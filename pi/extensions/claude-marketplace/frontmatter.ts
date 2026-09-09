export interface ParsedFrontmatter {
  data: Record<string, string>;
  body: string;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/**
 * Minimal, dependency-free frontmatter parser for Claude command files.
 *
 * Claude command frontmatter is a flat block of `key: value` scalar pairs
 * (`description`, `argument-hint`, `model`, `allowed-tools`, `context`). We only
 * need flat scalar extraction, and avoiding a YAML dependency keeps the pi
 * package installable without extra runtime deps. Values that Claude writes as
 * bracketed argument hints (for example `argument-hint: [foo] [bar]`) are
 * returned verbatim as strings.
 */
export function parseMarkdownFrontmatter(markdown: string): ParsedFrontmatter {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: markdown };
  }

  const [, frontmatter = "", body = ""] = match;
  const data: Record<string, string> = {};

  for (const rawLine of frontmatter.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = stripQuotes(line.slice(colonIndex + 1));
    if (key) data[key] = value;
  }

  return { data, body };
}
