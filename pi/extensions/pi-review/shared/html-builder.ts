/**
 * Shared HTML presentation engine for the pi-review extension.
 *
 * One renderer, two page types (plan presentations, commit diff reviews).
 * Pages are fully self-contained: inline CSS, inline JS, no external assets,
 * no server dependency. Feedback copy-back always works from the static file.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FeedbackControl =
  | { kind: "decision"; label: string; options: string[] }
  | { kind: "notes"; label: string }
  | { kind: "approval"; label: string };

export interface PresentationSection {
  /** Stable, unique identifier. Used in anchors and the feedback markdown. */
  id: string;
  title: string;
  /** One-sentence takeaway shown under the section heading. */
  takeaway: string;
  /** Section body as markdown. */
  body: string;
  /** Optional diagram description, rendered in a distinct callout. */
  diagram?: string;
  /** Feedback control for this section. Omit for sections that need none. */
  feedback?: FeedbackControl;
}

export interface Presentation {
  title: string;
  subtitle?: string;
  /** ISO timestamp of generation. */
  generatedAt: string;
  sections: PresentationSection[];
}

// ---------------------------------------------------------------------------
// Escaping and markdown
// ---------------------------------------------------------------------------

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Safe link href: only http(s), mailto, and in-page/relative references. */
function safeHref(rawUrl: string): string | null {
  const url = rawUrl.trim();
  if (url.startsWith("#") || url.startsWith("/") || url.startsWith(".")) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

/** Inline markdown on already-escaped text: code, bold, italic, links. */
function renderInline(escaped: string): string {
  let out = escaped;
  // Inline code first so its content is not further transformed.
  out = out.replace(/`([^`]+)`/g, (_m, code: string) => `<code>${code}</code>`);
  // Links: [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, text: string, url: string) => {
    const href = safeHref(url.replace(/&amp;/g, "&"));
    if (href === null) return text;
    return `<a href="${escapeHtml(href)}">${text}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return out;
}

interface MarkdownLine {
  text: string;
  consumed: boolean;
}

/**
 * Minimal, safe markdown renderer. Supports paragraphs, headings, fenced
 * code blocks, ordered/unordered lists, pipe tables, and inline formatting.
 * All input is HTML-escaped before transformation, so agent-provided content
 * can never inject markup.
 */
export function renderMarkdown(md: string): string {
  const lines: MarkdownLine[] = md
    .split("\n")
    .map((text) => ({ text, consumed: false }));
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.consumed) {
      i += 1;
      continue;
    }
    const raw = line.text.trim();

    // Fenced code block.
    if (raw.startsWith("```")) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].text.trim().startsWith("```")) {
        code.push(lines[i].text);
        i += 1;
      }
      i += 1; // closing fence
      parts.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    // Heading. Body content sits under section h2, so map #..###### to h3..h6.
    const heading = raw.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 2, 6);
      parts.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`);
      i += 1;
      continue;
    }

    // Table: consecutive lines that start and end with a pipe.
    if (raw.startsWith("|") && raw.endsWith("|") && raw.length > 2) {
      const rows: string[][] = [];
      while (i < lines.length) {
        const candidate = lines[i].text.trim();
        if (!(candidate.startsWith("|") && candidate.endsWith("|"))) break;
        const cells = candidate.slice(1, -1).split("|").map((c) => c.trim());
        // Separator row (|---|---|)
        if (cells.every((c) => /^:?-{3,}:?$/.test(c))) {
          i += 1;
          continue;
        }
        rows.push(cells);
        i += 1;
      }
      if (rows.length > 0) {
        const [head, ...body] = rows;
        const thead = `<tr>${head.map((c) => `<th>${renderInline(escapeHtml(c))}</th>`).join("")}</tr>`;
        const tbody = body
          .map((r) => `<tr>${r.map((c) => `<td>${renderInline(escapeHtml(c))}</td>`).join("")}</tr>`)
          .join("");
        parts.push(`<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`);
      }
      continue;
    }

    // Unordered list.
    if (/^[-*]\s+/.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].text.trim())) {
        items.push(`<li>${renderInline(escapeHtml(lines[i].text.trim().replace(/^[-*]\s+/, "")))}</li>`);
        i += 1;
      }
      parts.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list.
    if (/^\d+\.\s+/.test(raw)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].text.trim())) {
        items.push(`<li>${renderInline(escapeHtml(lines[i].text.trim().replace(/^\d+\.\s+/, "")))}</li>`);
        i += 1;
      }
      parts.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Blank line.
    if (raw === "") {
      i += 1;
      continue;
    }

    // Paragraph: consecutive plain-text lines joined with a space.
    const para: string[] = [];
    while (i < lines.length) {
      const next = lines[i].text.trim();
      if (
        next === "" ||
        next.startsWith("```") ||
        /^#{1,6}\s+/.test(next) ||
        /^[-*]\s+/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        (next.startsWith("|") && next.endsWith("|"))
      ) {
        break;
      }
      para.push(next);
      i += 1;
    }
    parts.push(`<p>${renderInline(escapeHtml(para.join(" ")))}</p>`);
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

