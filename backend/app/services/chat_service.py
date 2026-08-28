import asyncio
from collections.abc import AsyncGenerator, Awaitable, Callable
from typing import Any
from uuid import UUID, uuid4

from backend.app.agents.evaluation.types import IntentType
from backend.app.agents.routing.intents import check_off_topic, classify_intent
from backend.app.api.schemas.chat import (
    ChatRequest,
    ChatResponse,
    RecommendedCandidate,
    RecommendedJob,
)
from backend.app.config.models import FINAL_CANDIDATE_K
from backend.app.core.exceptions import AppError, BadRequestError
from backend.app.guardrails.gates import gate_context
from backend.app.guardrails.input import validate_text
from backend.app.guardrails.output import validate_generated_text
from backend.app.observability.logger import get_logger
from backend.app.services.recommend import mock_recommend, mock_recommend_candidates

CHITCHAT_RESPONSE = (
    "Chào bạn! Mình là trợ lý AI của hệ thống tuyển dụng. "
    "Bạn có thể nhờ mình gợi ý việc làm phù hợp với CV, "
    "tìm việc theo lĩnh vực/công ty, đánh giá CV, hoặc gợi ý lộ trình bổ sung kỹ năng."
)
RECRUITER_CHITCHAT_RESPONSE = (
    "Chào bạn! Tôi là trợ lý AI hỗ trợ tuyển dụng. "
    "Bạn có thể yêu cầu tôi gợi ý danh sách ứng viên phù hợp nhất với vị trí này, "
    "hoặc tìm kiếm ứng viên theo kỹ năng, số năm kinh nghiệm cụ thể."
)
INVALID_RESPONSE = "Nội dung không hợp lệ. Vui lòng mô tả yêu cầu rõ hơn."
OUT_OF_SCOPE_RESPONSE = (
    "Nội dung này không thuộc phạm vi hỗ trợ. "
    "Tôi chỉ hỗ trợ CV, việc làm, tuyển dụng, ứng viên và định hướng kỹ năng nghề nghiệp."
)
UNSUPPORTED_LANGUAGE_RESPONSE = (
    "Hiện tại hệ thống hỗ trợ tiếng Việt và tiếng Anh. "
    "Vui lòng gửi lại yêu cầu bằng một trong hai ngôn ngữ này."
)
UNKNOWN_RESPONSE = (
    "Tôi chưa xác định được yêu cầu tuyển dụng của bạn. "
    "Vui lòng nói rõ bạn muốn tìm việc, đánh giá CV, xem thiếu kỹ năng hay tìm ứng viên."
)
SAFE_OUTPUT_FALLBACK = "Không thể tạo phản hồi an toàn từ kết quả hiện tại. Vui lòng thử lại."

_RECOMMEND_INTENTS = frozenset(
    {
        IntentType.RECOMMEND_GENERAL,
        IntentType.SEARCH_BY_DOMAIN,
        IntentType.LIST_AVAILABLE_JOBS,
        IntentType.TARGET_SPECIFIC,
    }
)
_EVALUATION_INTENTS = frozenset({IntentType.SKILL_GAP_ADVICE, IntentType.SELF_EVALUATE})
_RECRUITER_MATCH_INTENTS = frozenset(
    {
        IntentType.RECRUITER_SCREEN,
        IntentType.RECOMMEND_GENERAL,
        IntentType.SEARCH_BY_DOMAIN,
        IntentType.TARGET_SPECIFIC,
    }
)

logger = get_logger(__name__)


def _guard_chat_response(
    response: ChatResponse,
    *,
    intent: IntentType,
    expected_output: str,
) -> ChatResponse:
    guarded_text = validate_generated_text(
        response.response,
        max_chars=2_000,
        fallback=SAFE_OUTPUT_FALLBACK,
    )
    if guarded_text.action == "fallback":
        logger.warning("chat output fallback intent=%s codes=%s", intent.value, guarded_text.codes)
        return response.model_copy(
            update={"response": str(guarded_text.value), "jobs": [], "candidates": []}
        )

    jobs = list(response.jobs)
    candidates = list(response.candidates)
    mismatch = (
        (expected_output == "text" and bool(jobs or candidates))
        or (expected_output == "jobs" and bool(candidates))
        or (expected_output == "candidates" and bool(jobs))
    )
    if mismatch:
        logger.warning("chat output intent mismatch intent=%s expected=%s", intent.value, expected_output)
        return response.model_copy(
            update={"response": SAFE_OUTPUT_FALLBACK, "jobs": [], "candidates": []}
        )

    if expected_output != "jobs":
        jobs = []
    if expected_output != "candidates":
        candidates = []
    return response.model_copy(
        update={"response": str(guarded_text.value), "jobs": jobs, "candidates": candidates}
    )


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
            "recommendations": recommendations,
        }).execute()
    except Exception:
        logger.exception("Failed to save chat message")


