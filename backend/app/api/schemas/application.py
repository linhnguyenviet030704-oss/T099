"""Schemas cho application management (job_submits)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Mapping enum từ DB (snake_case) - giữ nguyên
ApplicationStatus = Literal[
    "pending",
    "screening",
    "interview",
    "offer",
    "accepted",
    "rejected",
    "withdrawn",
]


class ApplicationStageResponse(BaseModel):
    """Một stage change trong lịch sử application."""

    model_config = ConfigDict(from_attributes=True)

    stage: str
    note: str | None = None
    is_system_generated: bool = False
    created_at: datetime
    changed_by_user_id: UUID | None = None


class ApplicationDetailResponse(BaseModel):
    """Chi tiết 1 application."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    job_post_id: UUID
    applicant_user_id: UUID
    resume_id: UUID
    current_status: ApplicationStatus
    cover_letter: str | None = None
    applied_at: datetime
    reviewed_at: datetime | None = None
    response_deadline_at: datetime | None = None
    # Thông tin join (optional)
    applicant_name: str | None = None
    applicant_email: str | None = None
    job_title: str | None = None
    company_name: str | None = None


class ApplicationListResponse(BaseModel):
    """Danh sách applications cho 1 job."""

    items: list[ApplicationDetailResponse]
    total: int


class InterviewScheduleInput(BaseModel):
    """Dữ liệu lịch phỏng vấn do Nhà tuyển dụng thiết lập."""

    proposed_time_slots: list[str] = Field(default_factory=list, description="Danh sách các mốc thời gian đề xuất (ISO string)")
    location: str | None = Field(default=None, description="Địa điểm phỏng vấn trực tiếp (nếu có)")
    meeting_link: str | None = Field(default=None, description="Đường dẫn phòng họp online (Google Meet, Zoom, ...)")
    note: str | None = Field(default=None, description="Ghi chú gửi kèm ứng viên")


class InterviewInvitationResponse(BaseModel):
    """Thông tin chi tiết lời mời phỏng vấn."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    application_id: UUID
    scheduled_at: datetime | None = None
    proposed_time_slots: list[str] = Field(default_factory=list)
    candidate_proposed_slots: list[str] = Field(default_factory=list)
    candidate_response_note: str | None = None
    location: str | None = None
    meeting_link: str | None = None
    note: str | None = None
    status: str
    responded_at: datetime | None = None
    created_at: datetime | None = None


class CandidateInterviewResponseRequest(BaseModel):
    """Request từ Ứng viên khi phản hồi lịch phỏng vấn."""

    action: Literal["confirm", "reschedule"]
    selected_slot: str | None = Field(default=None, description="Mốc thời gian đã chọn (nếu action='confirm')")
    proposed_time_slots: list[str] = Field(default_factory=list, description="Danh sách mốc thời gian đề xuất mới (nếu action='reschedule')")
    note: str | None = Field(default=None, description="Ghi chú gửi Nhà tuyển dụng")


class RecruiterConfirmRescheduleRequest(BaseModel):
    """Request từ Nhà tuyển dụng khi chốt mốc thời gian do ứng viên đề xuất."""

    selected_slot: str = Field(..., description="Mốc thời gian chốt từ danh sách đề xuất của ứng viên")
    meeting_link: str | None = None
    location: str | None = None
    note: str | None = None


class ApplicationUpdateStatusRequest(BaseModel):
    """Request update trạng thái application."""

    new_status: ApplicationStatus
    note: str | None = Field(default=None, max_length=2000)
    send_email: bool = False
    interview_schedule: InterviewScheduleInput | None = None


class ApplicationUpdateStatusResponse(BaseModel):
    """Response sau khi update status."""

    application: ApplicationDetailResponse
    new_stage: ApplicationStageResponse
    email_enqueued: bool
    interview_invitation: InterviewInvitationResponse | None = None