function pageCss(): string {
  return `
  :root {
    --bg: #14161a; --panel: #1d2026; --panel2: #232730; --border: #333846;
    --text: #e8eaed; --muted: #9aa1ad; --accent: #7aa2f7; --accent2: #9ece6a;
    --warn: #e0af68; --danger: #f7768e;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.55; }
  .skip { position: absolute; left: -9999px; }
  .skip:focus { left: 8px; top: 8px; background: var(--accent); color: #101216; padding: 6px 12px; border-radius: 6px; z-index: 10; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 24px 20px 80px; }
  header.page { border-bottom: 1px solid var(--border); padding: 28px 0 20px; margin-bottom: 28px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  .subtitle { color: var(--muted); font-size: 17px; }
  .meta { color: var(--muted); font-size: 14px; margin-top: 8px; }
  section { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 22px 24px; margin: 18px 0; }
  section h2 { font-size: 22px; margin: 0 0 4px; }
  .takeaway { color: var(--accent); font-size: 16px; margin: 0 0 14px; font-style: italic; }
  h3 { font-size: 17px; margin: 18px 0 6px; }
  p, li { font-size: 16px; }
  code { background: var(--panel2); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; font-size: 14px; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  pre { background: #101216; border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
  pre code { background: none; border: none; padding: 0; }
  ul, ol { padding-left: 22px; } li { margin: 4px 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 15px; }
  th, td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
  th { background: var(--panel2); }
  .diagram { background: #101216; border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; margin: 12px 0; }
  .diagram .diagram-label { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
  .feedback { margin-top: 18px; border-top: 1px dashed var(--border); padding-top: 16px; }
  .feedback .fb-label { font-weight: 600; font-size: 15px; margin-bottom: 8px; }
  .feedback fieldset { border: 1px solid var(--border); border-radius: 8px; margin: 0 0 10px; padding: 10px 14px; }
  .feedback legend { font-size: 14px; font-weight: 600; padding: 0 6px; }
  .fb-options { display: flex; flex-wrap: wrap; gap: 14px; }
  .fb-options label, .fb-check label { display: flex; align-items: center; gap: 6px; font-size: 15px; cursor: pointer; }
  textarea { width: 100%; background: #101216; color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-size: 15px; font-family: inherit; min-height: 60px; resize: vertical; }
  textarea:focus, input:focus { outline: 2px solid var(--accent); }
  .btn { background: var(--accent); color: #101216; font-weight: 700; border: none; border-radius: 8px; padding: 10px 18px; font-size: 16px; cursor: pointer; }
  .btn:hover { filter: brightness(1.1); }
  .btn-secondary { background: var(--panel2); color: var(--text); border: 1px solid var(--border); }
  .status { margin-left: 12px; font-size: 15px; color: var(--accent2); opacity: 0; transition: opacity .2s; }
  .status.show { opacity: 1; }
  .bar { position: sticky; bottom: 0; background: linear-gradient(transparent, var(--bg) 30%); padding: 20px 0 10px; text-align: center; }
  .bar .inner { display: inline-flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: center; }
  .response-area { margin-top: 18px; }
  .response-area h3 { margin: 0 0 8px; }
  #copyable-response { white-space: pre-wrap; font-size: 13px; max-height: 300px; overflow-y: auto; }
  .overall textarea { min-height: 90px; }
  @media (max-width: 640px) { h1 { font-size: 24px; } section { padding: 16px; } }
  @media print { .bar, .skip { display: none; } body { background: #fff; color: #111; } section { break-inside: avoid; } }
`;
}

// ---------------------------------------------------------------------------
// Feedback controls and client script
// ---------------------------------------------------------------------------

