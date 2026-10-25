# workflow-skills

92 productivity skills for Claude Code, invocable via `/skill-name`.

## Usage

Skills are auto-discovered by Claude Code when this plugin is enabled. Invoke any skill with:

```
/morning-plan
/course-review
/doc-generate
```

## Notable Skills

- `morning-plan` — Daily standup and task planning
- `course-review` — Learning content review
- `doc-generate` — Documentation generation
- `agent-browser` — Browser automation via Playwright
- `api-scaffold` — REST API scaffolding
- `continuous-learning-v2` — Tool use pattern observation

## Requirements

Most skills are conversational and need no external tools. A handful require:

| Tool | Skills that use it | Install |
|---|---|---|
| `herdr` | `herdr-cheatsheet` (optional — reads your config and version) | `brew install herdr` |
| `herdr`, `gh` | `herdr-fanout`, `herdr-review`, `herdr-layout` | `brew install herdr gh` |
| `cmux` | `workspace` | `brew install cmux` |
| `yazi` | `workspace` | `brew install yazi` |
| `lazygit` | `workspace` | `brew install lazygit` |
| `agent-browser` CLI | `agent-browser` | `npm install -g agent-browser` |
| Playwright browsers | `agent-browser` | `npx playwright install chromium` |
| Python 3 | `continuous-learning-v2` | `brew install python` |

## herdr automation

Skills for [herdr](https://herdr.dev) power use. They work in Claude Code (`/name`) and pi (`/skill:name`), and only run when you ask for them by name inside herdr (`HERDR_ENV=1`).

| Skill | What it does |
|---|---|
| `herdr-cheatsheet` | Keybinding/config lookup against your own `config.toml`; opens the web cheatsheet |
| `herdr-fanout` | Splits a task into ≤3 parts, one worktree + Claude/pi worker each, one reviewed PR each; `cleanup` removes merged worktrees |
| `herdr-review` | Second-opinion review by any Claude/pi model you pick, posted to the PR, verdict in the sidebar |
| `herdr-layout` | Auto-detected `dev` tab with server/tests/logs panes the agent can watch |

### Sidebar status

`scripts/herdr-status` writes sidebar tokens: `$pr`, `$ci`, `$tests`, `$review` per workspace and `$task` per agent pane. It is called by the skills, by this plugin's Claude hook (`hooks/hooks.json`: session start, `git push`, `gh pr …`), and by the pi extension `pi/extensions/herdr-status`, so both harnesses report the same way. CI status comes from a background `gh pr checks --watch` (one per PR) because CI finishes after the agent goes idle. Outside herdr the script does nothing.

The tokens only appear once your herdr config lists them. Add this to `~/.config/herdr/config.toml` (the non-`$` entries are herdr's defaults), then `herdr server reload-config`:

```toml
[ui.sidebar.spaces]
rows = [["state_icon", "workspace"], ["branch", "git_status", "$pr", "$ci"], ["$tests", "$review"]]

[ui.sidebar.agents]
rows = [["state_icon", "machine", "workspace", "tab"], ["agent", "$task"]]
```

Tests: `bats tests/herdr-status.bats` (repo root).
