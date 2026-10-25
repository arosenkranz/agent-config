#!/usr/bin/env bats
# Tests for plugins/workflow-skills/scripts/herdr-status.
# Fake `herdr` and `gh` binaries on PATH record their arguments, so nothing
# touches a real herdr server or GitHub.

SCRIPT="$BATS_TEST_DIRNAME/../plugins/workflow-skills/scripts/herdr-status"

setup() {
  FAKE_BIN="$BATS_TEST_TMPDIR/bin"
  mkdir -p "$FAKE_BIN"
  export HERDR_LOG="$BATS_TEST_TMPDIR/herdr.log"
  export GH_LOG="$BATS_TEST_TMPDIR/gh.log"
  : >"$HERDR_LOG"; : >"$GH_LOG"

  cat >"$FAKE_BIN/herdr" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$HERDR_LOG"
EOF
  # gh behavior is driven by env vars so each test can shape the response.
  cat >"$FAKE_BIN/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$GH_LOG"
case "$1 $2" in
  "pr view") [[ -n "${FAKE_PR:-}" ]] && echo "$FAKE_PR" || exit 1 ;;
  "pr checks")
    if [[ " $* " == *" --watch "* ]]; then sleep "${FAKE_WATCH_SLEEP:-0}"; exit 0; fi
    printf '%s\n' ${FAKE_BUCKETS:-} ;;
esac
EOF
  chmod +x "$FAKE_BIN/herdr" "$FAKE_BIN/gh"

  export PATH="$FAKE_BIN:$PATH"
  export HERDR_ENV=1 HERDR_WORKSPACE_ID=w9 HERDR_PANE_ID=w9:p1
  export TMPDIR="$BATS_TEST_TMPDIR"

  # refresh only runs inside a git work tree.
  REPO="$BATS_TEST_TMPDIR/repo"
  git init -q "$REPO"
  cd "$REPO"
}

@test "no-op outside herdr" {
  HERDR_ENV= run "$SCRIPT" set task=building
  [ "$status" -eq 0 ]
  [ ! -s "$HERDR_LOG" ]
}

@test "no-op when herdr is not installed" {
  rm "$FAKE_BIN/herdr"
  PATH="$FAKE_BIN:/usr/bin:/bin" run "$SCRIPT" set task=building
  [ "$status" -eq 0 ]
}

@test "task is reported on the pane, other keys on the workspace" {
  run "$SCRIPT" set task=building tests="tests ✓"
  [ "$status" -eq 0 ]
  grep -qx "pane report-metadata w9:p1 --source agent-config --token task=building" "$HERDR_LOG"
  grep -qx "workspace report-metadata w9 --source agent-config --token tests=tests ✓" "$HERDR_LOG"
}

@test "--workspace and --pane override the caller's ids" {
  run "$SCRIPT" --workspace w2 --pane w2:p3 set task=x review=y
  grep -qx "pane report-metadata w2:p3 --source agent-config --token task=x" "$HERDR_LOG"
  grep -qx "workspace report-metadata w2 --source agent-config --token review=y" "$HERDR_LOG"
}

@test "clear removes tokens from the right target" {
  run "$SCRIPT" clear task review
  grep -qx "pane report-metadata w9:p1 --source agent-config --clear-token task" "$HERDR_LOG"
  grep -qx "workspace report-metadata w9 --source agent-config --clear-token review" "$HERDR_LOG"
}

@test "usage errors exit 2" {
  run "$SCRIPT" set novalue
  [ "$status" -eq 2 ]
  run "$SCRIPT" bogus
  [ "$status" -eq 2 ]
  run "$SCRIPT" watch notanumber
  [ "$status" -eq 2 ]
}

@test "refresh with no PR clears pr and ci" {
  run "$SCRIPT" refresh
  [ "$status" -eq 0 ]
  grep -qx "workspace report-metadata w9 --source agent-config --clear-token pr --clear-token ci" "$HERDR_LOG"
}

@test "refresh reports PR number and passing CI" {
  FAKE_PR="27 OPEN false" FAKE_BUCKETS="pass pass skipping" run "$SCRIPT" refresh
  grep -qx "workspace report-metadata w9 --source agent-config --token pr=#27" "$HERDR_LOG"
  grep -qx "workspace report-metadata w9 --source agent-config --token ci=ci ✓" "$HERDR_LOG"
}

@test "any failing check wins over pending and passing" {
  FAKE_PR="27 OPEN false" FAKE_BUCKETS="pass pending fail" run "$SCRIPT" refresh
  grep -qx "workspace report-metadata w9 --source agent-config --token ci=ci ✗" "$HERDR_LOG"
}

@test "merged and draft PRs are labeled" {
  FAKE_PR="27 MERGED false" run "$SCRIPT" refresh
  grep -qx "workspace report-metadata w9 --source agent-config --token pr=#27 merged" "$HERDR_LOG"
  FAKE_PR="28 OPEN true" run "$SCRIPT" refresh
  grep -qx "workspace report-metadata w9 --source agent-config --token pr=#28 draft" "$HERDR_LOG"
}

@test "pending CI gets a TTL so a dead watcher can't stick" {
  FAKE_PR="27 OPEN false" FAKE_BUCKETS="pending" run "$SCRIPT" refresh
  grep -qx "workspace report-metadata w9 --source agent-config --token ci=ci … --ttl-ms 3000000" "$HERDR_LOG"
}

@test "watch reports the final CI state" {
  FAKE_BUCKETS="pass" run "$SCRIPT" watch 27
  [ "$status" -eq 0 ]
  grep -q "pr checks 27 --watch" "$GH_LOG"
  tail -n1 "$HERDR_LOG" | grep -qx "workspace report-metadata w9 --source agent-config --token ci=ci ✓"
}

@test "only one watcher runs per workspace and PR" {
  FAKE_WATCH_SLEEP=3 FAKE_BUCKETS="pending" "$SCRIPT" watch 27 &
  first=$!
  sleep 1
  FAKE_BUCKETS="pending" run "$SCRIPT" watch 27
  [ "$status" -eq 0 ]
  wait "$first"
  [ "$(grep -c -- '--watch' "$GH_LOG")" -eq 1 ]
}

@test "a stale lock from a dead watcher is reclaimed" {
  mkdir -p "$TMPDIR/herdr-status-locks/w9-27"
  echo 999999 >"$TMPDIR/herdr-status-locks/w9-27/pid"
  FAKE_BUCKETS="pass" run "$SCRIPT" watch 27
  grep -q "pr checks 27 --watch" "$GH_LOG"
  [ ! -d "$TMPDIR/herdr-status-locks/w9-27" ]
}
