"""API routes cho application/job_submit management."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from backend.app.api.schemas.application import (
    ApplicationDetailResponse,
    ApplicationListResponse,
    ApplicationUpdateStatusRequest,
    ApplicationUpdateStatusResponse,
)
from backend.app.core.exceptions import ForbiddenError
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.auth import (
    get_current_recruiter,
    get_current_user,
)
from backend.app.dependencies.services import (
    get_application_service,
    get_profile_service,
)
from backend.app.services.application_service import ApplicationService
from backend.app.services.profile_service import ProfileService

router = APIRouter(tags=["applications"])


@router.get("/applications/{application_id}", response_model=ApplicationDetailResponse)
async def get_application(
    application_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: ApplicationService = Depends(get_application_service),
    profile_service: ProfileService = Depends(get_profile_service),
) -> ApplicationDetailResponse:
    """Chi tiết application. Authz theo role: candidate xem của mình, recruiter xem job mình quản lý."""
    profile = await profile_service.get_own_profile(current_user.id)
    return await service.get_detail(application_id, current_user.id, profile.role)


@router.get(
    "/jobs/{job_id}/applications",
    response_model=ApplicationListResponse,
)
async def list_applications_for_job(
    job_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_recruiter),
    service: ApplicationService = Depends(get_application_service),
    profile_service: ProfileService = Depends(get_profile_service),
) -> ApplicationListResponse:
    """Danh sách applications của 1 job (chỉ recruiter)."""
    # Authz: phải là recruiter của company sở hữu job
    profile = await profile_service.get_own_profile(current_user.id)
    if profile.role not in ("recruiter", "admin"):
        raise ForbiddenError("Chỉ Nhà tuyển dụng mới có quyền xem danh sách ứng viên")
    items = await service.list_for_job(job_id, current_user.id)
    return ApplicationListResponse(items=items, total=len(items))


@router.patch(
    "/applications/{application_id}/status",
    response_model=ApplicationUpdateStatusResponse,
)
async def update_application_status(
    application_id: UUID,
    body: ApplicationUpdateStatusRequest,
    current_user: AuthenticatedUser = Depends(get_current_recruiter),
    service: ApplicationService = Depends(get_application_service),
    profile_service: ProfileService = Depends(get_profile_service),
) -> ApplicationUpdateStatusResponse:
    """Update trạng thái application. State machine validate ở service layer.

    Note: Authz chi tiết (recruiter có quản lý job này không) được check trong service.
    """
    profile = await profile_service.get_own_profile(current_user.id)
    if profile.role not in ("recruiter", "admin"):
        raise ForbiddenError("Chỉ Nhà tuyển dụng mới có quyền đổi trạng thái ứng viên")
    return await service.update_status(application_id, current_user.id, body)
