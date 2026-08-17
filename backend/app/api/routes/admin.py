from uuid import UUID

from fastapi import APIRouter, Depends

from backend.app.api.schemas.profile import (
    ProfileResponse,
    ProfileRoleUpdateRequest,
    RecruiterReviewRequest,
    RecruiterReviewResponse,
)
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.auth import get_current_admin
from backend.app.dependencies.services import get_admin_service
from backend.app.services.admin_service import AdminService

router = APIRouter()


@router.patch("/admin/profiles/{user_id}", response_model=ProfileResponse)
async def admin_set_role(
    user_id: UUID,
    body: ProfileRoleUpdateRequest,
    admin: AuthenticatedUser = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
) -> ProfileResponse:
    profile = await service.set_role(admin.id, user_id, body)
    return ProfileResponse.model_validate(profile)


@router.post("/admin/recruiter-forms/{form_id}/review", response_model=RecruiterReviewResponse)
async def admin_review_recruiter_form(
    form_id: UUID,
    body: RecruiterReviewRequest,
    admin: AuthenticatedUser = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service),
) -> RecruiterReviewResponse:
    return await service.review_recruiter_form(admin.id, form_id, body)
