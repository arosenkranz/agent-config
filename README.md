# agent-config

Alex Rosenkranz's personal agent configuration: **skills, agents, and extensions** that work across coding agent harnesses — [Claude Code](https://claude.ai/code) and [pi](https://github.com/earendil-works/pi-coding-agent) — with 7 plugins: 57+ skills, 8 agents, and a full dev environment automation stack (hooks, coding standards, Claude Island integration).

The repo's identity is the content, not any one harness. Each harness gets its own thin integration layer:

- **Claude Code** consumes this repo natively as a plugin marketplace — the `.claude-plugin/` manifest is just a publish surface, not the repo's identity.
- **pi** consumes the same content through the [`claude-marketplace` sync extension](pi/README.md) in [`pi/`](pi/), which reads your existing Claude Code settings and exposes every enabled plugin's skills, commands, and agents to pi. One configuration, both harnesses.

What deliberately does **not** live here: third-party extensions, MCP servers, and host-level config (model, permissions, statusline). Machines differ materially (personal vs. work), so those stay on the host — see [Local-only files](#local-only-files).

## How it works

This repo is a Claude Code plugin marketplace hosted on GitHub. Claude Code supports registering external GitHub repos as marketplaces via `extraKnownMarketplaces` in `~/.claude/settings.json` — once registered, plugins from the repo can be enabled and auto-updated like any other Claude Code plugin.

See the [Claude Code plugin marketplace docs](https://code.claude.com/docs/en/plugin-marketplaces) for how marketplaces work, and [discover and install plugins](https://code.claude.com/docs/en/discover-plugins) for how to register and enable them.

## Pi integration

The [`pi/`](pi/README.md) directory holds the pi extensions maintained in this repo. On pi startup the `claude-marketplace` fork reads the same `~/.claude/settings.json` (marketplaces + enabled plugins) and exposes every enabled plugin's skills, commands, and agents to pi:

- skills → `/skill:<name>` (auto-loaded when relevant)
- commands → `/<plugin>:<command>`
- agents → `/<plugin>:agent:<agent>` (e.g. `/goldeneye-agents:agent:trevelyan`)

This fork fixes an upstream crash: marketplace manifests with object-form plugin `source` entries (newer `claude-plugins-official`, `superpowers-marketplace`) aborted the whole sync; the fork skips those plugins with a warning instead. Enable it once in `~/.pi/agent/settings.json` (`packages` entry, see [`pi/README.md`](pi/README.md#install)) — after that, plugins enabled in Claude Code work in pi automatically, no duplicate configuration.

`pi/` also hosts **pi-review**, an always-on review gate for pi: plan presentations and commit approvals as HTML review pages, with feedback flowing back into the session. Install it with a symlink into `~/.pi/agent/extensions` — see [`pi/extensions/pi-review/README.md`](pi/extensions/pi-review/README.md).

## Setup on a new machine

### 1. Clone the repo

```bash
git clone git@github.com:arosenkranz/agent-config.git ~/Code/agent-config
```

### 2. Register the marketplace in `~/.claude/settings.json`

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
    "git-and-pr@arosenkranz-claude-plugins": true,
    "obsidian-and-notes@arosenkranz-claude-plugins": true
  }
}
```

See `config-templates/settings.json.template` for a complete starting point.

### 3. Create your CLAUDE.md

```bash
cp config-templates/CLAUDE.md.template ~/.claude/CLAUDE.md
# Edit it — add your machine-specific paths, identity, infrastructure context
```

### 4. Register the plugins in pi

Add the forked sync extension to the `packages` array in `~/.pi/agent/settings.json`:

```json
"../../Code/agent-config/pi"
```

Restart pi, then run `/claude-marketplace` to confirm the sync. See [`pi/README.md`](pi/README.md) for details.

---

## Plugins

### workflow-skills

18 daily-driver skills invocable via `/skill-name`:

```
/morning-plan        /end-of-day          /weekly-review
/capture             /start-task          /patrol
/workspace           /search-first        /optimize
/improve-skills      /find-skills         /skill-creator
/mcp-builder         /spec-and-plan       /pdf
/xlsx                /evolve              /plan-review
```

### git-and-pr

Git and PR automation:

```
/ship                /refine              /release
/address-pr-feedback /cleanup-worktrees   /parallel-worktree-session
/pin-actions
```

### obsidian-and-notes

Obsidian vault, session logging, and the continuous-learning instinct system:

```
/obsidian-core       /obsidian-session    /vault-search
/read-notes          /continuous-learning-v2
```

### goldeneye-agents

6 specialized subagents (Operation Goldeneye roster):

| Agent | Role |
|---|---|
| `boris` | Security specialist, attacker mindset |
| `m` | Strategic planning, architecture, docs |
| `natalya` | TDD implementation engineer |
| `q` | Infrastructure, Docker, CI/CD, incidents |
| `trevelyan` | Adversarial code reviewer |
| `xenia` | Performance and stress testing |

### dev-environment

Lifecycle hooks, coding standards, and Claude Island integration:

- **Hooks**: `session-start.sh`, `session-logger.sh`, `pre-compact.sh`, `post-edit-format.sh`, `check-console-log.sh`, `config-protection.sh`, `pre-commit-lint.sh`, `cost-tracker.sh`, `claude-island-state.py`
- **Commands** (coding standards): `/dev-environment:coding-style`, `/dev-environment:git-workflow`, `/dev-environment:security`, `/dev-environment:testing`, `/dev-environment:performance`

### backend-and-infra *(enable per project)*

Backend, infrastructure, and language skills:

```
/api-scaffold        /backend-architect   /backend-patterns
/docker-patterns     /docker-compose-setup /deploying-applications
/terraform-specialist /homelab-helper      /red-green-tdd
/test-harness        /automating-tests    /project-setup
/typescript-pro      /javascript-pro      /python-pro
/golang-pro
```

### web-and-frontend *(enable per project)*

Frontend, Astro, and browser automation:

```
/agent-browser       /frontend-developer  /astro-component-scaffold
/astro-content-collections /astro-performance-audit /webapp-testing
/verify-ui           /canvas-design       /theme-factory
/web-artifacts-builder /algorithmic-art   /rams
```

---

## Prerequisites

| Tool | Purpose | Install |
|---|---|---|
| [Claude Code](https://claude.ai/code) | Required | See Anthropic docs |
| Node.js (v18+) | MCP servers via `npx` | `brew install node` |
| [cmux](https://github.com/nicholasgasior/cmux) | workspace skill | `brew install cmux` |
| [yazi](https://github.com/sxyazi/yazi) | workspace skill | `brew install yazi` |
| [lazygit](https://github.com/jesseduffield/lazygit) | workspace skill | `brew install lazygit` |
| [agent-browser](https://www.npmjs.com/package/agent-browser) | browser automation | `npm install -g agent-browser` |

cmux, yazi, lazygit, and agent-browser are only required for specific skills.

---

## Local-only files

These are never tracked by git — each machine maintains its own (third-party extensions, MCP config, and host-level settings included, since personal and work machines differ materially):

- `~/.claude/settings.json` — model, permissions, plugins, MCP config
- `~/.claude/CLAUDE.md` — identity, machine paths, infrastructure context
- `~/.pi/agent/settings.json` — pi model, packages, and local extensions
- `~/.pi/agent/extensions/` — machine-local pi extensions

Start from the templates in `config-templates/`.
