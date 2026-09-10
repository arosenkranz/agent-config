/**
 * Plain-language enforcement for plan prose.
 *
 * Mechanical AI-writing-tell detection adapted from the unslop skill. The
 * present_plan tool runs every section's prose through this check and rejects
 * the call when findings exist, so the agent must rewrite before the page is
 * built. Technical detail is fine everywhere; only the tells below are banned.
 */

export interface ProseField {
  /** Where this text lives, e.g. "title" or "section 'summary' takeaway". */
  location: string;
  text: string;
}

export interface SlopFinding {
  location: string;
  /** 1-based line within the field. */
  line: number;
  /** Offending line, trimmed for display. */
  excerpt: string;
  rule: string;
  reason: string;
}

interface Pattern {
  rule: string;
  regex: RegExp;
  reason: string;
}

/**
 * Puffery vocabulary and phrases. Word boundaries keep matches mechanical.
 * The list is intentionally small and high-signal: every entry is a word or
 * phrase that reads as AI-generated, not a legitimate technical term.
 */
const PATTERNS: Pattern[] = [
  { rule: "puffery: comprehensive", regex: /\bcomprehensive\b/gi, reason: "Say what it actually covers." },
  { rule: "puffery: leverage", regex: /\bleverag(e|es|ing)\b/gi, reason: "Use 'use' or 'rely on'." },
  { rule: "puffery: delve", regex: /\bdelv(e|es|ing)\b/gi, reason: "Use 'dig into' or 'examine'." },
  { rule: "puffery: streamline", regex: /\bstreamlin(e|es|ing)\b/gi, reason: "Say what gets faster or removed." },
  { rule: "puffery: additionally", regex: /\badditionally\b/gi, reason: "Cut the connector or use 'also'." },
  { rule: "puffery: crucial", regex: /\bcrucial\b/gi, reason: "Say why it matters instead of calling it crucial." },
  { rule: "puffery: pivotal", regex: /\bpivotal\b/gi, reason: "State the fact instead of calling it pivotal." },
  { rule: "puffery: testament", regex: /\btestament\b/gi, reason: "State the fact; drop 'testament to'." },
  { rule: "puffery: showcase", regex: /\bshowcas(e|es|ing)\b/gi, reason: "Use 'show' or 'list'." },
  { rule: "puffery: underscore", regex: /\bunderscor(e|es|ing)\b/gi, reason: "Use 'show' or 'make clear'." },
  { rule: "puffery: vibrant", regex: /\bvibrant\b/gi, reason: "Use a neutral description." },
  { rule: "puffery: foster", regex: /\bfoster(s|ed|ing)?\b/gi, reason: "Say what actually helps or builds." },
  { rule: "puffery: garner", regex: /\bgarner(s|ed|ing)?\b/gi, reason: "Use 'get' or 'earn'." },
  { rule: "puffery: intricate", regex: /\bintricate\b/gi, reason: "Say what is complex about it." },
  { rule: "puffery: interplay", regex: /\binterplay\b/gi, reason: "Name the two things and how they connect." },
  { rule: "puffery: tapestry", regex: /\btapestry\b/gi, reason: "Use a plain word for what it is." },
  { rule: "puffery: evolving landscape", regex: /\b(evolving|ever-changing|shifting|rapidly changing)\s+landscape\b/gi, reason: "Drop the metaphor; state the change." },
  { rule: "fancy is: serves as", regex: /\bserves? as\b/gi, reason: "Just say 'is'." },
  { rule: "fancy is: boasts", regex: /\bboasts?\b/gi, reason: "Just say 'has'." },
  { rule: "plain word: utilize", regex: /\butili[sz](e|es|ing)\b/gi, reason: "Use 'use'." },
  { rule: "plain word: facilitate", regex: /\bfacilitat(e|es|ing)\b/gi, reason: "Use 'help' or name the action." },
  { rule: "plain word: numerous", regex: /\bnumerous\b/gi, reason: "Use 'many' or the number." },
  { rule: "filler: in order to", regex: /\bin order to\b/gi, reason: "Use 'to'." },
  { rule: "filler: due to the fact that", regex: /\bdue to the fact that\b/gi, reason: "Use 'because'." },
  { rule: "filler: it is important to note", regex: /\bit (is|'s) important to note\b/gi, reason: "Delete the filler and state the point." },
  { rule: "not-just-X-but-Y", regex: /\bnot (only|just)\b[^.!?]*\bbut (also\s)?\b/gi, reason: "State the point directly instead of the 'not just X but Y' shape." },
  { rule: "hollow: in today's", regex: /\bin today'?s\b/gi, reason: "Cut the hollow framing." },
  { rule: "hollow: fast-paced", regex: /\bfast-paced\b/gi, reason: "Cut the hollow framing." },
  { rule: "hollow: future looks bright", regex: /\bthe future looks bright\b/gi, reason: "State specific plans or facts." },
  { rule: "hollow: setting the stage", regex: /\bsetting the stage\b/gi, reason: "Say what enables what." },
];

/** Chatbot phrases only count at the start of a line. */
const OPENER_PATTERNS: Pattern[] = [
  { rule: "chatbot opener", regex: /^(great question|of course!|certainly!|absolutely!|sure!|i hope this helps|happy to help|let me know if|you'?re absolutely right|found the smoking gun)\b/i, reason: "Remove the chatbot phrase; start with the content." },
];

const CURLY_QUOTES = /["\u201c\u201d\u2018\u2019]/;
const EM_DASH = /\u2014/g;

/** Remove fenced code blocks and inline code so technical text is never scanned. */
export function stripCodeFences(md: string): string {
  return md
    .split("\n")
    .reduce<{ lines: string[]; inFence: boolean }>(
      (state, line) => {
        if (line.trim().startsWith("```")) {
          return { lines: [...state.lines, ""], inFence: !state.inFence };
        }
        // Keep line numbers aligned: in-fence lines become blank.
        if (state.inFence) {
          return { lines: [...state.lines, ""], inFence: state.inFence };
        }
        return { lines: [...state.lines, line], inFence: state.inFence };
      },
      { lines: [], inFence: false },
    )
    .lines.join("\n")
    .replace(/`[^`\n]*`/g, "");
}

/**
 * Scan prose fields for mechanical AI-writing tells. Returns findings in
 * field order; empty array means the prose is clean.
 */
export function checkProse(fields: ProseField[]): SlopFinding[] {
  const findings: SlopFinding[] = [];

  for (const field of fields) {
    const lines = stripCodeFences(field.text).split("\n");
    const fieldFindings: SlopFinding[] = [];

    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const excerpt = line.trim().slice(0, 120);

      for (const pattern of PATTERNS) {
        if (pattern.regex.test(line)) {
          fieldFindings.push({ location: field.location, line: lineNumber, excerpt, rule: pattern.rule, reason: pattern.reason });
        }
      }
      for (const pattern of OPENER_PATTERNS) {
        if (pattern.regex.test(line.trim())) {
          fieldFindings.push({ location: field.location, line: lineNumber, excerpt, rule: pattern.rule, reason: pattern.reason });
        }
      }
      if (CURLY_QUOTES.test(line)) {
        fieldFindings.push({ location: field.location, line: lineNumber, excerpt, rule: "curly quotes", reason: "Use straight quotes." });
      }
    });

    // Em dashes: stacked (2+ in one line) always flags; scattered use (4+
    // across the field) flags each line that has one.
    const totalEmDashes = lines.reduce((sum, line) => sum + (line.match(EM_DASH)?.length ?? 0), 0);
    lines.forEach((line, index) => {
      const count = line.match(EM_DASH)?.length ?? 0;
      if (count >= 2 || (totalEmDashes >= 4 && count >= 1)) {
        fieldFindings.push({
          location: field.location,
          line: index + 1,
          excerpt: line.trim().slice(0, 120),
          rule: count >= 2 ? "stacked em dashes" : "em dash overuse",
          reason: "Use periods or commas; em dashes are an AI tell.",
        });
      }
    });

    // Deduplicate per line: one finding per (line, rule).
    const seen = new Set<string>();
    for (const finding of fieldFindings) {
      const key = `${finding.line}:${finding.rule}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(finding);
    }
  }

  return findings;
}

/** Format findings into the rejection message shown to the agent. */
export function formatFindings(findings: SlopFinding[]): string {
  return findings
    .map((f) => `- ${f.location}, line ${f.line}: ${f.rule}. "${f.excerpt}" — ${f.reason}`)
    .join("\n");
}
