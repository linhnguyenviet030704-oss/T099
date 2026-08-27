"""Service dependencies - wires agents with per-agent model selection."""

from __future__ import annotations

from uuid import UUID

from fastapi import Depends

from backend.app.agents.evaluation import EvaluationAgent
from backend.app.agents.evaluation.types import EvaluationType, IntentType
from backend.app.agents.matching.graph import build_matching_graph
from backend.app.agents.recommend.graph import build_recommend_graph
from backend.app.agents.routing.intents import classify_intent
from backend.app.api.schemas.chat import ChatResponse
from backend.app.clients.supabase import get_supabase_client
from backend.app.config.env import settings
from backend.app.core.exceptions import AppError
from backend.app.observability.logger import get_logger, request_id_ctx
from backend.app.repositories.profile_repository import ProfileRepository
from backend.app.services.admin_service import AdminService
from backend.app.services.chat_service import ChatService, chat_response_from_graph, jobs_response_from_graph
from backend.app.services.matching.retrieve import persist_match_resume_rows, retrieve_for_job
from backend.app.services.matching.retrieve_jobs import persist_recommend_job_rows, retrieve_jobs_for_resume
from backend.app.services.matching.store import SupabaseResumeStore
from backend.app.services.profile_service import ProfileService
from backend.app.services.recommend import (
    assert_recruiter_job_access,
    list_applications_for_job,
    list_published_jobs,
)
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
            )
        except Exception:
            logger.exception("match_resume persist failed")
        return chat_response_from_graph(result, max_results=max_results)

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
            matched = skill_analysis.matched_skills[:5] if skill_analysis.matched_skills else []
            missing = skill_analysis.missing_critical[:5] if skill_analysis.missing_critical else []
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

    return ChatService(
        fetch_jobs, fetch_candidates, assert_access, match_candidates,
        recommend_jobs, dispatch_evaluation=dispatch_evaluation, supabase_client=client,
    )


def get_admin_service(
    repository: ProfileRepository = Depends(get_profile_repository),
) -> AdminService:
    return AdminService(repository)


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
