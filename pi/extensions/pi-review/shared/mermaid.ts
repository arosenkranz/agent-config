/**
 * Vendored mermaid.js loader.
 *
 * The full mermaid bundle is inlined into generated pages so they stay
 * self-contained (no CDN, works offline from a file:// URL). The bundle is
 * read once and cached; pages that carry no diagram never pay for it.
 */

import fs from "node:fs";
import path from "node:path";

const MERMAID_PATH = path.join(import.meta.dirname, "vendor", "mermaid.min.js");

let cachedSource: string | undefined;

/**
 * Make the bundle safe to embed inside a <script> tag: any literal
 * `</script` (which would close the tag early) is neutralized as
 * `<\/script`, an identical escape inside JavaScript string literals.
 */
export function escapeScriptClose(source: string): string {
  return source.replaceAll("</script", "<\\/script");
}

/** Read the vendored mermaid bundle once. Returns undefined when unavailable. */
export function loadMermaidSource(): string | undefined {
  if (cachedSource !== undefined) return cachedSource;
  try {
    cachedSource = escapeScriptClose(fs.readFileSync(MERMAID_PATH, "utf8"));
    return cachedSource;
  } catch {
    return undefined;
  }
}

/** Test hook: override the cached source (or clear it with undefined). */
export function setMermaidSourceForTests(source: string | undefined): void {
  cachedSource = source === undefined ? undefined : escapeScriptClose(source);
}
