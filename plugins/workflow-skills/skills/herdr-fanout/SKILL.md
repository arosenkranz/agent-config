---
name: herdr-fanout
description: Split a coding task into up to 3 independent parts and run each in its own herdr git worktree with its own Claude Code or pi worker, each landing its own reviewed PR, hands-off. Also cleans up merged fan-out worktrees. Use only when the user explicitly asks to fan out, parallelize, or run parallel agents/workers with herdr (or invokes /herdr-fanout). Requires HERDR_ENV=1.
user-invocable: true
---

# /herdr-fanout — Parallel Agents in herdr Worktrees

Runs up to 3 workers at once, each in its own herdr worktree workspace (own directory, own branch, own sidebar row). Each worker implements its part, opens a PR, and gets a cross-agent review. Alex is only pulled in for blockers; the sidebar is the alert channel.

Modes: `/herdr-fanout <task>` runs a fan-out. `/herdr-fanout cleanup` removes finished worktrees (see the end).

## Ground rules

- **Check first:** `test "${HERDR_ENV:-}" = 1` and `git rev-parse --show-toplevel`. Outside herdr or a git repo, say so and stop.
- **Max 3 workers.** Never more, even if the task splits further — fold the rest into the closest part or tell Alex what was left out.
- **Never answer a blocked dialog** except the one trust prompt described in step 4. Anything else blocked → mark it in the sidebar and move on to other workers.
- **Read IDs from JSON responses.** Never guess pane or workspace IDs.
- **Status script:** `S="${CLAUDE_PLUGIN_ROOT}/scripts/herdr-status"`. Use it for every sidebar update below. It never fails loudly, so don't check its output.
- Commands below are one per Bash call. Keep every wait under 9 minutes (the Bash tool caps at 10).

## 1. Ask two questions, then go

Ask Alex once, together (use your question tool if you have one):

1. **Workers:** which harness and model. Offer: same as you (default), Claude Code with a named model, or pi with a named model (`pi --list-models` lists them). One choice applies to all workers unless Alex specifies per part.
2. **Reviewer:** which harness and model reviews each PR, or no review. Suggest a different model family than the workers. Never pick one silently.

After that, do not ask again. Hands-off from here.

## 2. Split the task

Write the split as a short table: slug (`[a-z][a-z0-9-]{0,20}`), one-line goal, and the files/directories each part will touch.

**Refuse overlapping splits.** If two parts touch the same file, merge them into one part. Three PRs editing one file means manual merge conflicts later — the single biggest way fan-out wastes time.

Show the table in one message, then continue without waiting.

## 3. Prepare the run directory

```bash
mktemp -d "${TMPDIR:-/tmp}/herdr-fanout.XXXXXX"
```

