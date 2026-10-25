# Testing

Automated tests:

- `bats tests/` — shell scripts (currently `tests/herdr-status.bats` for `plugins/workflow-skills/scripts/herdr-status`)
- `npm --prefix pi run check` — pi extensions (typecheck + marketplace, pi-review, herdr-status tests)

If new shell scripts are added to `scripts/`, add corresponding `.bats` tests in `tests/` using the [Bats](https://github.com/bats-core/bats-core) framework.
