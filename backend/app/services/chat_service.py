from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from backend.app.agents.evaluation.types import IntentType
from backend.app.agents.routing.intents import classify_intent
from backend.app.api.schemas.chat import ChatRequest, ChatResponse, RecommendationItem, RecommendedCandidate, RecommendedJob
from backend.app.config.models import FINAL_CANDIDATE_K
from backend.app.core.exceptions import AppError
from backend.app.observability.logger import get_logger
from backend.app.services.recommend import mock_recommend, mock_recommend_candidates

CHITCHAT_RESPONSE = (
    "Chào bạn! Mình là trợ lý AI của hệ thống tuyển dụng. "
    "Bạn có thể nhờ mình gợi ý việc làm phù hợp với CV, "
    "tìm việc theo lĩnh vực/công ty, đánh giá CV, hoặc gợi ý lộ trình bổ sung kỹ năng."
)
INVALID_RESPONSE = "Nội dung không hợp lệ. Vui lòng mô tả yêu cầu rõ hơn."

logger = get_logger(__name__)


def _serialize_recommendations(response: ChatResponse) -> list[dict]:
    items = []
    for job in response.jobs:
        items.append({"id": str(job.id), "type": "job", "data": job.model_dump(mode="json")})
    for cand in response.candidates:
        items.append({"id": str(cand.application_id), "type": "candidate", "data": cand.model_dump(mode="json")})
    return items


async def _save_message(
    client, user_id: UUID, session_id: UUID | None, role: str, content: str, recommendations: list[dict]
) -> None:
    if session_id is None:
        return
    try:
        client.table("chat_messages").insert({
            "session_id": str(session_id),
            "user_id": str(user_id),
            "role": role,
            "content": content,
            "recommendations": json.dumps(recommendations),
        }).execute()
    except Exception:
        logger.exception("Failed to save chat message")

FetchJobs = Callable[[], Awaitable[list[dict[str, Any]]]]
FetchCandidates = Callable[[UUID, UUID], Awaitable[list[dict[str, Any]]]]
AssertJobAccess = Callable[[UUID, UUID], Awaitable[None]]
MatchCandidates = Callable[[UUID, UUID, str, str], Awaitable[ChatResponse]]
RecommendJobs = Callable[[UUID, str, str], Awaitable[ChatResponse]]
DispatchEvaluation = Callable[[UUID, str], Awaitable[ChatResponse]]


def chat_response_from_graph(result: dict[str, Any]) -> ChatResponse:
    candidates: list[RecommendedCandidate] = []
    for row in (result.get("candidates") or [])[:FINAL_CANDIDATE_K]:
        rerank_status = str(row.get("rerank_status") or "not_requested")
        rerank_score = row.get("rerank_score")
        reason_raw = row.get("match_reason")
        reason_clean = str(reason_raw).strip() if reason_raw else ""
        candidates.append(
            RecommendedCandidate(
                application_id=UUID(str(row["application_id"])),
                applicant_user_id=UUID(str(row["applicant_user_id"])),
                full_name=row.get("full_name"),
                email=row.get("email"),
                resume_title=row.get("resume_title"),
                resume_storage_path=row.get("resume_storage_path"),
                current_status=row.get("current_status") or "pending",
                rrf_score=float(row.get("rrf_score") or 0.0),
                rerank_score=None if rerank_score is None else float(rerank_score),
                rerank_status=rerank_status,  # type: ignore[arg-type]
                match_reason=reason_clean or None,
            )
        )
    return ChatResponse(response=str(result.get("response") or ""), candidates=candidates)


def jobs_response_from_graph(result: dict[str, Any]) -> ChatResponse:
    jobs: list[RecommendedJob] = []
    for row in (result.get("candidates") or [])[:FINAL_CANDIDATE_K]:
        rerank_status = str(row.get("rerank_status") or "not_requested")
        rerank_score = row.get("rerank_score")
        reason_raw = row.get("match_reason")
        reason_clean = str(reason_raw).strip() if reason_raw else ""
        jobs.append(
            RecommendedJob(
                id=UUID(str(row["job_id"])),
                title=row.get("title") or "",
                company_name=row.get("company_name"),
                location=row.get("location"),
                employment_type=row.get("employment_type"),
                salary_min=row.get("salary_min"),
                salary_max=row.get("salary_max"),
                currency=row.get("currency") or "VND",
                score=float(row.get("rrf_score") or 0.0),
                rerank_score=None if rerank_score is None else float(rerank_score),
                rerank_status=rerank_status,  # type: ignore[arg-type]
                match_reason=reason_clean or None,
            )
        )
    return ChatResponse(response=str(result.get("response") or ""), jobs=jobs)


