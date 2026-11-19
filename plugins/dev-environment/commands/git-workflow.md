# Git Workflow

## Commit Message Format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Note: Attribution disabled globally via ~/.claude/settings.json.

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Load Matt Pocock's `pr` skill for the PR body when installed (see `docs/matt-pocock-skills.md` in the agent-config checkout). Keep the title under 70 characters. If unavailable, use a short summary, verification evidence, and merge risk.
4. Create PR using `gh pr create` with HEREDOC body format:
   ```bash
   gh pr create --title "feat: add user authentication" --body "$(cat <<'EOF'
   - Implement JWT-based authentication
   - Add login/logout endpoints
   - Add auth middleware
   EOF
   )"
   ```
5. Push with `-u` flag if new branch
6. Use `gh pr view` to verify PR creation and check status

## Feature Implementation Workflow

1. **Match the task**
   - Implement clear requests directly. Clarify missing requirements before making consequential choices; don't force every task through a spec or planning document.
   - Use Matt Pocock's interview/spec/ticket flows when the user requests them. Preserve explicit-only invocation settings. Creating tracker issues, labels, ADRs, or glossaries needs the user's requested scope.
   - When using Matt's skills, read `docs/matt-pocock-skills.md` in the agent-config checkout for harness adaptation and workflow boundaries.

2. **Pressure-test the approach**
   - Run the plan or diagnosis past an available reviewer agent before committing to it: one adversarial pass (challenge assumptions, find logical flaws) and one architecture/planning pass.
   - Treat their critique as input, not gospel — verify claims before acting on them.
   - If agents cannot start, report the blocker and ask before skipping review or changing runners. Present substantive plans through the harness's review tool when available.

3. **Implement with tests alongside**
   - Write the code and its tests together (test-first when the behavior is well-specified). See `testing.md`.
   - For UI/runtime changes, verify in a real browser session, not just via tests.

4. **Review**
   - Self-review the diff, then use Matt's `code-review` skill for Standards and Spec review, or an available adversarial reviewer agent. Extra review perspectives are optional, not duplicate mandatory stages.
   - If a review needs unavailable subagents, report the blocker and get permission for a direct review.
   - Address CRITICAL and HIGH issues; fix MEDIUM when reasonable.

5. **Commit & Push**
   - Create the feature branch before implementation. A skill that says "commit to the current branch" does not authorize committing to main.
   - Use `ship` for checks, commit, push, PR, and CI. Matt's `pr` skill controls the body only; `implement` does not bypass approval gates or initiate a second shipping flow.
   - Don't use extended commit messages when possible
   - Don't ever include Claude or any other agent's name in commit messages
   - Follow conventional commits format
