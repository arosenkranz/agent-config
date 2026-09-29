import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FEEDBACK_ENDPOINT_TIMEOUT_MS,
  hasFeedbackContent,
  parseFeedback,
  startFeedbackEndpoint,
  type FeedbackEndpoint,
} from "../shared/feedback.ts";

describe("parseFeedback", () => {
  it("parses a full pasted feedback block", () => {
    const md = [
      "# Feedback on: Demo plan",
      "Generated: 2026-09-09T09:57:00-05:00",
      "",
      "## summary — Executive summary",
      "Decision: agree",
      "Notes: Looks right overall.",
      "",
      "## phase-2 — Phase 2",
      "Approved: no",
      "Notes: Too fast.",
      "Second line of the same note.",
      "",
      "## Overall response",
      "Ship it after the fixes.",
    ].join("\n");

    const parsed = parseFeedback(md);
    expect(parsed.title).toBe("Demo plan");
    expect(parsed.generatedAt).toBe("2026-09-09T09:57:00-05:00");
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0]).toEqual({
      id: "summary",
      title: "Executive summary",
      decision: "agree",
      notes: "Looks right overall.",
    });
    expect(parsed.sections[1]).toMatchObject({
      id: "phase-2",
      title: "Phase 2",
      approved: false,
    });
    expect(parsed.sections[1].notes).toContain("Second line of the same note.");
    expect(parsed.overall).toBe("Ship it after the fixes.");
  });

  it("accepts section headers without a title and unknown keys are ignored", () => {
    const parsed = parseFeedback("## risks\nDecision: needs changes\nUnknown: whatever");
    expect(parsed.sections).toEqual([{ id: "risks", decision: "needs changes" }]);
  });

  it("parses Approved case-insensitively and rejects other values", () => {
    const parsed = parseFeedback("## a — A\nApproved: YES\n\n## b — B\nApproved: maybe");
    expect(parsed.sections[0].approved).toBe(true);
    expect(parsed.sections[1].approved).toBeUndefined();
  });

  it("returns empty sections for unrelated text", () => {
    expect(parseFeedback("just some text")).toEqual({ sections: [], comments: [] });
  });

  it("parses a comments block with diff and paragraph anchors", () => {
    const md = [
      "# Feedback on: Commit review",
      "Generated: 2026-09-29T00:00:00Z",
      "",
      "## commit-decision — Commit decision",
      "Decision: approve",
      "",
      "## Comments",
      "- user.ts:42 — this retry misses the 429 case",
      "- rollout (para 2) — staging should be 5%",
      "",
      "## Overall response",
      "Ship it.",
    ].join("\n");
    const parsed = parseFeedback(md);
    expect(parsed.comments).toEqual([
      { anchor: "user.ts:42", text: "this retry misses the 429 case" },
      { anchor: "rollout (para 2)", text: "staging should be 5%" },
    ]);
    expect(parsed.sections).toEqual([{ id: "commit-decision", title: "Commit decision", decision: "approve" }]);
    expect(parsed.overall).toBe("Ship it.");
  });

  it("ignores comment lines outside a comments block", () => {
    const parsed = parseFeedback("## risks\n- not a comment: stray line");
    expect(parsed.comments).toEqual([]);
    expect(parsed.sections[0].id).toBe("risks");
  });
});

describe("hasFeedbackContent", () => {
  it("rejects the empty header skeleton", () => {
    expect(hasFeedbackContent("# Feedback on: t\nGenerated: now\n\n")).toBe(false);
  });

  it("accepts anything beyond the header lines", () => {
    expect(hasFeedbackContent("# Feedback on: t\nGenerated: now\n\n## s\nDecision: yes")).toBe(true);
    expect(hasFeedbackContent("# Feedback on: t\n\n## Comments\n- a:1 — note")).toBe(true);
  });
});

describe("startFeedbackEndpoint", () => {
  const endpoints: FeedbackEndpoint[] = [];

  afterEach(() => {
    for (const endpoint of endpoints.splice(0)) endpoint.close();
  });

  it("receives the POSTed markdown and closes after one delivery", async () => {
    const onFeedback = vi.fn();
    const endpoint = await startFeedbackEndpoint(onFeedback);
    endpoints.push(endpoint);

    expect(endpoint.port).toBeGreaterThan(0);
    expect(endpoint.url).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${endpoint.port}/feedback/[0-9a-f-]{36}$`));

    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "# Feedback on: t\nGenerated: now\n\n## s\nDecision: yes",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("delivered");
    expect(onFeedback).toHaveBeenCalledWith("# Feedback on: t\nGenerated: now\n\n## s\nDecision: yes");

    // Endpoint closed after first delivery: a second POST fails.
    await expect(fetch(endpoint.url, { method: "POST", body: "again" })).rejects.toThrow();
  });

  it("rejects empty feedback and stays open for a real send", async () => {
    const onFeedback = vi.fn();
    const endpoint = await startFeedbackEndpoint(onFeedback);
    endpoints.push(endpoint);

    const empty = await fetch(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "# Feedback on: t\nGenerated: now\n\n",
    });
    expect(empty.status).toBe(422);
    expect(onFeedback).not.toHaveBeenCalled();

    // The endpoint survived the ghost click: meaningful feedback still delivers.
    const real = await fetch(endpoint.url, {
      method: "POST",
      body: "# Feedback on: t\nGenerated: now\n\n## s\nDecision: yes",
    });
    expect(real.status).toBe(200);
    expect(onFeedback).toHaveBeenCalledTimes(1);
  });

  it("sends CORS headers for file:// pages", async () => {
    const endpoint = await startFeedbackEndpoint(() => {});
    endpoints.push(endpoint);
    const preflight = await fetch(endpoint.url, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("returns 404 for wrong paths, wrong tokens, and missing-token paths", async () => {
    const endpoint = await startFeedbackEndpoint(() => {});
    endpoints.push(endpoint);
    const res1 = await fetch(`http://127.0.0.1:${endpoint.port}/other`, { method: "POST" });
    const res2 = await fetch(`http://127.0.0.1:${endpoint.port}/feedback/not-the-token`, { method: "POST" });
    const res3 = await fetch(`http://127.0.0.1:${endpoint.port}/feedback`, { method: "POST" });
    expect(res1.status).toBe(404);
    expect(res2.status).toBe(404);
    expect(res3.status).toBe(404);
  });

  it("closes after the timeout", async () => {
    const endpoint = await startFeedbackEndpoint(() => {}, { timeoutMs: 100 });
    endpoints.push(endpoint);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await expect(fetch(endpoint.url, { method: "POST", body: "late" })).rejects.toThrow();
  });

  it("rejects bodies above the size limit", async () => {
    const onFeedback = vi.fn();
    const endpoint = await startFeedbackEndpoint(onFeedback);
    endpoints.push(endpoint);
    const res = await fetch(endpoint.url, {
      method: "POST",
      body: "x".repeat(200 * 1024),
    });
    expect(res.status).toBe(413);
    expect(onFeedback).not.toHaveBeenCalled();
  });

  it("defaults to a 30 minute timeout", () => {
    expect(FEEDBACK_ENDPOINT_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });
});
