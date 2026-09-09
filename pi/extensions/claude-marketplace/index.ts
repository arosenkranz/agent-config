import fs from "node:fs/promises";
import path from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isReadToolResult } from "@earendil-works/pi-coding-agent";

import {
  loadConfig,
  marketplacesDir,
  promptsStagingDir,
  skillsStagingDir,
  type ClaudeMarketplaceConfig,
} from "./config.ts";
import { readClaudeSettings } from "./claude-settings.ts";
import { replaceClaudePluginRootReferences } from "./claude-plugin-root.ts";
import { materializePromptTemplates } from "./prompts.ts";
import { syncMarketplaces, type Logger, type SyncResult } from "./marketplace.ts";
import { findNativeSkillNames } from "./skills.ts";

interface SyncSummary {
  reason: string;
  timestamp: number;
  marketplaceCount: number;
  pluginCount: number;
  skillPaths: string[];
  commandNames: string[];
  agentNames: string[];
  pluginRoots: string[];
}

function createFileLogger(dir: string): Logger {
  const logPath = path.join(dir, "sync.log");
  return (level, message) => {
    const line = `${new Date().toISOString()} [${level}] ${message}\n`;
    // Fire-and-forget: never block startup or corrupt the TUI with stdout.
    void fs
      .mkdir(dir, { recursive: true })
      .then(() => fs.appendFile(logPath, line, "utf8"))
      .catch(() => {});
  };
}

function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export default function (pi: ExtensionAPI) {
  let pluginRoots: string[] = [];
  let rewriteEnabled = true;
  let lastSummary: SyncSummary | undefined;

  async function runSync(cwd: string, reason: string): Promise<{ skillPaths: string[]; promptPaths: string[] }> {
    const config: ClaudeMarketplaceConfig = await loadConfig(cwd);
    rewriteEnabled = config.enabled && config.pluginRoot.rewrite;
    pluginRoots = [];

    if (!config.enabled) {
      lastSummary = undefined;
      return { skillPaths: [], promptPaths: [] };
    }

    const log = createFileLogger(path.dirname(marketplacesDir(config)));

    const settings = await readClaudeSettings(cwd);
    if (!settings) {
      lastSummary = undefined;
      return { skillPaths: [], promptPaths: [] };
    }

    let result: SyncResult;
    try {
      const nativeSkillNames = config.skills.sync ? await findNativeSkillNames(cwd) : new Set<string>();
      result = await syncMarketplaces(settings, {
        marketplacesRoot: marketplacesDir(config),
        skillsStagingRoot: skillsStagingDir(config),
        excludedSkillNames: nativeSkillNames,
        skillsSync: config.skills.sync,
        commandsSync: config.commands.sync,
        agentsSync: config.agents.sync,
        log,
      });
    } catch (err) {
      log("error", `Sync failed: ${String(err)}`);
      lastSummary = undefined;
      return { skillPaths: [], promptPaths: [] };
    }

    pluginRoots = result.pluginRoots.map((p) => path.resolve(p));

    const promptPaths: string[] = [];
    const promptTemplates = [...result.commands, ...result.agents];
    const staging = await materializePromptTemplates(promptsStagingDir(config), promptTemplates);
    promptPaths.push(staging);

    lastSummary = {
      reason,
      timestamp: Date.now(),
      marketplaceCount: result.marketplaceCount,
      pluginCount: result.pluginCount,
      skillPaths: result.skillPaths,
      commandNames: result.commands.map((c) => c.name),
      agentNames: result.agents.map((a) => a.name),
      pluginRoots,
    };

    log(
      "info",
      `Sync (${reason}): ${result.marketplaceCount} marketplace(s), ${result.pluginCount} plugin(s), ` +
        `${result.skillPaths.length} skill path(s), ${result.commands.length} command(s), ${result.agents.length} agent(s)`,
    );

    return { skillPaths: result.skillPaths, promptPaths };
  }

  pi.on("resources_discover", async (event) => {
    const { skillPaths, promptPaths } = await runSync(event.cwd, event.reason);
    return { skillPaths, promptPaths };
  });

  // Resolve ${CLAUDE_PLUGIN_ROOT} references when the model reads files that
  // live inside a synced Claude plugin (SKILL.md, references, etc.), so it does
  // not have to guess absolute paths.
  pi.on("tool_result", async (event, ctx) => {
    if (!rewriteEnabled || pluginRoots.length === 0) return;
    if (!isReadToolResult(event)) return;

    const rawPath = typeof event.input.path === "string" ? event.input.path : undefined;
    if (!rawPath) return;
    const absPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(ctx.cwd, rawPath);

    const pluginRoot = pluginRoots.find((root) => isWithin(root, absPath));
    if (!pluginRoot) return;

    let changed = false;
    const content = await Promise.all(
      event.content.map(async (block) => {
        if (block.type !== "text") return block;
        const rewritten = await replaceClaudePluginRootReferences(block.text, pluginRoot);
        if (rewritten !== block.text) changed = true;
        return { ...block, text: rewritten };
      }),
    );

    if (!changed) return;
    return { content };
  });

  pi.registerCommand("claude-marketplace", {
    description: "Show Claude marketplace skills/commands synced into pi",
    handler: async (_args, ctx) => {
      if (!lastSummary) {
        ctx.ui.notify(
          "claude-marketplace: nothing synced. Check ~/.claude/settings.json (extraKnownMarketplaces + enabledPlugins) and run /reload.",
          "warning",
        );
        return;
      }

      const s = lastSummary;
      const lines = [
        `Claude marketplace sync (${s.reason}) — ${new Date(s.timestamp).toLocaleTimeString()}`,
        `  marketplaces: ${s.marketplaceCount}`,
        `  plugins: ${s.pluginCount}`,
        `  skill paths: ${s.skillPaths.length}`,
        ...s.skillPaths.map((p) => `    - ${p}`),
        `  commands: ${s.commandNames.length}`,
        ...s.commandNames.map((n) => `    - /${n}`),
        `  agents: ${s.agentNames.length}`,
        ...s.agentNames.map((n) => `    - /${n}`),
        "",
        "Run /reload to re-sync after editing Claude settings.",
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
