/**
 * Change reviewer module.
 *
 * Before any `git commit` runs, the tool_call gate blocks it and the agent
 * must call review_changes: a self-contained diff page (diff first,
 * explanation next, per-file approval) opens in Chrome, with a TUI dialog as
 * the fallback path. Approval is keyed to a hash of the staged tree, so an
 * approval only ever lets through the exact reviewed content, once.
 *
 * Bypass paths: `git commit --no-review` (one commit), PI_REVIEW_BYPASS=1
 * (whole session), and /change-review off. In headless sessions (no UI)
 * the gate does not engage.
 */

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { isToolCallEventType, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { deliverUserMessage, parseFeedback, startFeedbackEndpoint, type FeedbackEndpoint } from "../shared/feedback.ts";
import { renderDiffPage, slugify } from "../shared/html-builder.ts";
import { findCommitInvocations, stripNoReviewFlag } from "./git.ts";

const DIFF_LINES_PER_FILE = 300;
const GATE_REASON =
  "Commit gated: call review_changes with the proposed commit message and a per-file explanation of the staged changes, then wait for the user's approval. To skip the review for this one commit, add --no-review to the git commit command.";

const ALL_FLAG_REASON =
  "Commit gated: git commit -a/--all cannot be reviewed faithfully against the staged diff. Stage the files explicitly with git add, then call review_changes.";

// ---------------------------------------------------------------------------
// Git helpers (exec-backed)
// ---------------------------------------------------------------------------

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function runGit(pi: ExtensionAPI, cwd: string, args: string[]): Promise<ExecResult> {
  return pi.exec("git", ["-C", cwd, ...args], { timeout: 30_000 });
}

async function gitOutput(pi: ExtensionAPI, cwd: string, args: string[]): Promise<string | undefined> {
  const result = await runGit(pi, cwd, args);
  if (result.code !== 0) return undefined;
  return result.stdout;
}

/** Stable hash of the staged tree, or undefined when git is unusable here. */
async function stagedTreeHash(pi: ExtensionAPI, cwd: string): Promise<string | undefined> {
  return gitOutput(pi, cwd, ["write-tree"]);
}

interface FileDiff {
  path: string;
  diff: string;
  truncated: boolean;
}

async function captureStagedDiffs(pi: ExtensionAPI, cwd: string, files: string[]) {
  const stat = await gitOutput(pi, cwd, ["diff", "--cached", "--stat"]);
  const diffs: FileDiff[] = [];
  for (const file of files) {
    const raw = (await gitOutput(pi, cwd, ["diff", "--cached", "--", file])) ?? "";
    const lines = raw.split("\n");
    const truncated = lines.length > DIFF_LINES_PER_FILE;
    diffs.push({
      path: file,
      diff: truncated ? lines.slice(0, DIFF_LINES_PER_FILE).join("\n") : raw,
      truncated,
    });
  }
  return { stat, diffs };
}

// ---------------------------------------------------------------------------
// Page writing
// ---------------------------------------------------------------------------

function localIso(date: Date): string {
  return date.toISOString();
}

function candidateBaseDirs(cwd: string): string[] {
  const piDir = process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".pi", "agent");
  return [
    path.join("/var/tmp", "pi-review-diffs"),
    path.join(cwd, ".pi-review-diffs"),
    path.join(piDir, "review-diffs"),
  ];
}

