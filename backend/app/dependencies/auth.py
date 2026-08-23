from __future__ import annotations

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.app.core.exceptions import ForbiddenError, UnauthorizedError
from backend.app.core.security import AuthenticatedUser, TokenVerificationError, verify_access_token
from backend.app.dependencies.services import get_profile_service
from backend.app.services.profile_service import ProfileService

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedError("Bearer authentication required")
    try:
        return verify_access_token(credentials.credentials)
    except TokenVerificationError as exc:
        raise UnauthorizedError(str(exc)) from exc


async def get_current_admin(
    user: AuthenticatedUser = Depends(get_current_user),
    service: ProfileService = Depends(get_profile_service),
) -> AuthenticatedUser:
    profile = await service.get_own_profile(user.id)
    if profile.role != "admin":
        raise ForbiddenError("Admin only")
    return user


async def get_current_candidate(
    user: AuthenticatedUser = Depends(get_current_user),
    service: ProfileService = Depends(get_profile_service),
) -> AuthenticatedUser:
    profile = await service.get_own_profile(user.id)
    if profile.role != "candidate":
        raise ForbiddenError("Chỉ ứng viên mới có quyền sử dụng tính năng này")
    return user


async def get_current_recruiter(
    user: AuthenticatedUser = Depends(get_current_user),
    service: ProfileService = Depends(get_profile_service),
) -> AuthenticatedUser:
    profile = await service.get_own_profile(user.id)
    if profile.role != "recruiter":
        raise ForbiddenError("Chỉ Nhà tuyển dụng mới có quyền sử dụng tính năng này")
    return user

