# Changelog

## Unreleased

- Run git marketplace sync with `cwd` set to the marketplaces cache root, so
  clone/fetch/checkout writes stay inside the invoking process's
  working-directory subtree. Environments that sandbox `git` writes to the
  parent cwd (e.g. Datadog's shadowfax) otherwise deny cloning a
  marketplace into `~/.pi/agent/claude-marketplace/marketplaces/` with
  `Operation not permitted`.
- Normalize Claude-only skill names such as `atlas:go-test` to pi-compatible
  names such as `atlas-go-test` in a staged plugin copy, avoiding skill-index
  validation warnings without modifying the marketplace checkout.
- Filter synced skills that collide with higher-priority native global/project
  skills, preserving pi's precedence rules without emitting collision warnings.
- Add support for syncing enabled plugin `agents/**/*.md` files (except
  `agents/README.md`) as pi prompt templates named `<plugin>:agent:<path>`.
- Keep skills as native pi skills invoked via `/skill:<name>` from `SKILL.md`;
  commands and agents are plugin-namespaced prompt templates.

## 0.1.1

- Fix git-backed marketplaces declared as `source: "git"` with a `url` (the
  shape real Claude settings use) being skipped. Marketplace resolution now
  prefers an explicit `url` and falls back to a GitHub `repo` shorthand
  regardless of the `source` label.

## 0.1.0

Initial release.

- Read and merge Claude Code settings from `~/.claude/settings.json` and
  `<repo>/.claude/settings.json` (repository settings override global).
- Resolve `extraKnownMarketplaces`: shallow-clone/update git marketplaces into
  `~/.pi/agent/claude-marketplace/marketplaces/`, use directory marketplaces in place.
- For enabled plugins in `enabledPlugins`:
  - contribute each plugin's `skills/` directory to pi via `resources_discover`;
  - materialize each `commands/**/*.md` file as a namespaced pi prompt template
    (`<plugin>:<path>`).
- Resolve `${CLAUDE_PLUGIN_ROOT}` in command templates at materialization time
  and in `read` tool output for files inside synced plugins.
- `/claude-marketplace` command shows the current sync summary.
- Configurable via a `claudeMarketplace` block in pi settings; all features
  default on. `PI_CLAUDE_MARKETPLACE_DISABLED=1` disables for a single run.
