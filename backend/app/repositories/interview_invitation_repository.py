"""Repository cho interview_invitations."""

from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

from supabase import Client


class InterviewInvitationRepository:
    def __init__(self, client: Client) -> None:
        self._client = client

    async def create(
        self,
        application_id: UUID,
        scheduled_at: str,
        created_by_user_id: UUID,
        location: str | None = None,
        meeting_link: str | None = None,
        note: str | None = None,
        response_deadline_at: str | None = None,
    ) -> dict[str, Any] | None:
        def _query() -> dict[str, Any] | None:
            payload: dict[str, Any] = {
                "application_id": str(application_id),
                "scheduled_at": scheduled_at,
                "created_by_user_id": str(created_by_user_id),
            }
            if location is not None:
                payload["location"] = location
            if meeting_link is not None:
                payload["meeting_link"] = meeting_link
            if note is not None:
                payload["note"] = note
            if response_deadline_at is not None:
                payload["response_deadline_at"] = response_deadline_at

            result = (
                self._client.table("interview_invitations")
                .insert(payload)
                .select("*")
                .maybe_single()
                .execute()
            )
            return result.data

        return await asyncio.to_thread(_query)

    async def mark_no_show(self, invitation_id: UUID) -> dict[str, Any] | None:
        """Recruiter/service xác nhận candidate không tới phỏng vấn."""
        def _query() -> dict[str, Any] | None:
            result = (
                self._client.table("interview_invitations")
                .update({"status": "no_show"})
                .eq("id", str(invitation_id))
                .select("*")
                .maybe_single()
                .execute()
            )
            return result.data

        return await asyncio.to_thread(_query)

    async def call_penalize_no_show(self, invitation_id: UUID) -> dict[str, Any]:
        """Gọi RPC penalize_interview_no_show để trừ điểm + tạo notification."""

        def _query() -> dict[str, Any]:
            result = self._client.rpc(
                "penalize_interview_no_show",
                {"p_interview_invitation_id": str(invitation_id)},
            ).execute()
            return result.data if isinstance(result.data, dict) else {}

        return await asyncio.to_thread(_query)
