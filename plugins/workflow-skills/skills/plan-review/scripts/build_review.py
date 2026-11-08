import html
import re


def parse_sections(markdown_text: str) -> list[dict]:
    lines = markdown_text.splitlines()
    sections = []
    current_heading = None
    current_lines = []

    def flush():
        if current_heading is not None or current_lines:
            heading = current_heading if current_heading is not None else "Plan"
            content = "\n".join(current_lines).strip()
            sections.append({"heading": heading, "content": content})

    for line in lines:
        if line.startswith("## "):
            flush()
            current_heading = line[3:].strip()
            current_lines = []
        else:
            current_lines.append(line)
    flush()

    if not sections:
        return [{"heading": "Plan", "content": markdown_text.strip()}]
    return sections


def slugify(name: str, max_len: int = 40) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:max_len].strip("-") or "plan"


def escape_html(text: str) -> str:
    return html.escape(text, quote=True)


def render_html(plan_title: str, source_path: str, generated_at: str, critique: dict, sections: list) -> str:
    adversarial_text = critique.get("adversarial")
    architecture_text = critique.get("architecture")

    def critique_block(label, text):
        if text:
            return f'<div class="critique-agent"><h3>{escape_html(label)}</h3><pre>{escape_html(text)}</pre></div>'
        return f'<div class="critique-agent critique-missing"><h3>{escape_html(label)}</h3><p>Critique unavailable.</p></div>'

    critique_html = critique_block("Adversarial reviewer", adversarial_text) + critique_block("Architecture reviewer", architecture_text)

    section_blocks = []
    for section in sections:
        heading = escape_html(section["heading"])
        content = escape_html(section["content"])
        section_blocks.append(f'''
        <section class="plan-section">
          <h2>{heading}</h2>
          <pre>{content}</pre>
          <label class="feedback-label">Feedback on this section</label>
          <textarea class="section-feedback" data-heading="{heading}" placeholder="Leave feedback on this section..."></textarea>
        </section>''')
    sections_html = "\n".join(section_blocks)

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Plan Review: {escape_html(plan_title)}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 860px; margin: 0 auto; padding: 2rem 1.5rem 6rem; line-height: 1.5; color: #1a1a1a; }}
  header {{ margin-bottom: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 1rem; }}
  header p {{ color: #666; font-size: 0.9rem; margin: 0.2rem 0; }}
  .critique-panel {{ background: #fff7e6; border: 1px solid #f0c36d; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 2rem; }}
  .critique-agent {{ margin-bottom: 1rem; }}
  .critique-agent h3 {{ margin: 0 0 0.4rem; }}
  .critique-missing p {{ color: #999; font-style: italic; }}
  .plan-section {{ border: 1px solid #ddd; border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1.25rem; }}
  .plan-section h2 {{ margin-top: 0; }}
  pre {{ white-space: pre-wrap; word-wrap: break-word; font-family: ui-monospace, monospace; font-size: 0.9rem; background: #fafafa; padding: 0.75rem; border-radius: 6px; }}
  .feedback-label {{ display: block; font-size: 0.85rem; color: #555; margin-top: 0.75rem; margin-bottom: 0.25rem; }}
  textarea {{ width: 100%; min-height: 3rem; box-sizing: border-box; font-family: inherit; font-size: 0.95rem; padding: 0.5rem; border: 1px solid #ccc; border-radius: 6px; }}
  .general-feedback, .decision {{ margin-bottom: 1.5rem; }}
  .copy-bar {{ position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #ddd; padding: 1rem 1.5rem; display: flex; align-items: center; gap: 1rem; justify-content: center; }}
  #copy-btn {{ background: #1a1a1a; color: #fff; border: none; padding: 0.6rem 1.2rem; border-radius: 6px; font-size: 0.95rem; cursor: pointer; }}
  #copy-status {{ color: #2a7a2a; font-size: 0.9rem; }}
  #fallback-output {{ display: none; width: 100%; max-width: 860px; margin: 0.5rem auto 0; }}
</style>
</head>
<body>
<header>
  <h1>{escape_html(plan_title)}</h1>
  <p>Source: {escape_html(source_path)}</p>
  <p>Generated: {escape_html(generated_at)}</p>
</header>

<details class="critique-panel" open>
  <summary><strong>Plan critique</strong> (adversarial + architecture)</summary>
  {critique_html}
</details>

{sections_html}

<div class="general-feedback">
  <h2>General Feedback</h2>
  <textarea id="general-feedback" placeholder="Overall feedback not tied to one section..."></textarea>
</div>

<div class="decision">
  <h2>Decision</h2>
  <label><input type="radio" name="decision" value="approve" checked> Approve</label>
  <label style="margin-left:1.5rem"><input type="radio" name="decision" value="changes"> Request changes</label>
</div>

<textarea id="fallback-output" readonly rows="10"></textarea>

<div class="copy-bar">
  <button id="copy-btn">Copy Feedback</button>
  <span id="copy-status"></span>
</div>

<script>
function buildFeedbackMarkdown() {{
  const decision = document.querySelector('input[name="decision"]:checked').value;
  const general = document.getElementById('general-feedback').value.trim();
  const sectionInputs = document.querySelectorAll('.section-feedback');
  let lines = [];
  lines.push('## Plan Feedback');
  lines.push('');
  lines.push('Decision: ' + (decision === 'approve' ? 'Approve' : 'Request changes'));
  lines.push('');
  if (general) {{
    lines.push('### General');
    lines.push(general);
    lines.push('');
  }}
  sectionInputs.forEach(function (el) {{
    const text = el.value.trim();
    if (text) {{
      lines.push('### Section: ' + el.dataset.heading);
      lines.push(text);
      lines.push('');
    }}
  }});
  return lines.join('\\n').trim();
}}

document.getElementById('copy-btn').addEventListener('click', function () {{
  const md = buildFeedbackMarkdown();
  const status = document.getElementById('copy-status');
  const fallback = document.getElementById('fallback-output');
  navigator.clipboard.writeText(md).then(function () {{
    status.textContent = 'Copied!';
    fallback.style.display = 'none';
    setTimeout(function () {{ status.textContent = ''; }}, 2000);
  }}).catch(function () {{
    fallback.value = md;
    fallback.style.display = 'block';
    fallback.focus();
    fallback.select();
    status.textContent = 'Clipboard unavailable — copy manually below';
  }});
}});
</script>
</body>
</html>'''


import argparse
import datetime
import os


def build_review(plan_path: str, adversarial_critique: str | None, architecture_critique: str | None, output_dir: str = "/tmp") -> str:
    with open(plan_path, "r", encoding="utf-8") as f:
        plan_text = f.read()

    sections = parse_sections(plan_text)

    stripped = plan_text.strip()
    first_line = stripped.splitlines()[0] if stripped else ""
    plan_title = first_line.lstrip("#").strip() if first_line.startswith("#") else os.path.basename(plan_path)

    generated_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    slug = slugify(plan_title)
    output_path = os.path.join(output_dir, f"claude-plan-review-{slug}-{timestamp}.html")

    html_out = render_html(
        plan_title=plan_title,
        source_path=plan_path,
        generated_at=generated_at,
        critique={"adversarial": adversarial_critique, "architecture": architecture_critique},
        sections=sections,
    )

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_out)

    return output_path


def _read_optional_file(path):
    if not path:
        return None
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip() or None


def main():
    parser = argparse.ArgumentParser(description="Generate an interactive HTML plan review page.")
    parser.add_argument("plan_path", help="Path to the plan markdown file")
    parser.add_argument("--adversarial-file", help="Path to a file containing the adversarial reviewer's critique text")
    parser.add_argument("--architecture-file", help="Path to a file containing the architecture reviewer's critique text")
    parser.add_argument("--trevelyan-file", dest="adversarial_file", help=argparse.SUPPRESS)
    parser.add_argument("--m-file", dest="architecture_file", help=argparse.SUPPRESS)
    parser.add_argument("--output-dir", default="/tmp", help="Directory to write the generated HTML file (default: /tmp)")
    args = parser.parse_args()

    adversarial_critique = _read_optional_file(args.adversarial_file)
    architecture_critique = _read_optional_file(args.architecture_file)

    output_path = build_review(args.plan_path, adversarial_critique, architecture_critique, args.output_dir)
    print(output_path)


if __name__ == "__main__":
    main()
