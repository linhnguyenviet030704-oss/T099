"""Evaluation API Endpoints (Agent 1)."""

from __future__ import annotations

import logging
import uuid
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.clients.supabase import get_supabase_client
from backend.app.services.eval.github_parser import normalize_github_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/evaluations", tags=["evaluations"])

# In-memory storage fallback for status polling when DB is unavailable
_EVAL_STATUS_STORE: dict[str, dict[str, Any]] = {}


class EvaluateRequest(BaseModel):
    candidate_id: uuid.UUID
    repo_urls: list[str] = Field(..., min_length=1)
    selected_repos: list[str] | None = None  # null = all. Format: "owner/repo"


class EvaluateResponse(BaseModel):
    evaluation_id: uuid.UUID
    status: Literal["pending", "tier1_complete", "complete", "failed"]
    poll_url: str


@router.post("", response_model=EvaluateResponse, status_code=status.HTTP_202_ACCEPTED)
async def evaluate_projects(
    req: EvaluateRequest,
    background_tasks: BackgroundTasks,
) -> EvaluateResponse:
    """Trigger async repository evaluation pipeline for a candidate."""
    # 1. Validate repo URLs
    normalized_repos: list[str] = []
    for url in req.repo_urls:
        norm = normalize_github_url(url)
        if not norm:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid GitHub URL: {url}",
            )
        normalized_repos.append(norm)

    eval_id = uuid.uuid4()
    eval_id_str = str(eval_id)
    candidate_id_str = str(req.candidate_id)

    # Initialize store status
    _EVAL_STATUS_STORE[eval_id_str] = {
        "id": eval_id_str,
        "candidate_id": candidate_id_str,
        "repo_urls": req.repo_urls,
        "status": "pending",
        "results": {},
    }

    # 2. Dispatch Celery task or BackgroundTask
    try:
        from backend.app.tasks.eval_tasks import run_evaluation_pipeline

        # Try async celery apply_async
        run_evaluation_pipeline.delay(
            evaluation_id=eval_id_str,
            candidate_id=candidate_id_str,
            repo_urls=req.repo_urls,
            selected_repos=req.selected_repos,
        )
    except Exception as e:
        logger.warning("Celery dispatch failed or broker offline, running via BackgroundTasks: %s", e)
        from backend.app.tasks.eval_tasks import run_evaluation_pipeline

        background_tasks.add_task(
            run_evaluation_pipeline,
            evaluation_id=eval_id_str,
            candidate_id=candidate_id_str,
            repo_urls=req.repo_urls,
            selected_repos=req.selected_repos,
        )

    return EvaluateResponse(
        evaluation_id=eval_id,
        status="pending",
        poll_url=f"/api/v1/evaluations/{eval_id}",
    )


@router.get("/{evaluation_id}")
async def get_evaluation_status(evaluation_id: uuid.UUID) -> dict[str, Any]:
    """Get status and result of an evaluation."""
    eval_id_str = str(evaluation_id)

    # Check in-memory store first
    if eval_id_str in _EVAL_STATUS_STORE:
        return _EVAL_STATUS_STORE[eval_id_str]

    # Check Supabase candidate_projects
    try:
        db = get_supabase_client()
        resp = (
            db.table("candidate_projects")
            .select("*")
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        if resp.data:
            return {
                "id": eval_id_str,
                "status": "complete",
                "projects": resp.data,
            }
    except Exception as e:
        logger.warning("Supabase evaluation fetch error: %s", e)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation not found")
