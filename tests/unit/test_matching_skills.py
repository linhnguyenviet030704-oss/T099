from backend.app.services.matching.skills import (
    coverage_score,
    expand_query,
    extract_skills,
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


def test_extract_skills_covers_expanded_taxonomy_domains():
    """Guards against the eval-report finding that only a 10-skill
    taxonomy meant entire domains (ML, embedded, data infra, blockchain,
    networking) were invisible to skill extraction."""
    text = (
        "Built models with TensorFlow and PyTorch, deployed on Kubernetes "
        "with Terraform. Embedded firmware in Embedded C with FreeRTOS. "
        "Streamed events through Kafka and Flink. Wrote Solidity smart "
        "contracts. CCNA certified, worked with Cisco gear."
    )
    found = set(extract_skills(text))
    assert {
        "TensorFlow",
        "PyTorch",
        "Kubernetes",
        "Terraform",
        "Embedded C",
        "FreeRTOS",
        "Kafka",
        "Flink",
        "Solidity",
        "CCNA",
        "Cisco",
    } <= found


def test_extract_skills_fuzzy_matches_minor_spelling_variant():
    found = extract_skills("Deployed apps on Postgre SQL and Kuberentes clusters")
    assert "PostgreSQL" in found
    assert "Kubernetes" in found


def test_extract_skills_does_not_fuzzy_match_unrelated_short_words():
    # The fuzzy pass is guarded to len>=4 candidates/aliases so common
    # short words don't turn into false matches.
    found = extract_skills("The team went to the store for coffee")
    assert "Go" not in found
