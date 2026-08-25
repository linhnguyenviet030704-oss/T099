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


class ComparedJobCompany(BaseModel):
    id: UUID
    name: str
    logo_storage_path: str | None = None


class ComparedJob(BaseModel):
    job_id: UUID
    title: str
    company: ComparedJobCompany | None = None
    location: str | None = None
    employment_type: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    currency: str = "VND"
    deadline_at: str | None = None
    anonymous_label: str = Field(..., description="Nhãn như Công việc A, Công việc B...")
    metrics: CandidateMetrics
    total_score: float = Field(..., description="Tổng điểm 4 tiêu chí (thang 40)")
    average_score: float = Field(..., description="Điểm trung bình (thang 10)")
    rank: int = Field(..., description="Xếp hạng trong nhóm so sánh (1 = phù hợp nhất)")


class CompareJobsRequest(BaseModel):
    job_ids: list[UUID] = Field(
        ...,
        min_length=2,
        max_length=5,
        description="Danh sách từ 2 đến 5 job_id cần so sánh",
    )
    resume_id: UUID | None = Field(
        None,
        description="ID CV cụ thể của ứng viên để đối chiếu so sánh. Nếu không truyền sẽ lấy CV mặc định.",
    )


class CompareJobsResponse(BaseModel):
    candidate_id: UUID
    resume_id: UUID
    resume_title: str | None = None
    jobs: list[ComparedJob]
    top_job_id: UUID | None = None
    summary: str | None = None

