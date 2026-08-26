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
