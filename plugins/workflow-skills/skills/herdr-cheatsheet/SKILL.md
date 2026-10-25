---
name: herdr-cheatsheet
description: Look up herdr keybindings, mouse actions, copy-mode and picker keys, agent states, and config syntax — resolved against the user's own ~/.config/herdr/config.toml overrides — or open the herdr cheatsheet web page. Use for "how do I X in herdr", "what's the herdr shortcut for", or "show the herdr cheatsheet". For actually driving herdr (splitting panes, running commands, reading output, waiting on agents), use the `herdr` skill instead.
user-invocable: true
---

# /herdr-cheatsheet — herdr Quick Reference

Answers "how do I…" questions about herdr from a bundled cheatsheet, adjusted to Alex's actual keybindings, and opens the same cheatsheet as a searchable web page.

## Files

- `${CLAUDE_PLUGIN_ROOT}/skills/herdr-cheatsheet/cheatsheet-data.js` — the content. `window.HERDR_CHEATSHEET = {...};` where the body is strict JSON: `herdrVersion` plus `sections[]`, each with `title`, `kind` (`keys`, `mouse`, `cli`, `config`, `concepts`, `trouble`), and `items[]`. Key items use `keys: [...]` where `"prefix"` means the prefix key and `"/"` means "or".
- `${CLAUDE_PLUGIN_ROOT}/skills/herdr-cheatsheet/index.html` — the web page. It loads the data file, so the two never disagree.

If `${CLAUDE_PLUGIN_ROOT}` isn't expanded, both files sit next to this SKILL.md (the skill's base directory).

## Boundary with the `herdr` skill

- User wants to **know** a key, a mouse action, or config syntax → this skill.
- User wants something **done** in herdr (open a pane, run tests in another pane, wait on an agent) → stop and use the `herdr` skill.
- User asks for **CLI syntax** → run `herdr <group>` (e.g. `herdr pane`); the installed binary is the authority. Don't answer CLI flags from the data file's `cli` sections — those exist for the web page.

## Answering a "how do I…" question

### 1. Read the cheatsheet data

Read `cheatsheet-data.js` and find the matching item(s) in the `keys`, `mouse`, `concepts`, `config`, or `trouble` sections.

### 2. Resolve Alex's overrides

Read the config (path is `$HERDR_CONFIG_PATH` if set, otherwise `~/.config/herdr/config.toml`). If it's missing or has no `[keys]` table, the defaults in the data file are correct — skip to step 3.

Otherwise, in this order:

1. **Prefix first.** If `[keys]` sets `prefix`, every `"prefix"` in the data means that key instead of `ctrl+b`. This changes nearly every binding, so never skip it.
2. **Then individual actions.** `[keys]` entries use action names (`split_vertical = "ctrl+alt+d"`), but the data file lists bindings, not action names. Run `herdr --default-config` and match the action's default binding (e.g. `# split_vertical = "prefix+v"`) to the cheatsheet row. A value may be a string or a list; a list means every listed chord works.
3. An empty string (`""`) unbinds the action — say so instead of giving the default.

### 3. Answer

Give the binding as Alex would actually press it, e.g. "`ctrl+a` then `v`" — not `prefix+v`. If an override changed it, mention the default in a few words so the web page (which shows defaults) isn't confusing. If the mouse can do it, say that too; herdr is mouse-first.

If nothing in the data matches, say so, then check `herdr --default-config` or https://herdr.dev/docs/keyboard/. Never invent a binding.

## Opening the web page

```bash
open "${CLAUDE_PLUGIN_ROOT}/skills/herdr-cheatsheet/index.html"
```

If `open` fails or `$SSH_CONNECTION` is set (the agent isn't on Alex's Mac), print the absolute path instead and tell Alex to open it locally.

The page has search (`/`), category filters, and click-to-copy commands. It always shows default bindings.

## Version check

Run `herdr --version`. If it differs from `herdrVersion` in the data, add one line: "This cheatsheet was written for herdr <herdrVersion>; you're on <installed>. Bindings may have changed." Then answer normally.

## Updating the cheatsheet

Never edit these files in place. The harness loads this skill from an installed copy (Claude Code's plugin cache, pi's marketplace checkout) that the next plugin update overwrites. If Alex wants it updated: edit `plugins/workflow-skills/skills/herdr-cheatsheet/cheatsheet-data.js` in `~/Code/agent-config` on a branch, using `herdr --default-config` and `herdr <group>` output as the source, keep the body valid JSON, bump `herdrVersion`, and open a PR.
