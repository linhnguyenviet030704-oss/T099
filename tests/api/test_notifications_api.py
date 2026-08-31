from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from backend.app.api.schemas.notification import (
    NotificationListResponse,
    NotificationMarkReadResponse,
    NotificationResponse,
)
from backend.app.config.env import settings
from backend.app.dependencies.services import get_notification_service
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
async def test_list_notifications_unauthorized(api_client: AsyncClient):
    """Không có token -> 401 Unauthorized."""
    response = await api_client.get("/api/v1/notifications")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_list_notifications_success(api_client: AsyncClient):
    """Lấy danh sách thông báo thành công -> 200 OK."""
    user_id = uuid4()
    notif_id = uuid4()

    mock_service = AsyncMock()
    mock_service.list_for_user.return_value = NotificationListResponse(
        items=[
            NotificationResponse(
                id=notif_id,
                notification_type="application_submitted",
                title="CV mới",
                message="Ứng viên vừa nộp CV",
                link_url="/recruiter/applications/1",
                metadata={},
                is_read=False,
                read_at=None,
                created_at=datetime.now(UTC),
            )
        ],
        unread_count=1,
        total=1,
    )
    app.dependency_overrides[get_notification_service] = lambda: mock_service

    token = _make_token(sub=str(user_id))
    response = await api_client.get(
        "/api/v1/notifications",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["unread_count"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["id"] == str(notif_id)


@pytest.mark.asyncio
async def test_mark_notifications_read_success(api_client: AsyncClient):
    """Đánh dấu danh sách thông báo đã đọc -> 200 OK."""
    user_id = uuid4()
    notif_id = uuid4()

    mock_service = AsyncMock()
    mock_service.mark_as_read.return_value = NotificationMarkReadResponse(updated_count=1)
    app.dependency_overrides[get_notification_service] = lambda: mock_service

    token = _make_token(sub=str(user_id))
    response = await api_client.post(
        "/api/v1/notifications/mark-read",
        headers={"Authorization": f"Bearer {token}"},
        json={"notification_ids": [str(notif_id)]},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["updated_count"] == 1


@pytest.mark.asyncio
async def test_mark_all_notifications_read_success(api_client: AsyncClient):
    """Đánh dấu tất cả thông báo đã đọc -> 200 OK."""
    user_id = uuid4()

    mock_service = AsyncMock()
    mock_service.mark_all_read.return_value = NotificationMarkReadResponse(updated_count=3)
    app.dependency_overrides[get_notification_service] = lambda: mock_service

    token = _make_token(sub=str(user_id))
    response = await api_client.post(
        "/api/v1/notifications/mark-all-read",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["updated_count"] == 3
