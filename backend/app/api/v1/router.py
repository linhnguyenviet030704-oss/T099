from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from backend.app.core.config import settings
from backend.app.core.exceptions import ForbiddenError, NotFoundError
from backend.app.core.rate_limit import enforce_chat_rate_limit
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.auth import get_current_admin, get_current_user
from backend.app.dependencies.services import get_admin_service, get_chat_service, get_profile_service
from backend.app.dependencies.supabase import get_supabase_client
from backend.app.schemas.chat import ChatRequest, ChatResponse
from backend.app.schemas.common import HealthResponse, IngestResponse
from backend.app.schemas.profile import (
    ProfileResponse,
    ProfileRoleUpdateRequest,
    ProfileUpdateRequest,
    RecruiterReviewRequest,
    RecruiterReviewResponse,
)
from backend.app.services.admin_service import AdminService
from backend.app.services.chat_service import ChatService
from backend.app.services.matching.ingest import ingest_resume
from backend.app.services.matching.store import SupabaseResumeStore
from backend.app.services.profile_service import ProfileService
from supabase import Client

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


@router.post("/resumes/{resume_id}/ingest", response_model=IngestResponse)
async def ingest_own_resume(
    resume_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> IngestResponse:
    store = SupabaseResumeStore(client)
    resume = await store.get_resume(resume_id)
    if not resume:
        raise NotFoundError("Resume not found", code="RESUME_NOT_FOUND")
    if str(resume.get("user_id")) != str(current_user.id):
        raise ForbiddenError("Not your resume")
    status = await ingest_resume(
        store,
        resume_id,
        api_key=settings.qwen_api_key,
        base_url=settings.qwen_base_url,
    )
    return IngestResponse(status=status)


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
