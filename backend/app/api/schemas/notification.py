"""Schemas cho notification API endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

NotificationType = Literal[
    "application_submitted",
    "application_status_changed",
    "interview_scheduled",
    "application_auto_rejected",
    "reputation_decreased",
    "reputation_increased",
    "interview_reminder",
]


class NotificationResponse(BaseModel):
    """Response cho 1 notification."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    notification_type: NotificationType
    title: str
    message: str
    link_url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    is_read: bool
    read_at: datetime | None = None
    created_at: datetime


class NotificationListResponse(BaseModel):
    """Danh sách notification + unread count."""

    items: list[NotificationResponse]
    unread_count: int
    total: int


class NotificationMarkReadRequest(BaseModel):
    """Request đánh dấu đã đọc."""

    notification_ids: list[UUID] = Field(default_factory=list)


class NotificationMarkReadResponse(BaseModel):
    """Số notification đã đánh dấu đã đọc."""

    updated_count: int
