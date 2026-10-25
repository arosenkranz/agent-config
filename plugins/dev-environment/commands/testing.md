# Testing

## Default: tests alongside code

Write tests with the code they cover, not as an afterthought. Test-first is a good default when the behavior is well-specified (write the failing test, make it pass, refactor), but it's a preference, not a law — match the task.

When the user chooses Matt Pocock's `tdd` skill, agree the public test boundaries before starting its red/green loop. Keep ordinary edits lightweight; its seam-confirmation step is not a mandatory interview for every task.

Lean toward unit tests for logic (pure functions, scheduling/derivation, reducers) and integration tests for API/DB boundaries. Don't chase a coverage number; cover the behavior that matters and the edge cases that bite. When you delete a module, delete its tests too.

## Verify behavior in the real app

Tests prove logic. For UI and runtime bugs, also verify the fix in the real app — drive a browser session (agent-browser / the `verify` and `run` skills) and observe actual behavior before claiming it works. "Looks like it works" should mean you watched it work.

## Troubleshooting test failures

1. Reproduce the failure and read the actual output before theorizing.
2. Check test isolation and that mocks reflect real behavior.
3. Fix the implementation, not the test — unless the test encodes the wrong expectation.
4. Use Matt Pocock's `diagnosing-bugs` skill for non-obvious failures: build a runnable reproduction that catches the exact symptom before theorizing. If it isn't installed, follow that reproduction-first approach directly.
