from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ProfileRole = Literal["candidate", "recruiter", "admin"]


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str | None = None
    full_name: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    role: ProfileRole
    default_resume_id: UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    avatar_url: str | None = Field(default=None, max_length=2000)


class ProfileRoleUpdateRequest(BaseModel):
    role: ProfileRole


class RecruiterReviewRequest(BaseModel):
    decision: Literal["approved", "rejected"]
    admin_note: str | None = Field(default=None, max_length=2000)


class RecruiterReviewResponse(BaseModel):
    id: UUID
    status: Literal["approved", "rejected"]
    role: ProfileRole
