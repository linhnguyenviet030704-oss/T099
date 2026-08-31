"""Service cho reputation domain."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from backend.app.api.schemas.reputation import (
    ReputationEventResponse,
    ReputationHistoryResponse,
    ReputationScoreResponse,
)
from backend.app.repositories.reputation_repository import ReputationRepository


class ReputationService:
    def __init__(self, repository: ReputationRepository) -> None:
        self._repository = repository

    async def get_scores(self, user_id: UUID) -> ReputationScoreResponse:
        row = await self._repository.get_scores(user_id)
        if not row:
            # Mặc định 100 nếu không tìm thấy profile (race condition)
            return ReputationScoreResponse(
                recruiter_reputation_score=100,
                candidate_reputation_score=100,
            )
        return ReputationScoreResponse(
            recruiter_reputation_score=int(row.get("recruiter_reputation_score") or 100),
            candidate_reputation_score=int(row.get("candidate_reputation_score") or 100),
        )

    async def list_history(
        self,
        user_id: UUID,
        role: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> ReputationHistoryResponse:
        rows = await self._repository.list_events_for_user(
            user_id, role=role, limit=limit, offset=offset,
        )
        total = await self._repository.count_events(user_id, role)
        items = [_to_event(row) for row in rows]
        return ReputationHistoryResponse(items=items, total=total)


def _to_event(row: dict[str, Any]) -> ReputationEventResponse:
    return ReputationEventResponse(
        id=UUID(str(row["id"])),
        role=row["role"],
        points_delta=int(row["points_delta"]),
        reason=row["reason"],
        application_id=UUID(str(row["application_id"])) if row.get("application_id") else None,
        job_post_id=UUID(str(row["job_post_id"])) if row.get("job_post_id") else None,
        interview_invitation_id=(
            UUID(str(row["interview_invitation_id"]))
            if row.get("interview_invitation_id")
            else None
        ),
        created_at=row["created_at"],
    )
