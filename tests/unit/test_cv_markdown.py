import pymupdf

from backend.app.services.matching.parse import parse_resume_bytes
from backend.app.services.matching.skills import extract_skills
from scripts.cv_markdown import parse_front_matter, render_markdown_to_pdf

SAMPLE_MD = """---
cv_id: TEST-01
group_id: 1
candidate_name: Test Candidate
---

# Test Candidate

## Profile
Senior engineer with five years of React and TypeScript experience.

## Skills
React, TypeScript, JavaScript, Git
"""


def test_parse_front_matter_splits_metadata_and_body():
    metadata, body = parse_front_matter(SAMPLE_MD)
    assert metadata["cv_id"] == "TEST-01"
    assert metadata["candidate_name"] == "Test Candidate"
    assert metadata["group_id"] == 1
    assert body.splitlines()[0] == "# Test Candidate"
    assert "React, TypeScript" in body


def test_parse_front_matter_handles_missing_front_matter():
    metadata, body = parse_front_matter("# No front matter\nJust body text.")
    assert metadata == {}
    assert body == "# No front matter\nJust body text."


def test_render_markdown_to_pdf_roundtrips_skills():
    _metadata, body = parse_front_matter(SAMPLE_MD)
    pdf_bytes = render_markdown_to_pdf(body)
    assert pdf_bytes[:4] == b"%PDF"
    markdown = parse_resume_bytes(pdf_bytes, mime_type="application/pdf")["markdown"]
    skills = extract_skills(markdown)
    assert any(s.lower() == "react" for s in skills)


def test_render_markdown_to_pdf_paginates_long_body():
    long_body = "\n\n".join(
        f"Paragraph {i}. " + ("Filler sentence about the role. " * 40) for i in range(30)
    )
    pdf_bytes = render_markdown_to_pdf(long_body)
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    assert doc.page_count >= 2
    doc.close()
