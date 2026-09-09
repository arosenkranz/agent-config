import fs from "node:fs/promises";
import path from "node:path";

import type { PromptEntry } from "./marketplace.ts";

function escapeYamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function renderTemplateFile(entry: PromptEntry): string {
  const lines: string[] = [];
  const hasFrontmatter = Boolean(entry.description || entry.argumentHint);
  if (hasFrontmatter) {
    lines.push("---");
    if (entry.description) lines.push(`description: ${escapeYamlString(entry.description)}`);
    if (entry.argumentHint) lines.push(`argument-hint: ${escapeYamlString(entry.argumentHint)}`);
    lines.push("---");
  }
  lines.push(entry.template);
  return `${lines.join("\n")}\n`;
}

/**
 * Materialize Claude command templates as pi prompt-template files in a flat
 * staging directory. Pi discovers prompt templates non-recursively and derives
 * the command name from the filename, so command names (which use `:` as a
 * namespace separator) map directly to file names.
 *
 * The staging directory is fully rebuilt on every sync so that disabling a
 * plugin or renaming a command removes stale templates.
 */
export async function materializePromptTemplates(stagingDir: string, prompts: PromptEntry[]): Promise<string> {
  await fs.rm(stagingDir, { recursive: true, force: true });
  await fs.mkdir(stagingDir, { recursive: true });

  for (const entry of prompts) {
    const filePath = path.join(stagingDir, `${entry.name}.md`);
    await fs.writeFile(filePath, renderTemplateFile(entry), "utf8");
  }

  return stagingDir;
}
