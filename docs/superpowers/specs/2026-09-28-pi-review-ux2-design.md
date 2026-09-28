# Design: pi-review page UX, round 2 (rail, banner, comments, explorer)

Date: 2026-09-28. Status: approved via plan-page feedback.

## Problem

The plan and diff pages work but read like documents, not review tools. Decisions sit at the bottom of each section with ids like `section-approach` instead of plain questions. The one-column layout wastes wide screens. The diff page is a long vertical scroll with no overview. There is no way to comment on a specific line or paragraph.

This design fixes those four problems in three phases.

## Goals

- Plan pages use two columns: a wider reading column and a sticky rail that never scrolls away.
- Every open decision reaches the user up front, in plain English, with controls inline.
- Comments can attach to a specific diff line or plan paragraph and flow back to the agent with an anchor.
- The diff page becomes a file explorer: tree on the left, description plus diff on the right.

## Non-goals

- No comment threads or replies. One plain-text comment per anchor.
- No server, no build step, no external assets. Pages stay fully self-contained.
- No schema changes to the tool parameters. Plain-English labels come from prompt guidance, not new fields.
- No replacement of the #22 page design. Numbered badges, the addendum treatment, and the dark theme stay.

## Phase 1: layouts and decision UX

### Two-column plan page

The reading column widens to about 1100px total. A sticky rail on the right holds:

- **Decisions**: every decision control on the page, mirrored compactly (radio pills, approval ticks).
- **Progress**: a live count, `2 of 4 decided`.
- **Contents**: the jump links that live in the TOC block today. The TOC block leaves the content column.

Controls in the banner, the rail, and the section body are three mirrors of one state. Radio inputs share one group name, so the browser keeps them in sync without JS. Textareas and checkboxes sync through input events on shared `data-section-id` targets.

### Decision banner

First thing under the title: a banner listing every open decision as a plain question, each with its control inline:

```
▌ 3 decisions before we start
 1. How fast do we roll out?   ○ Full ○ Staged ○ Hold
 2. Do we migrate the DB first? ○ Yes  ○ No
 3. Flag default state?         ○ On   ○ Off
 [decide as you read instead ->]
```

The banner is dismissible. The decide-as-you-read link collapses it; in-section controls remain the path.

### Plain-English labels

The `feedback.label` field and its tool description demand a question a human would ask. Never a section id or a noun phrase. The slop-check keeps the phrasing honest.

## Phase 2: inline comments

- **Diff pages, line comments**: hover a diff line, a plus bubble appears in the gutter. Click, type, it pins to that line.
- **Plan pages, paragraph comments**: hover a paragraph or bullet, same bubble.

Copy-back markdown gains a Comments block with anchors: `user.ts:42 — comment` and `rollout (para 2) — comment`. Per-section notes textareas stay. The Send to Pi approve flow still reads the commit decision section; comments ride along. Unsent comments clear on reload, same as unsent notes.

## Phase 3: diff file explorer

- **Left, file tree**: directories as expandable groups, files with `+N −M` counts, a status badge (new, modified, deleted), an approval tick once approved. Footer sums it up: `2 to review, 1 approved`.
- **Right, detail pane**: the selected file's description and diff together, with the per-file approval control. Phase 2 line comments live here.
- **Sticky bottom bar unchanged**: the final commit decision stays in the bar, always reachable.

All file panes are pre-rendered and switched with inline JS. Keyboard: `j`/`k` jump between files, `a` approves the current file.

## Responsive and fallback behavior

- Under about 1100px the plan rail hides; the banner becomes the primary decision surface. Under 640px the current compact styles apply.
- Under about 1000px on diff pages the tree collapses into a drawer at the top.
- Without JS, the diff page falls back to today's stacked sections; the explorer markup builds on that foundation.
- The copy-back Comments block is read leniently by the parser in `feedback.ts`, so stale pages with the old format still work.

## Ship order

Approved order: phase 1 (layouts and decision UX), then phase 2 (inline comments), then phase 3 (diff explorer). Three branches, three PRs, each shippable alone. The user works with each phase before the next starts.
