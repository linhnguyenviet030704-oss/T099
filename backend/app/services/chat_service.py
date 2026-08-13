from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from backend.app.core.exceptions import AppError
from backend.app.schemas.chat import ChatRequest, ChatResponse
from backend.app.services.recommend import mock_recommend, mock_recommend_candidates

FetchJobs = Callable[[], Awaitable[list[dict[str, Any]]]]
FetchCandidates = Callable[[UUID], Awaitable[list[dict[str, Any]]]]
AssertJobAccess = Callable[[UUID, UUID], Awaitable[None]]


class ChatService:
    def __init__(
        self,
        fetch_jobs: FetchJobs,
        fetch_candidates: FetchCandidates | None = None,
        assert_job_access: AssertJobAccess | None = None,
    ) -> None:
        self._fetch_jobs = fetch_jobs
        self._fetch_candidates = fetch_candidates
        self._assert_job_access = assert_job_access

    async def chat(self, request: ChatRequest, actor_id: UUID | None = None) -> ChatResponse:
        if request.job_id is not None:
            return await self._recommend_candidates(request.job_id, actor_id)
        return await self._recommend_jobs()

    async def _recommend_jobs(self) -> ChatResponse:
        try:
            rows = await self._fetch_jobs()
        except AppError:
            raise
        except Exception as exc:
            raise AppError(502, "Không lấy được danh sách việc làm", "JOBS_UNAVAILABLE") from exc

        jobs = mock_recommend(rows)
        if not jobs:
            return ChatResponse(response="Hiện chưa có tin tuyển dụng đang mở.", jobs=[])
        return ChatResponse(
            response=f"Gợi ý {len(jobs)} việc làm phù hợp (mock matching).",
            jobs=jobs,
        )

    async def _recommend_candidates(self, job_id: UUID, actor_id: UUID | None) -> ChatResponse:
        if actor_id is None or self._assert_job_access is None or self._fetch_candidates is None:
            raise AppError(403, "Not a recruiter for this job", "FORBIDDEN")
        await self._assert_job_access(actor_id, job_id)
        try:
            rows = await self._fetch_candidates(job_id)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(502, "Không lấy được danh sách ứng viên", "CANDIDATES_UNAVAILABLE") from exc

        candidates = mock_recommend_candidates(rows)
        if not candidates:
            return ChatResponse(response="Chưa có CV nộp cho vị trí này.", candidates=[])
        return ChatResponse(
            response=f"Gợi ý {len(candidates)} ứng viên phù hợp (mock matching).",
            candidates=candidates,
        )
