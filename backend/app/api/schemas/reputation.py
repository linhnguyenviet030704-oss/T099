"""Schemas cho reputation endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ReputationRole = Literal["recruiter", "candidate"]


class ReputationScoreResponse(BaseModel):
    """Điểm uy tín hiện tại."""

    recruiter_reputation_score: int = Field(ge=0, le=100)
    candidate_reputation_score: int = Field(ge=0, le=100)


class ReputationEventResponse(BaseModel):
    """Một event trong audit log."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role: ReputationRole
    points_delta: int
    reason: str
    application_id: UUID | None = None
    job_post_id: UUID | None = None
    interview_invitation_id: UUID | None = None
    created_at: datetime


class ReputationHistoryResponse(BaseModel):
    """Lịch sử reputation của user."""

    items: list[ReputationEventResponse]
    total: int
