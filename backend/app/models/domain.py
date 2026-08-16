from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

ProfileRole = Literal["candidate", "recruiter", "admin"]


@dataclass(slots=True)
class Profile:
    id: UUID
    email: str | None
    full_name: str | None
    phone: str | None
    avatar_url: str | None
    role: ProfileRole
    default_resume_id: UUID | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
