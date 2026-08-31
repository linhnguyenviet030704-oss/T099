"""API routes cho reputation."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from backend.app.api.schemas.reputation import (
    ReputationHistoryResponse,
    ReputationScoreResponse,
)
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.auth import get_current_user
from backend.app.dependencies.services import get_reputation_service
from backend.app.services.reputation_service import ReputationService

router = APIRouter(tags=["reputation"])


@router.get("/reputation/me", response_model=ReputationScoreResponse)
async def get_my_reputation(
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: ReputationService = Depends(get_reputation_service),
) -> ReputationScoreResponse:
    """Điểm uy tín hiện tại của current user (cả recruiter và candidate)."""
    return await service.get_scores(current_user.id)


@router.get("/reputation/me/history", response_model=ReputationHistoryResponse)
async def get_my_reputation_history(
    role: str | None = Query(default=None, pattern="^(recruiter|candidate)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: ReputationService = Depends(get_reputation_service),
) -> ReputationHistoryResponse:
    """Audit log mọi thay đổi điểm uy tín của current user."""
    return await service.list_history(
        current_user.id, role=role, limit=limit, offset=offset,
    )
