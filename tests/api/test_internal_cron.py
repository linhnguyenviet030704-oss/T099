from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from backend.app.config.env import settings
from backend.app.main import app


@pytest_asyncio.fixture
async def api_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cron_auto_reject_missing_secret(api_client: AsyncClient):
    """Thiếu header X-Cron-Secret -> 422 Unprocessable Entity."""
    response = await api_client.post("/api/v1/internal/cron/auto-reject-expired")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_cron_auto_reject_invalid_secret(api_client: AsyncClient):
    """Sai header X-Cron-Secret -> 403 Forbidden."""
    with patch.object(settings, "cron_secret", "correct-secret-123"):
        response = await api_client.post(
            "/api/v1/internal/cron/auto-reject-expired",
            headers={"X-Cron-Secret": "wrong-secret"},
        )
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_cron_auto_reject_valid_secret(api_client: AsyncClient):
    """Header X-Cron-Secret chính xác -> 200 OK."""
    with patch.object(settings, "cron_secret", "correct-secret-123"):
        mock_db = MagicMock()
        mock_rpc = MagicMock()
        mock_db.rpc.return_value = mock_rpc
        mock_rpc.execute.return_value = MagicMock(
            data=[
                {
                    "application_id": "11111111-1111-1111-1111-111111111111",
                    "job_post_id": "22222222-2222-2222-2222-222222222222",
                    "recruiter_user_id": "33333333-3333-3333-3333-333333333333",
                    "expired_at": "2026-08-30T10:00:00Z",
                    "new_reputation": 95,
                }
            ]
        )

        with patch("backend.app.clients.supabase.get_supabase_client", return_value=mock_db):
            response = await api_client.post(
                "/api/v1/internal/cron/auto-reject-expired",
                headers={"X-Cron-Secret": "correct-secret-123"},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["rejected_count"] == 1
            assert len(data["applications"]) == 1
