import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  escapeHtml,
  renderMarkdown,
  renderPlanPage,
  renderResponsesMd,
  type Presentation,
} from "../shared/html-builder.ts";

// Stub the mermaid loader so snapshots stay small and tests can toggle the
// bundle on and off without reading the 2.7 MB vendored file.
const mermaidState = vi.hoisted(() => ({ source: "/* mermaid stub for tests */" as string | undefined }));
vi.mock("../shared/mermaid.ts", () => ({
  loadMermaidSource: () => mermaidState.source,
}));

beforeEach(() => {
  mermaidState.source = "/* mermaid stub for tests */";
});

const demoPresentation: Presentation = {
  title: "Demo plan: ship the widget",
  subtitle: "A two-phase rollout with one open decision",
  generatedAt: "2026-09-09T09:57:00.000-05:00",
  sections: [
    {
      id: "summary",
      title: "Executive summary",
      takeaway: "Ship the widget in two phases with a fallback switch.",
      body: "## What changes\n\n- New `widget` module behind a flag\n- Rollout to 10% of traffic first\n\nSee [the spec](https://example.com/spec) for details.",
      feedback: { kind: "decision", label: "Approve this direction?", options: ["agree", "needs changes", "question"] },
    },
    {
      id: "phase-2",
      title: "Phase 2",
      takeaway: "Full rollout after one week of stable metrics.",
      body: "| Step | Owner |\n| --- | --- |\n| Flip flag | Alex |\n| Watch dashboards | On-call |\n",
      diagram: "flowchart LR\n  A[flag off] --> B[10% of traffic] --> C[100%]",
      feedback: { kind: "approval", label: "Approve this phase" },
    },
  ],
};

describe("escapeHtml", () => {
  it("escapes markup-significant characters", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });
});

describe("renderMarkdown", () => {
  it("renders paragraphs and inline formatting", () => {
    const html = renderMarkdown("Hello **bold** and *soft* and `code`.");
    expect(html).toContain("<p>Hello <strong>bold</strong>");
    expect(html).toContain("<em>soft</em>");
    expect(html).toContain("<code>code</code>");
  });

  it("renders fenced code blocks without interpreting their content", () => {
    const html = renderMarkdown("```\n<div>not markup</div>\n```");
    expect(html).toContain("<pre><code>&lt;div&gt;not markup&lt;/div&gt;</code></pre>");
  });

  it("decodes pre-escaped entities instead of double-escaping them", () => {
    const html = renderMarkdown("See http://lab-host.&lt;sandbox&gt;.instruqt.io:3000 and A &amp; B.");
    expect(html).toContain("&lt;sandbox&gt;");
    expect(html).not.toContain("&amp;lt;");
    expect(html).not.toContain("&amp;gt;");
    expect(html).toContain("A &amp; B");
  });

  it("keeps raw angle brackets escaped exactly once", () => {
    const html = renderMarkdown("Use <sandbox> in the URL.");
    expect(html).toContain("&lt;sandbox&gt;");
    expect(html).not.toContain("&amp;lt;");
  });

  it("wraps tables in a scrollable container", () => {
    const html = renderMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(html).toContain('<div class="table-wrap"><table>');
  });

  it("renders lists, headings, and tables", () => {
    const html = renderMarkdown("## Heading\n- one\n- two\n1. first\n\n| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(html).toContain("<h4>Heading</h4>");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("<ol><li>first</li></ol>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>2</td>");
  });

  it("drops unsafe link hrefs but keeps the text", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).toContain("click");
    expect(html).not.toContain("javascript:");
  });

  it("escapes injected html in list items", () => {
    const html = renderMarkdown("- <b>bold</b>");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });
});

describe("renderPlanPage", () => {
  it("matches the snapshot for the demo presentation", () => {
    expect(renderPlanPage(demoPresentation)).toMatchSnapshot();
  });

  it("numbers sections, marks addenda, and builds a TOC for long plans", () => {
    const long: Presentation = {
      title: "Long plan",
      generatedAt: "2026-09-10T00:00:00.000Z",
      sections: [1, 2, 3, 4, 5].map((n) => ({
        id: n === 5 ? "addendum" : `section-${n}`,
        title: n === 5 ? "Addendum: technical notes" : `Section ${n}`,
        takeaway: `Takeaway ${n}.`,
        body: "Body.",
      })),
    };
    const html = renderPlanPage(long);
    expect(html).toContain('<span class="sec-num">01</span>');
    expect(html).toContain('<span class="sec-num">05</span>');
    expect(html).toMatch(/<section id="addendum" class="addendum"/);
    expect(html).toContain('class="rail-box rail-contents"');
    expect(html).toContain('href="#addendum"');
  });

  it("lists contents in the rail for every plan, with no TOC block in the column", () => {
    const html = renderPlanPage(demoPresentation);
    expect(html).toContain('class="rail-box rail-contents"');
    expect(html).not.toContain('<details class="toc">');
    expect(html).toContain('href="#summary"');
    expect(html).toContain('href="#phase-2"');
  });

  it("styles radio options as chips with a visible checked state", () => {
    expect(renderPlanPage(demoPresentation)).toContain('.fb-options label:has(input:checked)');
  });

  it("disables Send to Pi without an endpoint and embeds the URL with one", () => {
    const withoutEndpoint = renderPlanPage(demoPresentation);
    expect(withoutEndpoint).toContain('id="send-feedback" disabled');

    const withEndpoint = renderPlanPage(demoPresentation, { sendToPiUrl: "http://127.0.0.1:54321/feedback" });
    expect(withEndpoint).not.toContain('id="send-feedback" disabled');
    expect(withEndpoint).toContain("http://127.0.0.1:54321/feedback");
    expect(withEndpoint).toContain("endpoint closed");
  });

  it("produces a self-contained page with required structure", () => {
    const html = renderPlanPage(demoPresentation);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('class="skip"');
    expect(html).toContain("<main id=\"main\">");
    expect(html).not.toMatch(/https?:\/\/(?!example\.com)/); // no CDN or remote assets
    expect(html).toContain("Copy feedback for Pi");
    expect(html).toContain("id=\"copyable-response\"");
  });

  it("gives every feedback control a label and a section id", () => {
    const html = renderPlanPage(demoPresentation);
    expect(html).toContain('data-section-id="summary"');
    expect(html).toContain('name="fb-decision-summary"');
    expect(html).toContain('<label class="fb-label" for="fb-notes-summary">');
    expect(html).toContain('data-feedback="approval"');
  });

  it("cannot break out of the inline script tag via the title", () => {
    const hostile: Presentation = {
      title: 'x</script><script>alert(1)</script>',
      generatedAt: "2026-09-09T00:00:00.000Z",
      sections: [{ id: "s", title: "t", takeaway: "k", body: "b" }],
    };
    const html = renderPlanPage(hostile);
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("\\u003c");
  });

  it("escapes hostile section content", () => {
    const hostile: Presentation = {
      title: '"><script>alert(1)</script>',
      generatedAt: "2026-09-09T00:00:00.000Z",
      sections: [
        {
          id: "evil",
          title: "</section><script>bad()</script>",
          takeaway: "<img src=x onerror=alert(1)>",
          body: "<script>alert('body')</script>",
        },
      ],
    };
    const html = renderPlanPage(hostile);
    expect(html).not.toContain("<script>bad");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>alert('body')");
  });
});

