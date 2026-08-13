from backend.app.services.matching.parse import parse_resume_bytes


def test_parse_plain_text_extracts_markdown_and_skills():
    raw = b"Backend engineer. Python FastAPI PostgreSQL and cooking."
    parsed = parse_resume_bytes(raw, mime_type="text/plain")
    assert "Python" in parsed["markdown"]
    assert "Python" in parsed["metadata"]["skills"]
    assert "FastAPI" in parsed["metadata"]["skills"]
    assert "PostgreSQL" in parsed["metadata"]["skills"]


def test_parse_empty_bytes():
    parsed = parse_resume_bytes(b"", mime_type="text/plain")
    assert parsed["markdown"] == ""
    assert parsed["metadata"]["skills"] == []
