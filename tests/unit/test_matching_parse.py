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
