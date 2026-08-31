"""Repository cho notifications.

Chú ý: Mọi write phải filter theo user_id để tránh user A đánh dấu đã đọc
notification của user B.
"""

from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

from supabase import Client


class NotificationRepository:
    def __init__(self, client: Client) -> None:
        self._client = client

    async def list_for_user(
        self,
        user_id: UUID,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        def _query() -> list[dict[str, Any]]:
            result = (
                self._client.table("notifications")
                .select("*")
                .eq("user_id", str(user_id))
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )
            return result.data or []

        return await asyncio.to_thread(_query)

    async def count_unread(self, user_id: UUID) -> int:
        def _query() -> int:
            result = (
                self._client.table("notifications")
                .select("id", count="exact")
                .eq("user_id", str(user_id))
                .eq("is_read", False)
                .execute()
            )
            return int(result.count or 0)

        return await asyncio.to_thread(_query)

    async def count_total(self, user_id: UUID) -> int:
        def _query() -> int:
            result = (
                self._client.table("notifications")
                .select("id", count="exact")
                .eq("user_id", str(user_id))
                .execute()
            )
            return int(result.count or 0)

        return await asyncio.to_thread(_query)

    async def mark_as_read(
        self,
        user_id: UUID,
        notification_ids: list[UUID],
    ) -> int:
        """Đánh dấu đã đọc. PHẢI filter theo user_id để không đụng row của user khác."""
        if not notification_ids:
            return 0

        def _query() -> list[dict[str, Any]]:
            result = (
                self._client.table("notifications")
                .update({"is_read": True})
                .eq("user_id", str(user_id))
                .in_("id", [str(nid) for nid in notification_ids])
                .select("id")
                .execute()
            )
            return result.data or []

        rows = await asyncio.to_thread(_query)
        return len(rows)

    async def mark_all_read(self, user_id: UUID) -> int:
        def _query() -> list[dict[str, Any]]:
            result = (
                self._client.table("notifications")
                .update({"is_read": True})
                .eq("user_id", str(user_id))
                .eq("is_read", False)
                .select("id")
                .execute()
            )
            return result.data or []

        rows = await asyncio.to_thread(_query)
        return len(rows)
