"""Service dependencies - wires agents with per-agent model selection."""

from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

from fastapi import Depends

from backend.app.agents.evaluation import EvaluationAgent
from backend.app.agents.evaluation.types import EvaluationType, IntentType
from backend.app.agents.matching.graph import build_matching_graph
from backend.app.agents.recommend.graph import build_recommend_graph
from backend.app.agents.routing.intents import classify_intent
from backend.app.agents.routing.semantic import classify_intent_semantically
from backend.app.api.schemas.chat import ChatResponse
from backend.app.clients.supabase import get_supabase_client
from backend.app.config.env import settings
from backend.app.core.exceptions import AppError
from backend.app.observability.logger import get_logger, request_id_ctx
from backend.app.repositories.application_repository import ApplicationRepository
from backend.app.repositories.email_outbox_repository import EmailOutboxRepository
from backend.app.repositories.interview_invitation_repository import InterviewInvitationRepository
from backend.app.repositories.notification_repository import NotificationRepository
from backend.app.repositories.profile_repository import ProfileRepository
from backend.app.repositories.reputation_repository import ReputationRepository
from backend.app.services.admin_service import AdminService
from backend.app.services.application_service import ApplicationService
from backend.app.services.chat_service import ChatService, chat_response_from_graph, jobs_response_from_graph
from backend.app.services.matching.retrieve import persist_match_resume_rows, retrieve_for_job
from backend.app.services.matching.retrieve_jobs import persist_recommend_job_rows, retrieve_jobs_for_resume
from backend.app.services.matching.store import SupabaseResumeStore
from backend.app.services.notification_service import NotificationService
from backend.app.services.profile_service import ProfileService
from backend.app.services.recommend import (
    assert_recruiter_job_access,
    list_applications_for_job,
    list_published_jobs,
)
from backend.app.services.reputation_service import ReputationService
from backend.app.shared_brain.registry import get_brain
from supabase import Client

logger = get_logger(__name__)


def get_profile_repository(
    client: Client = Depends(get_supabase_client),
) -> ProfileRepository:
    return ProfileRepository(client)


def get_profile_service(
    repository: ProfileRepository = Depends(get_profile_repository),
) -> ProfileService:
    return ProfileService(repository)


