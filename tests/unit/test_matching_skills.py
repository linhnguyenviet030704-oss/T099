from backend.app.services.matching.skills import coverage_score, jaccard_score, load_taxonomy_index, normalize_skill


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
