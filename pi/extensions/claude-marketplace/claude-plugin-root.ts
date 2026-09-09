import fs from "node:fs/promises";
import path from "node:path";

const CLAUDE_PLUGIN_ROOT_REGEX = /\$\{CLAUDE_PLUGIN_ROOT\}|\$CLAUDE_PLUGIN_ROOT(?![A-Za-z0-9_])/g;
const CLAUDE_PLUGIN_ROOT_REF_DELIMITER = /[\s"'`<>()[\]{};,]/;

async function pathExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() || stat.isDirectory();
  } catch {
    return false;
  }
}

function getReferenceSuffix(content: string, fromIndex: number): string {
  let idx = fromIndex;
  while (idx < content.length && !CLAUDE_PLUGIN_ROOT_REF_DELIMITER.test(content[idx]!)) {
    idx += 1;
  }
  return content.slice(fromIndex, idx);
}

function resolveReferencePath(pluginRoot: string, suffix: string): string {
  if (!suffix) return pluginRoot;
  if (suffix.startsWith("/")) return path.resolve(pluginRoot, `.${suffix}`);
  return path.resolve(pluginRoot, suffix);
}

/**
 * Replace `${CLAUDE_PLUGIN_ROOT}` / `$CLAUDE_PLUGIN_ROOT` references with the
 * absolute plugin root path. A reference is only rewritten when the resolved
 * path (root + trailing reference suffix) points at an existing file or
 * directory, mirroring the opencode-datadog behavior. This avoids corrupting
 * unrelated text that happens to contain the token.
 */
export async function replaceClaudePluginRootReferences(content: string, pluginRoot: string): Promise<string> {
  let result = "";
  let previousIndex = 0;
  let replaced = false;

  for (const match of content.matchAll(CLAUDE_PLUGIN_ROOT_REGEX)) {
    const matchValue = match[0];
    const matchIndex = match.index;
    if (matchIndex === undefined) continue;

    const tokenEnd = matchIndex + matchValue.length;
    const suffix = getReferenceSuffix(content, tokenEnd);
    const resolvedPath = resolveReferencePath(pluginRoot, suffix);

    if (!(await pathExists(resolvedPath))) continue;

    result += content.slice(previousIndex, matchIndex);
    result += pluginRoot;
    previousIndex = tokenEnd;
    replaced = true;
  }

  if (!replaced) return content;

  result += content.slice(previousIndex);
  return result;
}
