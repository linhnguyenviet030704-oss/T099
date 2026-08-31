"""API schemas for evaluation endpoints."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class EvaluationRequest(BaseModel):
    """Request for evaluation endpoint."""

    cv_text: str | None = Field(None, max_length=50000)
    jd_text: str | None = Field(None, max_length=50000)
    resume_id: UUID | None = None
    job_id: UUID | None = None
    evaluation_type: Literal["full", "skill_only", "experience_only", "quick"] = "full"


class MetricScoreResponse(BaseModel):
    """Individual metric in response."""

    score: float
    weight: float
    details: dict
    confidence: float


class SkillAnalysisResponse(BaseModel):
    """Skill analysis breakdown."""

    matched: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    unexpected: list[str] = Field(default_factory=list)
    match_rate: float


class RadarChartData(BaseModel):
    """Radar chart data for visualization."""

    type: str = "radar"
    labels: list[str]
    datasets: list[dict]


class BenchmarkResponse(BaseModel):
    """Benchmark comparison data."""

    percentile: float | None = None
    vs_average: float = 0.0
    industry: str = "tech_vietnam"


class EvaluationResponse(BaseModel):
    """Response from evaluation endpoint."""

    overall_score: float
    breakdown: dict[str, MetricScoreResponse]
    skill_analysis: SkillAnalysisResponse
    recommendations: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    confidence: float
    radar_chart: RadarChartData | None = None
    benchmark: BenchmarkResponse | None = None
    natural_language_summary: str | None = None


class RoutingRequest(BaseModel):
    """Request for routing endpoint."""

    message: str = Field(..., min_length=1, max_length=50000)


class RoutingResponse(BaseModel):
    """Response from routing endpoint."""

    intent: str
    is_valid: bool
    dispatch_target: str | None = None
    context: dict = Field(default_factory=dict)
    rejection_reason: str | None = None
    rejection_message: str | None = None


class CvAssessmentRequest(BaseModel):
    """Yêu cầu đánh giá độ mạnh/yếu CV theo ngành nghề mục tiêu."""

    resume_id: UUID | None = None
    cv_text: str | None = Field(None, max_length=50000)
    target_role: str = Field(..., min_length=1, max_length=200, description="Vị trí/ngành nghề muốn ứng tuyển (VD: Backend Developer, AI Engineer)")
    target_level: Literal["intern", "fresher", "junior", "middle", "senior", "lead"] | None = "middle"


class RoadmapPhase(BaseModel):
    """Một giai đoạn trong lộ trình học tập & bổ sung kỹ năng."""

    phase: int
    title: str
    duration_weeks: int
    focus_skills: list[str] = Field(default_factory=list)
    recommended_topics_or_projects: list[str] = Field(default_factory=list)


class CvAssessmentResponse(BaseModel):
    """Kết quả đánh giá chuyên sâu độ mạnh/yếu CV và lộ trình phát triển."""

    target_role: str
    target_level: str
    overall_score: float
    breakdown: dict[str, MetricScoreResponse]
    skill_analysis: SkillAnalysisResponse
    authenticity: dict = Field(default_factory=dict)
    red_flags: list[str] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    skill_gap: dict[str, list[str]] = Field(default_factory=dict)
    radar_chart: RadarChartData | None = None
    recommendations: list[str] = Field(default_factory=list)
    learning_roadmap: list[RoadmapPhase] = Field(default_factory=list)
    natural_language_summary: str | None = None
    confidence: float = 0.8


class SaveCvAssessmentHistoryRequest(BaseModel):
    """Yêu cầu lưu trữ kết quả đánh giá CV vào lịch sử."""

    id: str | None = None
    user_id: UUID | None = None
    target_role: str = Field(..., min_length=1, max_length=200)
    target_level: str = "middle"
    overall_score: float
    resume_id: UUID | None = None
    cv_title: str | None = None
    cv_preview: str | None = None
    assessment_data: dict = Field(..., description="Toàn bộ kết quả dữ liệu đánh giá CV")
    checklist_state: dict = Field(default_factory=dict, description="Trạng thái các mục checklist đã hoàn thành")


class UpdateChecklistRequest(BaseModel):
    """Yêu cầu cập nhật trạng thái checklist cho một bản ghi lịch sử."""

    checklist_state: dict = Field(..., description="Trạng thái checklist mới (key: checklist_id, value: boolean hoặc object)")


class CvAssessmentHistoryItem(BaseModel):
    """Bản ghi lịch sử đánh giá CV."""

    id: UUID
    user_id: UUID | None = None
    target_role: str
    target_level: str
    overall_score: float
    resume_id: UUID | None = None
    cv_title: str | None = None
    cv_preview: str | None = None
    assessment_data: dict
    checklist_state: dict = Field(default_factory=dict)
    created_at: str
    updated_at: str