function feedbackControlHtml(section: PresentationSection): string {
  const control = section.feedback;
  if (!control) return "";
  const sid = escapeHtml(section.id);
  const parts: string[] = ['<div class="feedback">'];
  const notesField = (label: string) => `
    <label class="fb-label" for="fb-notes-${sid}">${escapeHtml(label)}</label>
    <textarea id="fb-notes-${sid}" data-feedback="notes" data-section-id="${sid}" placeholder="${escapeHtml(label)}"></textarea>`;

  if (control.kind === "decision") {
    parts.push('<fieldset data-feedback="decision" data-section-id="' + sid + '">');
    parts.push(`<legend>${escapeHtml(control.label)}</legend>`);
    parts.push('<div class="fb-options">');
    for (const option of control.options) {
      const value = escapeHtml(option);
      parts.push(
        `<label><input type="radio" name="fb-decision-${sid}" value="${value}"> <span>${value}</span></label>`,
      );
    }
    parts.push("</div></fieldset>");
    parts.push(notesField("Notes"));
  } else if (control.kind === "notes") {
    parts.push(notesField(control.label));
  } else {
    parts.push('<div class="fb-check">');
    parts.push(
      `<label><input type="checkbox" data-feedback="approval" data-section-id="${sid}"> <span>${escapeHtml(control.label)}</span></label>`,
    );
    parts.push("</div>");
    parts.push(notesField("Notes"));
  }
  parts.push("</div>");
  return parts.join("\n");
}

/**
 * Client script shared by every page. Reads feedback controls in document
 * order, builds the stable markdown format, shows it in a copyable area,
 * and copies it to the clipboard (with a manual-copy fallback for
 * file:// pages where scripted clipboard writes are blocked).
 */
function feedbackScript(pageTitle: string, generatedAt: string, sendToPiUrl?: string): string {
  const meta = JSON.stringify({ title: pageTitle, generatedAt });
  const sendUrl = JSON.stringify(sendToPiUrl ?? null);
  return `
(function () {
  var META = ${meta};
  function buildFeedback() {
    var lines = [];
    lines.push("# Feedback on: " + META.title);
    lines.push("Generated: " + META.generatedAt);
    lines.push("");
    var sections = document.querySelectorAll("[data-section-title]");
    for (var i = 0; i < sections.length; i++) {
      var el = sections[i];
      var sid = el.getAttribute("data-section-id");
      var title = el.getAttribute("data-section-title");
      var decision = el.querySelector('input[type="radio"]:checked');
      var approval = el.querySelector('input[type="checkbox"]');
      var notesEl = el.querySelector("textarea[data-feedback='notes']");
      var notes = notesEl ? notesEl.value.trim() : "";
      var hasContent = decision || (approval && approval.checked) || notes;
      if (!hasContent) continue;
      lines.push("## " + sid + " — " + title);
      if (decision) lines.push("Decision: " + decision.value);
      if (approval) lines.push("Approved: " + (approval.checked ? "yes" : "no"));
      if (notes) lines.push("Notes: " + notes);
      lines.push("");
    }
    var overall = document.getElementById("overall-response");
    if (overall && overall.value.trim()) {
      lines.push("## Overall response");
      lines.push(overall.value.trim());
      lines.push("");
    }
    return lines.join("\\n");
  }
  var responseEl = document.getElementById("copyable-response");
  function refresh() {
    if (responseEl) responseEl.textContent = buildFeedback();
  }
  document.addEventListener("input", refresh);
  document.addEventListener("change", refresh);
  refresh();
  var status = document.getElementById("copy-status");
  function setStatus(text) {
    if (!status) return;
    status.textContent = text;
    status.classList.add("show");
  }
  var copyBtn = document.getElementById("copy-feedback");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      refresh();
      var text = buildFeedback();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { setStatus("copied — paste it back into the Pi session"); },
          function () { fallbackCopy(); },
        );
      } else {
        fallbackCopy();
      }
      function fallbackCopy() {
        if (responseEl) {
          var range = document.createRange();
          range.selectNodeContents(responseEl);
          var selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          setStatus("clipboard blocked — response text selected, press ⌘C");
        }
      }
    });
  }
  var resetBtn = document.getElementById("reset-feedback");
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      document.querySelectorAll("input[type='radio'], input[type='checkbox'], textarea").forEach(function (el) {
        if (el.id === "copyable-response") return;
        el.value = ""; el.checked = false;
      });
      refresh();
      setStatus("reset");
    });
  }
  var sendBtn = document.getElementById("send-feedback");
  if (sendBtn) {
    if (!${sendUrl}) {
      sendBtn.disabled = true;
      sendBtn.title = "No feedback endpoint for this page; use Copy feedback for Pi";
    } else {
      sendBtn.addEventListener("click", function () {
        refresh();
        sendBtn.disabled = true;
        setStatus("sending...");
        fetch(${sendUrl}, { method: "POST", headers: { "Content-Type": "text/plain" }, body: buildFeedback() })
          .then(function (res) {
            if (res.ok) {
              setStatus("sent — check your Pi session");
              sendBtn.textContent = "Sent";
            } else {
              setStatus("send failed (" + res.status + ") — use Copy feedback for Pi");
              sendBtn.disabled = false;
            }
          })
          .catch(function () {
            setStatus("endpoint closed — use Copy feedback for Pi");
            sendBtn.textContent = "Send to Pi (closed)";
          });
      });
    }
  }
})();
`;
}

