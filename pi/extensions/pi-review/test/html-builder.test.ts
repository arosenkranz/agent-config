import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  renderMarkdown,
  renderPlanPage,
  renderResponsesMd,
  type Presentation,
} from "../shared/html-builder.ts";

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
      diagram: "flag off → 10% → 100%",
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
    expect(html).toContain('class="toc"');
    expect(html).toContain('Contents (5 sections)');
  });

  it("skips the TOC for short plans", () => {
    expect(renderPlanPage(demoPresentation)).not.toContain('class="toc"');
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

describe("renderResponsesMd", () => {
  it("mirrors the page section ids and decisions", () => {
    const md = renderResponsesMd(demoPresentation);
    expect(md).toContain("## summary — Executive summary");
    expect(md).toContain("Decision: (agree / needs changes / question)");
    expect(md).toContain("Approved: (yes / no)");
    expect(md).toContain("## Overall response");
  });
});
