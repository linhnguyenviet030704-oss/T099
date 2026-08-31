"""Repository cho job_submits (application domain)."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any
from uuid import UUID

from supabase import Client


class ApplicationRepository:
    def __init__(self, client: Client) -> None:
        self._client = client

    async def get_by_id(self, application_id: UUID) -> dict[str, Any] | None:
        def _query() -> dict[str, Any] | None:
            result = (
                self._client.table("job_submits")
                .select(
                    "*, "
                    "job_posts!job_post_id(id, title, company_id, created_by_user_id, time_max_until_response), "
                    "profiles!applicant_user_id(id, full_name, email)"
                )
                .eq("id", str(application_id))
                .maybe_single()
                .execute()
            )
            return result.data

        return await asyncio.to_thread(_query)

    async def list_for_job(self, job_id: UUID) -> list[dict[str, Any]]:
        def _query() -> list[dict[str, Any]]:
            result = (
                self._client.table("job_submits")
                .select(
                    "id, job_post_id, applicant_user_id, resume_id, current_status, "
                    "cover_letter, applied_at, reviewed_at, response_deadline_at, "
                    "profiles!applicant_user_id(id, full_name, email)"
                )
                .eq("job_post_id", str(job_id))
                .is_("withdrawn_at", "null")
                .order("applied_at", desc=True)
                .execute()
            )
            return result.data or []

        return await asyncio.to_thread(_query)

    async def list_for_applicant(self, applicant_user_id: UUID) -> list[dict[str, Any]]:
        def _query() -> list[dict[str, Any]]:
            result = (
                self._client.table("job_submits")
                .select(
                    "id, job_post_id, applicant_user_id, resume_id, current_status, "
                    "applied_at, reviewed_at, response_deadline_at, "
                    "job_posts!job_post_id(id, title)"
                )
                .eq("applicant_user_id", str(applicant_user_id))
                .order("applied_at", desc=True)
                .execute()
            )
            return result.data or []

        return await asyncio.to_thread(_query)

    async def update_status(
        self,
        application_id: UUID,
        new_status: str,
        changed_by_user_id: UUID,
        note: str | None,
        is_system_generated: bool,
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        """Update status + insert application_stages record.

        Trả về (updated_application, new_stage_record).
        """
        def _query() -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
            # Update application
            app_result = (
                self._client.table("job_submits")
                .update(
                    {
                        "current_status": new_status,
                        "reviewed_at": datetime.utcnow().isoformat(),
                    }
                )
                .eq("id", str(application_id))
                .select("*")
                .maybe_single()
                .execute()
            )

            # Insert stage record
            stage_result = (
                self._client.table("application_stages")
                .insert(
                    {
                        "application_id": str(application_id),
                        "changed_by_user_id": str(changed_by_user_id),
                        "stage": new_status,
                        "note": note,
                        "is_system_generated": is_system_generated,
                    }
                )
                .select("*")
                .maybe_single()
                .execute()
            )
            return app_result.data, stage_result.data

        return await asyncio.to_thread(_query)
