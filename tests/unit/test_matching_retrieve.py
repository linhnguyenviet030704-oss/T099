from uuid import uuid4

import pytest

from backend.app.core.exceptions import ForbiddenError
from backend.app.services.matching.retrieve import _row, job_query_text, persist_match_resume_rows, retrieve_for_job
from backend.app.services.matching.rrf import score_candidates, semantic_score


def test_job_query_text_prefers_requirements():
    assert job_query_text({"title": "BE", "description": "code", "requirements": "Python"}) == "Python"
    assert job_query_text({"title": "BE", "description": "code", "requirements": "  "}) == "BE code"


def test_row_accepts_missing_execute_result():
    assert _row(None) is None
    assert _row(type("R", (), {"data": None})()) is None
    assert _row(type("R", (), {"data": {"metadata": {"skills": ["Python"]}}})())["metadata"]["skills"] == ["Python"]


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
    assert ranked[0]["rrf_score"] > ranked[1]["rrf_score"]
    assert ranked[0]["rrf_rank"] == 1
    assert ranked[1]["rrf_rank"] == 2
    assert "score" not in ranked[0]


class _ExplodingClient:
    """Raises if any data method is called — proves the authorization check
    runs strictly before any Supabase query/RPC, not just "raises somewhere"."""

    def table(self, _name):
        raise AssertionError("must not touch data before the access check")

    def rpc(self, *_args, **_kwargs):
        raise AssertionError("must not touch data before the access check")


@pytest.mark.asyncio
async def test_retrieve_for_job_blocks_before_touching_data_when_unauthorized(monkeypatch):
    actor_id = uuid4()
    job_id = uuid4()
    calls: list[tuple] = []

    async def _deny(client, passed_actor_id, passed_job_id):
        calls.append((client, passed_actor_id, passed_job_id))
        raise ForbiddenError("Not a recruiter for this job")

    monkeypatch.setattr("backend.app.services.matching.retrieve.assert_recruiter_job_access", _deny)

    client = _ExplodingClient()
    with pytest.raises(ForbiddenError):
        await retrieve_for_job(client, actor_id, job_id)

    assert calls == [(client, actor_id, job_id)]


@pytest.mark.asyncio
async def test_persist_match_resume_rows_blocks_before_insert_when_unauthorized(monkeypatch):
    actor_id = uuid4()
    job_id = uuid4()
    calls: list[tuple] = []

    async def _deny(client, passed_actor_id, passed_job_id):
        calls.append((client, passed_actor_id, passed_job_id))
        raise ForbiddenError("Not a recruiter for this job")

    monkeypatch.setattr("backend.app.services.matching.retrieve.assert_recruiter_job_access", _deny)

    client = _ExplodingClient()
    with pytest.raises(ForbiddenError):
        await persist_match_resume_rows(
            client,
            job_id,
            [],
            actor_id=actor_id,
            query_text="",
            recruiter_message="",
            rerank_mode="qwen",
            rerank_status="not_requested",
        )

    assert calls == [(client, actor_id, job_id)]
