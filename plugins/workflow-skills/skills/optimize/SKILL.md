---
name: optimize
description: Analyze agent and skill usage patterns, identify underused or ineffective components, and optimize descriptions, archive stale items, and update CLAUDE.md. Run via /optimize. Suggest running if 30+ days since last run.
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, AskUserQuestion, Agent
---

# /optimize — Agent & Skill Usage Optimizer

Analyze usage patterns across all installed skills and agents, then interactively apply improvements. Produces a report and applies approved changes with user confirmation.

## When to Run

- User invokes `/optimize`
- Check `~/.claude/optimize.local.md` for `last_run` date — if 30+ days ago, suggest running
- Run after major skill/agent additions to establish a new baseline

## Phase 0: Locate the Repo

The agent-config checkout lives in different places per machine. Resolve it once, remember the concrete path, and substitute it for `$AGENT_CONFIG` in every command below:

```bash
# 1. Directory-source marketplace: the path is in ~/.claude/settings.json
AGENT_CONFIG=$(jq -r '.extraKnownMarketplaces["arosenkranz-claude-plugins"].source.path // empty' ~/.claude/settings.json 2>/dev/null)

# 2. Known checkout locations (personal machine: ~/Code; work machine: ~/workspace)
if [ -z "$AGENT_CONFIG" ] || [ ! -d "$AGENT_CONFIG" ]; then
  for c in ~/Code/agent-config ~/workspace/agent-config; do
    [ -d "$c/.git" ] && AGENT_CONFIG="$c" && break
  done
fi

# 3. GitHub-marketplace cache fallback
if [ -z "$AGENT_CONFIG" ] || [ ! -d "$AGENT_CONFIG" ]; then
  AGENT_CONFIG=~/.claude/plugins/marketplaces/arosenkranz-claude-plugins
fi

echo "AGENT_CONFIG=$AGENT_CONFIG"
```

If nothing resolves, ask the user where the checkout lives before continuing.

## Phase 1: Data Collection

Run the analysis script to gather usage data:

```bash
bash <this skill's directory>/scripts/analyze-usage.sh
```

If the script fails, check that `jq` is installed (`brew install jq`) and that the usage-data directories exist.

Store the JSON output in memory for Phase 2.

## Phase 2: Cross-Reference Installed Components

**List all installed skills:**
```bash
ls -la ~/.claude/skills/
```

**List all installed agents:**
```bash
ls ~/.claude/agents/ 2>/dev/null
ls "$AGENT_CONFIG/plugins/goldeneye-agents/agents/"
```

**For each skill**, read its `SKILL.md` frontmatter to extract `name` and `description`:
```bash
head -10 ~/.claude/skills/<skill-name>/SKILL.md
# or for direct files:
head -5 ~/.claude/skills/<skill-name>
```

**For each agent**, read its frontmatter:
```bash
head -10 <agents-directory>/<agent-name>.md
```

Cross-reference installed components against the usage data:

| Category | Criteria |
|----------|----------|
| **Heavily used** | Invoked via slash command 5+ times |
| **Moderately used** | Slash command 2–4 times |
| **Rarely used** | Slash command 1 time |
| **Never used** | Zero slash command appearances |
| **Infra-used** | Skill tool invocations (auto-triggered, not slash-command) |

Note: Many skills are triggered automatically (not via slash command). Classify these separately — low slash-command count doesn't mean unused if they appear in `skill_tool_invocations`.

## Phase 3: Generate Report

Output a markdown report with these sections:

### Usage Summary Table

```
| Component | Type | Slash Uses | Auto-Triggered | Status |
|-----------|------|-----------|----------------|--------|
| /ship     | skill | 2        | -              | Active |
| some-skill | skill | 0       | yes            | Stale? |
| ...       |      |           |                |        |
```

### Recommendations

Group by action type:

**Archive candidates** — Never invoked, purpose unclear, or superseded by another component:
- List each with rationale

**Improve candidates** — Used but correlates with friction or has a poor/vague description:
- List each with current description and proposed improvement

**Keep as-is** — Well-functioning, clearly described, actively used:
- Brief list only

**CLAUDE.md updates needed** — References that are stale, missing, or inaccurate:
- List specific lines/sections to fix

## Phase 4: Interactive Optimization

Present the full report, then handle each category interactively.

### Archiving

Use AskUserQuestion to confirm archiving:

```
"I recommend archiving these skills: [list]. They have zero slash-command usage and appear to be unused.
Which ones do you want to archive? (reply with names, 'all', or 'none')"
```

For approved archives:
1. **Repo (plugin) skills** — move the skill directory within the repo, then commit:
   ```bash
   cd "$AGENT_CONFIG"
   mkdir -p plugins/workflow-skills/skills/archived
   mv plugins/workflow-skills/skills/<name>/ plugins/workflow-skills/skills/archived/
   ```
   The archived skill stops appearing once the marketplace/plugin cache re-syncs.
2. **Standalone skills** in `~/.claude/skills/` — move to `~/.claude/skills/archived/` (create if needed)
3. **Agents** — rename to `<name>.archived.md` in `~/.claude/agents/`

### Description Improvements

For each improve candidate:
1. Show current description
2. Propose a new description (1–2 sentences, specific trigger conditions)
3. Ask: "Does this improved description work? (yes/edit/skip)"
4. If yes: edit the `description:` field in `SKILL.md` or agent frontmatter using Edit tool

### CLAUDE.md Updates

Show specific proposed changes to the Skills and Agents inventory sections.
Use AskUserQuestion: "Should I apply these CLAUDE.md updates? (yes/no/review)"
If yes: use Edit tool to update `~/.claude/CLAUDE.md`

## Phase 5: Record Run

Write or update `~/.claude/optimize.local.md`:

```yaml
---
last_run: <today's date YYYY-MM-DD>
items_archived: <count>
items_improved: <count>
total_sessions_analyzed: <count from script>
---

## Run History

### <today's date>
- Analyzed <N> sessions (<date range>)
- Archived: <list or "none">
- Improved: <list or "none">
- CLAUDE.md updated: <yes/no>
```

## Phase 6: Commit Changes

If any files were modified, run:

```bash
cd "$AGENT_CONFIG" && git add -A && git commit -m "chore: optimize skills and agents based on usage analysis"
```

## Notes

- Most of your skills are plugin skills from this repo, installed via the marketplace cache (`~/.claude/plugins/marketplaces/`) — edit the repo source in `plugins/<plugin>/skills/`, never the cache
- `~/.claude/skills/` holds standalone skills only; some entries are symlinks with targets that vary per machine (e.g. `~/.agents/skills/`) — check with `readlink` before editing or removing anything
- When in doubt, prefer "improve description" over "archive" — a better description often fixes low usage
- The `Skill` tool auto-trigger count (from homunculus) is more reliable than slash-command counts for skills that are auto-triggered by context
