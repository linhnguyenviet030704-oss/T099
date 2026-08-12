from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from backend.app.core.config import settings
from backend.app.core.exceptions import NotFoundError
from backend.app.core.security import TokenVerificationError, verify_access_token
from backend.app.dependencies.services import get_profile_service
from backend.app.main import app
from backend.app.models.domain import Profile
from backend.app.schemas.profile import ProfileUpdateRequest


def _make_token(*, sub: str | None = None, email: str = "user@example.com", expired: bool = False) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": sub or str(uuid4()),
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "iat": int(now.timestamp()),
        "exp": int((now - timedelta(hours=1) if expired else now + timedelta(hours=1)).timestamp()),
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def test_verify_access_token_ok():
    user_id = uuid4()
    token = _make_token(sub=str(user_id))
    user = verify_access_token(token)
    assert user.id == user_id
    assert user.email == "user@example.com"


def test_verify_access_token_expired():
    token = _make_token(expired=True)
    with pytest.raises(TokenVerificationError):
        verify_access_token(token)


def test_verify_access_token_bad_signature():
    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "aud": "authenticated",
            "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        },
        "wrong-secret-wrong-secret-wrong-secret!!",
        algorithm="HS256",
    )
    with pytest.raises(TokenVerificationError):
        verify_access_token(token)


class _FakeProfileService:
    def __init__(self, profile: Profile | None) -> None:
        self.profile = profile
        self.updated_with: ProfileUpdateRequest | None = None

    async def get_own_profile(self, user_id):
        if self.profile is None or self.profile.id != user_id:
            raise NotFoundError("Profile not found", code="PROFILE_NOT_FOUND")
        return self.profile

    async def update_own_profile(self, user_id, data: ProfileUpdateRequest):
        self.updated_with = data
        if self.profile is None or self.profile.id != user_id:
            raise NotFoundError("Profile not found", code="PROFILE_NOT_FOUND")
        self.profile.full_name = data.full_name if data.full_name is not None else self.profile.full_name
        self.profile.phone = data.phone if data.phone is not None else self.profile.phone
        self.profile.avatar_url = data.avatar_url if data.avatar_url is not None else self.profile.avatar_url
        return self.profile


@pytest_asyncio.fixture
async def api_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_health(api_client: AsyncClient):
    response = await api_client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_get_my_profile_unauthenticated(api_client: AsyncClient):
    response = await api_client.get("/api/v1/profiles/me")
    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_get_my_profile_success(api_client: AsyncClient):
    user_id = uuid4()
    profile = Profile(
        id=user_id,
        email="user@example.com",
        full_name="Ada",
        phone=None,
        avatar_url=None,
        role="candidate",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    app.dependency_overrides[get_profile_service] = lambda: _FakeProfileService(profile)

    response = await api_client.get(
        "/api/v1/profiles/me",
        headers={"Authorization": f"Bearer {_make_token(sub=str(user_id))}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(user_id)
    assert body["full_name"] == "Ada"
    assert body["role"] == "candidate"


@pytest.mark.asyncio
async def test_get_my_profile_not_found(api_client: AsyncClient):
    user_id = uuid4()
    app.dependency_overrides[get_profile_service] = lambda: _FakeProfileService(None)
    response = await api_client.get(
        "/api/v1/profiles/me",
        headers={"Authorization": f"Bearer {_make_token(sub=str(user_id))}"},
    )
    assert response.status_code == 404
    assert response.json()["code"] == "PROFILE_NOT_FOUND"


@pytest.mark.asyncio
async def test_patch_my_profile_does_not_accept_role(api_client: AsyncClient):
    user_id = uuid4()
    profile = Profile(
        id=user_id,
        email="user@example.com",
        full_name="Ada",
        phone=None,
        avatar_url=None,
        role="candidate",
    )
    fake = _FakeProfileService(profile)
    app.dependency_overrides[get_profile_service] = lambda: fake

    response = await api_client.patch(
        "/api/v1/profiles/me",
        headers={"Authorization": f"Bearer {_make_token(sub=str(user_id))}"},
        json={"full_name": "Ada Lovelace", "role": "admin"},
    )
    assert response.status_code == 200
    assert response.json()["role"] == "candidate"
    assert response.json()["full_name"] == "Ada Lovelace"
    assert fake.updated_with is not None
    assert not hasattr(fake.updated_with, "role") or "role" not in fake.updated_with.model_dump(
        exclude_unset=True
    )


@pytest.mark.asyncio
async def test_chat_empty_message(api_client: AsyncClient):
    response = await api_client.post("/api/v1/chat", json={"message": ""})
    assert response.status_code == 422
