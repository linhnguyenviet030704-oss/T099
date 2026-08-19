from backend.app.services.matching.skills import (
    allowlist_token,
    coverage_score,
    expand_query,
    extract_skills,
    jaccard_score,
    load_taxonomy_index,
    normalize_skill,
    related_skills,
    skill_quote,
    taxonomy_version,
)


def test_normalize_maps_alias_to_snake_case():
    index = load_taxonomy_index()
    assert normalize_skill("postgres", index) == "postgresql"
    assert normalize_skill("PostgreSQL", index) == "postgresql"
    assert normalize_skill("unknown-skill-xyz", index) is None


def test_extract_special_skill_surfaces():
    found = extract_skills("Used C++ and C# with .NET, Node.js, Spring-Boot, and Postgres")
    assert "c_plus_plus" in found
    assert "c_sharp" in found
    assert "dotnet" in found
    assert "nodejs" in found
    assert "spring_boot" in found
    assert "postgresql" in found


def test_coverage_is_intersection_over_jd_must_have():
    index = load_taxonomy_index()
    cv = ["python", "fastapi", "Cooking"]
    jd = ["python", "fastapi", "docker"]
    assert coverage_score(cv, jd, index) == 2 / 3


def test_jaccard_penalizes_extra_cv_skills():
    index = load_taxonomy_index()
    cv = ["python", "fastapi", "docker"]
    jd = ["python", "fastapi"]
    assert jaccard_score(cv, jd, index) == 2 / 3


def test_coverage_empty_jd_is_zero():
    index = load_taxonomy_index()
    assert coverage_score(["python"], [], index) == 0.0
    assert coverage_score(["python"], ["not-a-real-skill"], index) == 0.0


def test_related_skills_are_same_category_siblings():
    related = related_skills("python", depth=2)
    assert "python" not in related
    assert "assembly" in related
    assert "fastapi" not in related
    assert len(related) <= 8
    assert related_skills("python", depth=0) == []


def test_expand_query_appends_natural_labels_and_category_display():
    expanded = expand_query("Need Python and FastAPI experience")
    assert "Need Python and FastAPI experience" in expanded
    assert "programming_languages" not in expanded
    assert "programming languages" in expanded
    assert "backend" in expanded
    assert expanded != "Need Python and FastAPI experience"


def test_expand_query_without_known_skills_is_unchanged():
    text = "Looking for a kind teammate"
    assert expand_query(text) == text


def test_allowlist_and_quote_and_version():
    assert allowlist_token("Spring Boot") == "spring_boot"
    assert allowlist_token("cooking") is None
    clean = "Developed REST APIs using FastAPI at a startup."
    quote = skill_quote(clean, "fastapi")
    assert "FastAPI" in quote
    assert len(quote) <= 160
    assert len(taxonomy_version()) == 12
