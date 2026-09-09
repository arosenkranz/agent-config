import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface MarketplaceSource {
  source: string;
  repo?: string;
  url?: string;
  ref?: string;
  path?: string;
}

export interface ClaudeSettings {
  extraKnownMarketplaces?: Record<string, { source: MarketplaceSource }>;
  enabledPlugins?: Record<string, boolean>;
  env?: Record<string, unknown>;
}

function homeDir(): string {
  return process.env.HOME || os.homedir();
}

function expandTilde(p: string): string {
  if (p === "~") return homeDir();
  if (p.startsWith("~/")) return path.join(homeDir(), p.slice(2));
  return p;
}

/**
 * Directory-marketplace paths in Claude settings are relative to the settings
 * file scope: `~` for global settings and the repository root for repository
 * settings. Resolve them to absolute paths so downstream consumers do not need
 * to know the originating scope.
 */
function normalizeDirectoryMarketplacePaths(settings: ClaudeSettings, baseDir: string): ClaudeSettings {
  const marketplaces = settings.extraKnownMarketplaces;
  if (!marketplaces) return settings;

  const normalized: NonNullable<ClaudeSettings["extraKnownMarketplaces"]> = {};
  for (const [name, marketplace] of Object.entries(marketplaces)) {
    const source = marketplace.source;
    if (source && source.source === "directory" && typeof source.path === "string" && source.path) {
      const expanded = expandTilde(source.path);
      const resolved = path.isAbsolute(expanded) ? expanded : path.resolve(baseDir, expanded);
      normalized[name] = { source: { ...source, path: resolved } };
      continue;
    }
    normalized[name] = marketplace;
  }

  return { ...settings, extraKnownMarketplaces: normalized };
}

async function readClaudeSettingsFile(settingsPath: string, baseDir: string): Promise<ClaudeSettings | null> {
  try {
    const content = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(content) as ClaudeSettings;
    return normalizeDirectoryMarketplacePaths(parsed, baseDir);
  } catch {
    return null;
  }
}

function mergeClaudeSettings(
  globalSettings: ClaudeSettings | null,
  projectSettings: ClaudeSettings | null,
): ClaudeSettings | null {
  if (!globalSettings && !projectSettings) return null;

  const merged: ClaudeSettings = { ...(globalSettings || {}), ...(projectSettings || {}) };

  // Repository settings override global settings for matching marketplace
  // names, plugin keys, and environment variables.
  if (globalSettings?.extraKnownMarketplaces || projectSettings?.extraKnownMarketplaces) {
    merged.extraKnownMarketplaces = {
      ...(globalSettings?.extraKnownMarketplaces || {}),
      ...(projectSettings?.extraKnownMarketplaces || {}),
    };
  }

  if (globalSettings?.enabledPlugins || projectSettings?.enabledPlugins) {
    merged.enabledPlugins = {
      ...(globalSettings?.enabledPlugins || {}),
      ...(projectSettings?.enabledPlugins || {}),
    };
  }

  if (globalSettings?.env || projectSettings?.env) {
    merged.env = { ...(globalSettings?.env || {}), ...(projectSettings?.env || {}) };
  }

  return merged;
}

/**
 * Read and merge Claude Code settings from the global user config
 * (`~/.claude/settings.json`) and the current project (`<directory>/.claude/settings.json`).
 * Repository settings override global settings.
 */
export async function readClaudeSettings(directory: string): Promise<ClaudeSettings | null> {
  const home = homeDir();
  const globalSettings = await readClaudeSettingsFile(path.join(home, ".claude", "settings.json"), home);
  const projectSettings = await readClaudeSettingsFile(path.join(directory, ".claude", "settings.json"), directory);
  return mergeClaudeSettings(globalSettings, projectSettings);
}
