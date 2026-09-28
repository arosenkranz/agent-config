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

describe("renderResponsesMd", () => {
  it("mirrors the page section ids and decisions", () => {
    const md = renderResponsesMd(demoPresentation);
    expect(md).toContain("## summary — Executive summary");
    expect(md).toContain("Decision: (agree / needs changes / question)");
    expect(md).toContain("Approved: (yes / no)");
    expect(md).toContain("## Overall response");
  });
});