FetchJobs = Callable[[], Awaitable[list[dict[str, Any]]]]
FetchCandidates = Callable[[UUID, UUID], Awaitable[list[dict[str, Any]]]]
AssertJobAccess = Callable[[UUID, UUID], Awaitable[None]]
MatchCandidates = Callable[[UUID, UUID, str, str], Awaitable[ChatResponse]]
RecommendJobs = Callable[[UUID, str, str], Awaitable[ChatResponse]]
DispatchEvaluation = Callable[[UUID, str], Awaitable[ChatResponse]]
ResolveIntent = Callable[[str], Awaitable[Any]]

StreamRecommendJobs = Callable[..., AsyncGenerator[dict[str, Any], None]]
StreamMatchCandidates = Callable[..., AsyncGenerator[dict[str, Any], None]]
StreamDispatchEvaluation = Callable[..., AsyncGenerator[dict[str, Any], None]]


def chat_response_from_graph(result: dict[str, Any], max_results: int | None = None) -> ChatResponse:
    candidates: list[RecommendedCandidate] = []
    limit = max_results or FINAL_CANDIDATE_K
    for row in (result.get("candidates") or [])[:limit]:
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
                is_public_candidate=bool(row.get("is_public_candidate", False) or row.get("current_status") == "job_seeking"),
                has_verified_skills=bool(row.get("has_verified_skills", False) or row.get("verified_skills")),
            )
        )
    return ChatResponse(response=str(result.get("response") or ""), candidates=candidates)