// ---------------------------------------------------------------------------
// Plan page
// ---------------------------------------------------------------------------

function shell(title: string, body: string, script: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${pageCss()}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="wrap">
${body}
</div>
<script>${script}</script>
</body>
</html>
`;
}

export interface PlanPageOptions {
  /** Local endpoint the "Send to Pi" button POSTs to. */
  sendToPiUrl?: string;
}

/** Render the full self-contained plan presentation page. */
export function renderPlanPage(presentation: Presentation, options: PlanPageOptions = {}): string {
  const sectionsHtml = presentation.sections
    .map((section) => {
      const diagram = section.diagram
        ? `<div class="diagram"><div class="diagram-label">Diagram</div>${renderMarkdown(section.diagram)}</div>`
        : "";
      return `<section id="${escapeHtml(section.id)}" data-section-id="${escapeHtml(section.id)}" data-section-title="${escapeHtml(section.title)}">
<h2>${escapeHtml(section.title)}</h2>
<p class="takeaway">${escapeHtml(section.takeaway)}</p>
${diagram}
${renderMarkdown(section.body)}
${feedbackControlHtml(section)}
</section>`;
    })
    .join("\n");

  const head = presentation.subtitle ? `<p class="subtitle">${escapeHtml(presentation.subtitle)}</p>` : "";

  const sendButton = options.sendToPiUrl
    ? `<button type="button" class="btn btn-secondary" id="send-feedback">Send to Pi</button>`
    : `<button type="button" class="btn btn-secondary" id="send-feedback" disabled>Send to Pi</button>`;

  const body = `<header class="page">
<h1>${escapeHtml(presentation.title)}</h1>
${head}
<p class="meta">Prepared ${escapeHtml(presentation.generatedAt)} · pi-review</p>
</header>
<main id="main">
${sectionsHtml}
<section class="overall" data-section-id="overall" data-section-title="Overall response">
<h2>Overall response</h2>
<label class="fb-label" for="overall-response">Anything else the plan should change?</label>
<textarea id="overall-response" placeholder="Overall comments, questions, or a final verdict"></textarea>
</section>
</main>
<div class="bar">
<div class="inner">
<button type="button" class="btn" id="copy-feedback">Copy feedback for Pi</button>
${sendButton}
<button type="button" class="btn btn-secondary" id="reset-feedback">Reset</button>
<span class="status" id="copy-status" role="status" aria-live="polite"></span>
</div>
</div>
<section class="response-area" aria-label="Copyable response">
<h3>Copyable response</h3>
<pre id="copyable-response" tabindex="0"></pre>
</section>`;

  return shell(
    presentation.title,
    body,
    feedbackScript(presentation.title, presentation.generatedAt, options.sendToPiUrl),
  );
}

/** Plain-text fallback file with the same section identifiers as the page. */
export function renderResponsesMd(presentation: Presentation): string {
  const blocks = presentation.sections.map((section) => {
    const lines = [`## ${section.id} — ${section.title}`];
    if (section.feedback?.kind === "decision") {
      lines.push(`Decision: (${section.feedback.options.join(" / ")})`);
    } else if (section.feedback?.kind === "approval") {
      lines.push(`Approved: (yes / no)`);
    }
    lines.push("Notes: ");
    return lines.join("\n");
  });
  return [
    `# Feedback on: ${presentation.title}`,
    `Generated: ${presentation.generatedAt}`,
    "",
    ...blocks,
    "",
    "## Overall response",
    "",
  ].join("\n");
}
