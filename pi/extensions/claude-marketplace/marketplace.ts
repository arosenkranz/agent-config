import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { ClaudeSettings, MarketplaceSource } from "./claude-settings.ts";
import { replaceClaudePluginRootReferences } from "./claude-plugin-root.ts";
import { parseMarkdownFrontmatter } from "./frontmatter.ts";
import { materializeSkillPaths } from "./skills.ts";

const execFileAsync = promisify(execFile);

export type LogLevel = "info" | "warn" | "error";
export type Logger = (level: LogLevel, message: string) => void;

/**
 * Plugin `source` in a marketplace manifest: a relative path (string), or an
 * object describing an external git repo (for example
 * `{"source": "url", "url": "https://...", "sha": "..."}`).
 */
interface MarketplacePlugin {
  name: string;
  source: string | { source?: string; url?: string; path?: string; ref?: string; sha?: string };
}

interface MarketplaceManifest {
  name?: string;
  plugins?: MarketplacePlugin[];
}

export interface ResolvedPlugin {
  pluginName: string;
  marketplaceName: string;
  pluginDir: string;
}

export interface PromptEntry {
  /** Namespaced prompt-template name, e.g. `dd:pr:address-feedback` or `dd:agent:oncall`. */
  name: string;
  /** Prompt template body (with `$CLAUDE_PLUGIN_ROOT` already resolved). */
  template: string;
  description?: string;
  argumentHint?: string;
}

export type CommandEntry = PromptEntry;
export type AgentEntry = PromptEntry;

export interface SyncResult {
  skillPaths: string[];
  commands: CommandEntry[];
  agents: AgentEntry[];
  /** Absolute plugin root dirs, for `$CLAUDE_PLUGIN_ROOT` rewriting on read. */
  pluginRoots: string[];
  marketplaceCount: number;
  pluginCount: number;
}

const SAFE_NAME = /^[a-zA-Z0-9._-]+$/;

async function isDir(p: string): Promise<boolean> {
  return fs
    .stat(p)
    .then((s) => s.isDirectory())
    .catch(() => false);
}

export function gitUrlForSource(source: MarketplaceSource): string | null {
  // Claude settings use several discriminators for git-backed marketplaces
  // (`github` with `repo`, `git`/`url` with `url`). Directory marketplaces are
  // handled earlier, so here we just prefer an explicit url and fall back to a
  // GitHub repo shorthand regardless of the exact `source` label.
  if (source.source === "directory") return null;
  if (source.url) return source.url;
  if (source.repo) return `https://github.com/${source.repo}.git`;
  return null;
}

async function syncGitMarketplace(
  name: string,
  source: MarketplaceSource,
  marketplacesRoot: string,
  log: Logger,
): Promise<string | null> {
  const gitUrl = gitUrlForSource(source);
  if (!gitUrl) return null;

  if (!SAFE_NAME.test(name)) {
    log("error", `Invalid marketplace name "${name}"`);
    return null;
  }

  const resolvedRoot = path.resolve(marketplacesRoot);
  const targetDir = path.resolve(marketplacesRoot, name);
  if (!(targetDir === resolvedRoot || targetDir.startsWith(resolvedRoot + path.sep))) {
    log("error", `Marketplace path escapes base directory: "${name}" -> ${targetDir}`);
    return null;
  }

  await fs.mkdir(marketplacesRoot, { recursive: true });

  const exists = await isDir(path.join(targetDir, ".git"));

  // Run git with cwd set to the marketplaces root so that the clone/fetch
  // target (always a subdirectory of resolvedRoot, validated above) stays
  // inside the invoking process's working-directory subtree. Some environments
  // (e.g. Datadog's nono tool sandbox) scope a sandboxed `git` write access to
  // the parent process's cwd and deny writes outside it; without this, cloning
  // a marketplace into ~/.pi/... fails with EPERM.
  const gitExecOptions = { cwd: resolvedRoot };

  try {
    if (exists) {
      const ref = source.ref || "HEAD";
      await execFileAsync("git", ["-C", targetDir, "fetch", "--depth=1", "origin", ref], gitExecOptions);
      await execFileAsync("git", ["-C", targetDir, "checkout", "FETCH_HEAD"], gitExecOptions);
    } else if (source.ref) {
      await execFileAsync("git", ["clone", "--depth=1", "--branch", source.ref, gitUrl, targetDir], gitExecOptions);
    } else {
      await execFileAsync("git", ["clone", "--depth=1", gitUrl, targetDir], gitExecOptions);
    }
  } catch (err) {
    log("error", `Failed to sync marketplace ${name}: ${String(err)}`);
    if (!exists) return null;
  }

  return targetDir;
}

