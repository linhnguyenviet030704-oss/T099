from backend.app.services.matching.skills import (
    coverage_score,
    expand_query,
    extract_skills,
    jaccard_score,
    load_major_groups,
    load_taxonomy_index,
    major_for_skills,
    normalize_skill,
    related_skills,
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


def test_extract_skills_covers_expanded_taxonomy_domains():
    """Guards against the eval-report finding that only a 10-skill
    taxonomy meant entire domains (ML, embedded, data infra, blockchain,
    networking) were invisible to skill extraction. Canonical IDs are
    slugs (snake_case for special chars, lowercase for the rest)."""
    text = (
        "Built models with TensorFlow and PyTorch, deployed on Kubernetes "
        "with Terraform. Embedded firmware in Embedded C with FreeRTOS. "
        "Streamed events through Kafka and Flink. Wrote Solidity smart "
        "contracts. CCNA certified, worked with Cisco gear."
    )
    found = set(extract_skills(text))
    assert {
        "tensorflow",
        "pytorch",
        "kubernetes",
        "terraform",
        "embedded_c",
        "freertos",
        "kafka",
        "flink",
        "solidity",
        "ccna",
        "cisco",
    } <= found


def test_extract_skills_fuzzy_matches_minor_spelling_variant():
    found = extract_skills("Deployed apps on Postgre SQL and Kuberentes clusters")
    assert "postgresql" in found
    assert "kubernetes" in found


def test_extract_skills_does_not_fuzzy_match_unrelated_short_words():
    # The fuzzy pass is guarded to len>=4 candidates/aliases so common
    # short words don't turn into false matches.
    found = extract_skills("The team went to the store for coffee")
    assert "golang" not in found


def test_major_for_skills_picks_largest_overlap():
    # cloud_devops wins on 2 markers (Kubernetes + Terraform) vs data on 1.
    assert major_for_skills({"kubernetes", "terraform", "pandas"}) == "cloud_devops"


def test_major_for_skills_returns_empty_when_no_overlap():
    assert major_for_skills({"Python", "FastAPI"}) == ""
    assert major_for_skills([]) == ""


def test_load_major_groups_is_driven_by_skill_graph_asset():
    groups = load_major_groups()
    assert list(groups["ai_ml"]) == ["tensorflow", "pytorch", "keras"]
    assert "data" in groups and "kafka" in groups["data"]


def test_taxonomy_version_changes_when_major_groups_change(tmp_path, monkeypatch):
    """Adding a major_groups entry must change the version hash since the
    asset bytes change — downstream caches that key on it invalidate."""
    import json
    import shutil

    from backend.app.services.matching import skills as skills_mod

    real_path = skills_mod._GRAPH_PATH
    fake_path = tmp_path / "skill_graph.json"
    shutil.copy(real_path, fake_path)

    base = json.loads(fake_path.read_text(encoding="utf-8"))
    monkeypatch.setattr(skills_mod, "_GRAPH_PATH", fake_path)
    before = skills_mod.taxonomy_version()

    base["major_groups"] = {**base.get("major_groups", {}), "test_only": ["Python"]}
    fake_path.write_text(json.dumps(base), encoding="utf-8")
    after = skills_mod.taxonomy_version()

    assert after != before
