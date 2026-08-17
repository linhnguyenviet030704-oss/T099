from __future__ import annotations

from uuid import UUID

from backend.app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from backend.app.models.domain import Profile
from backend.app.repositories.profile_repository import ProfileRepository
from backend.app.api.schemas.profile import (
    ProfileRoleUpdateRequest,
    RecruiterReviewRequest,
    RecruiterReviewResponse,
)


class AdminService:
    def __init__(self, repository: ProfileRepository) -> None:
        self._repository = repository

    async def _require_admin(self, actor_id: UUID) -> Profile:
        actor = await self._repository.get_by_id(actor_id)
        if actor is None:
            raise NotFoundError("Profile not found", code="PROFILE_NOT_FOUND")
        if actor.role != "admin":
            raise ForbiddenError("Admin only")
        return actor

    async def set_role(
        self,
        actor_id: UUID,
        target_id: UUID,
        data: ProfileRoleUpdateRequest,
    ) -> Profile:
        await self._require_admin(actor_id)
        updated = await self._repository.set_role(target_id, data.role)
        if updated is None:
            raise NotFoundError("Profile not found", code="PROFILE_NOT_FOUND")
        return updated

    async def review_recruiter_form(
        self,
        actor_id: UUID,
        form_id: UUID,
        data: RecruiterReviewRequest,
    ) -> RecruiterReviewResponse:
        await self._require_admin(actor_id)
        if data.decision == "rejected" and not (data.admin_note or "").strip():
            raise BadRequestError("admin_note is required when rejecting")

        form = await self._repository.get_recruiter_form(form_id)
        if form is None:
            raise NotFoundError("Registration form not found", code="FORM_NOT_FOUND")

        updated = await self._repository.update_recruiter_form(
            form_id,
            status=data.decision,
            admin_note=(data.admin_note or "").strip() or None,
            reviewed_by_user_id=actor_id,
        )
        if updated is None:
            raise NotFoundError("Registration form not found", code="FORM_NOT_FOUND")

        applicant_id = UUID(str(form["user_id"]))
        role = "candidate"
        if data.decision == "approved":
            promoted = await self._repository.set_role(applicant_id, "recruiter")
            if promoted is None:
                raise NotFoundError("Profile not found", code="PROFILE_NOT_FOUND")
            role = promoted.role
        else:
            profile = await self._repository.get_by_id(applicant_id)
            if profile is not None:
                role = profile.role

        return RecruiterReviewResponse(id=form_id, status=data.decision, role=role)
