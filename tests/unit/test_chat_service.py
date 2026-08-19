from __future__ import annotations

from uuid import uuid4

import pytest
from pydantic import ValidationError

from backend.app.api.schemas.chat import ChatRequest, ChatResponse, RecommendedCandidate
from backend.app.core.exceptions import AppError, ForbiddenError
from backend.app.services.chat_service import ChatService


def test_chat_request_rerank_defaults_to_qwen():
    req = ChatRequest(message="hello")
    assert req.rerank == "qwen"


def test_chat_request_rejects_unknown_rerank():
    with pytest.raises(ValidationError):
        ChatRequest(message="hello", rerank="cohere")


def _row(**overrides):
    base = {
        "id": str(uuid4()),
        "title": "Backend Engineer",
        "location": "Hà Nội",
        "employment_type": "full_time",
        "salary_min": 20_000_000,
        "salary_max": 35_000_000,
        "currency": "VND",
        "companies": {"name": "Acme"},
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_chat_returns_mock_jobs():
    job_id = uuid4()

    async def fetch_jobs():
        return [_row(id=str(job_id))]

    result = await ChatService(fetch_jobs).chat(ChatRequest(message="hello"))
    assert len(result.jobs) == 1
    assert result.jobs[0].id == job_id
    assert result.jobs[0].score == 0.95
    assert result.response == "Gợi ý 1 việc làm phù hợp (mock matching)."


@pytest.mark.asyncio
async def test_chat_empty_published_jobs():
    async def fetch_jobs():
        return []

    result = await ChatService(fetch_jobs).chat(ChatRequest(message="Gợi ý việc phù hợp"))
    assert result.jobs == []
    assert result.response == "Hiện chưa có tin tuyển dụng đang mở."


@pytest.mark.asyncio
async def test_chat_fetch_failure_is_502():
    async def fetch_jobs():
        raise RuntimeError("supabase down")

    with pytest.raises(AppError) as exc:
        await ChatService(fetch_jobs).chat(ChatRequest(message="hello"))
    assert exc.value.status_code == 502
    assert exc.value.code == "JOBS_UNAVAILABLE"


def _candidate_row(**overrides):
    base = {
        "id": str(uuid4()),
        "applicant_user_id": str(uuid4()),
        "current_status": "pending",
        "resume_title_snapshot": "CV.pdf",
        "resume_storage_path_snapshot": "u/cv.pdf",
        "profiles": {"full_name": "Ada", "email": "ada@example.com"},
    }
    base.update(overrides)
    return base


@pytest.mark.asyncio
async def test_chat_returns_mock_candidates_for_job():
    job_id = uuid4()
    actor_id = uuid4()
    app_id = uuid4()

    async def fetch_jobs():
        return []

    async def fetch_candidates(requested_job_id, requested_actor_id):
        assert requested_job_id == job_id
        assert requested_actor_id == actor_id
        return [_candidate_row(id=str(app_id))]

    async def allow(_actor, _job):
        return None

    result = await ChatService(fetch_jobs, fetch_candidates, allow).chat(
        ChatRequest(message="Gợi ý ứng viên phù hợp", job_id=job_id),
        actor_id,
    )
    assert result.jobs == []
    assert len(result.candidates) == 1
    assert result.candidates[0].application_id == app_id
    assert result.response == "Gợi ý 1 ứng viên phù hợp (mock matching)."


@pytest.mark.asyncio
async def test_chat_candidates_empty_pool():
    job_id = uuid4()

    async def fetch_jobs():
        return []

    async def fetch_candidates(_job_id, _actor_id):
        return []

    async def allow(_actor, _job):
        return None

    result = await ChatService(fetch_jobs, fetch_candidates, allow).chat(
        ChatRequest(message="hello", job_id=job_id),
        uuid4(),
    )
    assert result.candidates == []
    assert result.response == "Chưa có CV nộp cho vị trí này."


@pytest.mark.asyncio
async def test_chat_candidates_forbidden():
    job_id = uuid4()

    async def fetch_jobs():
        return []

    async def fetch_candidates(_job_id, _actor_id):
        return [_candidate_row()]

    async def deny(_actor, _job):
        raise ForbiddenError("Not a recruiter for this job")

    with pytest.raises(ForbiddenError):
        await ChatService(fetch_jobs, fetch_candidates, deny).chat(
            ChatRequest(message="hello", job_id=job_id),
            uuid4(),
        )


@pytest.mark.asyncio
async def test_chat_job_id_uses_matching_runner_not_mock():
    job_id = uuid4()
    actor_id = uuid4()
    app_id = uuid4()
    user_id = uuid4()

    async def fetch_jobs():
        return []

    async def fetch_candidates(_job_id, _actor_id):
        raise AssertionError("mock fetch_candidates must not run when matcher is set")

    async def allow(_actor, _job):
        return None

    async def match(requested, actor, message, rerank):
        assert requested == job_id
        assert actor == actor_id
        assert message == "Gợi ý ứng viên phù hợp"
        assert rerank == "qwen"
        return ChatResponse(
            response="Gợi ý 1 ứng viên phù hợp.",
            candidates=[
                RecommendedCandidate(
                    application_id=app_id,
                    applicant_user_id=user_id,
                    full_name="Ada",
                    email="ada@example.com",
                    resume_title="CV.pdf",
                    resume_storage_path="u/cv.pdf",
                    current_status="pending",
                    rrf_score=0.81,
                    rerank_score=None,
                    rerank_status="not_requested",
                )
            ],
        )

    result = await ChatService(fetch_jobs, fetch_candidates, allow, match).chat(
        ChatRequest(message="Gợi ý ứng viên phù hợp", job_id=job_id),
        actor_id,
    )
    assert result.response == "Gợi ý 1 ứng viên phù hợp."
    assert result.candidates[0].rrf_score == 0.81
    assert result.candidates[0].rerank_score is None
    assert "mock matching" not in result.response

