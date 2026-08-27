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


class _FakeQueryBuilder:
    """Fluent fake for `client.table(...).select(...).eq(...).maybe_single().execute()`
    that always resolves to `data=None` — enough to reach the 404 branch in
    `SupabaseResumeStore.get_resume` without touching a real Supabase instance."""

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return SimpleNamespace(data=None)


class _FakeSupabaseClient:
    def table(self, _name: str) -> _FakeQueryBuilder:
        return _FakeQueryBuilder()


@pytest_asyncio.fixture
async def api_client():
    app.dependency_overrides[get_supabase_client] = lambda: _FakeSupabaseClient()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_ingest_requires_auth(api_client: AsyncClient):
    response = await api_client.post(f"/api/v1/resumes/{uuid4()}/ingest")
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_ingest_unknown_resume_returns_404(api_client: AsyncClient):
    response = await api_client.post(
        f"/api/v1/resumes/{uuid4()}/ingest",
        headers={"Authorization": f"Bearer {_make_token()}"},
    )
    assert response.status_code == 404
    assert response.json()["code"] == "RESUME_NOT_FOUND"


@pytest.mark.asyncio
async def test_ingest_is_rate_limited_per_user(api_client: AsyncClient):
    token = _make_token()
    headers = {"Authorization": f"Bearer {token}"}

    for _ in range(20):
        response = await api_client.post(f"/api/v1/resumes/{uuid4()}/ingest", headers=headers)
        assert response.status_code == 404

    response = await api_client.post(f"/api/v1/resumes/{uuid4()}/ingest", headers=headers)
    assert response.status_code == 429
    assert response.json()["code"] == "RATE_LIMITED"


@pytest.mark.asyncio
async def test_set_resume_public_requires_auth(api_client: AsyncClient):
    response = await api_client.patch(
        f"/api/v1/resumes/{uuid4()}/public",
        json={"is_public": True},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_set_resume_public_unknown_resume_returns_404(api_client: AsyncClient):
    response = await api_client.patch(
        f"/api/v1/resumes/{uuid4()}/public",
        headers={"Authorization": f"Bearer {_make_token()}"},
        json={"is_public": True},
    )
    assert response.status_code == 404
    assert response.json()["code"] == "RESUME_NOT_FOUND"


class _FakeResumeDbQuery:
    def __init__(self, data: dict | None = None):
        self._data = data
        self.updates: list[dict] = []

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def neq(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def update(self, values: dict):
        self.updates.append(values)
        return self

    def execute(self):
        return SimpleNamespace(data=self._data)


class _FakeCustomSupabaseClient:
    def __init__(self, resume_data: dict | None = None):
        self.query_builder = _FakeResumeDbQuery(resume_data)

    def table(self, _name: str):
        return self.query_builder


@pytest.mark.asyncio
async def test_set_resume_public_forbidden_for_other_user():
    user_id = str(uuid4())
    other_user_id = str(uuid4())
    resume_id = uuid4()

    fake_client = _FakeCustomSupabaseClient({
        "id": str(resume_id),
        "user_id": other_user_id,
        "is_public": False,
        "deleted_at": None,
    })
    app.dependency_overrides[get_supabase_client] = lambda: fake_client
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            f"/api/v1/resumes/{resume_id}/public",
            headers={"Authorization": f"Bearer {_make_token(sub=user_id)}"},
            json={"is_public": True},
        )
    app.dependency_overrides.clear()
    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_set_resume_public_success_for_owner():
    user_id = str(uuid4())
    resume_id = uuid4()

    fake_client = _FakeCustomSupabaseClient({
        "id": str(resume_id),
        "user_id": user_id,
        "is_public": False,
        "deleted_at": None,
    })
    app.dependency_overrides[get_supabase_client] = lambda: fake_client
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.patch(
            f"/api/v1/resumes/{resume_id}/public",
            headers={"Authorization": f"Bearer {_make_token(sub=user_id)}"},
            json={"is_public": True},
        )
    app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(resume_id)
    assert body["is_public"] is True
    assert "Đang tìm việc" in body["message"]
    # Check that update was called (first to disable previous public CVs, then to enable this CV)
    assert len(fake_client.query_builder.updates) == 2
    assert fake_client.query_builder.updates[0] == {"is_public": False}
    assert fake_client.query_builder.updates[1] == {"is_public": True}

