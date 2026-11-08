from build_review import parse_sections, slugify, escape_html, render_html


def test_parse_sections_splits_on_level_two_headings():
    text = "# Title\n\nIntro text.\n\n## First\ncontent one\n\n## Second\ncontent two\n"
    sections = parse_sections(text)
    assert len(sections) == 3
    assert sections[0]["heading"] == "Plan"
    assert "Title" in sections[0]["content"]
    assert sections[1]["heading"] == "First"
    assert sections[1]["content"] == "content one"
    assert sections[2]["heading"] == "Second"
    assert sections[2]["content"] == "content two"


def test_parse_sections_no_headings_returns_single_fallback_section():
    text = "Just a flat plan with no headings at all."
    sections = parse_sections(text)
    assert sections == [{"heading": "Plan", "content": text}]


def test_parse_sections_ignores_level_three_headings():
    text = "## Phase 1\n### Step A\ndetail\n"
    sections = parse_sections(text)
    assert len(sections) == 1
    assert sections[0]["heading"] == "Phase 1"
    assert "### Step A" in sections[0]["content"]


def test_slugify_basic():
    assert slugify("Add Plan Review Skill") == "add-plan-review-skill"


def test_slugify_truncates():
    result = slugify("a" * 50, max_len=10)
    assert result == "a" * 10


def test_slugify_empty_input_returns_fallback():
    assert slugify("!!!") == "plan"


def test_escape_html_escapes_special_characters():
    assert escape_html("<script>&\"'") == "&lt;script&gt;&amp;&quot;&#x27;"


def test_render_html_includes_sections_and_critique_and_escapes_content():
    sections = [{"heading": "Phase 1 <script>", "content": "Do the thing & verify."}]
    html_out = render_html(
        plan_title="Sample Plan",
        source_path="/tmp/sample.md",
        generated_at="2026-07-13 10:00:00",
        critique={"adversarial": "Watch for race conditions.", "architecture": None},
        sections=sections,
    )
    assert "Sample Plan" in html_out
    assert "Phase 1 &lt;script&gt;" in html_out
    assert "Do the thing &amp; verify." in html_out
    assert "Watch for race conditions." in html_out
    assert "Critique unavailable." in html_out
    assert "Copy Feedback" in html_out
    assert "navigator.clipboard.writeText" in html_out


import os

from build_review import build_review


def test_build_review_writes_html_file_and_returns_path(tmp_path):
    plan_file = tmp_path / "sample-plan.md"
    plan_file.write_text("# My Sample Plan\n\n## Overview\nDo the thing.\n")

    output_path = build_review(
        plan_path=str(plan_file),
        adversarial_critique="Looks risky.",
        architecture_critique=None,
        output_dir=str(tmp_path),
    )

    assert os.path.exists(output_path)
    assert output_path.startswith(str(tmp_path))
    content = open(output_path, encoding="utf-8").read()
    assert "My Sample Plan" in content
    assert "Looks risky." in content
    assert "Critique unavailable." in content
