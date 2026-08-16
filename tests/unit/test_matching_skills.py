from backend.app.services.matching.skills import (
    coverage_score,
    expand_query,
    jaccard_score,
    load_taxonomy_index,
    normalize_skill,
    related_skills,
)


def test_normalize_maps_synonym_and_strips_accents():
    index = load_taxonomy_index()
    assert normalize_skill("postgres", index) == "PostgreSQL"
    assert normalize_skill("PostgreSQL", index) == "PostgreSQL"
    assert normalize_skill("unknown-skill-xyz", index) is None


def test_coverage_is_intersection_over_jd_must_have():
    index = load_taxonomy_index()
    cv = ["Python", "FastAPI", "Cooking"]
    jd = ["python", "fastapi", "docker"]
    assert coverage_score(cv, jd, index) == 2 / 3


def test_jaccard_penalizes_extra_cv_skills():
    index = load_taxonomy_index()
    cv = ["Python", "FastAPI", "Docker"]
    jd = ["python", "fastapi"]
    assert jaccard_score(cv, jd, index) == 2 / 3


def test_coverage_empty_jd_is_zero():
    index = load_taxonomy_index()
    assert coverage_score(["Python"], [], index) == 0.0
    assert coverage_score(["Python"], ["not-a-real-skill"], index) == 0.0


def test_related_skills_stays_within_depth_two():
    related = related_skills("Python", depth=2)
    assert "FastAPI" in related
    assert "Python" not in related
    assert related_skills("Python", depth=0) == []


def test_expand_query_appends_related_taxonomy_terms():
    expanded = expand_query("Need Python and FastAPI experience")
    assert "Need Python and FastAPI experience" in expanded
    assert "PostgreSQL" in expanded
    assert expanded != "Need Python and FastAPI experience"


def test_expand_query_without_known_skills_is_unchanged():
    text = "Looking for a kind teammate"
    assert expand_query(text) == text
