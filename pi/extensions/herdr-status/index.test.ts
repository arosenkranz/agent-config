import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import herdrStatus, { SCRIPT_PATH, isRefreshTrigger } from "./index.ts";

describe("SCRIPT_PATH", () => {
  it("resolves to the shared workflow-skills script", () => {
    expect(SCRIPT_PATH).toMatch(/plugins\/workflow-skills\/scripts\/herdr-status$/);
    expect(existsSync(SCRIPT_PATH)).toBe(true);
  });
});

describe("isRefreshTrigger", () => {
  it.each([
    "git push",
    "git push -u origin feat/x",
    "npm test && git push",
    "gh pr create --fill",
    "gh pr merge 27 --squash",
    "PI_REVIEW_BYPASS=1 git commit -m x; git push",
  ])("triggers on %s", (cmd) => {
    expect(isRefreshTrigger(cmd)).toBe(true);
  });

  it.each([
    "git status",
    "git pushd",
    "echo 'gitpush'",
    "gh issue list",
    "ghpr create",
  ])("ignores %s", (cmd) => {
    expect(isRefreshTrigger(cmd)).toBe(false);
  });
});

describe("herdrStatus", () => {
  const original = process.env.HERDR_ENV;
  afterEach(() => {
    process.env.HERDR_ENV = original;
  });

  it("registers nothing outside herdr", () => {
    delete process.env.HERDR_ENV;
    const on = vi.fn();
    herdrStatus({ on } as never);
    expect(on).not.toHaveBeenCalled();
  });

  it("listens for session start and tool results inside herdr", () => {
    process.env.HERDR_ENV = "1";
    const on = vi.fn();
    herdrStatus({ on } as never);
    expect(on.mock.calls.map(([event]) => event)).toEqual(["session_start", "tool_result"]);
  });
});
