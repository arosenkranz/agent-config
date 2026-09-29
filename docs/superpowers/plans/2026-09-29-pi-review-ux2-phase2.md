# pi-review UX phase 2: inline comments

> **For agentic workers:** implement task by task, checkbox tracking. Derived from `docs/superpowers/specs/2026-09-28-pi-review-ux2-design.md` (approved), plus the ghost-message hardening folded in per plan-page decision.

**Goal:** diff pages get line-anchored comments, plan pages get paragraph-anchored comments, the copy-back gains a Comments block with anchors, and the feedback endpoint rejects empty submissions and closes after a commit decision.

**Architecture:** rendering changes in `shared/html-builder.ts` (per-line diff rows with parsed line numbers, per-section paragraph anchors, comment bubble CSS and client script). Parser and endpoint guards in `shared/feedback.ts`. Endpoint closing on decision in `change-review/index.ts`. No schema changes.

## Global constraints

- Comment notes render through `textContent`, never innerHTML, so comment text cannot inject markup.
- The copy-back format only grows a `## Comments` block; existing Decision/Approved/Notes lines stay byte-identical.
- parseFeedback stays lenient and backward compatible: old format without comments parses as before.
- One note per anchor, plain text, remove supported, no edit, no threads.
- Unsent comments clear on reload (page state, no persistence) and on the Reset button.

---

### Task 1: diff rows with parsed line numbers

**Files:** `shared/html-builder.ts`

- [ ] renderDiffText(diff, truncated, filePath) emits one `div.diff-line` per line inside a single `pre.diff`, joined with no extra whitespace.
- [ ] Lines before the first hunk header are meta rows (no anchor, no number). Hunk headers set the new-file counter. Plus and context lines carry `data-anchor="file:line"` and a gutter number; minus lines and `\ No newline` rows carry neither.
- [ ] Truncation notice becomes a `diff-line truncated` row.
- [ ] renderDiffPage passes the file path through.

### Task 2: paragraph anchors in plan bodies

**Files:** `shared/html-builder.ts`

- [ ] renderMarkdown(md, anchorPrefix?) numbers paragraphs, list items, and table rows sequentially per section: `data-anchor="section-id:pN"`.
- [ ] Headings, code blocks, and diagrams get no anchors.
- [ ] renderPlanPage passes the section id.

### Task 3: comment interaction and copy-back

**Files:** `shared/html-builder.ts` (client script, CSS)

- [ ] One shared bubble: a plus button injected into every `[data-anchor]` element (into the first cell for table rows), revealed on hover.
- [ ] Click opens a single inline form (textarea, Add, Cancel) under the anchored element. Add pins a note with a remove control and pushes to a comments array; Cancel closes.
- [ ] buildFeedback emits `## Comments` before the overall response: one `- anchor — text` line per comment, document order, plan anchors rendered as `section-id (para N)`.
- [ ] Reset clears comments and pinned notes.
- [ ] Send to Pi refuses empty feedback client-side with a status hint.

### Task 4: endpoint and delivery hardening

**Files:** `shared/feedback.ts`, `change-review/index.ts`

- [ ] parseFeedback gains a `comments: ParsedComment[]` field reading `## Comments` blocks leniently.
- [ ] hasFeedbackContent(markdown) exported; the endpoint handler answers 422 and stays open on empty bodies.
- [ ] approveFromFeedback closes the endpoint after delivering a commit decision, so late clicks on old tabs send nothing.

### Task 5: tests and verification

- [ ] Diff rows: line numbers and anchors across adds, deletes, context, meta, and `\ No newline`; truncated row.
- [ ] Anchors: sequential numbering across paragraphs, bullets, rows; headings skipped.
- [ ] Parser: Comments block parsing, empty-body rejection, backward compatibility.
- [ ] Snapshot updates; `npm run check` green.
- [ ] Headless Chrome pass: pin a diff-line comment and a plan-paragraph comment, verify both anchors in the copyable response.
