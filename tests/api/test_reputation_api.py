from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from backend.app.api.schemas.reputation import (
    ReputationEventResponse,
    ReputationHistoryResponse,
    ReputationScoreResponse,
)
from backend.app.config.env import settings
from backend.app.dependencies.services import get_reputation_service
from backend.app.main import app


def _make_token(*, sub: str | None = None, email: str = "user@example.com") -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": sub or str(uuid4()),
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


@pytest_asyncio.fixture
async def api_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_my_reputation_unauthorized(api_client: AsyncClient):
    """Không có token -> 401 Unauthorized."""
    response = await api_client.get("/api/v1/reputation/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_my_reputation_success(api_client: AsyncClient):
    """Lấy điểm uy tín thành công -> 200 OK."""
    user_id = uuid4()
    mock_service = AsyncMock()
    mock_service.get_scores.return_value = ReputationScoreResponse(
        recruiter_reputation_score=90,
        candidate_reputation_score=95,
    )
    app.dependency_overrides[get_reputation_service] = lambda: mock_service

    token = _make_token(sub=str(user_id))
    response = await api_client.get(
        "/api/v1/reputation/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["recruiter_reputation_score"] == 90
    assert data["candidate_reputation_score"] == 95


@pytest.mark.asyncio
async def test_get_my_reputation_history_success(api_client: AsyncClient):
    """Lấy lịch sử uy tín thành công -> 200 OK."""
    user_id = uuid4()
    event_id = uuid4()

    mock_service = AsyncMock()
    mock_service.list_history.return_value = ReputationHistoryResponse(
        items=[
            ReputationEventResponse(
                id=event_id,
                role="recruiter",
                points_delta=-5,
                reason="recruiter_timeout",
                application_id=None,
                job_post_id=None,
                interview_invitation_id=None,
                created_at=datetime.now(UTC),
            )
        ],
        total=1,
    )
    app.dependency_overrides[get_reputation_service] = lambda: mock_service

    token = _make_token(sub=str(user_id))
    response = await api_client.get(
        "/api/v1/reputation/me/history?role=recruiter",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["reason"] == "recruiter_timeout"
