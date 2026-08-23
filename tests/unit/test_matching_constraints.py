from backend.app.services.matching.constraints import (
    constraint_status,
    empty_constraints,
    job_constraint_status,
    partition_rows,
    propose_skill_constraints,
    soft_delta,
)


def test_propose_does_not_and_every_mentioned_skill():
    text = (
        "Java là bắt buộc. Kotlin hoặc Go là điểm cộng. "
        "Team đang chuyển một số hệ thống Python."
    )
    proposed = propose_skill_constraints(text)
    must_ids = [skill for group in proposed["must"] for skill in group["any_of"]]
    assert must_ids == ["java"]
    assert "kotlin" in proposed["preferred"]
    assert "golang" in proposed["preferred"]
    assert "python" in proposed["mentioned"]
    assert "python" not in must_ids
    assert "kotlin" not in must_ids


def test_soft_delta_is_scaled_intersection():
    assert soft_delta(["java", "python"], ["java", "kotlin"]) == 0.05
    assert soft_delta([], ["java"]) == 0.0


def test_unconfirmed_is_ungated():
    row = {"verified_skills": [], "skill_records": []}
    assert constraint_status(row, empty_constraints(), confirmed=False) == "ungated"


def test_missing_records_are_unknown_when_confirmed():
    constraints = {"must": [{"any_of": ["java"]}], "preferred": [], "mentioned": [], "excluded": []}
    row = {"verified_skills": ["java"], "ingest_status": "ok"}
    assert constraint_status(row, constraints, confirmed=True) == "unknown"


def test_verified_any_of_passes_inferred_does_not():
    constraints = {"must": [{"any_of": ["java", "kotlin"]}], "preferred": [], "mentioned": [], "excluded": []}
    pass_row = {
        "verified_skills": ["java"],
        "skill_records": [{"id": "java", "status": "verified"}],
        "ingest_status": "ok",
        "clean_markdown": "Used Java",
    }
    inferred_row = {
        "verified_skills": [],
        "inferred_skills": ["java"],
        "skill_records": [{"id": "java", "status": "inferred", "origin": "llm", "quote": ""}],
        "ingest_status": "ok",
        "clean_markdown": "Backend intern",
    }
    assert constraint_status(pass_row, constraints, confirmed=True) == "pass"
    assert constraint_status(inferred_row, constraints, confirmed=True) == "fail"


def test_partition_orders_pass_unknown_fail_without_dropping():
    rows = [
        {"id": "f", "constraint_status": "fail"},
        {"id": "p", "constraint_status": "pass"},
        {"id": "u", "constraint_status": "unknown"},
        {"id": "p2", "constraint_status": "pass"},
    ]
    ordered = partition_rows(rows)
    assert [row["id"] for row in ordered] == ["p", "p2", "u", "f"]
    assert len(ordered) == 4


def test_job_constraint_status_ungated_when_job_constraints_unconfirmed():
    assert (
        job_constraint_status(
            verified={"java"}, has_evidence=True, constraints=empty_constraints(), confirmed=False
        )
        == "ungated"
    )


def test_job_constraint_status_unknown_when_cv_lacks_evidence():
    constraints = {"must": [{"any_of": ["java"]}], "preferred": [], "mentioned": [], "excluded": []}
    assert (
        job_constraint_status(verified={"java"}, has_evidence=False, constraints=constraints, confirmed=True)
        == "unknown"
    )


def test_job_constraint_status_pass_when_verified_covers_must_have():
    constraints = {"must": [{"any_of": ["java", "kotlin"]}], "preferred": [], "mentioned": [], "excluded": []}
    assert (
        job_constraint_status(verified={"java"}, has_evidence=True, constraints=constraints, confirmed=True)
        == "pass"
    )


def test_job_constraint_status_fail_when_verified_misses_must_have():
    constraints = {"must": [{"any_of": ["kotlin"]}], "preferred": [], "mentioned": [], "excluded": []}
    assert (
        job_constraint_status(verified={"java"}, has_evidence=True, constraints=constraints, confirmed=True)
        == "fail"
    )


def test_job_constraint_status_fail_when_verified_hits_excluded():
    constraints = {"must": [], "preferred": [], "mentioned": [], "excluded": ["php"]}
    assert (
        job_constraint_status(verified={"php"}, has_evidence=True, constraints=constraints, confirmed=True)
        == "fail"
    )
