from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from backend.app.core.exceptions import AppError
from backend.app.schemas.chat import ChatRequest, ChatResponse, RecommendedCandidate
from backend.app.services.recommend import mock_recommend, mock_recommend_candidates

FetchJobs = Callable[[], Awaitable[list[dict[str, Any]]]]
FetchCandidates = Callable[[UUID], Awaitable[list[dict[str, Any]]]]
AssertJobAccess = Callable[[UUID, UUID], Awaitable[None]]
MatchCandidates = Callable[[UUID], Awaitable[ChatResponse]]


def chat_response_from_graph(result: dict[str, Any]) -> ChatResponse:
    candidates: list[RecommendedCandidate] = []
    for row in result.get("candidates") or []:
        candidates.append(
            RecommendedCandidate(
                application_id=UUID(str(row["application_id"])),
                applicant_user_id=UUID(str(row["applicant_user_id"])),
                full_name=row.get("full_name"),
                email=row.get("email"),
                resume_title=row.get("resume_title"),
                resume_storage_path=row.get("resume_storage_path"),
                current_status=row.get("current_status") or "pending",
                score=float(row.get("score") or 0.0),
            )
        )
    return ChatResponse(response=str(result.get("response") or ""), candidates=candidates)


class ChatService:
    def __init__(
        self,
        fetch_jobs: FetchJobs,
        fetch_candidates: FetchCandidates | None = None,
        assert_job_access: AssertJobAccess | None = None,
        match_candidates: MatchCandidates | None = None,
    ) -> None:
        self._fetch_jobs = fetch_jobs
        self._fetch_candidates = fetch_candidates
        self._assert_job_access = assert_job_access
        self._match_candidates = match_candidates

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
        if actor_id is None or self._assert_job_access is None:
            raise AppError(403, "Not a recruiter for this job", "FORBIDDEN")
        await self._assert_job_access(actor_id, job_id)
        if self._match_candidates is not None:
            try:
                return await self._match_candidates(job_id)
            except AppError:
                raise
            except Exception as exc:
                raise AppError(502, "Không lấy được danh sách ứng viên", "CANDIDATES_UNAVAILABLE") from exc
        if self._fetch_candidates is None:
            raise AppError(403, "Not a recruiter for this job", "FORBIDDEN")
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
