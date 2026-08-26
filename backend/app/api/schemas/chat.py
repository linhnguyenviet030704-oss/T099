from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    job_id: UUID | None = None
    rerank: Literal["qwen", "agent"] = "qwen"
    session_id: UUID | None = None


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
    rerank_score: float | None = None
    rerank_status: Literal["success", "fallback", "not_requested"] = "not_requested"
    match_reason: str | None = None


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
    match_reason: str | None = None


class ChatResponse(BaseModel):
    response: str
    analysis: str = ""
    jobs: list[RecommendedJob] = Field(default_factory=list)
    candidates: list[RecommendedCandidate] = Field(default_factory=list)


class RecommendationItem(BaseModel):
    """Single recommendation item (job or candidate) stored in DB."""
    id: str
    type: Literal["job", "candidate"]
    data: dict


class ChatMessageRecord(BaseModel):
    """A single message in chat history."""
    id: UUID
    session_id: UUID
    role: Literal["user", "assistant"]
    content: str
    recommendations: list[RecommendationItem] = Field(default_factory=list)
    created_at: str


class ChatHistoryResponse(BaseModel):
    """Response for chat history endpoint."""
    session_id: UUID
    messages: list[ChatMessageRecord]


class ChatSessionSummary(BaseModel):
    """Summary of a chat session for sidebar listing."""
    id: UUID
    first_message: str
    last_message: str | None = None
    created_at: str
    updated_at: str
    message_count: int = 0


class ChatSessionsResponse(BaseModel):
    """Response for user chat sessions list."""
    sessions: list[ChatSessionSummary]

