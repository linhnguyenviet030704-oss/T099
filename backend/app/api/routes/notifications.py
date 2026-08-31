"""API routes cho notifications.

CRITICAL: Mọi endpoint đều resolve user_id từ JWT (qua current_user.id),
KHÔNG BAO GIỜ tin client-sent user_id.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from backend.app.api.schemas.notification import (
    NotificationListResponse,
    NotificationMarkReadRequest,
    NotificationMarkReadResponse,
)
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.auth import get_current_user
from backend.app.dependencies.services import get_notification_service
from backend.app.services.notification_service import NotificationService

router = APIRouter(tags=["notifications"])


@router.get("/notifications", response_model=NotificationListResponse)
async def list_notifications(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
) -> NotificationListResponse:
    """Danh sách notifications của current user."""
    return await service.list_for_user(current_user.id, limit=limit, offset=offset)


@router.post(
    "/notifications/mark-read",
    response_model=NotificationMarkReadResponse,
)
async def mark_notifications_read(
    body: NotificationMarkReadRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
) -> NotificationMarkReadResponse:
    """Đánh dấu đã đọc. Chỉ tác động lên notification thuộc current user."""
    return await service.mark_as_read(current_user.id, body.notification_ids)


@router.post(
    "/notifications/mark-all-read",
    response_model=NotificationMarkReadResponse,
)
async def mark_all_notifications_read(
    current_user: AuthenticatedUser = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
) -> NotificationMarkReadResponse:
    """Đánh dấu tất cả đã đọc cho current user."""
    return await service.mark_all_read(current_user.id)
