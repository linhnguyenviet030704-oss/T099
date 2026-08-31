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


class ApplicationUpdateStatusRequest(BaseModel):
    """Request update trạng thái application."""

    new_status: ApplicationStatus
    note: str | None = Field(default=None, max_length=2000)
    send_email: bool = False


class ApplicationUpdateStatusResponse(BaseModel):
    """Response sau khi update status."""

    application: ApplicationDetailResponse
    new_stage: ApplicationStageResponse
    email_enqueued: bool
