"""Celery tasks for Interview Question Generation (Agent 2)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from backend.app.agents.interview.graph import agent2_graph
from backend.app.clients.supabase import get_supabase_client
from backend.app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


def execute_interview_generation_sync(
    session_id: str,
    candidate_id: str,
    job_id: str,
    question_count_range: tuple[int, int] = (5, 15),
    coverage_threshold: float = 0.80,
    include_project_refs: bool = True,
) -> dict[str, Any]:
    """Thực thi pipeline sinh bộ câu hỏi phỏng vấn và cập nhật in-memory store."""
    async def _process_generation() -> dict[str, Any]:
        state_input = {
            "session_id": session_id,
            "candidate_id": candidate_id,
            "job_id": job_id,
            "question_count_range": question_count_range,
            "coverage_threshold": coverage_threshold,
            "status": "generating",
        }

        res = await agent2_graph.ainvoke(
            state_input,
            config={"configurable": {"thread_id": f"{session_id}_{job_id}"}},
        )

        return {
            "session_id": session_id,
            "status": res.get("status", "generated"),
            "questions": res.get("generated_questions", []),
            "validation_result": res.get("validation_result"),
            "distribution": res.get("question_distribution"),
        }

    try:
        results = asyncio.run(_process_generation())
        # Cập nhật kết quả vào bộ nhớ tạm in-memory store để polling trả về ngay
        try:
            from backend.app.api.v1.interviews import _INTERVIEW_STATUS_STORE

            _INTERVIEW_STATUS_STORE[session_id] = {
                "id": session_id,
                "candidate_id": candidate_id,
                "job_id": job_id,
                "status": results.get("status", "generated"),
                "questions": results.get("questions", []),
                "coverage_ratio": (results.get("validation_result") or {}).get("ratio", 1.0),
                "coverage_threshold": coverage_threshold,
                "question_distribution": results.get("distribution") or {},
                "is_approved": False,
                "reviewer_notes": None,
            }
        except Exception as e:
            logger.warning("Could not update in-memory store: %s", e)

        return results
    except Exception as exc:
        logger.error("Fatal error in execute_interview_generation_sync: %s", exc)
        try:
            from backend.app.api.v1.interviews import _INTERVIEW_STATUS_STORE

            _INTERVIEW_STATUS_STORE[session_id] = {
                "id": session_id,
                "candidate_id": candidate_id,
                "job_id": job_id,
                "status": "failed",
                "error": str(exc),
                "questions": [],
            }
        except Exception:
            pass

        try:
            db = get_supabase_client()
            db.table("interview_sessions").update({"status": "failed"}).eq("id", session_id).execute()
        except Exception:
            pass
        return {
            "session_id": session_id,
            "error": str(exc),
            "status": "failed",
        }


@celery_app.task(bind=True, max_retries=3)
def run_interview_pipeline(
    self: Any,
    session_id: str,
    candidate_id: str,
    job_id: str,
    question_count_range: tuple[int, int] = (5, 15),
    coverage_threshold: float = 0.80,
    include_project_refs: bool = True,
) -> dict[str, Any]:
    """Celery task entry point for interview pipeline."""
    return execute_interview_generation_sync(
        session_id=session_id,
        candidate_id=candidate_id,
        job_id=job_id,
        question_count_range=question_count_range,
        coverage_threshold=coverage_threshold,
        include_project_refs=include_project_refs,
    )