function resolveLocalMarketplace(source: MarketplaceSource): string | null {
  // claude-settings normalizes directory paths to absolute during load.
  if (source.source === "directory" && source.path) return path.resolve(source.path);
  return null;
}

async function resolveMarketplace(
  name: string,
  source: MarketplaceSource,
  marketplacesRoot: string,
  log: Logger,
): Promise<string | null> {
  const local = resolveLocalMarketplace(source);
  if (local) return local;
  return syncGitMarketplace(name, source, marketplacesRoot, log);
}

async function readMarketplaceManifest(marketplaceDir: string): Promise<MarketplaceManifest | null> {
  const manifestPath = path.join(marketplaceDir, ".claude-plugin", "marketplace.json");
  try {
    const content = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(content) as MarketplaceManifest;
  } catch {
    return null;
  }
}

function parseEnabledPluginKey(pluginKey: string): { pluginName: string; marketplaceName: string } | null {
  const atIndex = pluginKey.lastIndexOf("@");
  if (atIndex === -1) return null;
  return {
    pluginName: pluginKey.slice(0, atIndex),
    marketplaceName: pluginKey.slice(atIndex + 1),
  };
}

async function resolveEnabledPlugins(
  settings: ClaudeSettings,
  marketplaceDirs: Map<string, string>,
  log: Logger,
): Promise<ResolvedPlugin[]> {
  const enabledPlugins = settings.enabledPlugins || {};
  const resolved: ResolvedPlugin[] = [];
  const manifestCache = new Map<string, MarketplaceManifest | null>();

  for (const [pluginKey, enabled] of Object.entries(enabledPlugins)) {
    if (!enabled) continue;

    const parsed = parseEnabledPluginKey(pluginKey);
    if (!parsed) continue;

    const { pluginName, marketplaceName } = parsed;
    const marketplaceDir = marketplaceDirs.get(marketplaceName);
    if (!marketplaceDir) {
      log("warn", `Marketplace ${marketplaceName} not found for plugin ${pluginName}`);
      continue;
    }

    let manifest = manifestCache.get(marketplaceDir);
    if (manifest === undefined) {
      manifest = await readMarketplaceManifest(marketplaceDir);
      manifestCache.set(marketplaceDir, manifest);
    }
    if (!manifest) {
      log("warn", `Could not read marketplace manifest from ${marketplaceDir}`);
      continue;
    }
    if (!Array.isArray(manifest.plugins)) {
      log("warn", `Invalid marketplace manifest in ${marketplaceDir}: plugins must be an array`);
      continue;
    }

    const pluginEntry = manifest.plugins.find((p) => p.name === pluginName);
    if (!pluginEntry) {
      log("warn", `Plugin ${pluginName} not found in marketplace ${marketplaceName}`);
      continue;
    }
    if (typeof pluginEntry.source !== "string") {
      // External git-repo sources (object form) cannot be resolved to a local
      // plugin dir without cloning. Skip the plugin instead of crashing the
      // whole sync.
      log("warn", `Plugin ${pluginName} in marketplace ${marketplaceName} uses an external git source; skipping`);
      continue;
    }

    resolved.push({
      pluginName,
      marketplaceName,
      pluginDir: path.resolve(marketplaceDir, pluginEntry.source),
    });
  }

  return resolved;
}

async function findPluginsWithSkills(plugins: ResolvedPlugin[], log: Logger): Promise<ResolvedPlugin[]> {
  const withSkills: ResolvedPlugin[] = [];
  for (const plugin of plugins) {
    const skillsDir = path.join(plugin.pluginDir, "skills");
    if (!(await isDir(skillsDir))) continue;
    log("info", `Found skills for plugin ${plugin.pluginName}: ${skillsDir}`);
    withSkills.push(plugin);
  }
  return withSkills;
}

async function* walkMarkdown(dir: string, prefix = ""): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      yield* walkMarkdown(path.join(dir, entry.name), rel);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield rel;
    }
  }
}

