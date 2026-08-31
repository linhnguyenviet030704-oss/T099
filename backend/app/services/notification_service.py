"""Service cho notification domain."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from backend.app.api.schemas.notification import (
    NotificationListResponse,
    NotificationMarkReadResponse,
    NotificationResponse,
)
from backend.app.repositories.notification_repository import NotificationRepository


class NotificationService:
    def __init__(self, repository: NotificationRepository) -> None:
        self._repository = repository

    async def list_for_user(
        self,
        user_id: UUID,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> NotificationListResponse:
        rows = await self._repository.list_for_user(user_id, limit=limit, offset=offset)
        unread = await self._repository.count_unread(user_id)
        total = await self._repository.count_total(user_id)
        items = [_to_response(row) for row in rows]
        return NotificationListResponse(items=items, unread_count=unread, total=total)

    async def mark_as_read(
        self,
        user_id: UUID,
        notification_ids: list[UUID],
    ) -> NotificationMarkReadResponse:
        updated = await self._repository.mark_as_read(user_id, notification_ids)
        return NotificationMarkReadResponse(updated_count=updated)

    async def mark_all_read(self, user_id: UUID) -> NotificationMarkReadResponse:
        updated = await self._repository.mark_all_read(user_id)
        return NotificationMarkReadResponse(updated_count=updated)


def _to_response(row: dict[str, Any]) -> NotificationResponse:
    return NotificationResponse(
        id=UUID(str(row["id"])),
        notification_type=row["notification_type"],
        title=row["title"],
        message=row["message"],
        link_url=row.get("link_url"),
        metadata=row.get("metadata") or {},
        is_read=bool(row.get("is_read")),
        read_at=row.get("read_at"),
        created_at=row["created_at"],
    )
