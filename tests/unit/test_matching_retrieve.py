from backend.app.services.matching.retrieve import combine_scores, rank_candidates, semantic_score


def test_semantic_score_clamps_cosine_distance():
    assert semantic_score(0.0) == 1.0
    assert semantic_score(0.2) == 0.8
    assert semantic_score(2.0) == 0.0


def test_rank_candidates_prefers_skill_coverage_then_semantic():
    rows = [
        {
            "application_id": "a",
            "resume_id": "r1",
            "skills": ["Python"],
            "distance": 0.1,
        },
        {
            "application_id": "b",
            "resume_id": "r2",
            "skills": ["Python", "FastAPI", "Docker"],
            "distance": 0.3,
        },
    ]
    ranked = rank_candidates(rows, jd_skills=["Python", "FastAPI", "Docker"])
    assert ranked[0]["application_id"] == "b"
    assert ranked[0]["skill_score"] == 1.0
    assert ranked[1]["skill_score"] == 1 / 3


def test_combine_scores_weighted():
    assert combine_scores(1.0, 0.0) == 0.6
    assert combine_scores(0.0, 1.0) == 0.4
