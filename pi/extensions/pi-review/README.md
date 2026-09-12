# pi-review

An always-on review gate for [pi](https://github.com/earendil-works/pi-coding-agent). One extension, two modules, one shared HTML presentation engine:

- **Plan reviewer.** Substantive plans (more than one step or one real decision) are presented as an interactive HTML page with per-section feedback controls, opened in Chrome, instead of written into chat. The behavior is always-on: `before_agent_start` appends the guidance to the system prompt, and the `present_plan` tool enforces plain language before the page is built.
- **Change reviewer.** Every `git commit` is blocked until you approve the staged diff. The `review_changes` tool builds a self-contained diff page (diff first, explanation next, per-file approval) and shows an Approve/Reject dialog as the fallback path. Approval is keyed to the staged tree hash, so an approval only ever lets through the exact reviewed content, once.
- **Feedback loop.** Every page has a "Copy feedback for Pi" button (always works) and a "Send to Pi" button that POSTs to a short-lived localhost endpoint the extension runs while the page is open. Feedback lands back in the session as a user message.

## Install

The code lives in this repo; pi loads it through a symlink:

```bash
ln -sfn ~/Code/agent-config/pi/extensions/pi-review ~/.pi/agent/extensions/pi-review
```

Restart pi after creating the symlink. Verify with `pi -p "List your tool names"`; `present_plan` and `review_changes` should appear.

## Commands

| Command | Effect |
|---|---|
| `/plan-review on\|off\|status` | Toggle plan presentations (default: on) |
| `/change-review on\|off\|status` | Toggle the commit gate (default: on in interactive sessions) |
| `/present-plan` | Re-present the last plan |
| `/review-changes` | Ask the agent to open the staged-change review now |

## Commit gate details

- **Detection.** The gate parses bash commands and only matches `git commit` in command position, including inside compound commands (`git add . && git commit ...`) and after git global flags (`git -C dir commit`). Strings, echo arguments, and comments never match.
- **Approval tokens.** Approval is recorded against the `git write-tree` hash of the index at review time. When the agent re-runs the commit, the gate compares the current staged hash: same content passes and the token is consumed; any change to the staged files blocks again.
- **Bypass paths.**
  - `git commit --no-review` skips the review for that commit (the marker is stripped before git runs).
  - `PI_REVIEW_BYPASS=1 git commit ...` disables the gate for that command. The command-prefix form always works; exported environment variables can be stripped by wrapper environments (for example the sandboxed `pi` shim on this machine).
  - `/change-review off` turns the gate off until you turn it back on.
- **`git commit -a`** cannot be reviewed faithfully against the staged diff, so the gate asks the agent to stage explicitly with `git add` instead.
- **Headless sessions** (print/JSON mode, no UI) never engage the gate; it logs a notice instead.

## Sandbox and location notes

Sandboxed pi sessions can only write under the session workdir and a few granted paths, so output locations have fallback chains:

- Plan pages try `~/workspace/agent-plans/<date-slug>/` first (the existing convention), then `<cwd>/agent-plans/`, then `~/.pi/agent/agent-plans/`. The tool result reports the actual path.
- Diff pages go to `/var/tmp/pi-review-diffs/<stamp-slug>/`, then `<cwd>/.pi-review-diffs/`, then `~/.pi/agent/review-diffs/`.
- Opening Chrome can be denied by the sandbox. When that happens the tool tells the agent to open the page with its bash tool, or to give you the path and the `open -a "Google Chrome" ...` command to run.
- Every page is fully self-contained (inline CSS/JS, no network), so "Copy feedback for Pi" keeps working from a stale page after the endpoint closes. The "Send to Pi" button visibly disables when its endpoint is gone.

## Plan prose rules

`shared/slop-check.ts` enforces the mechanical tells from the unslop skill before a page is built: puffery words (comprehensive, leverage, delve, streamline, ...), "not just X but Y" shapes, chatbot openers, hollow phrases, curly quotes, em dashes, and filler. A rejected call lists the offending lines and the agent must rewrite and call again. Technical detail is never banned; it belongs in a final "Addendum" section.

## Development

```bash
cd pi
npm run test:pi-review   # vitest: html builder snapshots, slop check, git parser, feedback parser, endpoint
npm run typecheck
```

Layout:

```
pi/extensions/pi-review/
├── index.ts                 # entry: wires both modules
├── shared/
│   ├── html-builder.ts      # plan + diff page rendering (one engine)
│   ├── feedback.ts          # feedback markdown parser, delivery, localhost endpoint
│   └── slop-check.ts        # plain-language rules
├── plan-review/index.ts     # prompt injection + present_plan tool + /plan-review, /present-plan
├── change-review/
│   ├── index.ts             # commit gate + review_changes tool + /change-review, /review-changes
│   └── git.ts               # shell tokenizer + commit detection + bypass handling
└── test/                    # vitest suites
```
