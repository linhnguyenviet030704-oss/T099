from fastapi import APIRouter, Depends

from backend.app.api.schemas.profile import ProfileResponse, ProfileUpdateRequest
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.auth import get_current_user
from backend.app.dependencies.services import get_profile_service
from backend.app.services.profile_service import ProfileService

router = APIRouter()


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
