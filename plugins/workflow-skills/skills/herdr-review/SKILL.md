---
name: herdr-review
description: Get a second opinion from a different agent — any Claude Code or pi model, chosen each time — running next to you in herdr. The reviewer reviews the PR or branch diff, posts its findings as a PR comment, and hands back a PASS/CHANGES verdict that also shows in the herdr sidebar. Use only when the user explicitly asks for a cross-agent or second-agent review with herdr (or invokes /herdr-review); also used by /herdr-fanout. Requires HERDR_ENV=1.
user-invocable: true
---

# /herdr-review — Cross-Agent Review in herdr

Starts a reviewer agent in a pane beside the code, has it review the PR (or the branch diff), and brings back a verdict. A different model family catches different mistakes than the one that wrote the code.

## Ground rules

- **Check first:** `test "${HERDR_ENV:-}" = 1`. Outside herdr, say so and stop.
- **Status script:** `S="${CLAUDE_PLUGIN_ROOT}/scripts/herdr-status"`. Workspace token `review`, set on the workspace being reviewed.
- **Never answer a blocked dialog** in the reviewer. If it blocks, set `review="review: needs you"` and tell Alex.
- **Don't scrape long replies from the screen.** The reviewer writes its verdict to a file; read that.
- One command per Bash call; keep waits under 9 minutes.

## Inputs

When called by **/herdr-fanout**, these are given: reviewer harness+model, the worker's workspace ID and pane ID, PR number, and a run directory. Skip to step 2.

When invoked directly, gather them:

- **Reviewer:** ask Alex which harness (Claude Code or pi) and model. Every time — never pick silently. Suggest a different family than the one that wrote the code; `pi --list-models` lists pi's options.
- **Target:** `gh pr view --json number,url --jq '"\(.number) \(.url)"'` in the current directory. No PR → review the branch diff against the default branch instead (no PR comment).
- **Where:** your own workspace (`$HERDR_WORKSPACE_ID`) and pane (`$HERDR_PANE_ID`).
- **Run directory:** `mktemp -d "${TMPDIR:-/tmp}/herdr-review.XXXXXX"`.

## 1. Mark the review as running

```bash
"$S" --workspace <workspace> set review="review …"
```

## 2. Write the brief

Write `<run dir>/review-<n>.md` (use the PR number, or `branch` when there's no PR):

```markdown
# Review request

Review <PR URL> (or: the diff of the current branch against <default branch>; run `git diff <default branch>...HEAD`).
Repository checkout: <absolute path of the code under review>

Focus on correctness bugs, security problems, and missing tests. Skip style nits. For each finding give file:line, what's wrong, and a concrete fix.

## Deliver (required)
1. <PR only:> Post the full review as a PR comment: write it to a temp file and run `gh pr review <n> --comment --body-file <file>`. (Comment, not approve/request-changes: the author account can't approve its own PR.)
2. Write <run dir>/review-<n>.verdict. First line exactly `PASS` (nothing that must change) or `CHANGES` (at least one must-fix finding). Then a summary of at most 10 lines.
Do not wait for replies.
```

## 3. Start the reviewer beside the code

Split below the target pane so the code's pane keeps its width, and keep Alex's focus where it is:

```bash
herdr pane split --pane <pane> --direction down --cwd "<checkout path>" --no-focus
```

Save `.result.pane.pane_id` as REVIEW_PANE. Start the agent (name `rv-<n>`; if taken, add a suffix):

```bash
herdr agent start rv-<n> --kind <claude|pi> --pane <REVIEW_PANE> --timeout 60000 -- --model <model>
```

If it returns `agent_not_ready`, it's blocked at startup. If the screen shows the Claude trust prompt for exactly the checkout path above (a worktree created by /herdr-fanout), handle it as /herdr-fanout step 4c describes. Otherwise set `review="review: needs you"` and stop.

```bash
herdr agent wait rv-<n> --until idle --timeout 30000
```

```bash
sleep 3
```

## 4. Hand over the brief and wait

```bash
herdr agent prompt rv-<n> "Read <run dir>/review-<n>.md and do exactly what it asks." --wait --timeout 480000
```

On `agent_prompt_stalled`: read the screen; if the input is empty, wait 3 seconds and resend once. On `timeout`: wait again with `herdr agent wait rv-<n> --timeout 480000` (repeat up to 3 times). On `blocked`: `review="review: needs you"`, tell Alex, stop.

A settled state isn't proof it's done — the verdict file is. If the agent settled with no verdict file, prompt once: "You haven't written <run dir>/review-<n>.verdict yet. Finish the Deliver steps." and wait again.

## 5. Record the verdict

Read the first line of the verdict file:

```bash
"$S" --workspace <workspace> set review="review ✓"
```

for `PASS`, or `review="review: changes"` for `CHANGES`.

## 6. Hand back

- **Called by /herdr-fanout:** return the verdict and summary; fanout decides what happens next.
- **Invoked directly:** show Alex the summary and the PR comment link. If you wrote the code under review, offer to address the findings — don't start without a yes.

Then shut the reviewer down and close the pane you created (the full review lives on the PR):

```bash
herdr pane close <REVIEW_PANE>
```
