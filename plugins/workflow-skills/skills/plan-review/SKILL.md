---
name: plan-review
description: "Generate an interactive HTML review page for an implementation plan — runs the plan past two parallel critique agents (an adversarial reviewer and an architecture reviewer), then renders the plan and critique as a page with per-section and general feedback boxes that copy to clipboard as Markdown. Use before a non-trivial plan is presented for approval, or on demand via /plan-review <path-to-plan.md>. Triggers on \"review this plan\", \"plan review\", \"pressure-test this plan\"."
---

# Plan Review

Turn a plan markdown file into an interactive HTML page for critique and feedback, instead of presenting the plan as chat text.

## When to use

- Automatically, per CLAUDE.md Guardrail #9, before a non-trivial plan is presented for approval.
- Explicitly via `/plan-review <path-to-plan.md>`.

## Steps

1. **Critique the plan.** Dispatch two `Agent` calls in parallel against the plan file:
   - An adversarial reviewer: "Critique this implementation PLAN — not code, no code exists yet. Read the plan below and identify: assumptions it makes, failure modes it doesn't address, scope creep or ambiguity, and whether the phased/task breakdown makes sense. Be direct and specific, referencing exact section headings where relevant.\n\n<plan file contents>"
   - An architecture reviewer: "Sanity-check this implementation plan's architecture and phasing. Identify: missing steps, risky sequencing, unaddressed edge cases, and whether the file/component breakdown is sound. Be specific and reference exact section headings where relevant.\n\n<plan file contents>"

   If either agent call fails, proceed with whatever critique is available — do not block on it.

2. **Write critique to temp files.** Write each agent's response text to its own file (`/tmp/plan-review-adversarial.txt`, `/tmp/plan-review-architecture.txt`) rather than passing it as a shell argument — critique text is long and can contain quotes/newlines that break shell escaping.

3. **Generate the HTML.** Run:
   ```bash
   python3 <this skill's directory>/scripts/build_review.py <plan_path> --adversarial-file /tmp/plan-review-adversarial.txt --architecture-file /tmp/plan-review-architecture.txt
   ```
   This prints the generated file path (e.g. `/tmp/claude-plan-review-<slug>-<timestamp>.html`). The deprecated `--trevelyan-file`/`--m-file` flags still work as aliases.

4. **Open it.** Run `open <printed path>`.

5. **Wait for feedback.** Tell the user the page is open, ask them to review the critique, leave feedback per-section and/or generally, choose Approve/Request changes, click "Copy Feedback", and paste the result back into the conversation. Do not proceed with the plan until they respond.

6. **Incorporate feedback.** Once the user pastes their feedback Markdown, treat it like any other plan-approval response per Guardrail #2 — revise and re-present if changes were requested, proceed if approved.