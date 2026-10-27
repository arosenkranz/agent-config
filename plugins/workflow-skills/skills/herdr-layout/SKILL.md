---
name: herdr-layout
description: Auto-detect a project's dev server, test, and log commands (package.json, Makefile, docker compose, pyproject, go.mod, Cargo.toml) and open them as named panes in a herdr "dev" tab that the agent can watch, plus a lazygit diffs pane showing what files are changing, with test pass/fail and a changed-files count in the herdr sidebar. Use only when the user explicitly asks to set up a herdr layout/dev tab or to check the herdr test/server/diffs panes (or invokes /herdr-layout). Requires HERDR_ENV=1.
user-invocable: true
---

# /herdr-layout — Project Dev Tab in herdr

Opens a `dev` tab in the current workspace with the project's server, tests, and logs in named panes, so the agent can read them (`herdr pane read`) and wait on them (`herdr pane wait-output`) instead of guessing, plus a `diffs` pane running lazygit where Alex can watch files change and interact with them. Your agent pane stays where it is; the diffs pane is the one exception — it lands focused.

Modes: `/herdr-layout` sets up the tab. `/herdr-layout check` reads the panes and reports server/test health (see the end).

## Ground rules

- **Check first:** `test "${HERDR_ENV:-}" = 1`. Outside herdr, say so and stop.
- **Not inside /herdr-fanout worktrees.** Several worktrees each running a dev server fight over the same ports. Use it in the main checkout.
- **Status script:** `S="${CLAUDE_PLUGIN_ROOT}/scripts/herdr-status"` (workspace token `tests`).
- Read pane IDs from JSON responses. One command per Bash call.

## 1. Don't duplicate

```bash
herdr tab list --workspace "$HERDR_WORKSPACE_ID"
```

If a tab labeled `dev` exists, list its panes (`herdr pane list --workspace "$HERDR_WORKSPACE_ID"`, filter by its `tab_id`), report them, and stop. Offer `/herdr-layout check`. If the tab has no `diffs` pane, offer to add just that pane (split and start it as in step 3) instead of rebuilding the tab.

## 2. Detect commands

Work from `git rev-parse --show-toplevel` (or the current directory outside git). Check in this order and stop at the first source that yields a command for each role. Roles: **server** (long-running), **tests** (prefer a watch mode), **logs** (only when there's a real log stream), **diffs** (lazygit, for Alex — available whenever the project is a git repo, no detection needed).

| Source | server | tests | logs |
|---|---|---|---|
| `package.json` scripts | `dev`, else `start` | `test:watch`, else `test` | — |
| `Makefile` targets | `dev`, `run`, or `serve` | `test` | — |
| `compose.yaml` / `docker-compose.yml` | `docker compose up` (only if no server found above) | — | `docker compose logs -f --tail 100` |
| `pyproject.toml` / `manage.py` | `python manage.py runserver` if `manage.py` exists | `pytest` | — |
| `go.mod` | — | `go test ./...` | — |
| `Cargo.toml` | `cargo run` only if it has a `[[bin]]` or `src/main.rs` | `cargo test` | — |

For `package.json`, pick the runner from the lockfile: `bun.lock`/`bun.lockb` → `bun run`, `pnpm-lock.yaml` → `pnpm`, `yarn.lock` → `yarn`, otherwise `npm run`. Read `package.json` with a JSON parser (`node -e` or `jq`), not grep.

Nothing found for server/tests/logs → if the project is a git repo, the tab is still worth opening with just the diffs pane. Otherwise say what you looked for and stop. Don't invent commands.

## 3. Build the tab

State in one line what you're starting (e.g. "server: `pnpm dev` · tests: `pnpm test:watch` · logs: none · diffs: lazygit"), then go.

```bash
herdr tab create --workspace "$HERDR_WORKSPACE_ID" --label dev --cwd "<project root>" --no-focus
```

Save `.result.root_pane.pane_id` — the first role's pane. Then for each additional role, split (tests to the right of server; logs below tests; diffs below server, making a 2×2 grid):

```bash
herdr pane split --pane <pane> --direction right --cwd "<project root>" --no-focus
```

Name each pane by role and start its command:

```bash
herdr pane rename <pane> server
```

```bash
herdr pane run <pane> "<command>"
```

The diffs pane runs `lazygit` and is the one split made **focused** (omit `--no-focus` on its split): it exists for Alex, not the agent. lazygit is fully interactive — stage/unstage, commit, expand any hunk — and herdr being mouse-first means the file list and diffs are directly clickable. If diffs is the only role, the root pane holds it, focused.

## 4. Confirm it came up

- **Server:** `herdr pane wait-output <pane> --regex "(localhost|127\.0\.0\.1|0\.0\.0\.0):[0-9]+|ready|listening" --timeout 60000`. Report the URL if one appears. On timeout, read the pane (`--source recent-unwrapped --lines 60`) and report the error — `EADDRINUSE`/"port in use" means another server already runs; say so instead of retrying.
- **Tests:** go to step 5 once output settles.
- **diffs:** never `wait-output` a TUI. Read the pane once (`herdr pane read <pane> --source recent --lines 20`); any lazygit frame (panel headers, changed-file rows) means it's up. A shell prompt means the command failed — report it and stop.

## 5. Report test status to the sidebar

Read the test pane:

```bash
herdr pane read <tests pane> --source recent-unwrapped --lines 80
```

Decide from the runner's summary line (e.g. `Tests: 3 failed`, `FAILED`, `passed`, `ok`, `PASS`). Then:

```bash
"$S" set tests="tests ✓"
```

or `tests="tests ✗ <n>"` with the failure count, or `tests="tests …"` if it's still running. Don't guess when the output is ambiguous — leave the token unset and say so.

The diffs token comes from git, not the pane (lazygit's TUI isn't parseable):

```bash
git -C "<project root>" status --porcelain | wc -l | tr -d ' '
```

`diffs="diffs ✓"` when 0, otherwise `diffs="diffs: <n> changed"`. It only appears in the sidebar once `$diffs` is added to a `[ui.sidebar.spaces]` row in `~/.config/herdr/config.toml` — mention that to Alex once.

## Check mode

`/herdr-layout check`: find the `dev` tab's panes by name, read each (`--source recent-unwrapped --lines 80`), report server health (URL, errors) and test results, and refresh the `tests` token as in step 5. Don't read the diffs pane's TUI — report its state from `git -C "<project root>" status --porcelain` instead (changed and untracked files: the full list if short, otherwise a count) and refresh the `diffs` token. Read-only otherwise — never restart commands unless Alex asks.
