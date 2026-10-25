/**
 * herdr-status — pi side of the herdr sidebar status integration.
 *
 * Mirrors plugins/workflow-skills/hooks/hooks.json for Claude Code: refresh PR/CI
 * tokens when a session starts and after `git push` / `gh pr ...`. Both call the
 * same script (plugins/workflow-skills/scripts/herdr-status), so the sidebar looks
 * identical whichever harness is running. pi loads this file from the repo working
 * tree, which is why a repo-relative path to the script is reliable here.
 *
 * Inert outside herdr (HERDR_ENV !== "1").
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const SCRIPT_PATH = fileURLToPath(
  new URL("../../../plugins/workflow-skills/scripts/herdr-status", import.meta.url),
);

/** Commands after which PR/CI state is likely to have changed. */
export function isRefreshTrigger(command: string): boolean {
  return /(^|[\s;&|(])git\s+push\b/.test(command) || /(^|[\s;&|(])gh\s+pr\s/.test(command);
}

function refresh(cwd: string): void {
  // The script detaches its own work (`--async`), so this returns immediately.
  const child = spawn(SCRIPT_PATH, ["refresh", "--async"], { cwd, stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

export default function herdrStatus(pi: ExtensionAPI): void {
  if (process.env.HERDR_ENV !== "1" || !existsSync(SCRIPT_PATH)) return;

  pi.on("session_start", async (_event, ctx) => {
    refresh(ctx.cwd);
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "bash" || event.isError) return;
    const command = typeof event.input.command === "string" ? event.input.command : "";
    if (isRefreshTrigger(command)) refresh(ctx.cwd);
  });
}
