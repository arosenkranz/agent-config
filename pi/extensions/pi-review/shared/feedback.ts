/**
 * Feedback plumbing shared by both review modules.
 *
 * - parseFeedback parses the stable feedback-markdown format that the page's
 *   "Copy feedback for Pi" and "Send to Pi" buttons produce, so the agent and
 *   the change-review gate can read decisions without guessing.
 * - startFeedbackEndpoint runs a short-lived localhost endpoint (ephemeral
 *   port on 127.0.0.1) that the page POSTs the same markdown to. It closes
 *   after the first delivery or after a timeout.
 */

import { randomUUID } from "node:crypto";
import http from "node:http";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Feedback markdown parsing
// ---------------------------------------------------------------------------

export interface ParsedSectionFeedback {
  id: string;
  title?: string;
  decision?: string;
  approved?: boolean;
  notes?: string;
}

/** One inline comment from a review page, anchored to a diff line or a plan paragraph. */
export interface ParsedComment {
  /** Diff anchors read like `user.ts:42`; plan anchors like `rollout:p2`. */
  anchor: string;
  text: string;
}

export interface ParsedFeedback {
  title?: string;
  generatedAt?: string;
  sections: ParsedSectionFeedback[];
  comments: ParsedComment[];
  overall?: string;
}

const SECTION_HEADER = /^## ([a-zA-Z0-9][a-zA-Z0-9-]*)(?: — (.*))?$/;
const OVERALL_HEADER = /^## Overall response$/;
const COMMENTS_HEADER = /^## Comments$/;
const COMMENT_LINE = /^- (.+?) — (.*)$/;
const KEY_LINE = /^(Decision|Approved|Notes): ?(.*)$/;

/** True when the markdown carries any content beyond the page header lines. */
export function hasFeedbackContent(markdown: string): boolean {
  const meaningful = markdown
    .split("\n")
    .filter(
      (line) =>
        line !== "" &&
        !line.startsWith("# Feedback on: ") &&
        !line.startsWith("Generated: "),
    )
    .join("");
  return meaningful.length > 0;
}

/**
 * Parse the stable feedback format:
 *
 *   # Feedback on: <title>
 *   Generated: <timestamp>
 *
 *   ## <id> — <section title>
 *   Decision: <selected option>
 *   Approved: yes|no
 *   Notes: <free text, possibly multiline>
 *
 *   ## Comments
 *   - <anchor> — <inline comment text>
 *
 *   ## Overall response
 *   <free text>
 *
 * Tolerant by design: unknown keys are ignored and missing pieces stay unset.
 */
