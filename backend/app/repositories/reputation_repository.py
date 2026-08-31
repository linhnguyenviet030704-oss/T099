"""Repository cho reputation_events + reputation_scores."""

from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

from supabase import Client


class ReputationRepository:
    def __init__(self, client: Client) -> None:
        self._client = client

    async def get_scores(self, user_id: UUID) -> dict[str, Any] | None:
        def _query() -> dict[str, Any] | None:
            result = (
                self._client.table("profiles")
                .select("recruiter_reputation_score, candidate_reputation_score")
                .eq("id", str(user_id))
                .maybe_single()
                .execute()
            )
            return result.data

        return await asyncio.to_thread(_query)

    async def list_events_for_user(
        self,
        user_id: UUID,
        *,
        role: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        def _query() -> list[dict[str, Any]]:
            q = (
                self._client.table("reputation_events")
                .select("*")
                .eq("user_id", str(user_id))
                .order("created_at", desc=True)
                .range(offset, offset + limit - 1)
            )
            if role:
                q = q.eq("role", role)
            result = q.execute()
            return result.data or []

        return await asyncio.to_thread(_query)

    async def count_events(self, user_id: UUID, role: str | None = None) -> int:
        def _query() -> int:
            q = (
                self._client.table("reputation_events")
                .select("id", count="exact")
                .eq("user_id", str(user_id))
            )
            if role:
                q = q.eq("role", role)
            result = q.execute()
            return int(result.count or 0)

        return await asyncio.to_thread(_query)

    async def call_adjust_reputation(
        self,
        user_id: UUID,
        role: str,
        points_delta: int,
        reason: str,
        application_id: UUID | None,
        job_post_id: UUID | None,
        interview_invitation_id: UUID | None,
        idempotency_key: str,
    ) -> dict[str, Any]:
        """Gọi RPC adjust_reputation."""

        def _query() -> dict[str, Any]:
            params: dict[str, Any] = {
                "p_user_id": str(user_id),
                "p_role": role,
                "p_points_delta": points_delta,
                "p_reason": reason,
                "p_idempotency_key": idempotency_key,
            }
            if application_id:
                params["p_application_id"] = str(application_id)
            if job_post_id:
                params["p_job_post_id"] = str(job_post_id)
            if interview_invitation_id:
                params["p_interview_invitation_id"] = str(interview_invitation_id)
            result = self._client.rpc("adjust_reputation", params).execute()
            return result.data if isinstance(result.data, dict) else {}

        return await asyncio.to_thread(_query)
