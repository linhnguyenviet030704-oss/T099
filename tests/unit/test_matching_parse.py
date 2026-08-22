import io
from unittest.mock import patch

import pymupdf
from docx import Document

from backend.app.services.matching import parse as parse_module
from backend.app.services.matching.parse import parse_resume_bytes, redact_pii


def test_parse_plain_text_keeps_professional_content():
    raw = b"Backend engineer. Python FastAPI PostgreSQL and cooking."
    parsed = parse_resume_bytes(raw, mime_type="text/plain")
    assert "Python" in parsed["markdown"]
    assert "FastAPI" in parsed["markdown"]
    assert parsed["metadata"].get("skills") in (None, [])


def test_parse_empty_bytes():
    parsed = parse_resume_bytes(b"", mime_type="text/plain")
    assert parsed["markdown"] == ""


def test_parse_strips_pii_before_llm():
    raw = b"""Nguyen Van A
email: ada@gmail.com
phone: 0912345678
https://linkedin.com/in/nguyenvana
CCCD: 012345678901
Ngay sinh: 01/02/1999
Skills
Python FastAPI
"""
    parsed = parse_resume_bytes(raw, mime_type="text/plain")
    md = parsed["markdown"]
    assert "Python" in md
    assert "ada@gmail.com" not in md
    assert "0912345678" not in md
    assert "linkedin.com" not in md
    assert "012345678901" not in md
    assert "01/02/1999" not in md
    assert "Nguyen Van A" not in md


def _docx_bytes(paragraphs: list[tuple[str, str | None]]) -> bytes:
    doc = Document()
    for text, style in paragraphs:
        doc.add_paragraph(text, style=style)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_parse_docx_extracts_headings_and_bullets():
    data = _docx_bytes(
        [
            ("Backend Engineer", None),
            ("Skills", "Heading 2"),
            ("Python", "List Bullet"),
            ("FastAPI", "List Bullet"),
        ]
    )
    parsed = parse_resume_bytes(
        data,
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    md = parsed["markdown"]
    assert "## Skills" in md
    assert "Python" in md
    assert "FastAPI" in md


def test_parse_docx_detected_from_magic_bytes_without_mime_type():
    data = _docx_bytes([("Python FastAPI engineer", None)])
    parsed = parse_resume_bytes(data, mime_type="")
    assert "Python" in parsed["markdown"]


def test_parse_flags_low_content_for_thin_extraction():
    parsed = parse_resume_bytes(b"Hi", mime_type="text/plain")
    assert parsed["metadata"]["low_content"] is True


def test_parse_does_not_flag_low_content_for_normal_cv():
    raw = ("Backend engineer with Python FastAPI PostgreSQL experience. " * 20).encode()
    parsed = parse_resume_bytes(raw, mime_type="text/plain")
    assert parsed["metadata"]["low_content"] is False
    assert parsed["metadata"]["content_chars"] > 600


def _two_column_pdf_bytes() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    # Left sidebar column and a separated right main-content column, like
    # a typical TopCV-style resume template.
    page.insert_textbox(pymupdf.Rect(40, 40, 200, 700), "Contact\nSidebar info\nPython\nDocker", fontsize=11)
    page.insert_textbox(pymupdf.Rect(260, 40, 550, 700), "Experience\nBuilt APIs with FastAPI\nGit reviews daily", fontsize=11)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def test_pdfplumber_fallback_reads_columns_without_interleaving_mid_line():
    data = _two_column_pdf_bytes()
    text = parse_module._pdfplumber_to_markdown(data)
    assert "Python" in text
    assert "FastAPI" in text
    # Column-aware reading order: left column content stays together,
    # not spliced word-by-word with the right column on the same lines.
    assert "Sidebar info Built APIs" not in text


def test_parse_pdf_falls_back_to_layout_aware_when_primary_extraction_is_thin():
    data = _two_column_pdf_bytes()
    with patch.object(parse_module, "_pdf_to_markdown", return_value="x"):
        markdown = parse_module._parse_pdf(data)
    assert "Python" in markdown or "FastAPI" in markdown
    assert len(markdown) > 10


def test_redact_pii_drops_wrapped_name_continuation():
    text = """# CV

Nguyen Van
Anh

## Skills
- Python
"""
    cleaned = redact_pii(text)
    assert "Nguyen Van" not in cleaned
    assert "\nAnh\n" not in f"\n{cleaned}\n"
    assert "Python" in cleaned


def test_redact_pii_strips_scheme_less_social_handle():
    text = """# CV

## Skills
- Python
- twitter.com/khoi_sol
"""
    cleaned = redact_pii(text)
    assert "twitter.com" not in cleaned
    assert "Python" in cleaned


def test_redact_pii_drops_contact_section_and_urls():
    text = """# CV

Ada Lovelace

## Contact
- ada@example.com
- +84 912 345 678

## Skills
- Python
- https://github.com/ada/project
"""
    cleaned = redact_pii(text)
    assert "Python" in cleaned
    assert "ada@example.com" not in cleaned
    assert "912 345 678" not in cleaned
    assert "github.com" not in cleaned
    assert "Ada Lovelace" not in cleaned
    assert "## Contact" not in cleaned