class ChatService:
    def __init__(
        self,
        fetch_jobs: FetchJobs,
        fetch_candidates: FetchCandidates | None = None,
        assert_job_access: AssertJobAccess | None = None,
        match_candidates: MatchCandidates | None = None,
        recommend_jobs: RecommendJobs | None = None,
        dispatch_evaluation: DispatchEvaluation | None = None,
        supabase_client=None,
        client=None,
    ) -> None:
        self._fetch_jobs = fetch_jobs
        self._fetch_candidates = fetch_candidates
        self._assert_job_access = assert_job_access
        self._match_candidates = match_candidates
        self._recommend_jobs_fn = recommend_jobs
        self._dispatch_evaluation = dispatch_evaluation
        self._client = supabase_client if supabase_client is not None else client

    async def chat(self, request: ChatRequest, actor_id: UUID | None = None) -> ChatResponse:
        classification = classify_intent(request.message)

        # Short-circuit: pure chitchat — no CV load, no LLM call
        if request.job_id is None and classification.intent == IntentType.CHITCHAT:
            response = ChatResponse(response=CHITCHAT_RESPONSE)
        # Short-circuit: invalid/off-topic input
        elif classification.intent in (
            IntentType.OUT_OF_SCOPE,
            IntentType.CONTENT_TOO_SHORT,
            IntentType.INVALID_FORMAT,
        ):
            response = ChatResponse(response=INVALID_RESPONSE)
        # Recruiter flow: match candidates against a job
        elif request.job_id is not None:
            response = await self._recommend_candidates(request, actor_id)
        # Evaluation flows (skill gap / self-evaluate)
        elif classification.dispatch_target == "evaluation" and self._dispatch_evaluation is not None:
            response = await self._dispatch_evaluation(actor_id, request.message)
        # Default: recommend jobs for candidate
        else:
            response = await self._recommend_jobs(request, actor_id)

        # Save to history
        if actor_id is not None and self._client is not None:
            await _save_message(
                self._client,
                actor_id,
                request.session_id,
                "user",
                request.message,
                [],
            )
            await _save_message(
                self._client,
                actor_id,
                request.session_id,
                "assistant",
                response.response,
                _serialize_recommendations(response),
            )

        return response

    async def _recommend_jobs(self, request: ChatRequest, actor_id: UUID | None) -> ChatResponse:
        if self._recommend_jobs_fn is not None and actor_id is not None:
            try:
                return await self._recommend_jobs_fn(actor_id, request.message, request.rerank)
            except AppError:
                raise
            except Exception as exc:
                logger.exception("recommend_jobs failed")
                raise AppError(502, "Không lấy được danh sách việc làm", "JOBS_UNAVAILABLE") from exc
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

    async def _recommend_candidates(self, request: ChatRequest, actor_id: UUID | None) -> ChatResponse:
        job_id = request.job_id
        if job_id is None or actor_id is None or self._assert_job_access is None:
            raise AppError(403, "Not a recruiter for this job", "FORBIDDEN")
        await self._assert_job_access(actor_id, job_id)
        if self._match_candidates is not None:
            try:
                return await self._match_candidates(job_id, actor_id, request.message, request.rerank)
            except AppError:
                raise
            except Exception as exc:
                logger.exception("match_candidates failed")
                raise AppError(502, "Không lấy được danh sách ứng viên", "CANDIDATES_UNAVAILABLE") from exc
        if self._fetch_candidates is None:
            raise AppError(403, "Not a recruiter for this job", "FORBIDDEN")
        try:
            rows = await self._fetch_candidates(job_id, actor_id)
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
