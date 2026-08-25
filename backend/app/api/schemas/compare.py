from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class MetricScore(BaseModel):
    score: float = Field(..., ge=0, le=10, description="Điểm số từ 1-10 theo tiêu chí")
    reason: str = Field(..., description="Nhận xét ngắn gọn dưới 15 từ")


class CandidateMetrics(BaseModel):
    experience: MetricScore = Field(..., description="Kinh nghiệm làm việc")
    hard_skills: MetricScore = Field(..., description="Kỹ năng chuyên môn")
    education: MetricScore = Field(..., description="Học vấn & Chứng chỉ")
    overall_fit: MetricScore = Field(..., description="Độ phù hợp tổng thể")


class ComparedCandidate(BaseModel):
    application_id: UUID
    applicant_user_id: UUID
    full_name: str | None = None
    email: str | None = None
    resume_title: str | None = None
    resume_storage_path: str | None = None
    current_status: str = "pending"
    anonymous_label: str = Field(..., description="Nhãn ẩn danh như Ứng viên A, B...")
    metrics: CandidateMetrics
    total_score: float = Field(..., description="Tổng điểm 4 tiêu chí (thang 40)")
    average_score: float = Field(..., description="Điểm trung bình (thang 10)")
    rank: int = Field(..., description="Xếp hạng trong nhóm so sánh (1 = cao nhất)")


class CompareCandidatesRequest(BaseModel):
    job_id: UUID
    application_ids: list[UUID] = Field(
        ...,
        min_length=2,
        max_length=5,
        description="Danh sách từ 2 đến 5 application_id của ứng viên cần so sánh",
    )


class CompareCandidatesResponse(BaseModel):
    job_id: UUID
    job_title: str
    candidates: list[ComparedCandidate]
    top_candidate_id: UUID | None = None
    summary: str | None = None
