from __future__ import annotations

from fastapi import Depends

from backend.app.agents.matching.graph import build_matching_graph
from backend.app.agents.recommend.graph import build_recommend_graph
from backend.app.api.schemas.chat import ChatResponse
from backend.app.clients.supabase import get_supabase_client
from backend.app.config.env import settings
from backend.app.observability.logger import get_logger
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

    async def fetch_jobs() -> list:
        return await list_published_jobs(client)

    async def fetch_candidates(job_id, actor_id):
        return await list_applications_for_job(client, actor_id, job_id)

    async def assert_access(actor_id, job_id):
        await assert_recruiter_job_access(client, actor_id, job_id)

    async def match_candidates(job_id, actor_id, message, rerank):
        async def retrieve(retrieve_job_id):
            return await retrieve_for_job(
                client,
                actor_id,
                retrieve_job_id,
                store=store,
                api_key=settings.qwen_api_key,
                base_url=settings.qwen_base_url,
            )

        graph = build_matching_graph(
            retrieve=retrieve,
            rerank_fn=None,
            explain_api_key=settings.qwen_api_key,
            explain_base_url=settings.qwen_base_url,
        )
        result = await graph.ainvoke(
            {"job_id": str(job_id), "query": message, "rerank_mode": rerank}
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
        return chat_response_from_graph(result)

    async def recommend_jobs(actor_id, message, rerank):
        payload = await retrieve_jobs_for_resume(
            client,
            actor_id,
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
            explain_api_key=settings.qwen_api_key,
            explain_base_url=settings.qwen_base_url,
        )
        result = await graph.ainvoke({"query": message, "rerank_mode": rerank})

        # Persist audit log for analytics
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

        return jobs_response_from_graph(result)

    return ChatService(fetch_jobs, fetch_candidates, assert_access, match_candidates, recommend_jobs)


def get_admin_service(
    repository: ProfileRepository = Depends(get_profile_repository),
) -> AdminService:
    return AdminService(repository)
