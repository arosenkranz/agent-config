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
| `cmux` | `workspace` | `brew install cmux` |
| `yazi` | `workspace` | `brew install yazi` |
| `lazygit` | `workspace` | `brew install lazygit` |
| `agent-browser` CLI | `agent-browser` | `npm install -g agent-browser` |
| Playwright browsers | `agent-browser` | `npx playwright install chromium` |
| Python 3 | `continuous-learning-v2` | `brew install python` |

## Hooks

`observe.sh` fires on every `PreToolUse` and `PostToolUse` to capture tool patterns for the continuous-learning skill.