async function findPromptEntries(
  plugins: ResolvedPlugin[],
  dirName: "commands" | "agents",
  nameForPath: (pluginName: string, relativeName: string) => string,
  log: Logger,
): Promise<PromptEntry[]> {
  const prompts: PromptEntry[] = [];

  for (const plugin of plugins) {
    const promptsDir = path.join(plugin.pluginDir, dirName);
    if (!(await isDir(promptsDir))) continue;

    for await (const file of walkMarkdown(promptsDir)) {
      if (file === "README.md" || file.endsWith("/README.md")) continue;

      const absolutePath = path.join(promptsDir, file);
      try {
        const content = await fs.readFile(absolutePath, "utf8");
        const parsed = parseMarkdownFrontmatter(content);

        const relativeName = file.replace(/\.md$/, "").replace(/\//g, ":");
        const promptName = nameForPath(plugin.pluginName, relativeName);

        const template = await replaceClaudePluginRootReferences(parsed.body.trim(), plugin.pluginDir);

        const entry: PromptEntry = { name: promptName, template };
        if (parsed.data.description) entry.description = parsed.data.description;
        if (parsed.data["argument-hint"]) entry.argumentHint = parsed.data["argument-hint"];

        prompts.push(entry);
        log("info", `Loaded ${dirName.slice(0, -1)}: /${promptName}`);
      } catch (err) {
        log("error", `Failed to load ${dirName.slice(0, -1)} from ${absolutePath}: ${String(err)}`);
      }
    }
  }

  return prompts;
}

async function findCommandEntries(plugins: ResolvedPlugin[], log: Logger): Promise<CommandEntry[]> {
  return findPromptEntries(plugins, "commands", (pluginName, relativeName) => `${pluginName}:${relativeName}`, log);
}

async function findAgentEntries(plugins: ResolvedPlugin[], log: Logger): Promise<AgentEntry[]> {
  return findPromptEntries(plugins, "agents", (pluginName, relativeName) => `${pluginName}:agent:${relativeName}`, log);
}

/**
 * Resolve Claude marketplaces from settings, sync git-based ones, resolve
 * enabled plugins, and collect skill paths + command templates.
 */
export async function syncMarketplaces(
  settings: ClaudeSettings,
  options: {
    marketplacesRoot: string;
    skillsStagingRoot: string;
    excludedSkillNames: ReadonlySet<string>;
    skillsSync: boolean;
    commandsSync: boolean;
    agentsSync: boolean;
    log: Logger;
  },
): Promise<SyncResult> {
  const {
    marketplacesRoot,
    skillsStagingRoot,
    excludedSkillNames,
    skillsSync,
    commandsSync,
    agentsSync,
    log,
  } = options;
  const empty: SyncResult = {
    skillPaths: [],
    commands: [],
    agents: [],
    pluginRoots: [],
    marketplaceCount: 0,
    pluginCount: 0,
  };

  const marketplaces = settings.extraKnownMarketplaces;
  if (!marketplaces || Object.keys(marketplaces).length === 0) return empty;
  if (!settings.enabledPlugins || Object.keys(settings.enabledPlugins).length === 0) return empty;

  const marketplaceDirs = new Map<string, string>();
  await Promise.all(
    Object.entries(marketplaces).map(async ([name, { source }]) => {
      log("info", `Resolving marketplace: ${name} (source: ${source.source})`);
      const dir = await resolveMarketplace(name, source, marketplacesRoot, log);
      if (dir) marketplaceDirs.set(name, dir);
    }),
  );

  if (marketplaceDirs.size === 0) return empty;

  const plugins = await resolveEnabledPlugins(settings, marketplaceDirs, log);

  const pluginsWithSkills = skillsSync ? await findPluginsWithSkills(plugins, log) : [];
  const materializedSkills = await materializeSkillPaths(
    pluginsWithSkills,
    skillsStagingRoot,
    excludedSkillNames,
    log,
  );
  const commands = commandsSync ? await findCommandEntries(plugins, log) : [];
  const agents = agentsSync ? await findAgentEntries(plugins, log) : [];

  return {
    skillPaths: materializedSkills.skillPaths,
    commands,
    agents,
    pluginRoots: [...plugins.map((p) => p.pluginDir), ...materializedSkills.pluginRoots],
    marketplaceCount: marketplaceDirs.size,
    pluginCount: plugins.length,
  };
}
