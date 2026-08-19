from backend.app.services.matching.rrf import RRF_K, rrf_fuse, rrf_normalize, score_candidates


def test_rrf_prefers_doc_ranked_first_on_more_lists():
    fused = rrf_fuse(
        {
            "expanded": ["bob", "ada"],
            "bm25": ["bob", "ada"],
        }
    )
    assert [row[0] for row in fused] == ["bob", "ada"]
    assert fused[0][1] > fused[1][1]


def test_rrf_equal_ranks_tie_break_by_id_order_stable():
    fused = rrf_fuse({"a": ["x", "y"], "b": ["x", "y"]})
    assert fused[0][0] == "x"
    expected = 2 / (RRF_K + 1)
    assert fused[0][1] == expected


def test_rrf_tied_input_ranks_share_contribution():
    fused = rrf_fuse({"a": ["x", "y"]}, ranks={"a": [1, 1]})
    assert fused[0][1] == fused[1][1] == 1 / (RRF_K + 1)
    assert [row[0] for row in fused] == ["x", "y"]


def test_rrf_normalize_maps_all_rank_one_to_one():
    raw = 2 / (RRF_K + 1)
    assert rrf_normalize(raw, n_lists=2) == 1.0
    assert rrf_normalize(0.0, n_lists=2) == 0.0


def test_score_candidates_fuses_dense_and_bm25_and_keeps_zeros_out():
    rows = [
        {
            "application_id": "ada",
            "resume_id": "r1",
            "verified_skills": ["python"],
            "skills": ["python"],
            "distance_expanded": 0.1,
            "bm25_score": 0.0,
        },
        {
            "application_id": "bob",
            "resume_id": "r2",
            "verified_skills": ["python", "fastapi"],
            "skills": ["python", "fastapi"],
            "distance_expanded": 0.9,
            "bm25_score": 4.2,
        },
        {
            "application_id": "cam",
            "resume_id": "r3",
            "verified_skills": [],
            "skills": [],
            "distance_expanded": None,
            "bm25_score": 0.0,
        },
    ]
    ranked = score_candidates(rows, jd_skills=["python", "fastapi"])
    ids = [row["application_id"] for row in ranked]
    assert "ada" in ids and "bob" in ids
    assert "cam" not in ids
    assert ranked[0]["rrf_rank"] == 1


def test_score_candidates_confirmed_partitions_without_dropping_fail():
    constraints = {"must": [{"any_of": ["java"]}], "preferred": [], "mentioned": [], "excluded": []}
    rows = [
        {
            "application_id": "fail",
            "verified_skills": ["python"],
            "skill_records": [{"id": "python", "status": "verified"}],
            "ingest_status": "ok",
            "clean_markdown": "python",
            "distance_expanded": 0.01,
            "bm25_score": 0.0,
        },
        {
            "application_id": "pass",
            "verified_skills": ["java"],
            "skill_records": [{"id": "java", "status": "verified"}],
            "ingest_status": "ok",
            "clean_markdown": "java",
            "distance_expanded": 0.5,
            "bm25_score": 0.0,
        },
        {
            "application_id": "unk",
            "verified_skills": ["java"],
            "distance_expanded": 0.02,
            "bm25_score": 0.0,
        },
    ]
    ranked = score_candidates(rows, jd_skills=["java"], constraints=constraints, confirmed=True)
    assert [row["application_id"] for row in ranked] == ["pass", "unk", "fail"]
    assert {row["application_id"] for row in ranked} == {"pass", "unk", "fail"}
