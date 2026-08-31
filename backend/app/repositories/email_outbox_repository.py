"""Repository cho email_outbox (write-only từ backend)."""

from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

from supabase import Client


class EmailOutboxRepository:
    def __init__(self, client: Client) -> None:
        self._client = client

    async def enqueue(
        self,
        to_user_id: UUID,
        template: str,
        payload: dict[str, Any],
        idempotency_key: str,
    ) -> UUID | None:
        def _query() -> str | None:
            result = self._client.rpc(
                "enqueue_email",
                {
                    "p_to_user_id": str(to_user_id),
                    "p_template": template,
                    "p_payload": payload,
                    "p_idempotency_key": idempotency_key,
                },
            ).execute()
            return result.data

        data = await asyncio.to_thread(_query)
        return UUID(data) if data else None