def get_chat_service(client: Client = Depends(get_supabase_client)) -> ChatService:
    store = SupabaseResumeStore(client)

    # Get per-agent brains with correct models
    matching_brain = get_brain("matching")
    recommend_brain = get_brain("recommend")
    routing_brain = get_brain("routing")

    async def resolve_intent(message):
        # Lời gọi provider là đồng bộ, chuyển sang thread để không chặn event loop.
        return await asyncio.to_thread(
            classify_intent_semantically,
            message,
            complete=routing_brain.chat,
        )

    async def fetch_jobs() -> list:
        return await list_published_jobs(client)

    async def fetch_candidates(job_id, actor_id):
        return await list_applications_for_job(client, actor_id, job_id)

    async def assert_access(actor_id, job_id):
        await assert_recruiter_job_access(client, actor_id, job_id)

    async def match_candidates(
        job_id,
        actor_id,
        message,
        rerank,
        include_public: bool = True,
        verified_only: bool = False,
        max_results: int | None = None,
    ):
        async def retrieve(retrieve_job_id):
            return await retrieve_for_job(
                client,
                actor_id,
                retrieve_job_id,
                include_public=include_public,
                verified_only=verified_only,
                store=store,
                api_key=settings.qwen_api_key,
                base_url=settings.qwen_base_url,
            )

        graph = build_matching_graph(
            retrieve=retrieve,
            rerank_fn=None,
            explain_complete=matching_brain.chat,
            explain_api_key=settings.qwen_api_key,
            explain_base_url=settings.qwen_base_url,
            brain=matching_brain,
        )
        rid = request_id_ctx.get() or "-"
        result = await graph.ainvoke(
            {"job_id": str(job_id), "query": message, "rerank_mode": rerank},
            config={
                "run_name": "match_candidates_pipeline",
                "tags": ["matching", "recruiter", rerank],
                "metadata": {
                    "request_id": rid,
                    "job_id": str(job_id),
                    "actor_id": str(actor_id),
                },
            },
        )
        ranked = result.get("candidates") or []
        status = str((ranked[0].get("rerank_status") if ranked else None) or "not_requested")
        try:
            await persist_match_resume_rows(
                client,
                job_id,
                ranked,
                actor_id=actor_id,
                query_text=str(result.get("jd_query") or ""),
                recruiter_message=message,
                rerank_mode=rerank,
                rerank_status=status,
                pool_size=int(result.get("pool_size") or 0),
                pool_truncated=bool(result.get("pool_truncated") or False),
                dropped_count=int(result.get("dropped_count") or 0),
                pool_latency_warn=bool(result.get("pool_latency_warn") or False),
                embedding_mismatch_count=int(result.get("embedding_mismatch_count") or 0),
            )
        except Exception:
            logger.exception("match_resume persist failed")
        return chat_response_from_graph(result, max_results=max_results)

    async def stream_match_candidates(
        job_id,
        actor_id,
        message,
        rerank,
        include_public: bool = True,
        verified_only: bool = False,
        max_results: int | None = None,
    ):
        """Phát luồng tiến trình từng bước khi gợi ý ứng viên cho nhà tuyển dụng."""
        yield {
            "event": "status",
            "data": {"step": "retrieve", "label": "Đang truy xuất dữ liệu JD và danh sách hồ sơ ứng viên..."},
        }
        async def retrieve(retrieve_job_id):
            return await retrieve_for_job(
                client,
                actor_id,
                retrieve_job_id,
                include_public=include_public,
                verified_only=verified_only,
                store=store,
                api_key=settings.qwen_api_key,
                base_url=settings.qwen_base_url,
            )

        graph = build_matching_graph(
            retrieve=retrieve,
            rerank_fn=None,
            explain_complete=matching_brain.chat,
            explain_api_key=settings.qwen_api_key,
            explain_base_url=settings.qwen_base_url,
            brain=matching_brain,
        )
        rid = request_id_ctx.get() or "-"

        node_labels = {
            "retrieve": "Đã tải danh sách hồ sơ ứng viên.",
            "skill": "Đang trích xuất và đối chiếu kỹ năng từ bản mô tả công việc (JD)...",
            "rrf": "Đang tính điểm xếp hạng kết hợp đa tiêu chuẩn (RRF)...",
            "rerank": "Đang đánh giá chuyên sâu độ khớp hồ sơ bằng mô hình AI...",
            "snapshot": "Đã chọn lọc các ứng viên tiêu biểu.",
            "explain": "Đang tạo bản phân tích điểm mạnh cho từng ứng viên...",
            "output_guard": "Đang kiểm tra an toàn dữ liệu...",
            "respond": "Đang tổng hợp danh sách ứng viên phù hợp...",
        }

        final_state: dict[str, Any] = {"job_id": str(job_id), "query": message, "rerank_mode": rerank}
        async for chunk in graph.astream(
            {"job_id": str(job_id), "query": message, "rerank_mode": rerank},
            config={
                "run_name": "match_candidates_pipeline",
                "tags": ["matching", "recruiter", rerank],
                "metadata": {
                    "request_id": rid,
                    "job_id": str(job_id),
                    "actor_id": str(actor_id),
                },
            },
            stream_mode="updates",
        ):
            for node_name, node_update in chunk.items():
                if isinstance(node_update, dict):
                    final_state.update(node_update)
                label = node_labels.get(node_name, f"Đang xử lý bước {node_name}...")
                yield {
                    "event": "status",
                    "data": {"step": node_name, "label": label},
                }

        ranked = final_state.get("candidates") or []
        status = str((ranked[0].get("rerank_status") if ranked else None) or "not_requested")
        try:
            await persist_match_resume_rows(
                client,
                job_id,
                ranked,
                actor_id=actor_id,
                query_text=str(final_state.get("jd_query") or ""),
                recruiter_message=message,
                rerank_mode=rerank,
                rerank_status=status,
                pool_size=int(final_state.get("pool_size") or 0),
                pool_truncated=bool(final_state.get("pool_truncated") or False),
                dropped_count=int(final_state.get("dropped_count") or 0),
                pool_latency_warn=bool(final_state.get("pool_latency_warn") or False),
                embedding_mismatch_count=int(final_state.get("embedding_mismatch_count") or 0),
            )
        except Exception:
            logger.exception("match_resume persist failed")

        final_resp = chat_response_from_graph(final_state, max_results=max_results)
        yield {"event": "_final_response", "data": final_resp}

    async def recommend_jobs(
        actor_id,
        message,
        rerank,
        resume_id: UUID | None = None,
        max_results: int | None = None,
    ):
        payload = await retrieve_jobs_for_resume(
            client,
            actor_id,
            resume_id=resume_id,
            query=message,
            store=store,
            api_key=settings.qwen_api_key,
            base_url=settings.qwen_base_url,
        )
        if payload is None:
            return ChatResponse(
                response="Bạn chưa có CV mặc định để gợi ý việc làm phù hợp.", jobs=[]
            )

        async def retrieve():
            return payload

        graph = build_recommend_graph(
            retrieve=retrieve,
            rerank_fn=None,
            explain_complete=recommend_brain.chat,
            explain_api_key=settings.qwen_api_key,
            explain_base_url=settings.qwen_base_url,
            brain=recommend_brain,
        )
        rid = request_id_ctx.get() or "-"
        result = await graph.ainvoke(
            {"query": message, "rerank_mode": rerank},
            config={
                "run_name": "recommend_jobs_pipeline",
                "tags": ["recommend", "candidate", rerank],
                "metadata": {
                    "request_id": rid,
                    "actor_id": str(actor_id),
                },
            },
        )

        ranked = result.get("candidates") or []
        status = str((ranked[0].get("rerank_status") if ranked else None) or "not_requested")
        try:
            await persist_recommend_job_rows(
                client,
                actor_id,
                ranked,
                candidate_message=message,
                rerank_mode=rerank,
                rerank_status=status,
            )
        except Exception:
            logger.exception("recommend_job persist failed")

        return jobs_response_from_graph(result, max_results=max_results)

    async def stream_recommend_jobs(
        actor_id,
        message,
        rerank,
        resume_id: UUID | None = None,
        max_results: int | None = None,
    ):
        """Phát luồng tiến trình từng bước khi gợi ý việc làm cho ứng viên."""
        yield {
            "event": "status",
            "data": {"step": "retrieve", "label": "Đang truy xuất CV và danh sách việc làm phù hợp..."},
        }
        payload = await retrieve_jobs_for_resume(
            client,
            actor_id,
            resume_id=resume_id,
            query=message,
            store=store,
            api_key=settings.qwen_api_key,
            base_url=settings.qwen_base_url,
        )
        if payload is None:
            yield {
                "event": "_final_response",
                "data": ChatResponse(
                    response="Bạn chưa có CV mặc định để gợi ý việc làm phù hợp.", jobs=[]
                ),
            }
            return

        async def retrieve():
            return payload

        graph = build_recommend_graph(
            retrieve=retrieve,
            rerank_fn=None,
            explain_complete=recommend_brain.chat,
            explain_api_key=settings.qwen_api_key,
            explain_base_url=settings.qwen_base_url,
            brain=recommend_brain,
        )
        rid = request_id_ctx.get() or "-"

        node_labels = {
            "router": "Đang phân tích ý định tìm kiếm việc làm...",
            "retrieve": "Đã trích xuất thông tin CV và danh sách việc làm.",
            "kg_retrieval": "Đang đối chiếu đồ thị tri thức kỹ năng & liên kết ngành nghề...",
            "score": "Đang tính toán điểm tương thích cơ bản (Lexical + Semantic)...",
            "rerank": "Đang tái xếp hạng chuyên sâu bằng mô hình AI...",
            "snapshot": "Đã chọn lọc các vị trí việc làm phù hợp nhất.",
            "explain": "Đang phân tích và tạo giải thích điểm phù hợp cho từng vị trí...",
            "advice": "Đang phân tích khoảng cách kỹ năng và lập lộ trình phát triển...",
            "output_guard": "Đang kiểm tra an toàn dữ liệu...",
            "respond": "Đang tổng hợp câu trả lời...",
        }

        final_state: dict[str, Any] = {"query": message, "rerank_mode": rerank}
        async for chunk in graph.astream(
            {"query": message, "rerank_mode": rerank},
            config={
                "run_name": "recommend_jobs_pipeline",
                "tags": ["recommend", "candidate", rerank],
                "metadata": {
                    "request_id": rid,
                    "actor_id": str(actor_id),
                },
            },
            stream_mode="updates",
        ):
            for node_name, node_update in chunk.items():
                if isinstance(node_update, dict):
                    final_state.update(node_update)
                label = node_labels.get(node_name, f"Đang xử lý bước {node_name}...")
                yield {
                    "event": "status",
                    "data": {"step": node_name, "label": label},
                }

        ranked = final_state.get("candidates") or []
        status = str((ranked[0].get("rerank_status") if ranked else None) or "not_requested")
        try:
            await persist_recommend_job_rows(
                client,
                actor_id,
                ranked,
                candidate_message=message,
                rerank_mode=rerank,
                rerank_status=status,
            )
        except Exception:
            logger.exception("recommend_job persist failed")

        final_resp = jobs_response_from_graph(final_state, max_results=max_results)
        yield {"event": "_final_response", "data": final_resp}

    async def dispatch_evaluation(actor_id, message):
        classification = classify_intent(message)
        if classification.intent not in (IntentType.SKILL_GAP_ADVICE, IntentType.SELF_EVALUATE):
            raise AppError(400, "Intent not supported for evaluation dispatch", "INVALID_EVAL_INTENT")

        if actor_id is None:
            return ChatResponse(response="Không xác định được người dùng.")

        eval_type = EvaluationType.SKILL_ONLY if classification.intent == IntentType.SKILL_GAP_ADVICE else EvaluationType.FULL

        # Load default CV from DB
        try:
            payload = await retrieve_jobs_for_resume(
                client,
                actor_id,
                query="",
                store=store,
                api_key=settings.qwen_api_key,
                base_url=settings.qwen_base_url,
            )
        except Exception:
            payload = None

        if payload is None or not payload.get("cv_text"):
            return ChatResponse(response="Bạn chưa có CV mặc định để phân tích. Vui lòng tải lên CV trước.")

        cv_text = payload.get("cv_text") or ""

        try:
            evaluation_brain = get_brain("evaluation")
        except Exception:
            evaluation_brain = None

        agent = EvaluationAgent(brain=evaluation_brain)
        result = await agent.evaluate(
            cv_text=cv_text,
            jd_text=None,
            evaluation_type=eval_type,
            needs_vector_search=False,
        )

        api_response = result.to_api_response()
        summary = api_response.get("summary")
        if not summary:
            skill_analysis = result.skill_analysis
            matched = skill_analysis.matched_skills[:5] if skill_analysis and skill_analysis.matched_skills else []
            missing = skill_analysis.missing_critical[:5] if skill_analysis and skill_analysis.missing_critical else []
            lines = []
            if matched:
                lines.append(f"**Kỹ năng đáp ứng ({len(matched)}):** {', '.join(matched)}")
            if missing:
                lines.append(f"**Kỹ năng cần bổ sung ({len(missing)}):** {', '.join(missing)}")
            lines.append(f"\n**Điểm tổng quan:** {result.overall_score:.0f}/100")
            if result.recommendations:
                lines.append(f"\n**Khuyến nghị:** {result.recommendations[0]}")
            summary = "\n".join(lines) if lines else f"Điểm tổng quan CV của bạn: {result.overall_score:.0f}/100."

        return ChatResponse(response=summary)

    async def stream_dispatch_evaluation(actor_id, message):
        """Phát luồng phân tích kỹ năng và đánh giá CV."""
        classification = classify_intent(message)
        if classification.intent not in (IntentType.SKILL_GAP_ADVICE, IntentType.SELF_EVALUATE):
            raise AppError(400, "Intent not supported for evaluation dispatch", "INVALID_EVAL_INTENT")

        if actor_id is None:
            yield {"event": "_final_response", "data": ChatResponse(response="Không xác định được người dùng.")}
            return

        yield {
            "event": "status",
            "data": {"step": "retrieve_cv", "label": "Đang tải hồ sơ CV mặc định..."},
        }
        eval_type = EvaluationType.SKILL_ONLY if classification.intent == IntentType.SKILL_GAP_ADVICE else EvaluationType.FULL

        try:
            payload = await retrieve_jobs_for_resume(
                client,
                actor_id,
                query="",
                store=store,
                api_key=settings.qwen_api_key,
                base_url=settings.qwen_base_url,
            )
        except Exception:
            payload = None

        if payload is None or not payload.get("cv_text"):
            yield {
                "event": "_final_response",
                "data": ChatResponse(response="Bạn chưa có CV mặc định để phân tích. Vui lòng tải lên CV trước."),
            }
            return

        cv_text = payload.get("cv_text") or ""
        try:
            evaluation_brain = get_brain("evaluation")
        except Exception:
            evaluation_brain = None

        agent = EvaluationAgent(brain=evaluation_brain)
        eval_node_labels = {
            "parse": "Đang trích xuất và phân tích cấu trúc thông tin CV...",
            "retrieve": "Đang tra cứu hồ sơ tham chiếu và đối sánh...",
            "score": "Đang tính toán phân tích khoảng cách kỹ năng (Skill Gap)...",
            "report": "Đang tạo báo cáo đánh giá và khuyến nghị phát triển...",
        }

        final_eval_state: dict[str, Any] = {}
        async for chunk in agent.evaluate_stream(
            cv_text=cv_text,
            jd_text=None,
            evaluation_type=eval_type,
            needs_vector_search=False,
        ):
            if isinstance(chunk, dict):
                for node_name, node_state in chunk.items():
                    if isinstance(node_state, dict):
                        final_eval_state.update(node_state)
                    label = eval_node_labels.get(node_name, f"Đang xử lý bước {node_name}...")
                    yield {
                        "event": "status",
                        "data": {"step": node_name, "label": label},
                    }

        result = final_eval_state.get("result")
        if result is not None:
            api_response = result.to_api_response()
            summary = api_response.get("summary")
            if not summary:
                skill_analysis = result.skill_analysis
                matched = skill_analysis.matched_skills[:5] if skill_analysis and skill_analysis.matched_skills else []
                missing = skill_analysis.missing_critical[:5] if skill_analysis and skill_analysis.missing_critical else []
                lines = []
                if matched:
                    lines.append(f"**Kỹ năng đáp ứng ({len(matched)}):** {', '.join(matched)}")
                if missing:
                    lines.append(f"**Kỹ năng cần bổ sung ({len(missing)}):** {', '.join(missing)}")
                lines.append(f"\n**Điểm tổng quan:** {result.overall_score:.0f}/100")
                if result.recommendations:
                    lines.append(f"\n**Khuyến nghị:** {result.recommendations[0]}")
                summary = "\n".join(lines) if lines else f"Điểm tổng quan CV của bạn: {result.overall_score:.0f}/100."
        else:
            summary = final_eval_state.get("response") or "Hoàn tất phân tích CV."

        yield {"event": "_final_response", "data": ChatResponse(response=summary)}

    return ChatService(
        fetch_jobs, fetch_candidates, assert_access, match_candidates,
        recommend_jobs, dispatch_evaluation=dispatch_evaluation,
        resolve_intent=resolve_intent, supabase_client=client,
        stream_recommend_jobs=stream_recommend_jobs,
        stream_match_candidates=stream_match_candidates,
        stream_dispatch_evaluation=stream_dispatch_evaluation,
    )


