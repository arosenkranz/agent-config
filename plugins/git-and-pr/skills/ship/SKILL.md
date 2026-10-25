---
name: ship
description: Full ship lifecycle — lint, test, branch, commit, push, PR, CI check. Use when work is complete and ready to land. Pass --merge to also merge after CI passes. Pass --no-test to skip tests.
---

# Ship Workflow (/ship)

Full lifecycle for shipping completed work: pre-flight checks, PR creation, and CI monitoring. Invoke with `/ship`.

## When to Use

Use `/ship` when implementation is complete and changes are ready to land. This skill runs the full quality gauntlet before creating a PR.

## Flags

- `--merge` — Also merge the PR after CI passes (default: stop after CI green)
- `--no-test` — Skip the test step in pre-flight (lint still runs)

## Steps (execute in order, honor harness approval gates)

A plan or commit review gate still requires user approval. Stop at the gate rather than treating this skill as permission to bypass it.

### Phase 1: Pre-flight Checks

Detect package manager:

```bash
if [[ -f "bun.lockb" ]]; then PM="bun"
elif [[ -f "pnpm-lock.yaml" ]]; then PM="pnpm"
elif [[ -f "yarn.lock" ]]; then PM="yarn"
else PM="npm"; fi
```

Run checks in order. If any fails, stop and report — do not proceed to PR:

1. **Lint** (if `package.json` has a `lint` script):
   ```bash
   $PM run lint
   ```
   If lint fails, attempt auto-fix with `$PM run lint -- --fix` and re-check.

2. **Typecheck** (if `package.json` has a `typecheck` script):
   ```bash
   $PM run typecheck
   ```

3. **Tests** (if `package.json` has a `test` script, skip with `--no-test`):
   ```bash
   $PM run test
   ```

### Phase 2: Branch + Commit + Push

1. Check current branch:
   ```bash
   git branch --show-current
   ```
   If on `main` or `master`, create a feature branch:
   - Format: `<type>/<short-description>` (e.g., `feat/add-auth-middleware`)
   - `git checkout -b <branch-name>`

2. Stage relevant files. Exclude:
   - `.env`, `.env.*` files
   - Files matching `*.secret`, `*credentials*`, `*token*`
   - Generated files (`dist/`, `build/`, `.next/`, `node_modules/`)
   - Binary files not intentionally added

   ```bash
   git add <specific files or patterns>
   git status
   git diff --staged
   ```

3. Commit with conventional format:
   ```bash
   git commit -m "$(cat <<'EOF'
   <type>: <concise description under 72 chars>
   EOF
   )"
   ```
   Types: feat, fix, refactor, docs, test, chore, perf, ci.
   Never include "Claude", "AI", or agent attribution.

4. Push with tracking:
   ```bash
   git push -u origin <branch-name>
   ```

### Phase 3: Create PR

Load Matt Pocock's `pr` skill for the body when installed. In Claude Code, use the Skill tool; in pi, read the discovered `pr/SKILL.md` (normally `~/.agents/skills/pr/SKILL.md`). It supplies the change summary, before/after evidence, and merge risk. It does not own branching, committing, CI monitoring, or merging; those stay here.

If the skill isn't installed, use the fallback below. Do not invent successful verification or hide checks that were skipped.

Create the PR with an explicit title and body:

```bash
gh pr create --title "<type>: <description>" --body "$(cat <<'EOF'
## Summary
- <bullet 1>
- <bullet 2>

## Test plan
- [ ] <verification step>
EOF
)"
```

Output the PR URL.

### Phase 4: CI Check

Monitor CI status with a 5-minute timeout:

```bash
timeout 300 gh pr checks <pr-number> --watch
```

- If checks **pass** → report green. Stop here unless `--merge` flag was passed.
- If checks **fail** → report which checks failed. Stop and inform user.
- If **timeout** → report "CI still running, check manually" with PR URL. Stop.

### Phase 5: Merge (only with `--merge` flag)

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull origin main
```

If merge is blocked (reviews required, branch protection), report and stop — never force-merge.

### Phase 6: Summary

After completion, print:

```
Ship complete
- Lint: passed
- Typecheck: passed (or "no typecheck script")
- Tests: passed / skipped (--no-test) / "no test script"
- PR: #<number> (<url>)
- CI: all checks green / failed / timed out
- Merged: yes (squash) / no (default — use --merge to auto-merge)
```

## Constraints (always enforced)

- **Never skip lint** — if a lint script exists and fails, stop
- **Never merge with failing CI** — report failures, do not force
- **Never force-merge** — if branch protection blocks merge, stop and report
- **Default merge strategy: squash** — keeps main history clean
- **No attribution** in commits — already disabled globally
- **Never commit directly to main** — always branch first
