"""Service cho application/job_submit management."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from backend.app.api.schemas.application import (
    ApplicationDetailResponse,
    ApplicationStageResponse,
    ApplicationUpdateStatusRequest,
    ApplicationUpdateStatusResponse,
)
from backend.app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from backend.app.repositories.application_repository import ApplicationRepository
from backend.app.repositories.email_outbox_repository import EmailOutboxRepository
from supabase import Client

# State machine cho status transition
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"screening", "interview", "rejected", "withdrawn"},
    "screening": {"interview", "rejected", "withdrawn"},
    "interview": {"offer", "rejected", "withdrawn"},
    "offer": {"accepted", "rejected", "withdrawn"},
    "accepted": set(),
    "rejected": set(),
    "withdrawn": set(),
}


def validate_status_transition(old_status: str, new_status: str) -> None:
    """Kiểm tra status transition hợp lệ theo state machine."""
    if old_status == new_status:
        return
    allowed = ALLOWED_TRANSITIONS.get(old_status, set())
    if new_status not in allowed:
        raise BadRequestError(
            f"Invalid status transition: {old_status} -> {new_status}",
            code="INVALID_STATUS_TRANSITION",
        )


def assert_recruiter_owns_job_application(
    *,
    application: dict[str, Any],
    recruiter_user_id: UUID,
    client: Client,
) -> None:
    """Kiểm tra recruiter có quyền quản lý application này không.

    Quyền = là owner hoặc active member (owner/recruiter) của company sở hữu job.
    """
    job = application.get("job_posts") or {}
    if not isinstance(job, dict):
        job = job[0] if isinstance(job, list) and job else {}

    company_id = job.get("company_id")
    if not company_id:
        raise ForbiddenError("Job has no company", code="JOB_HAS_NO_COMPANY")

    def _check() -> dict[str, Any] | None:
        result = (
            client.table("company_members")
            .select("id, role")
            .eq("company_id", str(company_id))
            .eq("user_id", str(recruiter_user_id))
            .eq("is_active", True)
            .in_("role", ["owner", "recruiter"])
            .maybe_single()
            .execute()
        )
        return result.data

    member = _check()
    if not member:
        raise ForbiddenError(
            "Bạn không có quyền quản lý application này",
            code="NOT_RECRUITER_FOR_JOB",
        )


class ApplicationService:
    def __init__(
        self,
        repository: ApplicationRepository,
        email_outbox_repo: EmailOutboxRepository,
        client: Client,
    ) -> None:
        self._repository = repository
        self._email_outbox_repo = email_outbox_repo
        self._client = client

    async def get_detail(
        self,
        application_id: UUID,
        actor_id: UUID,
        actor_role: str,
    ) -> ApplicationDetailResponse:
        application = await self._repository.get_by_id(application_id)
        if not application:
            raise NotFoundError("Application not found", code="APPLICATION_NOT_FOUND")

        # Authz: applicant xem của mình, recruiter xem của job mình quản lý
        if actor_role == "candidate":
            if str(application["applicant_user_id"]) != str(actor_id):
                raise ForbiddenError("Bạn không có quyền xem application này")
        else:
            assert_recruiter_owns_job_application(
                application=application,
                recruiter_user_id=actor_id,
                client=self._client,
            )

        return _to_detail(application)

    async def list_for_job(
        self,
        job_id: UUID,
        recruiter_user_id: UUID,
    ) -> list[ApplicationDetailResponse]:
        # Authz đã được check qua job-level (caller phải truyền job_id hợp lệ)
        rows = await self._repository.list_for_job(job_id)
        return [_to_detail(row) for row in rows]

    async def update_status(
        self,
        application_id: UUID,
        recruiter_user_id: UUID,
        request: ApplicationUpdateStatusRequest,
    ) -> ApplicationUpdateStatusResponse:
        application = await self._repository.get_by_id(application_id)
        if not application:
            raise NotFoundError("Application not found", code="APPLICATION_NOT_FOUND")

        # Authz: recruiter phải là member của company sở hữu job
        assert_recruiter_owns_job_application(
            application=application,
            recruiter_user_id=recruiter_user_id,
            client=self._client,
        )

        old_status = application["current_status"]
        validate_status_transition(old_status, request.new_status)

        # Update + insert stage (trigger DB sẽ tự tạo notification)
        updated_app, new_stage = await self._repository.update_status(
            application_id=application_id,
            new_status=request.new_status,
            changed_by_user_id=recruiter_user_id,
            note=request.note,
            is_system_generated=False,
        )
        if not updated_app or not new_stage:
            raise BadRequestError("Failed to update application", code="UPDATE_FAILED")

        # Enqueue email nếu được yêu cầu
        email_enqueued = False
        if request.send_email:
            job = application.get("job_posts") or {}
            if isinstance(job, list) and job:
                job = job[0]
            applicant = application.get("profiles") or {}
            if isinstance(applicant, list) and applicant:
                applicant = applicant[0]
            job_title = job.get("title", "Công việc")

            email_id = await self._email_outbox_repo.enqueue(
                to_user_id=application["applicant_user_id"],
                template="application_status_changed",
                payload={
                    "application_id": str(application_id),
                    "old_status": old_status,
                    "new_status": request.new_status,
                    "job_title": job_title,
                    "candidate_name": applicant.get("full_name"),
                    "note": request.note,
                },
                idempotency_key=f"application_status_email:{application_id}:{request.new_status}",
            )
            email_enqueued = email_id is not None

        return ApplicationUpdateStatusResponse(
            application=_to_detail({**application, **updated_app}),
            new_stage=ApplicationStageResponse(
                stage=new_stage["stage"],
                note=new_stage.get("note"),
                is_system_generated=bool(new_stage.get("is_system_generated")),
                created_at=new_stage["created_at"],
                changed_by_user_id=new_stage.get("changed_by_user_id"),
            ),
            email_enqueued=email_enqueued,
        )


def _to_detail(row: dict[str, Any]) -> ApplicationDetailResponse:
    job = row.get("job_posts") or {}
    if isinstance(job, list) and job:
        job = job[0]
    applicant = row.get("profiles") or {}
    if isinstance(applicant, list) and applicant:
        applicant = applicant[0]

    return ApplicationDetailResponse(
        id=UUID(str(row["id"])),
        job_post_id=UUID(str(row["job_post_id"])),
        applicant_user_id=UUID(str(row["applicant_user_id"])),
        resume_id=UUID(str(row["resume_id"])),
        current_status=row["current_status"],
        cover_letter=row.get("cover_letter"),
        applied_at=row["applied_at"],
        reviewed_at=row.get("reviewed_at"),
        response_deadline_at=row.get("response_deadline_at"),
        applicant_name=applicant.get("full_name") if isinstance(applicant, dict) else None,
        applicant_email=applicant.get("email") if isinstance(applicant, dict) else None,
        job_title=job.get("title") if isinstance(job, dict) else None,
        company_name=None,
    )