def jobs_response_from_graph(result: dict[str, Any], max_results: int | None = None) -> ChatResponse:
    jobs: list[RecommendedJob] = []
    limit = max_results or FINAL_CANDIDATE_K
    for row in (result.get("candidates") or [])[:limit]:
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
        resolve_intent: ResolveIntent | None = None,
        supabase_client=None,
        client=None,
        stream_recommend_jobs: StreamRecommendJobs | None = None,
        stream_match_candidates: StreamMatchCandidates | None = None,
        stream_dispatch_evaluation: StreamDispatchEvaluation | None = None,
    ) -> None:
        self._fetch_jobs = fetch_jobs
        self._fetch_candidates = fetch_candidates
        self._assert_job_access = assert_job_access
        self._match_candidates = match_candidates
        self._recommend_jobs_fn = recommend_jobs
        self._dispatch_evaluation = dispatch_evaluation
        self._resolve_intent = resolve_intent
        self._client = supabase_client if supabase_client is not None else client
        self._stream_recommend_jobs_fn = stream_recommend_jobs
        self._stream_match_candidates_fn = stream_match_candidates
        self._stream_dispatch_evaluation_fn = stream_dispatch_evaluation

    async def chat(self, request: ChatRequest, actor_id: UUID | None = None) -> ChatResponse:
        validated = validate_text(request.message, source="chat", max_chars=5000)
        guarded = gate_context(validated.text, source="chat", max_chars=5000)
        if guarded.action == "block":
            code = guarded.codes[0] if guarded.codes else "DATA_INJECTION_SIGNAL"
            raise BadRequestError("Yêu cầu không an toàn để xử lý", code=code)
        request = request.model_copy(update={"message": str(guarded.value)})
        classification = classify_intent(request.message)
        if (
            classification.intent in (IntentType.UNKNOWN, IntentType.OUT_OF_SCOPE)
            and not check_off_topic(request.message)
            and self._resolve_intent is not None
        ):
            try:
                classification = await self._resolve_intent(request.message)
            except Exception:
                logger.exception("semantic intent fallback failed")

        # Determine session_id
        session_id = request.session_id or (uuid4() if actor_id is not None else None)
        expected_output = "text"

        # Kiểm tra quyền truy cập công việc trước khi chạy luồng nhà tuyển dụng.
        if request.job_id is not None and actor_id is not None and self._assert_job_access is not None:
            await self._assert_job_access(actor_id, request.job_id)

        # Dừng sớm các yêu cầu không cần gọi matching hoặc mô hình ngôn ngữ.
        if classification.intent == IntentType.UNSUPPORTED_LANGUAGE:
            response = ChatResponse(response=UNSUPPORTED_LANGUAGE_RESPONSE, session_id=session_id)
        elif classification.intent == IntentType.CHITCHAT:
            greeting = RECRUITER_CHITCHAT_RESPONSE if request.job_id is not None else CHITCHAT_RESPONSE
            response = ChatResponse(response=greeting, session_id=session_id)
        elif classification.intent == IntentType.OUT_OF_SCOPE:
            message = INVALID_RESPONSE if request.job_id is not None else OUT_OF_SCOPE_RESPONSE
            response = ChatResponse(response=message, session_id=session_id)
        elif classification.intent == IntentType.UNKNOWN:
            response = ChatResponse(response=UNKNOWN_RESPONSE, session_id=session_id)
        elif classification.intent in (IntentType.CONTENT_TOO_SHORT, IntentType.INVALID_FORMAT):
            response = ChatResponse(response=INVALID_RESPONSE, session_id=session_id)
        # Recruiter flow: match candidates against a job
        elif request.job_id is not None:
            if classification.intent in _RECRUITER_MATCH_INTENTS:
                response = await self._recommend_candidates(request, actor_id)
                expected_output = "candidates"
            else:
                response = ChatResponse(response=UNKNOWN_RESPONSE)
        # Evaluation flows (skill gap / self-evaluate)
        elif classification.intent in _EVALUATION_INTENTS and self._dispatch_evaluation is not None:
            response = await self._dispatch_evaluation(actor_id, request.message)
        elif classification.intent in _RECOMMEND_INTENTS and classification.dispatch_target == "recommend":
            response = await self._recommend_jobs(request, actor_id)
            expected_output = "jobs"
        else:
            response = ChatResponse(response=UNKNOWN_RESPONSE)

        response.session_id = session_id
        response = _guard_chat_response(
            response,
            intent=classification.intent,
            expected_output=expected_output,
        )

        # Save to history
        if actor_id is not None and self._client is not None and session_id is not None:
            await _save_message(
                self._client,
                actor_id,
                session_id,
                "user",
                request.message,
                [],
            )
            await _save_message(
                self._client,
                actor_id,
                session_id,
                "assistant",
                response.response,
                _serialize_recommendations(response),
            )

        return response

    async def _recommend_jobs(self, request: ChatRequest, actor_id: UUID | None) -> ChatResponse:
        if self._recommend_jobs_fn is not None and actor_id is not None:
            try:
                try:
                    return await self._recommend_jobs_fn(
                        actor_id,
                        request.message,
                        request.rerank,
                        resume_id=request.resume_id,
                        max_results=request.max_results,
                    )
                except TypeError:
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
        if request.max_results:
            jobs = jobs[:request.max_results]
        if not jobs:
            return ChatResponse(response="Hiện chưa có tin tuyển dụng đang mở.", jobs=[])
        return ChatResponse(
            response=f"Gợi ý {len(jobs)} việc làm phù hợp.",
            jobs=jobs,
        )

    async def _recommend_candidates(self, request: ChatRequest, actor_id: UUID | None) -> ChatResponse:
        job_id = request.job_id
        if job_id is None or actor_id is None or self._assert_job_access is None:
            raise AppError(403, "Not a recruiter for this job", "FORBIDDEN")
        await self._assert_job_access(actor_id, job_id)
        if self._match_candidates is not None:
            try:
                try:
                    return await self._match_candidates(
                        job_id,
                        actor_id,
                        request.message,
                        request.rerank,
                        include_public=request.include_public if request.include_public is not None else True,
                        verified_only=bool(request.verified_only),
                        max_results=request.max_results,
                    )
                except TypeError:
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
        if request.include_public is False:
            candidates = [c for c in candidates if not c.is_public_candidate and c.current_status != "job_seeking"]
        if request.verified_only:
            candidates = [c for c in candidates if c.has_verified_skills]
        if request.max_results:
            candidates = candidates[:request.max_results]
        if not candidates:
            return ChatResponse(response="Chưa có CV nộp cho vị trí này.", candidates=[])
        return ChatResponse(
            response=f"Gợi ý {len(candidates)} ứng viên phù hợp.",
            candidates=candidates,
        )

    async def stream_chat(
        self, request: ChatRequest, actor_id: UUID | None = None
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Phát luồng trạng thái tiến trình (status) và nội dung tin nhắn (message/token) cho gợi ý."""
        # 1. Phát trạng thái bước đầu: xác thực và phân tích ý định
        yield {
            "event": "status",
            "data": {"step": "routing", "label": "Đang phân tích ý định và nội dung yêu cầu..."},
        }
        validated = validate_text(request.message, source="chat", max_chars=5000)
        guarded = gate_context(validated.text, source="chat", max_chars=5000)
        if guarded.action == "block":
            code = guarded.codes[0] if guarded.codes else "DATA_INJECTION_SIGNAL"
            raise BadRequestError("Yêu cầu không an toàn để xử lý", code=code)
        request = request.model_copy(update={"message": str(guarded.value)})
        classification = classify_intent(request.message)
        if (
            classification.intent in (IntentType.UNKNOWN, IntentType.OUT_OF_SCOPE)
            and not check_off_topic(request.message)
            and self._resolve_intent is not None
        ):
            try:
                classification = await self._resolve_intent(request.message)
            except Exception:
                logger.exception("semantic intent fallback failed")

        session_id = request.session_id or (uuid4() if actor_id is not None else None)
        expected_output = "text"
        response: ChatResponse | None = None

        if request.job_id is not None and actor_id is not None and self._assert_job_access is not None:
            await self._assert_job_access(actor_id, request.job_id)

        # Xử lý các intent trả về trực tiếp (chitchat, out of scope,...)
        if classification.intent == IntentType.UNSUPPORTED_LANGUAGE:
            response = ChatResponse(response=UNSUPPORTED_LANGUAGE_RESPONSE, session_id=session_id)
        elif classification.intent == IntentType.CHITCHAT:
            greeting = RECRUITER_CHITCHAT_RESPONSE if request.job_id is not None else CHITCHAT_RESPONSE
            response = ChatResponse(response=greeting, session_id=session_id)
        elif classification.intent == IntentType.OUT_OF_SCOPE:
            message = INVALID_RESPONSE if request.job_id is not None else OUT_OF_SCOPE_RESPONSE
            response = ChatResponse(response=message, session_id=session_id)
        elif classification.intent == IntentType.UNKNOWN:
            response = ChatResponse(response=UNKNOWN_RESPONSE, session_id=session_id)
        elif classification.intent in (IntentType.CONTENT_TOO_SHORT, IntentType.INVALID_FORMAT):
            response = ChatResponse(response=INVALID_RESPONSE, session_id=session_id)
        # Luồng nhà tuyển dụng: khớp ứng viên với công việc
        elif request.job_id is not None:
            if classification.intent in _RECRUITER_MATCH_INTENTS:
                expected_output = "candidates"
                async for item in self._stream_recommend_candidates(request, actor_id):
                    if item.get("event") == "_final_response":
                        response = item["data"]
                    else:
                        yield item
            else:
                response = ChatResponse(response=UNKNOWN_RESPONSE)
        # Luồng đánh giá kỹ năng / lộ trình CV
        elif classification.intent in _EVALUATION_INTENTS:
            async for item in self._stream_evaluation(request, actor_id):
                if item.get("event") == "_final_response":
                    response = item["data"]
                else:
                    yield item
        # Luồng gợi ý việc làm cho ứng viên
        elif classification.intent in _RECOMMEND_INTENTS and classification.dispatch_target == "recommend":
            expected_output = "jobs"
            async for item in self._stream_recommend_jobs(request, actor_id):
                if item.get("event") == "_final_response":
                    response = item["data"]
                else:
                    yield item
        else:
            response = ChatResponse(response=UNKNOWN_RESPONSE)

        if response is None:
            response = ChatResponse(response=UNKNOWN_RESPONSE)

        response.session_id = session_id
        response = _guard_chat_response(
            response,
            intent=classification.intent,
            expected_output=expected_output,
        )

        # Phát trạng thái hoàn tất xử lý logic và bắt đầu xuất kết quả
        yield {
            "event": "status",
            "data": {"step": "generating", "label": "Đang hoàn tất câu trả lời..."},
        }

        # Stream các token của tin nhắn phản hồi
        if response.response:
            words = response.response.split(" ")
            chunk_size = 4
            for i in range(0, len(words), chunk_size):
                chunk = " ".join(words[i : i + chunk_size])
                if i + chunk_size < len(words):
                    chunk += " "
                yield {"event": "token", "data": {"delta": chunk}}
                await asyncio.sleep(0.01)

        # Lưu lịch sử chat
        if actor_id is not None and self._client is not None and session_id is not None:
            await _save_message(
                self._client,
                actor_id,
                session_id,
                "user",
                request.message,
                [],
            )
            await _save_message(
                self._client,
                actor_id,
                session_id,
                "assistant",
                response.response,
                _serialize_recommendations(response),
            )

        # Phát sự kiện hoàn tất cuối cùng
        yield {
            "event": "complete",
            "data": response.model_dump(mode="json"),
        }

    async def _stream_recommend_jobs(
        self, request: ChatRequest, actor_id: UUID | None
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Phát luồng gợi ý việc làm phù hợp cho ứng viên."""
        if self._stream_recommend_jobs_fn is not None and actor_id is not None:
            try:
                try:
                    async for item in self._stream_recommend_jobs_fn(
                        actor_id,
                        request.message,
                        request.rerank,
                        resume_id=request.resume_id,
                        max_results=request.max_results,
                    ):
                        yield item
                    return
                except TypeError:
                    async for item in self._stream_recommend_jobs_fn(actor_id, request.message, request.rerank):
                        yield item
                    return
            except AppError:
                raise
            except Exception as exc:
                logger.exception("stream_recommend_jobs failed")
                raise AppError(502, "Không lấy được danh sách việc làm", "JOBS_UNAVAILABLE") from exc

        # Fallback chế độ đồng bộ khi không có generator chuyên dụng
        yield {
            "event": "status",
            "data": {"step": "retrieve", "label": "Đang truy xuất danh sách việc làm..."},
        }
        res = await self._recommend_jobs(request, actor_id)
        yield {
            "event": "status",
            "data": {"step": "score", "label": "Đã tính toán độ tương thích các vị trí tuyển dụng."},
        }
        yield {"event": "_final_response", "data": res}

    async def _stream_recommend_candidates(
        self, request: ChatRequest, actor_id: UUID | None
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Phát luồng gợi ý ứng viên phù hợp cho nhà tuyển dụng."""
        job_id = request.job_id
        if job_id is None or actor_id is None or self._assert_job_access is None:
            raise AppError(403, "Not a recruiter for this job", "FORBIDDEN")
        await self._assert_job_access(actor_id, job_id)

        if self._stream_match_candidates_fn is not None:
            try:
                try:
                    async for item in self._stream_match_candidates_fn(
                        job_id,
                        actor_id,
                        request.message,
                        request.rerank,
                        include_public=request.include_public if request.include_public is not None else True,
                        verified_only=bool(request.verified_only),
                        max_results=request.max_results,
                    ):
                        yield item
                    return
                except TypeError:
                    async for item in self._stream_match_candidates_fn(job_id, actor_id, request.message, request.rerank):
                        yield item
                    return
            except AppError:
                raise
            except Exception as exc:
                logger.exception("stream_match_candidates failed")
                raise AppError(502, "Không lấy được danh sách ứng viên", "CANDIDATES_UNAVAILABLE") from exc

        # Fallback chế độ đồng bộ
        yield {
            "event": "status",
            "data": {"step": "retrieve", "label": "Đang truy xuất danh sách ứng viên..."},
        }
        res = await self._recommend_candidates(request, actor_id)
        yield {
            "event": "status",
            "data": {"step": "score", "label": "Đã tính toán độ tương thích ứng viên."},
        }
        yield {"event": "_final_response", "data": res}

    async def _stream_evaluation(
        self, request: ChatRequest, actor_id: UUID | None
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Phát luồng phân tích kỹ năng hoặc tự đánh giá CV."""
        if self._stream_dispatch_evaluation_fn is not None and actor_id is not None:
            try:
                async for item in self._stream_dispatch_evaluation_fn(actor_id, request.message):
                    yield item
                return
            except AppError:
                raise
            except Exception as exc:
                logger.exception("stream_evaluation failed")
                raise AppError(502, "Không hoàn tất được đánh giá CV", "EVALUATION_FAILED") from exc

        if self._dispatch_evaluation is not None:
            yield {
                "event": "status",
                "data": {"step": "parse", "label": "Đang phân tích cấu trúc kỹ năng CV..."},
            }
            res = await self._dispatch_evaluation(actor_id, request.message)
            yield {"event": "_final_response", "data": res}
        else:
            yield {"event": "_final_response", "data": ChatResponse(response=UNKNOWN_RESPONSE)}
