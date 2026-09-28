# pi-review UX phase 1: rail, banner, plain-English decisions

> **For agentic workers:** implement task by task, checkbox tracking. Derived from `docs/superpowers/specs/2026-09-28-pi-review-ux2-design.md` (approved).

**Goal:** plan pages gain a two-column layout with a sticky decision rail, a dismissible decision banner up top, and decision labels phrased as plain questions. The #22 design stays.

**Architecture:** all rendering changes live in `shared/html-builder.ts` (layout grid, rail, banner, CSS) plus the client script (control mirroring, progress count). Prompt guidance changes live in `plan-review/index.ts`. No schema changes, no new files except a client-script helper if the shared script grows past the 200-line guide. Vanilla JS/CSS only, pages stay self-contained.

## Global constraints

- All control markup stays HTML-escaped; reuse `escapeHtml` and existing control builders.
- Radio mirrors share one `name` per decision so the browser syncs them natively. Textareas and checkboxes sync via `input`/`change` events keyed on `data-section-id`.
- The rail collapses below 1100px; the page stays usable with the banner and in-section controls.
- No change to the diff page in this phase.
- No change to the copy-back markdown format in this phase.

---

### Task 1: layout grid and responsive shell

**Files:**
- Change: `pi/extensions/pi-review/shared/html-builder.ts` (pageCss, renderPlanPage body markup)

**Do:**
- [ ] `.wrap` becomes a two-column grid on plan pages: content column plus a 300px rail, gap ~32px, collapsing to one column below 1100px.
- [ ] Add an `aside.rail` after `main` in `renderPlanPage`; sticky, `max-height: calc(100vh - 48px)`, internal scroll.
- [ ] Diff pages keep the current single-column layout (the rail is plan-only for now).

### Task 2: decision rail contents

**Files:**
- Change: `pi/extensions/pi-review/shared/html-builder.ts`

**Do:**
- [ ] Rail mirrors every decision control, compact: the question label plus radios or approval tick. Radios reuse the same `name` as the section control so the browser syncs them.
- [ ] Rail lists contents: the jump links from `tocHtml`, always shown (drop the 4-section minimum in the rail). Remove the TOC block from the content column.
- [ ] Rail shows a progress line, `N of M decided`, with an element the client script updates.

### Task 3: decision banner

**Files:**
- Change: `pi/extensions/pi-review/shared/html-builder.ts`

**Do:**
- [ ] Banner renders under the page header when any section has a feedback control: an ordinal list, one line per decision, the question label plus the control inline, shared radio `name`.
- [ ] A dismiss control (decide as you read instead) toggles the banner hidden. No persistence.
- [ ] Sections with no feedback control are excluded.

### Task 4: client script sync and progress

**Files:**
- Change: `pi/extensions/pi-review/shared/html-builder.ts` (feedbackScript)

**Do:**
- [ ] Mirror textareas and checkboxes across banner, rail, and section via input/change events keyed on `data-section-id`.
- [ ] Count decided sections (any checked radio, checked approval, or non-empty notes) and update the rail progress element.
- [ ] The copy-back output stays byte-identical to today: buildFeedback must not emit duplicates from mirrored controls (query one canonical copy per section, e.g. scope by section element and read the first match).

### Task 5: plain-English label guidance

**Files:**
- Change: `pi/extensions/pi-review/plan-review/index.ts`

**Do:**
- [ ] `feedback.label` schema description: demand a plain question the user answers (example: How fast do we roll out?). Never a section id or a noun phrase.
- [ ] `PLAN_GUIDANCE` gains one sentence repeating the same rule for decisions and approvals.

### Task 6: tests and snapshot

**Files:**
- Change: `pi/extensions/pi-review/test/html-builder.test.ts`, snapshot; possibly a new `test/rail.test.ts`

**Do:**
- [ ] Snapshot updated for rail, banner, and TOC move.
- [ ] New assertions: banner lists only decision sections; radios in banner, rail, and section share the group name; banner dismiss control present; TOC block gone from the content column; rail hidden markup present.
- [ ] Copy-back stability: demo presentation produces the same feedback markdown as before the layout change.
- [ ] `npm run check` passes in `pi/`.