export function parseFeedback(markdown: string): ParsedFeedback {
  const result: ParsedFeedback = { sections: [], comments: [] };
  const lines = markdown.split("\n");

  let current: ParsedSectionFeedback | undefined;
  let overall: string[] | undefined;
  let notes: string[] | undefined;
  let inComments = false;

  for (const line of lines) {
    if (line.startsWith("# Feedback on: ")) {
      result.title = line.slice("# Feedback on: ".length).trim();
      continue;
    }
    if (line.startsWith("Generated: ")) {
      result.generatedAt = line.slice("Generated: ".length).trim();
      continue;
    }
    if (OVERALL_HEADER.test(line)) {
      current = undefined;
      notes = undefined;
      inComments = false;
      overall = [];
      continue;
    }
    if (COMMENTS_HEADER.test(line)) {
      current = undefined;
      notes = undefined;
      overall = undefined;
      inComments = true;
      continue;
    }
    const sectionMatch = line.match(SECTION_HEADER);
    if (sectionMatch) {
      current = { id: sectionMatch[1], ...(sectionMatch[2] ? { title: sectionMatch[2] } : {}) };
      result.sections.push(current);
      overall = undefined;
      notes = undefined;
      inComments = false;
      continue;
    }
    const commentMatch = line.match(COMMENT_LINE);
    if (commentMatch && inComments) {
      result.comments.push({ anchor: commentMatch[1], text: commentMatch[2] });
      continue;
    }
    if (overall !== undefined) {
      overall.push(line);
      continue;
    }
    const keyMatch = line.match(KEY_LINE);
    if (keyMatch && current) {
      const [, key, value] = keyMatch;
      notes = undefined;
      if (key === "Decision") {
        current.decision = value.trim() || undefined;
      } else if (key === "Approved") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "yes" || normalized === "no") current.approved = normalized === "yes";
      } else {
        notes = [value];
        current.notes = value;
      }
      continue;
    }
    // Continuation lines extend the current notes block.
    if (notes !== undefined && current) {
      notes.push(line);
      current.notes = notes.join("\n").trim() || undefined;
    }
  }

  if (overall !== undefined) {
    result.overall = overall.join("\n").trim() || undefined;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Session delivery
// ---------------------------------------------------------------------------

/**
 * Deliver feedback markdown into the session as a user message. While the
 * agent is busy (typically mid tool execution), a plain sendUserMessage is
 * not deliverable, so queue it as a follow-up that runs once the agent
 * finishes its current work.
 */
export function deliverUserMessage(pi: ExtensionAPI, ctx: ExtensionContext, markdown: string): void {
  if (ctx.isIdle()) {
    pi.sendUserMessage(markdown);
  } else {
    pi.sendUserMessage(markdown, { deliverAs: "followUp" });
  }
}

// ---------------------------------------------------------------------------
// Local feedback endpoint
// ---------------------------------------------------------------------------

export const FEEDBACK_ENDPOINT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_BODY_BYTES = 100 * 1024;

export interface FeedbackEndpoint {
  port: number;
  url: string;
  close(): void;
}

/**
 * Start the localhost feedback endpoint. Binds 127.0.0.1 on an ephemeral
 * port, accepts one POST of feedback markdown, hands it to onFeedback, then
 * closes. Also closes after timeoutMs. Call close() on session shutdown.
 */
export function startFeedbackEndpoint(
  onFeedback: (markdown: string) => Promise<void> | void,
  options: { timeoutMs?: number } = {},
): Promise<FeedbackEndpoint> {
  // A random token in the URL path stops other web pages in the user's
  // browser from posting forged feedback to a port-scanned endpoint.
  const token = randomUUID();
  const timeoutMs = options.timeoutMs ?? FEEDBACK_ENDPOINT_TIMEOUT_MS;
  let closed = false;
  let timer: NodeJS.Timeout | undefined;

  const server = http.createServer((req, res) => {
    // Pages are served from file://, so the Origin is null: allow everything.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    // Only the exact token URL is valid; also require a localhost Host header
    // so DNS-rebound pages cannot reach the endpoint.
    const expectedUrl = `/feedback/${token}`;
    const host = req.headers.host ?? "";
    if (req.method !== "POST" || req.url !== expectedUrl || !host.startsWith("127.0.0.1:")) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413, { "Content-Type": "text/plain" });
        res.end("body too large");
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", () => {});
    req.on("end", async () => {
      if (aborted) return;
      const body = Buffer.concat(chunks).toString("utf8");
      if (!hasFeedbackContent(body)) {
        // Ghost clicks send the empty header skeleton; refuse and stay open
        // so the user can still send real feedback from the same page.
        res.writeHead(422, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
        res.end("empty feedback rejected — answer a decision or leave a comment first");
        return;
      }
      try {
        await onFeedback(body);
        res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
        res.end("delivered");
      } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`delivery failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      close(); // one delivery per endpoint, then it closes
    });
  });

  const close = (): void => {
    if (closed) return;
    closed = true;
    if (timer !== undefined) clearTimeout(timer);
    server.close();
  };

  return new Promise<FeedbackEndpoint>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        close();
        reject(new Error("could not determine ephemeral port"));
        return;
      }
      timer = setTimeout(close, timeoutMs);
      resolve({
        port: address.port,
        url: `http://127.0.0.1:${address.port}/feedback/${token}`,
        close,
      });
    });
  });
}
