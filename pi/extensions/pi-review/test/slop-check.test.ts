import { describe, expect, it } from "vitest";

import { checkProse, formatFindings, stripCodeFences, type ProseField } from "../shared/slop-check.ts";

describe("stripCodeFences", () => {
  it("blanks fenced blocks but preserves line numbers", () => {
    const md = "line one\n```js\nconst x = 1; // comprehensive comment\n```\nline five";
    const stripped = stripCodeFences(md).split("\n");
    expect(stripped).toHaveLength(5);
    expect(stripped[2]).toBe("");
  });

  it("strips inline code spans", () => {
    expect(stripCodeFences("the `leverage` field")).not.toContain("leverage");
  });
});

describe("checkProse", () => {
  it("accepts clean plain prose", () => {
    const fields: ProseField[] = [
      { location: "title", text: "Ship the login fix" },
      { location: "body", text: "The fix moves the check into the auth service.\n\n- One deploy\n- One rollback switch" },
    ];
    expect(checkProse(fields)).toEqual([]);
  });

  it("rejects injected puffery words", () => {
    const fields: ProseField[] = [
      { location: "title", text: "A comprehensive plan" },
      { location: "body", text: "We leverage the new cache and delve into the config." },
    ];
    const findings = checkProse(fields);
    const rules = findings.map((f) => f.rule);
    expect(rules).toContain("puffery: comprehensive");
    expect(rules).toContain("puffery: leverage");
    expect(rules).toContain("puffery: delve");
  });

  it("rejects chatbot openers only at line start", () => {
    const findings = checkProse([{ location: "body", text: "Great question! Here is the plan.\nThe plan is great, question answered." }]);
    const openers = findings.filter((f) => f.rule === "chatbot opener");
    expect(openers).toHaveLength(1);
    expect(openers[0].line).toBe(1);
  });

  it("rejects stacked em dashes", () => {
    const findings = checkProse([{ location: "body", text: "One path — fast — and one path, slow." }]);
    expect(findings.map((f) => f.rule)).toContain("stacked em dashes");
  });

  it("allows a single em dash", () => {
    expect(checkProse([{ location: "body", text: "One path — the fast one." }])).toEqual([]);
  });

  it("rejects em dash overuse across a field", () => {
    const text = ["a — b", "c — d", "e — f", "g — h"].join("\n");
    const findings = checkProse([{ location: "body", text }]);
    expect(findings.length).toBeGreaterThanOrEqual(4);
  });

  it("rejects hollow phrases and filler", () => {
    const findings = checkProse([
      { location: "body", text: "In today's fast-paced world, in order to ship, we act." },
    ]);
    const rules = findings.map((f) => f.rule);
    expect(rules).toContain("hollow: in today's");
    expect(rules).toContain("hollow: fast-paced");
    expect(rules).toContain("filler: in order to");
  });

  it("rejects the not-just-X-but-Y shape", () => {
    const findings = checkProse([{ location: "body", text: "This is not just a fix but a rewrite." }]);
    expect(findings.map((f) => f.rule)).toContain("not-just-X-but-Y");
  });

  it("rejects curly quotes", () => {
    const findings = checkProse([{ location: "takeaway", text: "It “works” now." }]);
    expect(findings.map((f) => f.rule)).toContain("curly quotes");
  });

  it("does not scan code fences", () => {
    const findings = checkProse([
      { location: "body", text: "```\n// leverage the API comprehensively\n```" },
    ]);
    expect(findings).toEqual([]);
  });

  it("reports location and line for each finding", () => {
    const findings = checkProse([{ location: "section 'summary' takeaway", text: "We delve deep." }]);
    expect(findings[0].location).toBe("section 'summary' takeaway");
    expect(findings[0].line).toBe(1);
    expect(findings[0].excerpt).toContain("delve");
  });
});

describe("formatFindings", () => {
  it("renders actionable rejection lines", () => {
    const text = formatFindings(checkProse([{ location: "title", text: "A comprehensive plan" }]));
    expect(text).toContain("title, line 1");
    expect(text).toContain("puffery: comprehensive");
  });
});
