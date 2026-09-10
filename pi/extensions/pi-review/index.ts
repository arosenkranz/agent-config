/**
 * pi-review: an always-on review gate for Pi.
 *
 * Two modules sharing one HTML presentation engine:
 * - plan-review: the agent presents substantive plans as an HTML page with
 *   per-section feedback controls instead of dumping them into chat.
 * - change-review: `git commit` is blocked until you approve the staged diff
 *   in a review page; rejection comments flow back into the session.
 *
 * Loaded as a directory extension (index.ts) via symlink from
 * ~/.pi/agent/extensions/pi-review, so the code stays versioned in this repo.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerPlanReview } from "./plan-review/index.ts";
import { registerChangeReview } from "./change-review/index.ts";

export default function piReview(pi: ExtensionAPI): void {
  registerPlanReview(pi);
  registerChangeReview(pi);
}
