import { describe, expect, it } from "vitest";

import { findCommitInvocations, stripNoReviewFlag } from "../change-review/git.ts";

describe("findCommitInvocations", () => {
  it("detects a plain commit", () => {
    const [inv] = findCommitInvocations('git commit -m "fix: handle empty input"');
    expect(inv).toBeDefined();
    expect(inv.message).toBe("fix: handle empty input");
    expect(inv.noReview).toBe(false);
  });

  it("detects commits inside compound commands", () => {
    const invocations = findCommitInvocations("git add . && git commit -m 'one' && echo done");
    expect(invocations).toHaveLength(1);
    expect(invocations[0].message).toBe("one");
  });

  it("joins multiple -m flags with blank lines", () => {
    const [inv] = findCommitInvocations("git commit -m title -m body");
    expect(inv.message).toBe("title\n\nbody");
  });

  it("does not split on && inside quoted messages", () => {
    const [inv] = findCommitInvocations('git commit -m "do a && b"');
    expect(inv.message).toBe("do a && b");
  });

  it("ignores git commit inside strings and echo arguments", () => {
    expect(findCommitInvocations("echo 'git commit -m x'")).toHaveLength(0);
    expect(findCommitInvocations("echo \"run git commit to save\"")).toHaveLength(0);
    expect(findCommitInvocations('cat <<EOF\ngit commit -m x\nEOF')).toHaveLength(1); // heredoc bodies are command position only in theory; documented limitation
  });

  it("ignores non-commit git commands and comments", () => {
    expect(findCommitInvocations("git status")).toHaveLength(0);
    expect(findCommitInvocations("git log --oneline")).toHaveLength(0);
    expect(findCommitInvocations("git add -A")).toHaveLength(0);
    expect(findCommitInvocations("# git commit -m x\necho hi")).toHaveLength(0);
  });

  it("handles git global flags before the subcommand", () => {
    const [inv] = findCommitInvocations("git -C /repo checkout -b x && git -C /repo commit -m y");
    expect(inv).toBeDefined();
    expect(inv.message).toBe("y");
  });

  it("handles env-assignment prefixes and detects the env bypass", () => {
    const [inv] = findCommitInvocations("LC_ALL=C git commit -m z");
    expect(inv.message).toBe("z");
    const [bypass] = findCommitInvocations("PI_REVIEW_BYPASS=1 git commit -m z");
    expect(bypass.noReview).toBe(true);
  });

  it("handles -m without a space and --message=", () => {
    expect(findCommitInvocations("git commit -mfix")[0].message).toBe("fix");
    expect(findCommitInvocations("git commit --message=wip")[0].message).toBe("wip");
  });

  it("detects -F file commits", () => {
    const [inv] = findCommitInvocations("git commit -F msg.txt");
    expect(inv.messageFromFile).toBe("msg.txt");
    expect(inv.message).toBeNull();
  });

  it("detects the --no-review bypass flag", () => {
    const [inv] = findCommitInvocations('git commit --no-review -m "hotfix"');
    expect(inv.noReview).toBe(true);
  });

  it("detects -a/--all commits", () => {
    expect(findCommitInvocations("git commit -a -m x")[0].commitsAllTracked).toBe(true);
    expect(findCommitInvocations("git commit --all -m x")[0].commitsAllTracked).toBe(true);
    expect(findCommitInvocations("git commit -m x")[0].commitsAllTracked).toBe(false);
  });

  it("keeps gated and bypassed invocations distinct in one compound command", () => {
    const invocations = findCommitInvocations('git commit --no-review -m a && git commit -m b');
    expect(invocations).toHaveLength(2);
    expect(invocations[0].noReview).toBe(true);
    expect(invocations[1].noReview).toBe(false);
  });

  it("returns an invocation with null message when no -m is given", () => {
    const [inv] = findCommitInvocations("git commit");
    expect(inv.message).toBeNull();
  });
});

describe("stripNoReviewFlag", () => {
  it("removes the marker so git never sees it", () => {
    expect(stripNoReviewFlag("git commit --no-review -m x")).toBe("git commit -m x");
    expect(stripNoReviewFlag("git commit -m x --no-review")).toBe("git commit -m x");
  });
});
