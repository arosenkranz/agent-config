import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FEEDBACK_ENDPOINT_TIMEOUT_MS,
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
    expect(parseFeedback("just some text")).toEqual({ sections: [] });
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
    expect(endpoint.url).toBe(`http://127.0.0.1:${endpoint.port}/feedback`);

    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "# Feedback on: t",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("delivered");
    expect(onFeedback).toHaveBeenCalledWith("# Feedback on: t");

    // Endpoint closed after first delivery: a second POST fails.
    await expect(fetch(endpoint.url, { method: "POST", body: "again" })).rejects.toThrow();
  });

  it("sends CORS headers for file:// pages", async () => {
    const endpoint = await startFeedbackEndpoint(() => {});
    endpoints.push(endpoint);
    const preflight = await fetch(endpoint.url, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("returns 404 for non-feedback routes", async () => {
    const endpoint = await startFeedbackEndpoint(() => {});
    endpoints.push(endpoint);
    const res = await fetch(`http://127.0.0.1:${endpoint.port}/other`, { method: "POST" });
    expect(res.status).toBe(404);
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
