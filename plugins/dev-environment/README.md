# dev-environment

Core dev automation — lifecycle hooks, coding standards commands, statusline, guardrails, and Claude Island integration.

## Hooks

All lifecycle hooks are consolidated here for deterministic ordering.

| Event | Scripts |
|---|---|
| `SessionStart` | `session-start.sh` (env setup, uncommitted-changes flag) |
| `PreCompact` | `pre-compact.sh` |
| `PostToolUse` (Edit) | `post-edit-format.sh` (formatter) + `check-console-log.sh` |
| `PostToolUse` (Write) | `check-console-log.sh` |
| `PreToolUse` (Bash `git commit*`) | `pre-commit-lint.sh` (lint + typecheck) |
| `PreToolUse` (Edit/Write) | `config-protection.sh` |
| `PermissionRequest` | `afplay` ping sound |

## Commands (Coding Standards)

Coding standards distributed as commands — invoke via `/dev-environment:coding-style`, etc.

- `coding-style` — Immutability, file organization, error handling
- `git-workflow` — Commit format, PR workflow, feature implementation workflow
- `memory-system` — Auto-memory system guidelines
- `performance` — Model selection, context management, ultrathink
- `security` — Mandatory security checks, secret management
- `testing` — TDD workflow, coverage requirements

## Requirements

| Tool | Purpose | Install |
|---|---|---|
| Node | `pre-commit-lint.sh` package.json detection | bundled with the project toolchain |
| `jq` | JSON parsing in hook scripts | `brew install jq` |

**Verify hooks are loading:**
```bash
# Should print the resolved plugin root
echo $CLAUDE_PLUGIN_ROOT
```