Remember this absolute path as RUN. For each part, write `RUN/<slug>.md` (outside the repo, so it's never committed) with:

```markdown
# Task: <one-line goal>

<full description of this part, acceptance criteria, files in scope>

## Out of scope
Do not modify files outside: <file list>. Other workers own them.

## Finish protocol (required)
1. Run the project's lint/typecheck/tests if they exist; fix failures.
2. Commit on the current branch with a clear message.
   <pi workers only:> Prefix the commit command exactly like this: `PI_REVIEW_BYPASS=1 git commit ...`
3. `git push -u origin HEAD`
4. `gh pr create --fill` (add a short summary body).
5. Write the PR URL to RUN/<slug>.done — e.g. `echo "<url>" > RUN/<slug>.done`. This file is how the orchestrator knows you are finished.

If you cannot finish (missing info, failing tests you can't fix), write the reason to RUN/<slug>.blocked instead and stop. Do not wait for replies.
```

Substitute real paths for RUN — the worker must see absolute paths.

## 4. Start each worker

For each part, in order:

**a. Create the worktree** from the repo root:

```bash
herdr worktree create --cwd "<repo root>" --branch "<prefix>/<slug>" --label "<slug>" --no-focus
```

Use `feat/` as prefix unless the task is clearly a fix (`fix/`). Save `.result.workspace.workspace_id`, `.result.root_pane.pane_id`, and `.result.worktree.path`. If it fails because the repository isn't trusted by herdr, stop and tell Alex — never add `--trust-repository` yourself.

If no herdr workspace was open for the repo itself, herdr also opens one for the repo root alongside the first worktree. That's normal; leave it.

**b. Start the agent** (name `fo-<slug>`, max 32 chars):

```bash
herdr agent start fo-<slug> --kind <claude|pi> --pane <root_pane> --timeout 60000 -- --model <model>
```

Omit `-- --model …` if Alex chose the default model.

**c. If it returns `agent_not_ready`** (expected for Claude in every new worktree; pi workers start without a trust prompt), read the screen:

```bash
herdr agent read fo-<slug> --source visible
```

Auto-accept **only** when all three are true: the screen contains `Accessing workspace:`, the exact worktree path from step 4a, and `Yes, I trust this folder`. Alex approved this one case: it's a checkout of a repo he is already working in. Then:

```bash
herdr agent send-keys fo-<slug> down
```

Read the screen again and confirm `❯` is on the `Yes, I trust this folder` line, then:

```bash
herdr agent send-keys fo-<slug> enter
```

If any condition fails, or any other dialog is showing: `"$S" --pane <root_pane> set task="⚠ <slug>: needs you (startup)"` and skip this worker.

**d. Wait until ready, then give it the task:**

```bash
herdr agent wait fo-<slug> --until idle --timeout 30000
```

```bash
sleep 3
```

```bash
herdr agent prompt fo-<slug> "Read RUN/<slug>.md and complete it, following its finish protocol exactly." --wait --timeout 20000
```

- `timeout` → good: the worker is busy. Continue.
- `agent_prompt_stalled` → the agent dropped the input while still loading. Read the screen; if the input box is empty, wait 3 seconds and send the same prompt once more. If it stalls again, mark `⚠ needs you` and skip.
- Returned `done`/`idle` quickly → it may have finished or bailed; the monitor loop will check its marker.

**e. Label it:** `"$S" --pane <root_pane> set task="fanout: <slug> · working"`

Then set your own row: `"$S" set task="fanout 0/<n> done"`.

## 5. Monitor until every worker is finished or stuck

Loop over unfinished workers. For each:

```bash
herdr agent wait fo-<slug> --timeout 480000
```

Then decide by marker file first, agent state second:

| Observation | Meaning | Action |
|---|---|---|
| `RUN/<slug>.done` exists | Finished; contains PR URL | Mark finished, go to step 6 for it |
| `RUN/<slug>.blocked` exists | Worker gave up | `task="⚠ <slug>: blocked"`, record the reason, stop tracking |
| state `blocked` | A dialog needs Alex | `task="⚠ <slug>: needs you"`, check it again next loop |
| `done`/`idle`, no marker | Paused between turns, not finished | First time: prompt "You haven't written RUN/<slug>.done. Continue with the finish protocol in RUN/<slug>.md." Second time: treat as stalled (`⚠ <slug>: stalled`) |
| wait returned `timeout` | Still working | Check the next worker |

`done` alone never means finished — only the marker does. Update your own row (`fanout <k>/<n> done`) as workers finish.

## 6. Review each PR

If Alex chose no reviewer, skip to step 7. Otherwise, as each worker finishes, follow the **herdr-review** skill for that PR with these inputs: the chosen reviewer, the worker's workspace and root pane (split the reviewer below the worker's pane), the PR number, and `RUN` as the directory for the verdict file. Reviews of different PRs can overlap with other workers still running.

When the verdict is `CHANGES`: prompt the worker once — "The review on <PR URL> requested changes. Address them, push, and overwrite RUN/<slug>.done with the PR URL when done." — delete the old `.done` first, then monitor it as in step 5. One fix round only; after that, report remaining findings to Alex instead of looping.

Set the worker's pane task to `fanout: <slug> · PR #<n>` when it's done and reviewed.

## 7. Report

One table: slug, PR link, review verdict, anything blocked or stalled with its reason. Set your own row to `fanout done` (or `fanout: <k> need you`).

Leave worktrees and workers in place — Alex may want to inspect them, and PRs merge later. Mention `/herdr-fanout cleanup` for after merging.

## Cleanup mode

`/herdr-fanout cleanup` removes worktrees whose work has landed. From the repo root:

```bash
herdr worktree list --cwd "<repo root>"
```

Consider only entries with `is_linked_worktree: true`, a `path` under herdr's worktree directory (`~/.herdr/worktrees/` unless `[worktrees] directory` in `~/.config/herdr/config.toml` says otherwise), and a branch starting with `feat/` or `fix/`. Worktrees Alex made some other way are never touched. For each:

1. `gh pr view <branch> --json state --jq .state` must be `MERGED`.
2. `git -C <path> status --porcelain` must be empty.
3. If it has an `open_workspace_id`, no agent in that workspace may be `working` (`herdr agent list`).

Only when all three hold:

```bash
herdr worktree remove --workspace <open_workspace_id>
```

```bash
git -C "<repo root>" branch -D <branch>
```

(`worktree remove` deletes the directory and closes the workspace but keeps the branch; `-D` is safe here because GitHub reports the PR merged, including squash merges that plain `-d` rejects.) For worktrees without an open workspace, use `git -C "<repo root>" worktree remove <path>` instead.

Report what was removed and what was skipped and why. Never remove anything else.
