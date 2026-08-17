from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    job_id: UUID | None = None
    rerank: Literal["qwen", "agent"] = "qwen"


class RecommendedJob(BaseModel):
    id: UUID
    title: str
    company_name: str | None = None
    location: str | None = None
    employment_type: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    currency: str = "VND"
    score: float


class RecommendedCandidate(BaseModel):
    application_id: UUID
    applicant_user_id: UUID
    full_name: str | None = None
    email: str | None = None
    resume_title: str | None = None
    resume_storage_path: str | None = None
    current_status: str
    rrf_score: float
    rerank_score: float | None = None
    rerank_status: Literal["success", "fallback", "not_requested"] = "not_requested"


class ChatResponse(BaseModel):
    response: str
    analysis: str = ""
    jobs: list[RecommendedJob] = Field(default_factory=list)
    candidates: list[RecommendedCandidate] = Field(default_factory=list)
