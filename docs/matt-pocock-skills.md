# Matt Pocock skills: shared installation and workflow boundaries

Claude Code and pi use one reviewed set of Matt's skills. The installer selects the 27 published engineering/productivity skills, not the 11 miscellaneous and in-progress skills present at the audited revision. These third-party files stay on the host, not in this repository or its plugin caches.

## Install and verify

Requires Python 3.10+, Node 22.20+, npm, and git. From this checkout:

```bash
python3 scripts/install-matt-skills.py
python3 scripts/install-matt-skills.py --check
```

The reviewed source revision, CLI version, selection, and explicit-only settings live in [`config-templates/matt-pocock-skills.json`](../config-templates/matt-pocock-skills.json). The installer pins the GitHub URL to the full commit SHA and passes each selected name to the pinned skills CLI with non-interactive flags. It requests Claude copies explicitly, moves them to the canonical directory, then creates Claude links itself. This avoids depending on the CLI's default install mode.

- Canonical files: `~/.agents/skills/<name>/`
- Claude links: `~/.claude/skills/<name>`
- pi: discovers the canonical directory natively; no second installation or pi settings entry
- Installation receipt and bundled-file hashes: `~/.local/state/agent-config/matt-pocock-skills.json`

The installer refuses existing unmanaged destinations, an enabled Matt plugin, separate pi copies, changed files, and unexpected CLI link layouts. A failed install removes only its new destinations and restores the shared CLI source lock. A verified rerun does not write or call the CLI.

Don't also install `mattpocock-skills` as a Claude plugin or add Matt's repo to pi packages. Don't run `skills update` for this set: that bypasses the reviewed revision. To change revisions, audit upstream, update the selection and explicit-only flags, back up the managed installation and source lock, then remove the old managed files/links/receipt before rerunning. Preserve any local edits first; the installer deliberately refuses unattended migration.

Restart Claude Code and run `/reload` in pi after installation. Native commands are `/ask-matt`, `/tdd`, etc. in Claude and `/skill:ask-matt`, `/skill:tdd`, etc. in pi. Explicit-only skills remain user-invoked.

## When using these skills

**Authority stays with the user and the harness.** A third-party skill supplies a technique, not permission to publish, delegate, change infrastructure, create docs, or bypass approval. Read the shared [git workflow](../plugins/dev-environment/commands/git-workflow.md) and [testing policy](../plugins/dev-environment/commands/testing.md) for implementation work.

- **Clear tasks:** implement directly. Don't impose an interview, spec, or unsolicited planning document on every request. If a substantive plan is needed, use the harness presentation gate when available.
- **Skill loading:** in Claude use its Skill tool. In pi, where upstream says to call a Skill tool or another `/skill`, read the discovered skill's `SKILL.md` and its required references. Shared skills normally live under `~/.agents/skills/`. Resolve bundled relative references against that skill's directory.
- **Explicit-only flows:** preserve `disable-model-invocation`. A user-invoked flow may call its documented helpers; merely installing it does not start a spec/ticket/implementation pipeline.
- **Planning and review:** Goldeneye critiques remain available when requested or required by the shared workflow. Matt's code review checks Standards and Spec; don't add a second mandatory copy of that review. Define the comparison base and include uncommitted work when reviewing a working tree.
- **Delegation:** only launch agents when authorized by the user or applicable project instructions. If a required agent can't start, stop that flow, explain the failure, and ask before skipping the stage or switching runners. Don't quietly replace background research or parallel implementation with a different CLI.
- **Tests:** use the task's existing test policy. Choosing Matt's TDD flow includes agreeing the public test boundaries first. It does not create an extra interview requirement for tasks outside that flow.
- **Git and publication:** create a feature branch before implementation. Matt's `implement` instruction to commit to the current branch never authorizes a commit to main. Honor commit review gates. `ship` owns checks, commit, push, PR, and CI; Matt's `pr` owns the body only. Avoid duplicate commits if implementation already committed the work.
- **UI/runtime bugs:** keep real-browser verification; passing tests alone isn't proof of the runtime fix.
- **Documents and external state:** durable docs, issue/ticket publication, GitHub labels, and infrastructure changes must fit the user's requested scope. `setup-matt-pocock-skills` is explicitly per-repo, not global bootstrap. Don't run it across all projects. It may configure a tracker, create labels, and edit domain-doc pointers.
- **Retrospectives:** `retro` suggests changes. Apply those changes only with approval. The old local `improve-skills` is retired; don't invoke it even if an older plugin cache still advertises it. Keep upstream skill files unchanged unless the user explicitly requests a maintained fork.
- **Distinct tools:** keep `optimize` for usage audits, `skill-creator` for authoring/evaluation, and `search-first` for existing-solution research. Keep Herdr, Obsidian, infrastructure, language, and Lathe workflows for their separate jobs.
- **Interactive wizards:** Matt's `wizard` generates scripts for a human to run. Don't execute a prompting wizard inside the agent's non-interactive shell or leave a watcher running.

