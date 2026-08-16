from __future__ import annotations

from uuid import UUID

from backend.app.core.exceptions import NotFoundError
from backend.app.models.domain import Profile
from backend.app.repositories.profile_repository import ProfileRepository
from backend.app.schemas.profile import ProfileUpdateRequest


class ProfileService:
    def __init__(self, repository: ProfileRepository) -> None:
        self._repository = repository

    async def get_own_profile(self, user_id: UUID) -> Profile:
        profile = await self._repository.get_by_id(user_id)
        if profile is None:
            raise NotFoundError("Profile not found", code="PROFILE_NOT_FOUND")
        return profile

    async def update_own_profile(self, user_id: UUID, data: ProfileUpdateRequest) -> Profile:
        # Ownership: only mutate the authenticated user's row; never accept user_id from body.
        updated = await self._repository.update(
            user_id,
            full_name=data.full_name,
            phone=data.phone,
            avatar_url=data.avatar_url,
        )
        if updated is None:
            raise NotFoundError("Profile not found", code="PROFILE_NOT_FOUND")
        return updated
