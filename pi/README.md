# pi extensions

This directory holds the pi extensions maintained in `claude-code-config`:

- **claude-marketplace** (local fork of `datadog-pi-packages/packages/claude-marketplace`) — the bridge that exposes the same Claude Code plugins, including the ones in this repo, to both Claude Code (natively) and pi. See `extensions/claude-marketplace/` and the fork notes below.
- **pi-review** — an always-on review gate for pi: substantive plans are presented as HTML pages with per-section feedback instead of chat prose, and `git commit` is blocked until you approve the staged diff in a review page. Feedback flows back into the session. See [`extensions/pi-review/README.md`](extensions/pi-review/README.md).

**Fork change:** upstream crashed the whole sync when a marketplace manifest used the newer object-form plugin `source` (for example `claude-plugins-official`, `superpowers-marketplace`), which broke all marketplace skill sync since 2026-09-01. This fork skips object-source plugins with a warning instead of crashing. See `extensions/claude-marketplace/test.ts` for the regression test.

## Installing pi-review

```bash
ln -sfn ~/workspace/claude-code-config/pi/extensions/pi-review ~/.pi/agent/extensions/pi-review
```

Restart pi afterwards. Details and commands: [`extensions/pi-review/README.md`](extensions/pi-review/README.md).

Claude Code plugins package **skills**, **commands**, and **agents** and share them through a marketplace. This extension reads your existing Claude Code settings, resolves the marketplaces and enabled plugins you already use, and exposes their skills, commands, and agents to pi — no duplicate configuration required.

## What it does

On pi startup (and on `/reload`), the extension:

1. Reads and merges Claude settings from `~/.claude/settings.json` and `<repo>/.claude/settings.json` (repository settings override global).
2. Resolves every marketplace in `extraKnownMarketplaces`:
   - **git marketplaces** (`source: github` / `url`) are shallow-cloned/updated into `~/.pi/agent/claude-marketplace/marketplaces/<name>`.
   - **directory marketplaces** (`source: directory`) are used in place; relative paths resolve against the settings file scope.
3. For every enabled plugin in `enabledPlugins` (a plugin set to `false` in repo settings disables a globally enabled one):
   - **skills** — the plugin's `skills/` directory is added to pi's skill search paths, so its `SKILL.md` skills appear in the system prompt and via `/skill:<name>`. Native global/project skills take precedence without producing collision warnings. Names that use Claude-only separators are normalized for pi (for example, `atlas:go-test` becomes `/skill:atlas-go-test`) from a staged copy; the marketplace checkout is never modified.
   - **commands** — each `commands/**/*.md` file is materialized as a pi prompt template named `<plugin>:<path>` (for example `dd:pr:address-feedback` → `/dd:pr:address-feedback`). Frontmatter `description` and `argument-hint` are preserved.
   - **agents** — each `agents/**/*.md` file except `agents/README.md` is materialized as a pi prompt template named `<plugin>:agent:<path>` (for example `dd:agent:oncall`; nested `agents/foo/bar.md` → `/dd:agent:foo:bar`).
4. Resolves `${CLAUDE_PLUGIN_ROOT}` / `$CLAUDE_PLUGIN_ROOT` references:
   - in command and agent templates, at materialization time;
   - in skill file reads, by rewriting the `read` tool output whenever the agent reads a file inside a synced plugin. This saves the model from guessing absolute paths to bundled scripts.

## Requirements

- pi with extension, skill, and prompt-template support.
- `git` on `PATH` for git-based marketplaces.
- Existing Claude Code settings (`~/.claude/settings.json`) with `extraKnownMarketplaces` and `enabledPlugins`. See the [marketplace README](https://github.com/DataDog/claude-marketplace#repository-setup).

## Install

This fork is loaded by path. In `~/.pi/agent/settings.json`, list it in `packages` (relative to `~/.pi/agent/`):

```json
{
  "packages": [
    "../../workspace/claude-code-config/pi"
  ]
}
```

Replace the `../../dd/datadog-pi-packages/packages/claude-marketplace` entry — loading both would double-register every plugin. Restart pi or run `/reload`, then run `/claude-marketplace` to see what was synced.

## Usage

- `/claude-marketplace` — show the current sync summary (marketplaces, plugins, skill paths, command names, and agent names).
- `/skill:<name>` — invoke a synced skill (also auto-loaded by the model when relevant). Skills remain native pi skills contributed from plugin `skills/` directories; they are not plugin-namespaced prompt templates.
- `/<plugin>:<command>` — invoke a synced command prompt template, e.g. `/dd:pr:address-feedback <PR-URL>`.
- `/<plugin>:agent:<agent>` — invoke a synced agent prompt template, e.g. `/dd:agent:oncall`.

After editing Claude settings, run `/reload` to re-sync.

## Configuration

Configuration lives in a `claudeMarketplace` block in pi settings. Global settings
(`~/.pi/agent/settings.json`) are read first, then project settings
(`<repo>/.pi/settings.json`) override. All features default to **on**.

```json
{
  "claudeMarketplace": {
    "enabled": true,
    "skills": { "sync": true },
    "commands": { "sync": true },
    "agents": { "sync": true },
    "pluginRoot": { "rewrite": true },
    "marketplaceCacheDir": "~/.pi/agent/claude-marketplace/marketplaces"
  }
}
```

| Key | Default | Effect |
| --- | --- | --- |
| `enabled` | `true` | Master switch. When `false`, the extension contributes nothing. |
| `skills.sync` | `true` | Add enabled plugins' `skills/` directories to pi's skill paths. |
| `commands.sync` | `true` | Materialize enabled plugins' `commands/` as pi prompt templates. |
| `agents.sync` | `true` | Materialize enabled plugins' `agents/` as plugin-namespaced pi prompt templates. |
| `pluginRoot.rewrite` | `true` | Resolve `${CLAUDE_PLUGIN_ROOT}` in command/agent templates and skill reads. |
| `marketplaceCacheDir` | `~/.pi/agent/claude-marketplace/marketplaces` | Where git marketplaces are cloned. |

Environment override: set `PI_CLAUDE_MARKETPLACE_DISABLED=1` to disable the extension for a single run regardless of settings.

> **Note:** `claudeMarketplace` is a custom key that pi itself does not interpret. Edit `settings.json` directly to set it; a settings save triggered from pi's `/settings` UI may drop unknown keys.

## Files and side effects

- Clones/updates git marketplaces under `~/.pi/agent/claude-marketplace/marketplaces/`.
- Writes materialized prompt templates under `~/.pi/agent/claude-marketplace/prompts/` (fully rebuilt on every sync).
- Writes staged copies of plugins containing non-standard skill names under `~/.pi/agent/claude-marketplace/skills/` (fully rebuilt on every sync).
- Appends a sync log to `~/.pi/agent/claude-marketplace/sync.log`.
- Runs `git clone` / `git fetch` for git marketplaces. No other network access.

## Development

```bash
cd ~/workspace/claude-code-config/pi
npm install
npm run check   # typecheck + tests
```

## Maintainer

Alex Rosenkranz — this is a personal fork; upstream lives in `datadog-pi-packages`.