## Retirement and deployment

On the personal host, Superpowers is uninstalled; `code-review@claude-plugins-official` and `commit-commands@claude-plugins-official` are disabled. Keep the official marketplace and unrelated plugins enabled.

Tracked changes remove `improve-skills`, replace the live Superpowers references, and let `ship` use Matt's PR-body guidance. Plugin versions must change for Claude to refresh installed content. After those changes merge:

```bash
claude plugin marketplace update arosenkranz-claude-plugins
claude plugin update workflow-skills@arosenkranz-claude-plugins
claude plugin update dev-environment@arosenkranz-claude-plugins
claude plugin update git-and-pr@arosenkranz-claude-plugins
```

Restart Claude and `/reload` pi. Until publication, the shared policy above retires the old skill behavior even if the installed plugin still lists it. Don't hand-edit plugin caches or the pi marketplace checkout to simulate a release.

For both harnesses, the host instruction file should point to this document and the shared git workflow by absolute checkout path. Claude's four `~/.claude/rules/*.md` links should point to this checkout's `plugins/dev-environment/commands/`, not the former `claude-code-config` path.

## Known pi subagent blocker

At integration time, pi 1.4.0 plus `pi-subagents` 0.77.0 could not start background children. Its `src/runs/background/runner-aliases.js` exempts only stable `0.x` hosts below 0.85 from requiring `@earendil-works/chord` and `@earendil-works/chord/context`. Pi 1.4.0 declares neither package, so the check rejects the launch before a child session starts.

This is a compatibility-check mismatch, not evidence that installing chord into pi is the correct repair. The integration doesn't change pi packages. Background-dependent skills remain blocked until that issue is separately resolved. Report the actual launch result rather than assuming this note describes every future version.

The Goldeneye proposal critiques failed for this reason. The user authorized this integration without those reviews; that waiver is specific to this task, not a standing waiver for later work.

## Rollback

Back up host settings, global instructions, rule links, and `~/.agents/.skill-lock.json` before changing them. These files are machine-local and must not be committed. Existing agent settings and skill files must remain intact.

To undo this set, verify the receipt first, remove only its named Claude links and canonical directories, then remove the receipt. Remove the corresponding source-lock entries without deleting entries for other skills. Restore the backed-up settings/instructions/rule links. Re-enable official helpers if desired; Superpowers must be reinstalled, and its persistent data was preserved. Revert tracked changes through git, not plugin-cache edits.

## Sources and audit

- [Reviewed Matt Pocock source](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2), plugin version 1.3.1. Its plugin manifest lists the published selection; the recursive source tree contains more skills.
- [skills CLI installation reference](https://github.com/vercel-labs/skills/blob/main/docs/commands.md): named selections and canonical symlink installation.
- [pi skill discovery](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/skills.md): shared `~/.agents/skills/` support.

No exact skill-name collisions were found among the existing shared, Claude, pi, and local-plugin skill files at audit time. This isn't a permanent guarantee: repeat discovery checks after adding another skill source.