describe("renderPlanPage diagrams", () => {
  it("renders a diagram as a mermaid block and inlines the bundle", () => {
    const html = renderPlanPage(demoPresentation);
    expect(html).toContain('<pre class="mermaid">flowchart LR');
    expect(html).toContain("/* mermaid stub for tests */");
    expect(html).toContain('mermaid.initialize({ startOnLoad: false, securityLevel: "strict"');
  });

  it("does not inline the bundle when no section has a diagram", () => {
    const sections = demoPresentation.sections.map(({ diagram: _diagram, ...rest }) => rest);
    const html = renderPlanPage({ ...demoPresentation, sections });
    expect(html).not.toContain("mermaid stub");
    expect(html).not.toContain('class="mermaid"');
  });

  it("falls back to markdown when the mermaid bundle is unavailable", () => {
    mermaidState.source = undefined;
    const html = renderPlanPage(demoPresentation);
    expect(html).toContain("<p>flowchart LR");
    expect(html).not.toContain('class="mermaid"');
    expect(html).not.toContain("mermaid.initialize");
  });

  it("escapes hostile diagram content inside the mermaid block", () => {
    const hostile: Presentation = {
      title: "t",
      generatedAt: "2026-09-09T00:00:00.000Z",
      sections: [
        {
          id: "d",
          title: "Diagram section",
          takeaway: "k",
          body: "b",
          diagram: "flowchart TD\n  A[</pre><script>alert(1)</script>] --> B",
        },
      ],
    };
    const html = renderPlanPage(hostile);
    expect(html).toContain("&lt;/pre&gt;&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)");
  });
});

describe("renderPlanPage rail and banner", () => {
  it("renders a decision banner and rail mirroring the section controls", () => {
    const html = renderPlanPage(demoPresentation);
    expect(html).toContain('id="decision-banner"');
    expect(html).toContain("2 decisions before you start");
    expect(html).toContain('id="banner-dismiss"');
    // shared radio name across section, banner, and rail: 3 surfaces x 3 options
    expect((html.match(/name="fb-decision-summary"/g) ?? []).length).toBe(9);
    expect(html).toContain('class="rail"');
    expect(html).toContain('id="decision-progress"');
    expect(html).toContain("0 of 2 decided");
    // the approval control is mirrored in the banner and rail, once each, plus the section copy
    expect((html.match(/data-feedback="approval"/g) ?? []).length).toBe(3);
  });

  it("keeps mirrors invisible to the copy-back builder", () => {
    const html = renderPlanPage(demoPresentation);
    const rail = html.match(/<aside class="rail"[\s\S]*?<\/aside>/)?.[0] ?? "";
    const banner = html.match(/<section class="banner"[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(rail).not.toBe("");
    expect(banner).not.toBe("");
    expect(rail).not.toContain("data-section-title");
    expect(banner).not.toContain("data-section-title");
    // buildFeedback still walks sections only, so mirrors cannot duplicate output
    expect(html).toContain('document.querySelectorAll("[data-section-title]")');
  });

  it("carries sync, progress, and banner-dismiss behavior in the client script", () => {
    const html = renderPlanPage(demoPresentation);
    expect(html).toContain("mirrorSync");
    expect(html).toContain("updateProgress");
    expect(html).toContain("banner.setAttribute");
    // radios sync natively through shared names, never through mirrorSync
    expect(html).toContain("t.type === \"radio\"");
  });

  it("hides the rail on narrow screens and keeps the banner as the decision surface", () => {
    const html = renderPlanPage(demoPresentation);
    expect(html).toContain("@media (max-width: 1100px)");
    expect(html).toContain(".rail { display: none; }");
  });
});

describe("renderResponsesMd", () => {
  it("mirrors the page section ids and decisions", () => {
    const md = renderResponsesMd(demoPresentation);
    expect(md).toContain("## summary — Executive summary");
    expect(md).toContain("Decision: (agree / needs changes / question)");
    expect(md).toContain("Approved: (yes / no)");
    expect(md).toContain("## Overall response");
  });
});
