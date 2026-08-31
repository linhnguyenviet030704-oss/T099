"""Repository cho interview_invitations."""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any
from uuid import UUID

from supabase import Client


class InterviewInvitationRepository:
    def __init__(self, client: Client) -> None:
        self._client = client

    async def get_by_application_id(self, application_id: UUID) -> dict[str, Any] | None:
        """Lấy lời mời phỏng vấn mới nhất theo application_id."""
        def _query() -> dict[str, Any] | None:
            result = (
                self._client.table("interview_invitations")
                .select("*")
                .eq("application_id", str(application_id))
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            return result.data[0] if (result and result.data) else None

        return await asyncio.to_thread(_query)

    async def get_by_id(self, invitation_id: UUID) -> dict[str, Any] | None:
        """Lấy thông tin lời mời phỏng vấn theo ID."""
        def _query() -> dict[str, Any] | None:
            result = (
                self._client.table("interview_invitations")
                .select("*")
                .eq("id", str(invitation_id))
                .limit(1)
                .execute()
            )
            return result.data[0] if (result and result.data) else None

        return await asyncio.to_thread(_query)


    async def create(
        self,
        application_id: UUID,
        created_by_user_id: UUID,
        scheduled_at: str | None = None,
        proposed_time_slots: list[str] | None = None,
        location: str | None = None,
        meeting_link: str | None = None,
        note: str | None = None,
        response_deadline_at: str | None = None,
    ) -> dict[str, Any] | None:
        """Tạo mới hoặc cập nhật lời mời phỏng vấn."""
        def _query() -> dict[str, Any] | None:
            payload: dict[str, Any] = {
                "application_id": str(application_id),
                "created_by_user_id": str(created_by_user_id),
                "status": "pending",
                "proposed_time_slots": proposed_time_slots or [],
                "candidate_proposed_slots": [],
                "candidate_response_note": None,
            }
            if scheduled_at is not None:
                payload["scheduled_at"] = scheduled_at
            if location is not None:
                payload["location"] = location
            if meeting_link is not None:
                payload["meeting_link"] = meeting_link
            if note is not None:
                payload["note"] = note
            if response_deadline_at is not None:
                payload["response_deadline_at"] = response_deadline_at

            # Kiểm tra xem đã có lời mời pending nào cho application này chưa
            existing = (
                self._client.table("interview_invitations")
                .select("id")
                .eq("application_id", str(application_id))
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            existing_row = existing.data[0] if (existing and existing.data) else None

            if existing_row:
                # Update bản ghi hiện có
                result = (
                    self._client.table("interview_invitations")
                    .update(payload)
                    .eq("id", existing_row["id"])
                    .execute()
                )
            else:
                # Insert bản ghi mới
                result = (
                    self._client.table("interview_invitations")
                    .insert(payload)
                    .execute()
                )
            return result.data[0] if isinstance(result.data, list) and result.data else (result.data if isinstance(result.data, dict) else None)

        return await asyncio.to_thread(_query)

    async def candidate_confirm_slot(
        self,
        application_id: UUID,
        selected_slot: str,
    ) -> dict[str, Any] | None:
        """Ứng viên xác nhận đồng ý 1 mốc thời gian phù hợp."""
        def _query() -> dict[str, Any] | None:
            existing = (
                self._client.table("interview_invitations")
                .select("id")
                .eq("application_id", str(application_id))
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            existing_row = existing.data[0] if (existing and existing.data) else None
            if not existing_row:
                return None

            result = (
                self._client.table("interview_invitations")
                .update({
                    "status": "confirmed",
                    "scheduled_at": selected_slot,
                    "responded_at": datetime.now().astimezone().isoformat(),
                })
                .eq("id", existing_row["id"])
                .execute()
            )
            return result.data[0] if isinstance(result.data, list) and result.data else (result.data if isinstance(result.data, dict) else None)

        return await asyncio.to_thread(_query)

    async def candidate_request_reschedule(
        self,
        application_id: UUID,
        proposed_slots: list[str],
        note: str | None = None,
    ) -> dict[str, Any] | None:
        """Ứng viên phản hồi không có lịch phù hợp và đề xuất mốc thời gian mới."""
        def _query() -> dict[str, Any] | None:
            existing = (
                self._client.table("interview_invitations")
                .select("id")
                .eq("application_id", str(application_id))
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            existing_row = existing.data[0] if (existing and existing.data) else None
            if not existing_row:
                return None

            result = (
                self._client.table("interview_invitations")
                .update({
                    "status": "reschedule_requested",
                    "candidate_proposed_slots": proposed_slots,
                    "candidate_response_note": note,
                    "responded_at": datetime.now().astimezone().isoformat(),
                })
                .eq("id", existing_row["id"])
                .execute()
            )
            return result.data[0] if isinstance(result.data, list) and result.data else (result.data if isinstance(result.data, dict) else None)

        return await asyncio.to_thread(_query)

    async def recruiter_confirm_rescheduled_slot(
        self,
        application_id: UUID,
        selected_slot: str,
        meeting_link: str | None = None,
        location: str | None = None,
        note: str | None = None,
    ) -> dict[str, Any] | None:
        """Nhà tuyển dụng chốt 1 mốc thời gian từ danh sách ứng viên đề xuất."""
        def _query() -> dict[str, Any] | None:
            existing = (
                self._client.table("interview_invitations")
                .select("id")
                .eq("application_id", str(application_id))
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            existing_row = existing.data[0] if (existing and existing.data) else None
            if not existing_row:
                return None

            update_payload: dict[str, Any] = {
                "status": "confirmed",
                "scheduled_at": selected_slot,
            }
            if meeting_link is not None:
                update_payload["meeting_link"] = meeting_link
            if location is not None:
                update_payload["location"] = location
            if note is not None:
                update_payload["note"] = note

            result = (
                self._client.table("interview_invitations")
                .update(update_payload)
                .eq("id", existing_row["id"])
                .execute()
            )
            return result.data[0] if isinstance(result.data, list) and result.data else (result.data if isinstance(result.data, dict) else None)

        return await asyncio.to_thread(_query)

    async def mark_no_show(self, invitation_id: UUID) -> dict[str, Any] | None:
        """Recruiter/service xác nhận candidate không tới phỏng vấn."""
        def _query() -> dict[str, Any] | None:
            result = (
                self._client.table("interview_invitations")
                .update({"status": "no_show"})
                .eq("id", str(invitation_id))
                .execute()
            )
            return result.data[0] if isinstance(result.data, list) and result.data else (result.data if isinstance(result.data, dict) else None)

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

