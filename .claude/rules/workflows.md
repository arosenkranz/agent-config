# Workflows

## Architecture

This repo is a personal agent configuration published as a Claude Code marketplace with 7 plugins (30 skills, 6 agents total):
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
3. The skill is immediately discoverable via `/name` — no registration needed

## Adding a new agent

1. Create `plugins/goldeneye-agents/agents/<name>.md`
2. Include the agent's system prompt and trigger conditions
3. Auto-discovered — no registration needed

## Adding or modifying hooks

Edit `plugins/dev-environment/hooks/hooks.json` directly. The `${CLAUDE_PLUGIN_ROOT}` variable resolves to the plugin directory at runtime.

## Coding standards

Standards live in `plugins/dev-environment/commands/` and are invocable on-demand via `/dev-environment:coding-style` (and other command names in that directory).

## Local-only files (never tracked by git)

- `~/.claude/settings.json` — managed locally, runtime mutations never dirty the repo
- `~/.claude/CLAUDE.md` — machine-specific identity and context
