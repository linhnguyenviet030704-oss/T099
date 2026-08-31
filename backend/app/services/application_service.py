"""Service cho application/job_submit management."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from backend.app.api.schemas.application import (
    ApplicationDetailResponse,
    ApplicationStageResponse,
    ApplicationUpdateStatusRequest,
    ApplicationUpdateStatusResponse,
    CandidateInterviewResponseRequest,
    InterviewInvitationResponse,
    RecruiterConfirmRescheduleRequest,
)
from backend.app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from backend.app.repositories.application_repository import ApplicationRepository
from backend.app.repositories.email_outbox_repository import EmailOutboxRepository
from backend.app.repositories.interview_invitation_repository import InterviewInvitationRepository
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


def _parse_slot_time(val: str) -> datetime:
    """Parse chuỗi datetime sang datetime object."""
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except Exception:
        raise BadRequestError(f"Định dạng thời gian không hợp lệ: {val}")


def validate_and_normalize_time_slots(slots: list[Any]) -> list[str]:
    """Kiểm tra và chuẩn hóa danh sách các khoảng thời gian phỏng vấn:
    1. start_time và end_time hợp lệ (end_time > start_time, tối thiểu 15 phút).
    2. Không trùng lặp (non-overlapping) để tránh spam.
    3. Cách nhau ít nhất 4 giờ giữa các khoảng thời gian khác nhau.
    """
    if not slots:
        return []

    parsed_slots: list[tuple[datetime, datetime]] = []
    for slot in slots:
        start_str: str | None = None
        end_str: str | None = None

        if isinstance(slot, dict):
            start_str = slot.get("start_time") or slot.get("start")
            end_str = slot.get("end_time") or slot.get("end")
        elif isinstance(slot, str):
            if " - " in slot:
                parts = slot.split(" - ")
                start_str, end_str = parts[0].strip(), parts[1].strip()
            elif "/" in slot:
                parts = slot.split("/")
                start_str, end_str = parts[0].strip(), parts[1].strip()
            else:
                start_str = slot.strip()
                start_dt = _parse_slot_time(start_str)
                end_str = (start_dt + timedelta(hours=1)).isoformat()
        else:
            raise BadRequestError("Dữ liệu mốc thời gian không hợp lệ")

        if not start_str:
            raise BadRequestError("Thiếu thời gian bắt đầu cho khoảng thời gian phỏng vấn")

        start_dt = _parse_slot_time(start_str)
        if end_str:
            end_dt = _parse_slot_time(end_str)
        else:
            end_dt = start_dt + timedelta(hours=1)

        if end_dt <= start_dt:
            raise BadRequestError("Thời gian kết thúc phải lớn hơn thời gian bắt đầu")

        if (end_dt - start_dt).total_seconds() < 15 * 60:
            raise BadRequestError("Khoảng thời gian phỏng vấn tối thiểu là 15 phút")

        parsed_slots.append((start_dt, end_dt))

    # Sắp xếp theo thời gian bắt đầu
    parsed_slots.sort(key=lambda s: s[0])

    # Kiểm tra trùng lặp & khoảng cách tối thiểu 4h (14400 giây)
    min_gap_seconds = 4 * 3600

    for i in range(len(parsed_slots) - 1):
        curr_start, curr_end = parsed_slots[i]
        next_start, next_end = parsed_slots[i + 1]

        # Kiểm tra trùng lặp (Overlap)
        if next_start < curr_end:
            raise BadRequestError("Các khoảng thời gian phỏng vấn không được trùng lặp nhau")

        # Kiểm tra khoảng cách tối thiểu 4h
        gap = (next_start - curr_end).total_seconds()
        if gap < min_gap_seconds:
            gap_minutes = int(gap // 60)
            gap_hours = gap / 3600
            raise BadRequestError(
                f"Các khoảng thời gian khác nhau cần cách nhau ít nhất 4 giờ (hiện cách {gap_hours:.1f}h / {gap_minutes} phút)."
            )

    return [
        f"{s.isoformat()}/{e.isoformat()}"
        for s, e in parsed_slots
    ]



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
        interview_repo: InterviewInvitationRepository | None = None,
    ) -> None:
        self._repository = repository
        self._email_outbox_repo = email_outbox_repo
        self._client = client
        self._interview_repo = interview_repo or InterviewInvitationRepository(client)

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

        # Xử lý tạo/cập nhật interview_invitations khi chuyển sang 'interview'
        interview_invitation_res: InterviewInvitationResponse | None = None
        if request.new_status == "interview" and request.interview_schedule:
            norm_slots = validate_and_normalize_time_slots(request.interview_schedule.proposed_time_slots)
            inv_data = await self._interview_repo.create(
                application_id=application_id,
                created_by_user_id=recruiter_user_id,
                proposed_time_slots=norm_slots,
                location=request.interview_schedule.location,
                meeting_link=request.interview_schedule.meeting_link,
                note=request.interview_schedule.note or request.note,
            )
            if inv_data:
                interview_invitation_res = _to_invitation(inv_data)

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
            interview_invitation=interview_invitation_res,
        )

    async def get_interview_invitation(
        self,
        application_id: UUID,
        actor_id: UUID,
        actor_role: str,
    ) -> InterviewInvitationResponse | None:
        """Lấy thông tin lịch hẹn phỏng vấn của một application."""
        application = await self._repository.get_by_id(application_id)
        if not application:
            raise NotFoundError("Application not found", code="APPLICATION_NOT_FOUND")

        # Kiểm tra quyền truy cập
        if actor_role == "candidate":
            if str(application["applicant_user_id"]) != str(actor_id):
                raise ForbiddenError("Bạn không có quyền xem thông tin lịch phỏng vấn này")
        else:
            assert_recruiter_owns_job_application(
                application=application,
                recruiter_user_id=actor_id,
                client=self._client,
            )

        inv_data = await self._interview_repo.get_by_application_id(application_id)
        if not inv_data:
            return None
        return _to_invitation(inv_data)

    async def candidate_respond_interview(
        self,
        application_id: UUID,
        candidate_id: UUID,
        request: CandidateInterviewResponseRequest,
    ) -> InterviewInvitationResponse:
        """Ứng viên phản hồi lịch phỏng vấn (xác nhận hoặc đề xuất mốc mới)."""
        application = await self._repository.get_by_id(application_id)
        if not application:
            raise NotFoundError("Application not found", code="APPLICATION_NOT_FOUND")

        if str(application["applicant_user_id"]) != str(candidate_id):
            raise ForbiddenError("Bạn không phải là ứng viên của đơn này")

        if request.action == "confirm":
            if not request.selected_slot:
                raise BadRequestError("Vui lòng chọn mốc thời gian phỏng vấn")
            res_data = await self._interview_repo.candidate_confirm_slot(
                application_id=application_id,
                selected_slot=request.selected_slot,
            )
        elif request.action == "reschedule":
            if not request.proposed_time_slots:
                raise BadRequestError("Vui lòng nhập ít nhất một mốc thời gian đề xuất")
            norm_slots = validate_and_normalize_time_slots(request.proposed_time_slots)
            res_data = await self._interview_repo.candidate_request_reschedule(
                application_id=application_id,
                proposed_slots=norm_slots,
                note=request.note,
            )
        else:
            raise BadRequestError("Invalid action")

        if not res_data:
            raise NotFoundError("Không tìm thấy lời mời phỏng vấn để phản hồi")

        return _to_invitation(res_data)


    async def recruiter_confirm_reschedule(
        self,
        application_id: UUID,
        recruiter_id: UUID,
        request: RecruiterConfirmRescheduleRequest,
    ) -> InterviewInvitationResponse:
        """Nhà tuyển dụng chốt mốc thời gian từ danh sách ứng viên đề xuất."""
        application = await self._repository.get_by_id(application_id)
        if not application:
            raise NotFoundError("Application not found", code="APPLICATION_NOT_FOUND")

        assert_recruiter_owns_job_application(
            application=application,
            recruiter_user_id=recruiter_id,
            client=self._client,
        )

        res_data = await self._interview_repo.recruiter_confirm_rescheduled_slot(
            application_id=application_id,
            selected_slot=request.selected_slot,
            meeting_link=request.meeting_link,
            location=request.location,
            note=request.note,
        )
        if not res_data:
            raise NotFoundError("Không tìm thấy lời mời phỏng vấn")

        return _to_invitation(res_data)


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


def _to_invitation(row: dict[str, Any]) -> InterviewInvitationResponse:
    return InterviewInvitationResponse(
        id=UUID(str(row["id"])),
        application_id=UUID(str(row["application_id"])),
        scheduled_at=row.get("scheduled_at"),
        proposed_time_slots=row.get("proposed_time_slots") or [],
        candidate_proposed_slots=row.get("candidate_proposed_slots") or [],
        candidate_response_note=row.get("candidate_response_note"),
        location=row.get("location"),
        meeting_link=row.get("meeting_link"),
        note=row.get("note"),
        status=row.get("status", "pending"),
        responded_at=row.get("responded_at"),
        created_at=row.get("created_at"),
    )

