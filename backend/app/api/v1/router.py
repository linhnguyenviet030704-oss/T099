from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.core.config import settings
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.auth import get_current_user
from backend.app.dependencies.services import get_chat_service, get_profile_service
from backend.app.schemas.chat import ChatRequest, ChatResponse
from backend.app.schemas.common import HealthResponse
from backend.app.schemas.profile import ProfileResponse, ProfileUpdateRequest
from backend.app.services.chat_service import ChatService
from backend.app.services.profile_service import ProfileService

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", env=settings.app_env)


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
    service: ChatService = Depends(get_chat_service),
) -> ChatResponse:
    return await service.chat(request)
