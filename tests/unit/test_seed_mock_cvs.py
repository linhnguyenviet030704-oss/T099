from pathlib import Path

from backend.app.services.matching.parse import parse_resume_bytes
from backend.app.services.matching.skills import coverage_score, extract_skills, load_taxonomy_index

from scripts.seed_mock_cvs import DEMO_CVS, JD_SKILLS, mock_cv_pdf


def test_demo_cvs_cover_react_jd_with_spread_scores():
    index = load_taxonomy_index()
    scores = []
    for cv in DEMO_CVS:
        markdown = parse_resume_bytes(mock_cv_pdf(cv), mime_type="application/pdf")["markdown"]
        skills = extract_skills(markdown)
        assert set(skills) == set(extract_skills(cv["skills"])), cv["title"]
        scores.append(coverage_score(skills, JD_SKILLS, index))
    assert len(DEMO_CVS) == 30
    assert max(scores) == 1.0
    assert min(scores) == 0.0
    assert len({round(score, 2) for score in scores}) >= 4


def test_seed_sql_lists_demo_titles_and_react_jd():
    sql = Path("supabase/seed.sql").read_text(encoding="utf-8")
    assert "React TypeScript JavaScript Git" in sql
    for cv in DEMO_CVS:
        assert cv["title"] in sql
