from backend.app.services.matching.rrf_jobs import score_jobs_for_resume


def _job_row(job_id: str, *, skills, distance, bm25=0.0, constraints=None, confirmed=False) -> dict:
    return {
        "job_id": job_id,
        "skills": skills,
        "distance_expanded": distance,
        "bm25_score": bm25,
        "skill_constraints": constraints or {"must": [], "preferred": [], "mentioned": [], "excluded": []},
        "constraints_confirmed": confirmed,
    }


def test_skill_score_divides_by_job_skill_count_not_cv_skill_count():
    rows = [_job_row("j1", skills=["python", "fastapi"], distance=0.1)]
    ranked = score_jobs_for_resume(rows, cv_skills=["python"], cv_verified=["python"])
    # CV has 1 of the job's 2 required skills -> 0.5, NOT 1/len(cv_skills)=1.0
    assert ranked[0]["skill_score"] == 0.5


def test_skill_score_is_one_when_cv_covers_all_job_skills():
    rows = [_job_row("j1", skills=["python"], distance=0.1)]
    ranked = score_jobs_for_resume(rows, cv_skills=["python", "docker"], cv_verified=["python", "docker"])
    assert ranked[0]["skill_score"] == 1.0


def test_rrf_fuses_dense_and_bm25_with_job_id_as_doc_id():
    rows = [
        _job_row("j1", skills=["python"], distance=0.9, bm25=0.0),
        _job_row("j2", skills=["python"], distance=0.1, bm25=4.2),
    ]
    ranked = score_jobs_for_resume(rows, cv_skills=["python"], cv_verified=["python"])
    ids = [row["job_id"] for row in ranked]
    assert ids[0] == "j2"


def test_row_with_no_dense_or_bm25_signal_is_dropped():
    # Mirrors score_candidates' existing "cam" case in test_matching_rrf.py:
    # a row with distance_expanded=None and bm25_score=0.0 has zero signal
    # on both rankings, so it never appears in rrf_fuse's output and is
    # correctly absent from the final ranked list -- not a CV->JD-specific
    # behavior, just inherited from the shared rrf_fuse primitive.
    rows = [
        _job_row("j1", skills=["python"], distance=None, bm25=0.0),
        _job_row("j2", skills=["python"], distance=0.1, bm25=1.0),
    ]
    ranked = score_jobs_for_resume(rows, cv_skills=["python"], cv_verified=["python"])
    ids = {row["job_id"] for row in ranked}
    assert ids == {"j2"}


def test_confirmed_job_constraints_partition_pass_before_fail_without_dropping():
    # job_constraint_status gates on each ROW's own constraints against one
    # FIXED cv_verified set (the same candidate for every row) -- so what
    # makes a job "fail" here is that job's own must-have (kotlin), not its
    # "skills" list, which is purely informational for skill_score/bm25.
    pass_constraints = {"must": [{"any_of": ["java"]}], "preferred": [], "mentioned": [], "excluded": []}
    fail_constraints = {"must": [{"any_of": ["kotlin"]}], "preferred": [], "mentioned": [], "excluded": []}
    rows = [
        _job_row("fail", skills=["kotlin"], distance=0.01, constraints=fail_constraints, confirmed=True),
        _job_row("pass", skills=["java"], distance=0.5, constraints=pass_constraints, confirmed=True),
        _job_row("ungated", skills=["java"], distance=0.02, constraints=pass_constraints, confirmed=False),
    ]
    ranked = score_jobs_for_resume(
        rows, cv_skills=["java"], cv_verified=["java"], cv_has_evidence=True
    )
    statuses = {row["job_id"]: row["constraint_status"] for row in ranked}
    assert statuses == {"fail": "fail", "pass": "pass", "ungated": "ungated"}
    order = [row["job_id"] for row in ranked]
    assert order.index("pass") < order.index("fail")


def test_cv_without_evidence_marks_confirmed_jobs_unknown_not_fail():
    constraints = {"must": [{"any_of": ["java"]}], "preferred": [], "mentioned": [], "excluded": []}
    rows = [_job_row("j1", skills=["python"], distance=0.1, constraints=constraints, confirmed=True)]
    ranked = score_jobs_for_resume(rows, cv_skills=["python"], cv_verified=[], cv_has_evidence=False)
    assert ranked[0]["constraint_status"] == "unknown"
