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

/** Filesystem/anchor-safe slug from arbitrary text. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function escapeHtml(text: string): string {
  return normalizeEntities(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Decode the five XML entities before escaping. LLM-authored markdown often
 * arrives pre-escaped (`&lt;sandbox&gt;`); without decoding, the second escape
 * pass would show the reader the literal text "&lt;sandbox&gt;". Decoding
 * first is idempotent: raw text is unchanged, and single-escaped content in
 * diffs or code blocks round-trips to the same display.
 */
function normalizeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
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
        parts.push(`<div class="table-wrap"><table><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`);
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
    --bg: #101217; --panel: #1a1d24; --panel2: #232730; --border: #333846;
    --text: #e8eaed; --muted: #9aa1ad; --accent: #7aa2f7; --accent2: #9ece6a;
    --warn: #e0af68; --danger: #f7768e; --radius: 14px;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
  .skip { position: absolute; left: -9999px; }
  .skip:focus { left: 8px; top: 8px; background: var(--accent); color: #101216; padding: 6px 12px; border-radius: 6px; z-index: 10; }
  .wrap { max-width: 920px; margin: 0 auto; padding: 24px 20px 90px; }
  header.page { border-bottom: 1px solid var(--border); padding: 30px 0 22px; margin-bottom: 30px; position: relative; }
  header.page::before { content: ""; position: absolute; top: 0; left: -20px; right: -20px; height: 4px; background: linear-gradient(90deg, var(--accent), #bb9af7 55%, var(--accent2)); border-radius: 4px; }
  h1 { font-size: 32px; margin: 0 0 8px; line-height: 1.25; letter-spacing: -0.01em; }
  .subtitle { color: var(--muted); font-size: 18px; margin: 0 0 10px; }
  .meta { color: var(--muted); font-size: 14px; margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px 16px; }
  .toc { margin-top: 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); }
  .toc summary { cursor: pointer; padding: 10px 16px; font-size: 15px; font-weight: 600; color: var(--muted); }
  .toc summary:hover { color: var(--text); }
  .toc ol { margin: 0; padding: 4px 16px 14px 40px; columns: 2; column-gap: 32px; }
  .toc li { margin: 4px 0; break-inside: avoid; }
  .toc a { color: var(--accent); text-decoration: none; font-size: 15px; }
  .toc a:hover { text-decoration: underline; }
  section { background: var(--panel); border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: var(--radius); padding: 24px 26px; margin: 22px 0; position: relative; }
  .sec-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 6px; }
  .sec-num { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 15px; font-weight: 700; color: var(--accent); background: rgba(122, 162, 247, 0.12); border: 1px solid rgba(122, 162, 247, 0.35); border-radius: 8px; padding: 3px 9px; flex: none; }
  section h2 { font-size: 23px; margin: 0; line-height: 1.3; letter-spacing: -0.01em; }
  .takeaway { color: var(--text); font-size: 16.5px; margin: 0 0 18px; padding: 10px 14px; border-left: 3px solid var(--accent); background: rgba(122, 162, 247, 0.07); border-radius: 0 8px 8px 0; }
  section.addendum { border-left-color: var(--muted); }
  section.addendum .sec-num { color: var(--muted); background: rgba(154, 161, 173, 0.1); border-color: var(--border); }
  section.addendum .takeaway { border-left-color: var(--muted); background: rgba(154, 161, 173, 0.07); color: var(--muted); }
  h3 { font-size: 18px; margin: 20px 0 8px; }
  p, li { font-size: 16px; }
  p, li, td, th { overflow-wrap: anywhere; }
  code { background: var(--panel2); border: 1px solid var(--border); border-radius: 5px; padding: 1px 6px; font-size: 14px; font-family: ui-monospace, "SF Mono", Menlo, monospace; overflow-wrap: anywhere; }
  pre { background: #0c0e12; border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; overflow-x: auto; font-size: 13px; line-height: 1.5; }
  pre code { background: none; border: none; padding: 0; overflow-wrap: normal; }
  ul, ol { padding-left: 24px; } li { margin: 5px 0; }
  .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; margin: 12px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 15px; margin: 0; }
  th, td { border-bottom: 1px solid var(--border); padding: 10px 14px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  thead th { background: var(--panel2); text-transform: uppercase; letter-spacing: 0.06em; font-size: 12.5px; color: var(--muted); border-bottom: 2px solid var(--border); }
  tbody tr:nth-child(even) { background: rgba(255, 255, 255, 0.02); }
  tbody tr:last-child td { border-bottom: none; }
  .diagram { background: #0c0e12; border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; margin: 12px 0; overflow-x: auto; }
  .diagram .diagram-label { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
  .feedback { margin-top: 20px; border-top: 1px dashed var(--border); padding-top: 18px; }
  .feedback .fb-label { font-weight: 600; font-size: 15px; margin-bottom: 10px; }
  .feedback fieldset { border: 1px solid var(--border); border-radius: 10px; margin: 0 0 12px; padding: 12px 14px; }
  .feedback legend { font-size: 15px; font-weight: 600; padding: 0 8px; color: var(--accent); }
  .fb-options { display: flex; flex-wrap: wrap; gap: 10px; }
  .fb-options label { display: inline-flex; align-items: center; gap: 0; font-size: 15px; cursor: pointer; color: var(--text); background: var(--panel2); border: 1px solid var(--border); border-radius: 999px; padding: 8px 16px 8px 12px; transition: border-color .15s, background .15s; }
  .fb-options label:hover { border-color: var(--accent); }
  .fb-options label:has(input:checked) { border-color: var(--accent); background: rgba(122, 162, 247, 0.14); font-weight: 600; }
  .fb-options input { accent-color: var(--accent); width: 16px; height: 16px; margin: 0 8px 0 2px; }
  .fb-check label { display: inline-flex; align-items: center; gap: 10px; font-size: 16px; cursor: pointer; margin-bottom: 12px; }
  .fb-check input { accent-color: var(--accent); width: 18px; height: 18px; }
  textarea { width: 100%; background: #0c0e12; color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 15px; font-family: inherit; min-height: 60px; resize: vertical; }
  textarea:focus, input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .btn { background: var(--accent); color: #101216; font-weight: 700; border: none; border-radius: 10px; padding: 12px 20px; font-size: 16px; cursor: pointer; transition: transform .1s, filter .15s; }
  .btn:hover { filter: brightness(1.12); transform: translateY(-1px); }
  .btn:active { transform: translateY(0); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .btn-secondary { background: var(--panel2); color: var(--text); border: 1px solid var(--border); }
  .status { margin-left: 12px; font-size: 15px; color: var(--accent2); opacity: 0; transition: opacity .2s; }
  .status.show { opacity: 1; }
  .bar { position: sticky; bottom: 0; z-index: 5; background: rgba(16, 18, 23, 0.85); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-top: 1px solid var(--border); padding: 14px 0 12px; text-align: center; margin-top: 26px; }
  .bar .inner { display: inline-flex; gap: 12px; align-items: center; flex-wrap: wrap; justify-content: center; }
  .response-area { margin-top: 18px; background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; }
  .response-area h3 { margin: 0 0 8px; color: var(--muted); font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; }
  #copyable-response { white-space: pre-wrap; font-size: 13px; max-height: 300px; overflow-y: auto; margin: 0; }
  .overall textarea { min-height: 90px; }
  .overall { border-left-color: var(--accent2); }
  pre.diff { font-size: 12px; line-height: 1.45; }
  pre.diff .add { color: var(--accent2); }
  pre.diff .del { color: var(--danger); }
  pre.diff .hunk { color: var(--accent); }
  pre.diff .truncated { color: var(--warn); font-style: italic; }
  .stat { background: var(--panel2); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; font-size: 14px; margin: 12px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  @media (max-width: 640px) {
    h1 { font-size: 26px; } section { padding: 18px 16px; } .toc ol { columns: 1; }
    .sec-head { flex-direction: column; gap: 6px; }
  }
  @media print {
    .bar, .skip { display: none; }
    body { background: #fff; color: #111; }
    section { break-inside: avoid; border-left-color: #999; }
    .takeaway { background: #f2f2f2; }
    a { color: #111; }
  }
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
/**
 * JSON for safe embedding inside a <script> tag: JSON.stringify alone does
 * not escape "</script>", "<!--", or U+2028/2029, all of which can break the
 * script context or the JS string literal.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function feedbackScript(pageTitle: string, generatedAt: string, sendToPiUrl?: string): string {
  const meta = jsonForScript({ title: pageTitle, generatedAt });
  const sendUrl = jsonForScript(sendToPiUrl ?? null);
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

/** Sections named or identified as an addendum get a muted visual treatment. */
function isAddendum(section: PresentationSection): boolean {
  return /addendum/i.test(section.id) || /addendum/i.test(section.title);
}

/** Section opening markup: numbered badge, heading, takeaway callout. */
function sectionHeadHtml(section: PresentationSection, number: number): string {
  const num = String(number).padStart(2, "0");
  return `<div class="sec-head">
<span class="sec-num">${num}</span>
<h2>${escapeHtml(section.title)}</h2>
</div>
<p class="takeaway">${escapeHtml(section.takeaway)}</p>`;
}

/** Collapsible table of contents, shown once the plan has several sections. */
function tocHtml(sections: PresentationSection[]): string {
  if (sections.length < 4) return "";
  const items = sections
    .map((section) => `<li><a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a></li>`)
    .join("");
  return `<details class="toc">
<summary>Contents (${sections.length} sections)</summary>
<ol>${items}</ol>
</details>`;
}

/** Render the full self-contained plan presentation page. */
export function renderPlanPage(presentation: Presentation, options: PlanPageOptions = {}): string {
  const sectionsHtml = presentation.sections
    .map((section, index) => {
      const diagram = section.diagram
        ? `<div class="diagram"><div class="diagram-label">Diagram</div>${renderMarkdown(section.diagram)}</div>`
        : "";
      const addendumClass = isAddendum(section) ? " addendum" : "";
      return `<section id="${escapeHtml(section.id)}" class="${addendumClass.trim()}" data-section-id="${escapeHtml(section.id)}" data-section-title="${escapeHtml(section.title)}">
${sectionHeadHtml(section, index + 1)}
${diagram}
${renderMarkdown(section.body)}
${feedbackControlHtml(section)}
</section>`;
    })
    .join("\n");

  const head = presentation.subtitle ? `<p class="subtitle">${escapeHtml(presentation.subtitle)}</p>` : "";
  const toc = tocHtml(presentation.sections);

  const sendButton = options.sendToPiUrl
    ? `<button type="button" class="btn btn-secondary" id="send-feedback">Send to Pi</button>`
    : `<button type="button" class="btn btn-secondary" id="send-feedback" disabled>Send to Pi</button>`;

  const body = `<header class="page">
<h1>${escapeHtml(presentation.title)}</h1>
${head}
<p class="meta"><span>Prepared ${escapeHtml(presentation.generatedAt)}</span><span>pi-review</span></p>
${toc}
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

// ---------------------------------------------------------------------------
// Diff review page
// ---------------------------------------------------------------------------

export interface DiffFileSection {
  /** Repository-relative file path. */
  path: string;
  /** The agent's per-file explanation. */
  explanation: string;
  /** Unified diff for this file. */
  diff: string;
  /** True when the diff was truncated for the page. */
  truncated: boolean;
}

export interface DiffReview {
  commitMessage: string;
  repoDir?: string;
  /** Output of git diff --cached --stat, shown as a summary block. */
  statSummary?: string;
  generatedAt: string;
  files: DiffFileSection[];
}

/** Render one diff line with add/del/hunk coloring. */
function renderDiffLine(line: string): string {
  const escaped = escapeHtml(line);
  if (escaped.startsWith("+")) return `<span class="add">${escaped}</span>`;
  if (escaped.startsWith("-")) return `<span class="del">${escaped}</span>`;
  if (escaped.startsWith("@@")) return `<span class="hunk">${escaped}</span>`;
  return escaped;
}

/** Render a unified diff as a colored pre block. */
export function renderDiffText(diff: string, truncated: boolean): string {
  const lines = diff.split("\n").map(renderDiffLine);
  if (truncated) {
    lines.push('<span class="truncated">--- diff truncated for this page; run `git diff --cached` in the terminal for the full diff ---</span>');
  }
  return `<pre class="diff"><code>${lines.join("\n")}</code></pre>`;
}

export interface DiffPageOptions extends PlanPageOptions {}

/** Render the full self-contained staged-diff review page. */
export function renderDiffPage(review: DiffReview, options: DiffPageOptions = {}): string {
  const usedIds = new Set<string>();
  const uniqueSectionId = (path: string): string => {
    const base = slugify(path) || "file";
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return id;
  };

  const fileSections = review.files
    .map((file) => {
      const id = uniqueSectionId(file.path);
      const section: PresentationSection = {
        id,
        title: file.path,
        takeaway: file.explanation,
        body: renderDiffText(file.diff, file.truncated),
        feedback: { kind: "approval", label: `Approve changes to ${file.path}` },
      };
      return section;
    })
    .map((section, index) => {
      const sid = escapeHtml(section.id);
      return `<section id="${sid}" data-section-id="${sid}" data-section-title="${escapeHtml(section.title)}">
${sectionHeadHtml(section, index + 1)}
${section.body}
${feedbackControlHtml(section)}
</section>`;
    })
    .join("\n");

  const decisionSection: PresentationSection = {
    id: "commit-decision",
    title: "Commit decision",
    takeaway: "Approve the whole commit, or reject it with comments that go straight back to the agent.",
    body: "",
    feedback: { kind: "decision", label: "Approve this commit as a whole?", options: ["approve", "reject"] },
  };
  const decisionHtml = `<section id="commit-decision" data-section-id="commit-decision" data-section-title="Commit decision">
${sectionHeadHtml(decisionSection, review.files.length + 1)}
${feedbackControlHtml(decisionSection)}
</section>`;

  const statHtml = review.statSummary ? `<div class="stat">${escapeHtml(review.statSummary)}</div>` : "";
  const repoLine = review.repoDir ? ` in ${escapeHtml(review.repoDir)}` : "";

  const sendButton = options.sendToPiUrl
    ? `<button type="button" class="btn btn-secondary" id="send-feedback">Send to Pi</button>`
    : `<button type="button" class="btn btn-secondary" id="send-feedback" disabled>Send to Pi</button>`;

  const body = `<header class="page">
<h1>Commit review${repoLine}</h1>
<p class="subtitle">Proposed commit message</p>
<div class="stat">${escapeHtml(review.commitMessage)}</div>
${statHtml}
<p class="meta"><span>Prepared ${escapeHtml(review.generatedAt)}</span><span>pi-review</span></p>
</header>
<main id="main">
${fileSections}
${decisionHtml}
<section class="overall" data-section-id="overall" data-section-title="Overall response">
<h2>Overall response</h2>
<label class="fb-label" for="overall-response">Anything else the commit should change?</label>
<textarea id="overall-response" placeholder="Overall comments or questions"></textarea>
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
    "Commit review",
    body,
    feedbackScript("Commit review", review.generatedAt, options.sendToPiUrl),
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
