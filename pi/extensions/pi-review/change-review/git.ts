/**
 * Git command parsing for the change reviewer module.
 *
 * Pure functions only: shell tokenizer plus git commit detection, including
 * compound commands (git add . && git commit ...), quoted messages, git
 * global flags (-C, -c), env-assignment prefixes, and the --no-review
 * bypass flag. Words in strings or echo arguments are never in command
 * position and are never flagged.
 */

// ---------------------------------------------------------------------------
// Shell tokenization
// ---------------------------------------------------------------------------

interface ShellWord {
  /** Word text with quotes removed. */
  text: string;
}

type Token =
  | ({ kind: "word" } & ShellWord)
  | { kind: "op"; op: "&&" | "||" | ";" | "|" | "\n" };

/**
 * Single-pass tokenizer: words keep their quotes removed, operators are
 * separate tokens, and comments are skipped. Doing both passes at once
 * keeps quoted operators ("a && b") out of command position.
 */
function tokenize(command: string): Token[] {
  const tokens: Token[] = [];
  let current = "";
  let hasWord = false;
  let quote: string | null = null;

  const pushWord = () => {
    if (hasWord) {
      tokens.push({ kind: "word", text: current });
      current = "";
      hasWord = false;
    }
  };

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      hasWord = true;
      continue;
    }
    if (char === "\\" && i + 1 < command.length) {
      current += command[i + 1];
      hasWord = true;
      i += 1;
      continue;
    }
    const two = command.slice(i, i + 2);
    if (two === "&&" || two === "||") {
      pushWord();
      tokens.push({ kind: "op", op: two });
      i += 1;
      continue;
    }
    if (char === ";" || char === "|" || char === "\n") {
      pushWord();
      tokens.push({ kind: "op", op: char });
      continue;
    }
    if (char === "#" && (i === 0 || /\s/.test(command[i - 1] ?? " "))) {
      pushWord();
      while (i < command.length && command[i] !== "\n") i += 1;
      continue;
    }
    if (/\s/.test(char)) {
      pushWord();
      continue;
    }
    current += char;
    hasWord = true;
  }
  pushWord();
  return tokens;
}

/** Split the token stream into command segments at operators. */
function splitIntoSegments(tokens: Token[]): ShellWord[][] {
  const segments: ShellWord[][] = [[]];
  for (const token of tokens) {
    if (token.kind === "op") {
      segments.push([]);
    } else {
      segments[segments.length - 1].push({ text: token.text });
    }
  }
  return segments.filter((segment) => segment.length > 0);
}

// ---------------------------------------------------------------------------
// Commit detection
// ---------------------------------------------------------------------------

export interface CommitInvocation {
  /** Raw segment containing the commit command (for logging). */
  segment: string;
  /** Commit message from -m flags, joined with blank lines; null if none. */
  message: string | null;
  /** True when -F/--file was used (message comes from a file). */
  messageFromFile: string | null;
  /** True when the command carries the --no-review bypass flag. */
  noReview: boolean;
  /** True for -a/--all commits, which the staged-review gate cannot review faithfully. */
  commitsAllTracked: boolean;
}

/** git global flags that consume a separate argument word. */
const GIT_FLAGS_WITH_ARG = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);

function stripEnvAssignments(words: ShellWord[]): { words: ShellWord[]; bypassEnv: boolean } {
  let bypassEnv = false;
  let index = 0;
  while (index < words.length) {
    const word = words[index];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word.text)) {
      if (word.text.startsWith("PI_REVIEW_BYPASS=")) bypassEnv = true;
      index += 1;
    } else {
      break;
    }
  }
  return { words: words.slice(index), bypassEnv };
}

function isGitWord(word: ShellWord): boolean {
  return word.text === "git" || word.text.endsWith("/git");
}

/** Parse the words following the git subcommand "commit". */
function parseCommitArgs(args: ShellWord[]): Pick<CommitInvocation, "message" | "messageFromFile" | "noReview" | "commitsAllTracked"> {
  const messages: string[] = [];
  let messageFromFile: string | null = null;
  let noReview = false;
  let commitsAllTracked = false;

  let i = 0;
  while (i < args.length) {
    const word = args[i];
    if (word.text === "-m" && i + 1 < args.length) {
      messages.push(args[i + 1].text);
      i += 2;
      continue;
    }
    if (word.text.startsWith("-m") && word.text.length > 2) {
      messages.push(word.text.slice(2));
      i += 1;
      continue;
    }
    if (word.text.startsWith("--message=")) {
      messages.push(word.text.slice("--message=".length));
      i += 1;
      continue;
    }
    if (word.text === "--no-review") {
      noReview = true;
      i += 1;
      continue;
    }
    if (word.text === "-F" || word.text === "--file" || word.text.startsWith("--file=")) {
      messageFromFile =
        word.text.startsWith("--file=") ? word.text.slice("--file=".length) : args[i + 1]?.text ?? "(file)";
      i += word.text.startsWith("--file=") ? 1 : 2;
      continue;
    }
    if (word.text === "-a" || word.text === "--all" || word.text === "-am" || word.text === "-amend") {
      // -am and -amend carry both -a and a message flag; treat as -a plus message below.
      commitsAllTracked = true;
      if (word.text.length > 2) {
        messages.push(word.text.slice(2));
      }
      i += 1;
      continue;
    }
    i += 1;
  }

  return {
    message: messages.length > 0 ? messages.join("\n\n") : null,
    messageFromFile,
    noReview,
    commitsAllTracked,
  };
}

/**
 * Find every git commit invocation in command position across the whole
 * (possibly compound) command string. Returns one entry per commit found.
 */
export function findCommitInvocations(command: string): CommitInvocation[] {
  const invocations: CommitInvocation[] = [];

  for (const words of splitIntoSegments(tokenize(command))) {
    const { words: stripped, bypassEnv } = stripEnvAssignments(words);
    if (stripped.length === 0 || !isGitWord(stripped[0])) continue;

    // Find the subcommand: the first non-flag word after git, skipping flags
    // that consume an argument.
    let i = 1;
    let subcommand: string | null = null;
    while (i < stripped.length) {
      const word = stripped[i];
      if (GIT_FLAGS_WITH_ARG.has(word.text)) {
        i += 2;
        continue;
      }
      if (word.text.startsWith("-")) {
        i += 1;
        continue;
      }
      subcommand = word.text;
      i += 1;
      break;
    }
    if (subcommand !== "commit") continue;

    const parsed = parseCommitArgs(stripped.slice(i));
    const noReview = bypassEnv || parsed.noReview;
    invocations.push({
      segment: stripped.map((word) => word.text).join(" "),
      message: parsed.message,
      messageFromFile: parsed.messageFromFile,
      noReview,
      commitsAllTracked: parsed.commitsAllTracked,
    });
  }

  return invocations;
}

/** Remove a --no-review token from a command string before it reaches git. */
export function stripNoReviewFlag(command: string): string {
  return command
    .replace(/(^|\s)--no-review\b\s?/g, "$1")
    .replace(/\s--no-review\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
