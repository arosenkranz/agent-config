import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseMarkdownFrontmatter } from "./frontmatter.ts";
import type { Logger, ResolvedPlugin } from "./marketplace.ts";

const MAX_SKILL_NAME_LENGTH = 64;
const VALID_SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface MaterializedSkills {
  skillPaths: string[];
  /** Staged plugin roots used to resolve `$CLAUDE_PLUGIN_ROOT` while reading copied skills. */
  pluginRoots: string[];
}

export function isValidPiSkillName(name: string): boolean {
  return name.length <= MAX_SKILL_NAME_LENGTH && VALID_SKILL_NAME.test(name);
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

/** Convert Claude skill names such as `atlas:go-test` into Agent Skills-compatible names. */
export function normalizePiSkillName(name: string): string {
  let normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) normalized = `skill-${shortHash(name)}`;
  if (normalized.length > MAX_SKILL_NAME_LENGTH) {
    const suffix = shortHash(name);
    normalized = `${normalized.slice(0, MAX_SKILL_NAME_LENGTH - suffix.length - 1).replace(/-+$/g, "")}-${suffix}`;
  }
  return normalized;
}

async function* walkSkillFiles(dir: string): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkSkillFiles(absolutePath);
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      yield absolutePath;
    }
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(
    () => true,
    () => false,
  );
}

async function addSkillName(filePath: string, names: Set<string>, visited: Set<string>): Promise<void> {
  let canonicalPath: string;
  try {
    canonicalPath = await fs.realpath(filePath);
  } catch {
    return;
  }
  if (visited.has(canonicalPath)) return;
  visited.add(canonicalPath);

  try {
    const markdown = await fs.readFile(filePath, "utf8");
    const name = parseMarkdownFrontmatter(markdown).data.name;
    if (name) names.add(name);
  } catch {
    // Skills can disappear during a concurrent reload; skip them here and let
    // pi's own discovery report any persistent filesystem problem.
  }
}

async function collectNativeSkillNames(
  root: string,
  includeRootMarkdown: boolean,
  names: Set<string>,
  visited: Set<string>,
): Promise<void> {
  for await (const filePath of walkSkillFiles(root)) await addSkillName(filePath, names, visited);

  if (!includeRootMarkdown) return;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      await addSkillName(path.join(root, entry.name), names, visited);
    }
  }
}

/** Discover native global/project skill names that pi loads before extension-contributed paths. */
export async function findNativeSkillNames(cwd: string): Promise<Set<string>> {
  const names = new Set<string>();
  const visited = new Set<string>();
  const home = process.env.HOME || os.homedir();

  await collectNativeSkillNames(path.join(home, ".pi", "agent", "skills"), true, names, visited);
  await collectNativeSkillNames(path.join(home, ".agents", "skills"), false, names, visited);

  let current = path.resolve(cwd);
  while (true) {
    await collectNativeSkillNames(path.join(current, ".pi", "skills"), true, names, visited);
    await collectNativeSkillNames(path.join(current, ".agents", "skills"), false, names, visited);

    if (await pathExists(path.join(current, ".git"))) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return names;
}

function replaceFrontmatterName(markdown: string, name: string): string {
  const match = markdown.match(/^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$)[\s\S]*)$/);
  if (!match) return markdown;

  const [, opening = "", frontmatter = "", remainder = ""] = match;
  const rewritten = frontmatter.replace(/^\s*name\s*:[^\r\n]*$/m, `name: ${name}`);
  return `${opening}${rewritten}${remainder}`;
}

function safeStagingSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "plugin";
}

/**
 * Return native skill paths for valid plugins. If a plugin contains names that
 * pi cannot index without warnings, copy that plugin to staging and rewrite
 * only those frontmatter names. Copying the whole plugin preserves relative
 * references, scripts, and `$CLAUDE_PLUGIN_ROOT` semantics.
 */
export async function materializeSkillPaths(
  plugins: ResolvedPlugin[],
  stagingRoot: string,
  excludedSkillNames: ReadonlySet<string>,
  log: Logger,
): Promise<MaterializedSkills> {
  await fs.rm(stagingRoot, { recursive: true, force: true });
  await fs.mkdir(stagingRoot, { recursive: true });

  const skillPaths: string[] = [];
  const pluginRoots: string[] = [];

  for (const [index, plugin] of plugins.entries()) {
    const sourceSkillsDir = path.join(plugin.pluginDir, "skills");
    const skills: Array<{ sourcePath: string; name?: string; effectiveName?: string }> = [];
    let hasInvalidNames = false;
    let hasExcludedNames = false;

    for await (const sourcePath of walkSkillFiles(sourceSkillsDir)) {
      const markdown = await fs.readFile(sourcePath, "utf8");
      const name = parseMarkdownFrontmatter(markdown).data.name;
      const effectiveName = name && !isValidPiSkillName(name) ? normalizePiSkillName(name) : name;
      if (name !== effectiveName) hasInvalidNames = true;
      if (effectiveName && excludedSkillNames.has(effectiveName)) hasExcludedNames = true;
      skills.push({ sourcePath, name, effectiveName });
    }

    if (!hasInvalidNames && !hasExcludedNames) {
      skillPaths.push(sourceSkillsDir);
      continue;
    }

    let effectivePluginDir = plugin.pluginDir;
    if (hasInvalidNames) {
      const stageName = `${index}-${safeStagingSegment(plugin.marketplaceName)}-${safeStagingSegment(plugin.pluginName)}`;
      effectivePluginDir = path.join(stagingRoot, stageName);
      await fs.cp(plugin.pluginDir, effectivePluginDir, {
        recursive: true,
        dereference: false,
        verbatimSymlinks: true,
      });
      pluginRoots.push(effectivePluginDir);
    }

    for (const skill of skills) {
      const relativePath = path.relative(plugin.pluginDir, skill.sourcePath);
      const effectivePath = path.join(effectivePluginDir, relativePath);

      if (skill.name && skill.effectiveName && skill.name !== skill.effectiveName) {
        const markdown = await fs.readFile(effectivePath, "utf8");
        await fs.writeFile(effectivePath, replaceFrontmatterName(markdown, skill.effectiveName), "utf8");
        log("info", `Normalized skill name ${skill.name} -> ${skill.effectiveName}`);
      }

      if (skill.effectiveName && excludedSkillNames.has(skill.effectiveName)) {
        log(
          "info",
          `Skipped synced skill ${skill.effectiveName} from plugin ${plugin.pluginName}; a native skill takes precedence`,
        );
        continue;
      }
      skillPaths.push(path.dirname(effectivePath));
    }
  }

  const uniqueSkillPaths = [...new Set(skillPaths)];

  return { skillPaths: uniqueSkillPaths, pluginRoots };
}
