from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from backend.app.services.reputation_service import ReputationService


@pytest.mark.asyncio
async def test_get_scores_found():
    """Lấy điểm uy tín khi profile tồn tại."""
    user_id = uuid4()
    repo = AsyncMock()
    repo.get_scores.return_value = {
        "recruiter_reputation_score": 95,
        "candidate_reputation_score": 85,
    }

    service = ReputationService(repo)
    scores = await service.get_scores(user_id)

    assert scores.recruiter_reputation_score == 95
    assert scores.candidate_reputation_score == 85


@pytest.mark.asyncio
async def test_get_scores_fallback_default_100():
    """Mặc định điểm 100 nếu chưa có dữ liệu điểm."""
    user_id = uuid4()
    repo = AsyncMock()
    repo.get_scores.return_value = None

    service = ReputationService(repo)
    scores = await service.get_scores(user_id)

    assert scores.recruiter_reputation_score == 100
    assert scores.candidate_reputation_score == 100


@pytest.mark.asyncio
async def test_list_history():
    """Lấy danh sách lịch sử biến động điểm uy tín."""
    user_id = uuid4()
    event_id = uuid4()
    app_id = uuid4()

    repo = AsyncMock()
    repo.list_events_for_user.return_value = [
        {
            "id": str(event_id),
            "role": "recruiter",
            "points_delta": -5,
            "reason": "recruiter_timeout",
            "application_id": str(app_id),
            "job_post_id": None,
            "interview_invitation_id": None,
            "created_at": "2026-08-30T10:00:00Z",
        }
    ]
    repo.count_events.return_value = 1

    service = ReputationService(repo)
    history = await service.list_history(user_id, role="recruiter", limit=10, offset=0)

    assert history.total == 1
    assert len(history.items) == 1
    assert history.items[0].id == event_id
    assert history.items[0].points_delta == -5
    assert history.items[0].reason == "recruiter_timeout"
    assert history.items[0].application_id == app_id
