from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from backend.app.clients.supabase import get_supabase_client
from backend.app.config.env import settings
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


class _FakeChatDbQuery:
    def __init__(self, data: list[dict] | dict | None = None):
        self._data = data
        self.deleted = False
        self.filters: list[tuple[str, str]] = []

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column: str, value: str):
        self.filters.append((column, str(value)))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def delete(self):
        self.deleted = True
        return self

    def execute(self):
        return SimpleNamespace(data=self._data if self._data is not None else [])


class _FakeChatSupabaseClient:
    def __init__(self, chat_data: list[dict] | dict | None = None):
        self.query_builder = _FakeChatDbQuery(chat_data)

    def table(self, _name: str):
        return self.query_builder


@pytest_asyncio.fixture
async def api_client():
    app.dependency_overrides[get_supabase_client] = lambda: _FakeChatSupabaseClient([])
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_delete_chat_session_requires_auth(api_client: AsyncClient):
    response = await api_client.delete(f"/api/v1/chat/sessions/{uuid4()}")
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_delete_chat_session_not_found(api_client: AsyncClient):
    response = await api_client.delete(
        f"/api/v1/chat/sessions/{uuid4()}",
        headers={"Authorization": f"Bearer {_make_token()}"},
    )
    assert response.status_code == 404
    assert response.json()["code"] == "CHAT_SESSION_NOT_FOUND"


@pytest.mark.asyncio
async def test_delete_chat_session_forbidden_for_other_user():
    user_id = str(uuid4())
    other_user_id = str(uuid4())
    session_id = uuid4()

    fake_client = _FakeChatSupabaseClient([
        {
            "id": str(uuid4()),
            "session_id": str(session_id),
            "user_id": other_user_id,
            "role": "user",
            "content": "Hello",
            "created_at": "2026-08-27T10:00:00Z",
        }
    ])
    app.dependency_overrides[get_supabase_client] = lambda: fake_client
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete(
            f"/api/v1/chat/sessions/{session_id}",
            headers={"Authorization": f"Bearer {_make_token(sub=user_id)}"},
        )
    app.dependency_overrides.clear()
    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_delete_chat_session_success_for_owner():
    user_id = str(uuid4())
    session_id = uuid4()

    fake_client = _FakeChatSupabaseClient([
        {
            "id": str(uuid4()),
            "session_id": str(session_id),
            "user_id": user_id,
            "role": "user",
            "content": "Hello AI",
            "created_at": "2026-08-27T10:00:00Z",
        }
    ])
    app.dependency_overrides[get_supabase_client] = lambda: fake_client
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete(
            f"/api/v1/chat/sessions/{session_id}",
            headers={"Authorization": f"Bearer {_make_token(sub=user_id)}"},
        )
    app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    assert body["session_id"] == str(session_id)
    assert body["deleted"] is True
    assert fake_client.query_builder.deleted is True


@pytest.mark.asyncio
async def test_clear_all_chat_history():
    user_id = str(uuid4())
    fake_client = _FakeChatSupabaseClient([])
    app.dependency_overrides[get_supabase_client] = lambda: fake_client
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete(
            "/api/v1/chat/history",
            headers={"Authorization": f"Bearer {_make_token(sub=user_id)}"},
        )
    app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    assert body["deleted"] is True
    assert fake_client.query_builder.deleted is True
    assert ("user_id", user_id) in fake_client.query_builder.filters
