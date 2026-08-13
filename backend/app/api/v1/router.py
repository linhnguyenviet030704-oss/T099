from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from backend.app.core.rate_limit import enforce_chat_rate_limit
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.auth import get_current_admin, get_current_user
from backend.app.dependencies.services import get_admin_service, get_chat_service, get_profile_service
from backend.app.schemas.chat import ChatRequest, ChatResponse
from backend.app.schemas.common import HealthResponse
from backend.app.schemas.profile import (
    ProfileResponse,
    ProfileRoleUpdateRequest,
    ProfileUpdateRequest,
    RecruiterReviewRequest,
    RecruiterReviewResponse,
)
from backend.app.services.admin_service import AdminService
from backend.app.services.chat_service import ChatService
from backend.app.services.profile_service import ProfileService

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/profiles/me", response_model=ProfileResponse)
async def get_my_profile(
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: ProfileService = Depends(get_profile_service),
) -> ProfileResponse:
    profile = await service.get_own_profile(current_user.id)
    return ProfileResponse.model_validate(profile)


@router.patch("/profiles/me", response_model=ProfileResponse)
async def update_my_profile(
    body: ProfileUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: ProfileService = Depends(get_profile_service),
) -> ProfileResponse:
    profile = await service.update_own_profile(current_user.id, body)
    return ProfileResponse.model_validate(profile)


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    _user: AuthenticatedUser = Depends(enforce_chat_rate_limit),
    service: ChatService = Depends(get_chat_service),
) -> ChatResponse:
    return await service.chat(request, _user.id)


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