def get_admin_service(
    repository: ProfileRepository = Depends(get_profile_repository),
) -> AdminService:
    return AdminService(repository)


def get_notification_repository(
    client: Client = Depends(get_supabase_client),
) -> NotificationRepository:
    return NotificationRepository(client)


def get_notification_service(
    repository: NotificationRepository = Depends(get_notification_repository),
) -> NotificationService:
    return NotificationService(repository)


def get_application_repository(
    client: Client = Depends(get_supabase_client),
) -> ApplicationRepository:
    return ApplicationRepository(client)


def get_email_outbox_repository(
    client: Client = Depends(get_supabase_client),
) -> EmailOutboxRepository:
    return EmailOutboxRepository(client)


def get_interview_invitation_repository(
    client: Client = Depends(get_supabase_client),
) -> InterviewInvitationRepository:
    return InterviewInvitationRepository(client)


def get_application_service(
    repository: ApplicationRepository = Depends(get_application_repository),
    email_repo: EmailOutboxRepository = Depends(get_email_outbox_repository),
    interview_repo: InterviewInvitationRepository = Depends(get_interview_invitation_repository),
    client: Client = Depends(get_supabase_client),
) -> ApplicationService:
    return ApplicationService(repository, email_repo, client, interview_repo)


def get_reputation_repository(
    client: Client = Depends(get_supabase_client),
) -> ReputationRepository:
    return ReputationRepository(client)


def get_reputation_service(
    repository: ReputationRepository = Depends(get_reputation_repository),
) -> ReputationService:
    return ReputationService(repository)



# === Per-agent brain accessors ===

def get_routing_brain():
    """Routing agent brain - LIGHT model."""
    return get_brain("routing")


def get_evaluation_brain():
    """Evaluation agent brain - MAX model."""
    return get_brain("evaluation")


def get_ingest_brain():
    """Ingest agent brain - PRO model."""
    return get_brain("ingest")


def get_matching_brain():
    """Matching agent brain - PRO model."""
    return get_brain("matching")


def get_recommend_brain():
    """Recommend agent brain - PRO model."""
    return get_brain("recommend")
