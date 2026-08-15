from backend.app.services.matching.retrieve import job_query_text
from backend.app.services.matching.rrf import score_candidates, semantic_score


def test_job_query_text_prefers_requirements():
    assert job_query_text({"title": "BE", "description": "code", "requirements": "Python"}) == "Python"
    assert job_query_text({"title": "BE", "description": "code", "requirements": "  "}) == "BE code"


def test_semantic_score_clamps_cosine_distance():
    assert semantic_score(0.0) == 1.0
    assert semantic_score(0.2) == 0.8
    assert semantic_score(2.0) == 0.0


def test_score_candidates_rrf_prefers_expanded_and_skill_over_one_semantic_hit():
    rows = [
        {
            "application_id": "ada",
            "resume_id": "r1",
            "skills": ["Python"],
            "distance_original": 0.1,
            "distance_expanded": 0.4,
        },
        {
            "application_id": "bob",
            "resume_id": "r2",
            "skills": ["Python", "FastAPI", "Docker"],
            "distance_original": 0.3,
            "distance_expanded": 0.1,
        },
    ]
    ranked = score_candidates(rows, jd_skills=["Python", "FastAPI", "Docker"])
    assert ranked[0]["application_id"] == "bob"
    assert ranked[0]["skill_score"] == 1.0
    assert ranked[1]["skill_score"] == 1 / 3
    assert ranked[0]["score"] > ranked[1]["score"]
