import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface ClaudeMarketplaceConfig {
  /** Master switch. When false, the extension contributes nothing. */
  enabled: boolean;
  /** Sync enabled Claude marketplace plugins' `skills/` directories into pi. */
  skills: { sync: boolean };
  /** Sync enabled Claude marketplace plugins' `commands/` files as pi prompt templates. */
  commands: { sync: boolean };
  /** Sync enabled Claude marketplace plugins' `agents/` files as pi prompt templates. */
  agents: { sync: boolean };
  /** Rewrite `${CLAUDE_PLUGIN_ROOT}` references in read output / command and agent templates. */
  pluginRoot: { rewrite: boolean };
  /** Override the directory where git-based marketplaces are cloned. */
  marketplaceCacheDir?: string;
}

export const DEFAULT_CONFIG: ClaudeMarketplaceConfig = {
  enabled: true,
  skills: { sync: true },
  commands: { sync: true },
  agents: { sync: true },
  pluginRoot: { rewrite: true },
};

function agentDir(): string {
  return path.join(process.env.HOME || os.homedir(), ".pi", "agent");
}

/** Directory where synced marketplaces and materialized prompt templates live. */
export function dataDir(config: ClaudeMarketplaceConfig): string {
  return path.join(agentDir(), "claude-marketplace");
}

export function marketplacesDir(config: ClaudeMarketplaceConfig): string {
  if (config.marketplaceCacheDir) return path.resolve(config.marketplaceCacheDir);
  return path.join(dataDir(config), "marketplaces");
}

export function promptsStagingDir(config: ClaudeMarketplaceConfig): string {
  return path.join(dataDir(config), "prompts");
}

export function skillsStagingDir(config: ClaudeMarketplaceConfig): string {
  return path.join(dataDir(config), "skills");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeBlock(base: ClaudeMarketplaceConfig, block: unknown): ClaudeMarketplaceConfig {
  if (!isRecord(block)) return base;
  const next: ClaudeMarketplaceConfig = {
    ...base,
    skills: { ...base.skills },
    commands: { ...base.commands },
    agents: { ...base.agents },
    pluginRoot: { ...base.pluginRoot },
  };

  if (typeof block.enabled === "boolean") next.enabled = block.enabled;
  if (isRecord(block.skills) && typeof block.skills.sync === "boolean") next.skills.sync = block.skills.sync;
  if (isRecord(block.commands) && typeof block.commands.sync === "boolean")
    next.commands.sync = block.commands.sync;
  if (isRecord(block.agents) && typeof block.agents.sync === "boolean") next.agents.sync = block.agents.sync;
  if (isRecord(block.pluginRoot) && typeof block.pluginRoot.rewrite === "boolean")
    next.pluginRoot.rewrite = block.pluginRoot.rewrite;
  if (typeof block.marketplaceCacheDir === "string" && block.marketplaceCacheDir)
    next.marketplaceCacheDir = block.marketplaceCacheDir;

  return next;
}

async function readSettingsBlock(settingsPath: string): Promise<unknown> {
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed?.claudeMarketplace;
  } catch {
    return undefined;
  }
}

/**
 * Resolve extension configuration from the `claudeMarketplace` block in pi's
 * settings files. Global settings (`~/.pi/agent/settings.json`) are merged
 * first, then project settings (`<cwd>/.pi/settings.json`) override.
 * Environment variables take final precedence for the master switch:
 *
 *   PI_CLAUDE_MARKETPLACE_DISABLED=1  -> disables the extension entirely.
 */
export async function loadConfig(cwd: string): Promise<ClaudeMarketplaceConfig> {
  const globalBlock = await readSettingsBlock(path.join(agentDir(), "settings.json"));
  const projectBlock = await readSettingsBlock(path.join(cwd, ".pi", "settings.json"));

  let config = mergeBlock(DEFAULT_CONFIG, globalBlock);
  config = mergeBlock(config, projectBlock);

  const disabledEnv = process.env.PI_CLAUDE_MARKETPLACE_DISABLED;
  if (disabledEnv === "1" || disabledEnv === "true") {
    config.enabled = false;
  }

  return config;
}
