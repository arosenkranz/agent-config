# Workflows

## Architecture

This repo is a personal agent configuration published as a Claude Code marketplace with 7 plugins (35 skills, 6 agents total):
- `workflow-skills` — daily-driver workflow skills invocable via `/name`
- `goldeneye-agents` — specialized subagents (boris, m, natalya, q, trevelyan, xenia)
- `dev-environment` — lifecycle hooks, commands (coding standards)
- `backend-and-infra` — backend, infra, homelab, and language skills
- `web-and-frontend` — Astro, frontend, browser automation, design review
- `git-and-pr` — git and PR automation (ship, release, worktrees, pin-actions)
- `obsidian-and-notes` — Obsidian vault search and note skills

Plugins auto-discover their content via `${CLAUDE_PLUGIN_ROOT}`. No symlinks needed.
Skills are discovered from `plugins/<plugin>/skills/<name>/SKILL.md`; agents from
`plugins/goldeneye-agents/agents/<name>.md`.

## Setting up on a new machine

```bash
git clone git@github.com:arosenkranz/agent-config.git ~/Code/agent-config
```

Add to `~/.claude/settings.json`:
```json
{
  "extraKnownMarketplaces": {
    "arosenkranz-claude-plugins": {
      "source": { "source": "github", "repo": "arosenkranz/agent-config" }
    }
  },
  "enabledPlugins": {
    "workflow-skills@arosenkranz-claude-plugins": true,
    "goldeneye-agents@arosenkranz-claude-plugins": true,
    "dev-environment@arosenkranz-claude-plugins": true,
    "backend-and-infra@arosenkranz-claude-plugins": true,
    "web-and-frontend@arosenkranz-claude-plugins": true,
    "git-and-pr@arosenkranz-claude-plugins": true,
    "obsidian-and-notes@arosenkranz-claude-plugins": true
  }
}
```

Copy and customize CLAUDE.md:
```bash
cp config-templates/CLAUDE.md.template ~/.claude/CLAUDE.md
```

## Adding a new skill

1. Create `plugins/workflow-skills/skills/<name>/SKILL.md` with `name` and `description` frontmatter
2. Add any references, templates, or scripts in the same directory
3. No registration needed — but bump the plugin version before merging (see [Shipping plugin changes](#shipping-plugin-changes))

## Adding a new agent

1. Create `plugins/goldeneye-agents/agents/<name>.md`
2. Include the agent's system prompt and trigger conditions
3. Auto-discovered — no registration needed; bump `goldeneye-agents`' version before merging

## Shipping plugin changes

Any PR that changes files under `plugins/<plugin>/` must bump `version` in `plugins/<plugin>/.claude-plugin/plugin.json` (semver: patch for fixes and wording, minor for new skills/agents/commands/hooks, major for removals or renames).

Why: Claude Code installs plugins into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` and `claude plugin update` only re-installs when the version changes. Without a bump the merge reaches GitHub but installed copies silently stay stale (this happened with `workflow-skills` 1.1.0 — fixed in #29). pi is unaffected: it re-pulls the marketplace on startup and loads `pi/` extensions from this checkout.

After merging, update and verify:

```bash
claude plugin marketplace update arosenkranz-claude-plugins
claude plugin update <plugin>@arosenkranz-claude-plugins   # then restart Claude Code
ls ~/.claude/plugins/cache/arosenkranz-claude-plugins/<plugin>/   # new version dir present
```

In pi, run `/reload` (or start a new session).

## Adding or modifying hooks

Edit `plugins/dev-environment/hooks/hooks.json` directly. Exception: a hook that only serves one plugin's skills lives in that plugin (`plugins/workflow-skills/hooks/hooks.json` runs `scripts/herdr-status` for the herdr skills), because a plugin can only reach its own files through `${CLAUDE_PLUGIN_ROOT}`. The `${CLAUDE_PLUGIN_ROOT}` variable resolves to the plugin directory at runtime.

## Coding standards

Standards live in `plugins/dev-environment/commands/` and are invocable on-demand via `/dev-environment:coding-style` (and other command names in that directory).

## Local-only files (never tracked by git)

- `~/.claude/settings.json` — managed locally, runtime mutations never dirty the repo
- `~/.claude/CLAUDE.md` — machine-specific identity and context
