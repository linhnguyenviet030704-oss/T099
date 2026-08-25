from pathlib import Path

from backend.app.services.matching.parse import parse_resume_bytes

_CV_PATH = (
    Path(__file__).resolve().parents[2]
    / "evaluation"
    / "cv_hard"
    / "Nguyen-Anh-Tuan-TopCV.vn-040925.195058.pdf"
)


def test_parse_real_vietnamese_cv_detects_sections_and_skills():
    """Regression guard: the main pytest suite must catch a Vietnamese-CV
    parsing break, not just the manual evaluation/ingest_eval_v2 script.
    Fixture is a real export from TopCV.vn with fully Vietnamese body text."""
    data = _CV_PATH.read_bytes()
    result = parse_resume_bytes(data, mime_type="application/pdf")
    markdown = result["markdown"]
    metadata = result["metadata"]

    assert metadata["low_content"] is False

    # Vietnamese section headings ("Học vấn", "Kinh nghiệm làm việc") must
    # normalize to their canonical English headings.
    assert "## Education" in markdown
    assert "## Experience" in markdown

    # Skills listed in Vietnamese-language bullet text (technology names
    # kept in English/borrowed form, as is standard for VN tech CVs) must
    # still be recognized by the taxonomy.
    expected_skills = {
        "javascript",
        "sql_server",
        "bootstrap",
        "dotnet",
        "jquery",
        "react",
        "css",
        "sql",
        "html",
    }
    assert expected_skills.issubset(set(metadata["skills"]))


def test_parse_real_vietnamese_cv_redacts_all_pii():
    data = _CV_PATH.read_bytes()
    result = parse_resume_bytes(data, mime_type="application/pdf")
    markdown = result["markdown"]

    assert "anhtuan.d19c01a1020@gmail.com" not in markdown
    assert "0914844158" not in markdown
    assert "Nguyễn Anh Tuấn" not in markdown
    assert "Nguyen Anh Tuan" not in markdown