async function writeDiffPage(html: string, cwd: string, slug: string): Promise<string> {
  const stamp = localIso(new Date()).replace(/[:.]/g, "-");
  const failures: string[] = [];
  for (const baseDir of candidateBaseDirs(cwd)) {
    try {
      const dir = path.join(baseDir, `${stamp}-${slug}`);
      await fsp.mkdir(dir, { recursive: true });
      const page = path.join(dir, "index.html");
      await fsp.writeFile(page, html, "utf8");
      return page;
    } catch (error) {
      failures.push(`${baseDir}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No writable location for the diff page. Tried:\n${failures.join("\n")}`);
}

async function openInBrowser(pi: ExtensionAPI, page: string): Promise<boolean> {
  try {
    const chrome = await pi.exec("open", ["-a", "Google Chrome", page]);
    if (chrome.code === 0) return true;
    const fallback = await pi.exec("open", [page]);
    return fallback.code === 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Module registration
// ---------------------------------------------------------------------------

const reviewParameters = Type.Object({
  commitMessage: Type.String({ description: "The exact proposed commit message." }),
  files: Type.Array(
    Type.Object({
      path: Type.String({ description: "Repository-relative staged file path, exactly as git reports it." }),
      explanation: Type.String({ description: "What this file's staged changes do and why, in plain language." }),
    }),
    { minItems: 1 },
  ),
});

export function registerChangeReview(pi: ExtensionAPI): void {
  let enabled = true;
  let headlessNoticeShown = false;
  const approvedHashes = new Set<string>();
  let activeEndpoint: FeedbackEndpoint | undefined;

  pi.on("session_shutdown", async () => {
    activeEndpoint?.close();
    activeEndpoint = undefined;
  });

  // The gate ---------------------------------------------------------------

  pi.on("tool_call", async (event, ctx) => {
    if (!enabled || !isToolCallEventType("bash", event)) return;
    if (process.env.PI_REVIEW_BYPASS === "1") return;

    // In headless sessions there is no browser and no TUI: do not engage.
    if (!ctx.hasUI) {
      if (!headlessNoticeShown) {
        headlessNoticeShown = true;
        console.error("pi-review: commit gate inactive in this headless session (no UI).");
      }
      return;
    }

    const invocations = findCommitInvocations(event.input.command);
    if (invocations.length === 0) return;

    if (invocations.some((invocation) => invocation.commitsAllTracked && !invocation.noReview)) {
      return { block: true, reason: ALL_FLAG_REASON };
    }

    const gated = invocations.filter((invocation) => !invocation.noReview);
    if (gated.length === 0) {
      // Bypass requested: strip the marker so git never sees it.
      event.input.command = stripNoReviewFlag(event.input.command);
      return;
    }

    const treeHash = await stagedTreeHash(pi, ctx.cwd);
    if (treeHash !== undefined && approvedHashes.has(treeHash)) {
      approvedHashes.delete(treeHash); // token consumed
      return;
    }

    return { block: true, reason: GATE_REASON };
  });

  // The review tool ---------------------------------------------------------

  function approveFromFeedback(markdown: string, treeHash: string | undefined, ctx: ExtensionContext): void {
    const parsed = parseFeedback(markdown);
    const decision = parsed.sections.find((section) => section.id === "commit-decision")?.decision;
    if (decision === "approve" && treeHash !== undefined) {
      approvedHashes.add(treeHash);
      deliverUserMessage(
        pi,
        ctx,
        "Commit approved from the review page. Re-run the original git commit command now. The approval only covers the exact staged content that was reviewed.",
      );
    } else {
      deliverUserMessage(pi, ctx, `Commit rejected from the review page. Your feedback:\n\n${markdown}`);
    }
    if (ctx.hasUI) {
      ctx.ui.notify("Feedback received from the commit review page", "info");
    }
  }

  pi.registerTool({
    name: "review_changes",
    label: "Review changes",
    description:
      "Call immediately after a git commit is gated. Captures the staged diff, opens a review page in Chrome with your per-file explanations, and asks the user to approve or reject. Only call after staging the exact changes to commit.",
    promptSnippet: "Present staged commits for approval before committing",
    promptGuidelines: [
      "Call review_changes only after a git commit was actually blocked by the gate: pass the commit message and one explanation per staged file, then wait for the user's decision. Never call it preemptively, and never instead of a commit the user explicitly asked to run with --no-review.",
    ],
    parameters: reviewParameters,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const stagedRaw = await gitOutput(pi, ctx.cwd, ["diff", "--cached", "--name-only"]);
      if (stagedRaw === undefined) {
        throw new Error(`Not a usable git repository at ${ctx.cwd}.`);
      }
      const staged = stagedRaw.split("\n").map((line) => line.trim()).filter(Boolean);
      if (staged.length === 0) {
        throw new Error("Nothing is staged. Stage the changes with git add first; the gate only reviews staged content.");
      }
      const given = params.files.map((file) => file.path);
      const stagedSet = new Set(staged);
      const missing = given.filter((file) => !stagedSet.has(file));
      if (missing.length > 0 || new Set(given).size !== staged.length) {
        throw new Error(
          `files must exactly match the staged files (${staged.length}). Missing or wrong paths: ${missing.join(", ") || "none"}; staged: ${staged.join(", ")}.`,
        );
      }

      const treeHash = await stagedTreeHash(pi, ctx.cwd);
      const { stat, diffs } = await captureStagedDiffs(pi, ctx.cwd, staged);
      const explanations = new Map(params.files.map((file) => [file.path, file.explanation] as const));

      // Fresh endpoint per review so the approval binds to this diff.
      activeEndpoint?.close();
      activeEndpoint = undefined;
      let sendToPiUrl: string | undefined;
      try {
        activeEndpoint = await startFeedbackEndpoint((markdown) => approveFromFeedback(markdown, treeHash, ctx));
        sendToPiUrl = activeEndpoint.url;
      } catch (error) {
        console.error(`pi-review: feedback endpoint failed: ${String(error)}`);
      }

      const generatedAt = new Date().toISOString();
      const html = renderDiffPage(
        {
          commitMessage: params.commitMessage,
          repoDir: ctx.cwd,
          ...(stat ? { statSummary: stat } : {}),
          generatedAt,
          files: diffs.map((file) => ({
            path: file.path,
            explanation: explanations.get(file.path) ?? "",
            diff: file.diff,
            truncated: file.truncated,
          })),
        },
        sendToPiUrl === undefined ? {} : { sendToPiUrl: sendToPiUrl },
      );
      const page = await writeDiffPage(html, ctx.cwd, slugify(params.commitMessage.split("\n")[0] ?? "commit"));
      const opened = await openInBrowser(pi, page);

      // TUI fallback dialog.
      const choice = await ctx.ui.select(
        `Commit gated: ${params.commitMessage.split("\n")[0] ?? "(no message)"}`,
        ["Approve", "Reject with comments", "Use the browser page instead"],
      );
      if (choice === "Approve" && treeHash !== undefined) {
        approvedHashes.add(treeHash);
        return {
          content: [{ type: "text", text: `Approved by the user. Re-run the original git commit command now; the gate will let the exact reviewed staged content through once. Diff page: ${page}` }],
          details: { page, approved: true },
        };
      }
      if (choice === "Reject with comments") {
        const comments = await ctx.ui.input("Rejection comments (sent straight back into this session):", "What should change?");
        deliverUserMessage(pi, ctx, `Commit rejected. Comments:\n\n${comments}`);
        return {
          content: [{ type: "text", text: "Rejected. Your comments were delivered into the session as a user message. The commit stays blocked; address the comments, then call review_changes again." }],
          details: { page, approved: false },
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Diff review page is ${opened ? "open in Chrome" : `written to ${page} (open it manually)`}. Waiting for the user's decision from the page. Tell the user the page path and that the "Send to Pi" or "Copy feedback for Pi" button returns their decision here.`,
          },
        ],
        details: { page },
      };
    },
  });
}
