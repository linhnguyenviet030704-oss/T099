from __future__ import annotations

from uuid import uuid4

import pytest

from backend.app.core.exceptions import NotFoundError
from backend.app.models.domain import Profile
from backend.app.api.schemas.profile import ProfileUpdateRequest
from backend.app.services.profile_service import ProfileService


class _Repo:
    def __init__(self, profile: Profile | None) -> None:
        self.profile = profile
        self.last_update_id = None

    async def get_by_id(self, profile_id):
        if self.profile and self.profile.id == profile_id:
            return self.profile
        return None

    async def update(self, profile_id, **kwargs):
        self.last_update_id = profile_id
        if self.profile is None or self.profile.id != profile_id:
            return None
        for key, value in kwargs.items():
            if value is not None:
                setattr(self.profile, key, value)
        return self.profile


@pytest.mark.asyncio
async def test_get_own_profile_not_found():
    service = ProfileService(_Repo(None))
    with pytest.raises(NotFoundError):
        await service.get_own_profile(uuid4())


@pytest.mark.asyncio
async def test_update_own_profile_uses_authenticated_id_only():
    user_id = uuid4()
    other_id = uuid4()
    repo = _Repo(
        Profile(
            id=user_id,
            email="a@example.com",
            full_name="A",
            phone=None,
            avatar_url=None,
            role="candidate",
        )
    )
    service = ProfileService(repo)
    updated = await service.update_own_profile(
        user_id,
        ProfileUpdateRequest(full_name="B"),
    )
    assert updated.full_name == "B"
    assert repo.last_update_id == user_id

    with pytest.raises(NotFoundError):
        await service.update_own_profile(other_id, ProfileUpdateRequest(full_name="X"))
