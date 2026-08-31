"""Evaluation API Endpoints (Agent 1)."""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncGenerator
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.app.agents.eval.graph import agent1_graph
from backend.app.clients.supabase import get_supabase_client
from backend.app.guardrails.input import MAX_CV_BYTES, validate_file
from backend.app.services.eval.cv_repo_extractor import extract_cv_repos_and_projects
from backend.app.services.eval.github_parser import normalize_github_url
from backend.app.services.matching.parse import parse_resume_bytes
from backend.app.services.matching.store import SupabaseResumeStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/evaluations", tags=["evaluations"])

# In-memory storage fallback for status polling when DB is unavailable
_EVAL_STATUS_STORE: dict[str, dict[str, Any]] = {}


class ExtractCvReposRequest(BaseModel):
    resume_id: uuid.UUID | None = None
    cv_text: str | None = None
    profile_url: str | None = None


class ExtractedRepoItem(BaseModel):
    repo_url: str
    repo_name: str
    repo_full_name: str
    project_name: str
    match_type: str
    match_reason: str
    description: str = ""
    language: str = ""
    stars: int = 0


class ExtractCvReposResponse(BaseModel):
    found: bool
    repos: list[ExtractedRepoItem] | None = None
    profile_url: str | None = None
    projects_found: list[str] = Field(default_factory=list)
    message: str


class EvaluateSingleRequest(BaseModel):
    candidate_id: str | None = None
    repo_url: str
    project_name: str | None = None


class EvaluateSingleResponse(BaseModel):
    repo_full_name: str
    repo_url: str
    project_name: str | None = None
    overall_score: float
    evaluation_scores: dict[str, Any]
    heuristic_metrics: dict[str, Any] | None = None
    summary: str
    red_flags: list[str] = Field(default_factory=list)
    evaluation_tier: str = "full"
    status: str = "complete"
    error: str | None = None


class SaveRepoSearchHistoryRequest(BaseModel):
    id: str | None = None
    user_id: str | None = None
    search_type: Literal["cv", "direct_url"] = "cv"
    title: str
    resume_id: str | None = None
    cv_preview: str | None = None
    profile_url: str | None = None
    extracted_repos: list[dict[str, Any]] = Field(default_factory=list)
    evaluation_results: list[dict[str, Any]] = Field(default_factory=list)
    status: Literal["starting", "evaluating", "completed", "no_repos", "failed"] = "completed"
    report_message: str | None = None


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


@router.post("/extract-cv-repos", response_model=ExtractCvReposResponse)
async def extract_cv_repositories(req: ExtractCvReposRequest) -> ExtractCvReposResponse:
    """Extract project information and GitHub repository/profile URLs from a CV.

    If a profile URL is found without direct repos, matches public repos with CV projects.
    If no repos are found, returns found=False and repos=None with an explanation message.
    """
    cv_text = (req.cv_text or "").strip()

    # If resume_id is provided and cv_text is empty, look up CV from DB
    if not cv_text and req.resume_id:
        try:
            db = get_supabase_client()
            # 1. Try embedded_resumes table for clean_markdown
            embed_res = (
                db.table("embedded_resumes")
                .select("clean_markdown, markdown, metadata")
                .eq("resume_id", str(req.resume_id))
                .maybe_single()
                .execute()
            )
            if embed_res and embed_res.data:
                cv_text = (
                    embed_res.data.get("clean_markdown")
                    or embed_res.data.get("markdown")
                    or ""
                )

            # 2. If still empty, download from Storage and parse directly
            if not cv_text or len(cv_text.strip()) < 30:
                resume_row = (
                    db.table("resumes")
                    .select("id, user_id, title, storage_path, bucket_id, mime_type")
                    .eq("id", str(req.resume_id))
                    .maybe_single()
                    .execute()
                )
                if resume_row and resume_row.data:
                    storage_path = resume_row.data.get("storage_path")
                    bucket_id = resume_row.data.get("bucket_id") or "resumes"
                    if storage_path:
                        store = SupabaseResumeStore(db)
                        blob = await store.download(bucket_id, storage_path)
                        validated = validate_file(
                            blob,
                            declared_mime=resume_row.data.get("mime_type") or "",
                            max_bytes=MAX_CV_BYTES,
                        )
                        parsed_local = parse_resume_bytes(validated.data, mime_type=validated.detected_mime)
                        cv_text = str(parsed_local.get("markdown") or "")

                    # Fallback 3: Tái tạo từ profile_lines nếu tệp không có text layer (file scan/ảnh)
                    if not cv_text or len(cv_text.strip()) < 30:
                        owner_id = resume_row.data.get("user_id")
                        if owner_id:
                            prof = db.table("profiles").select("*").eq("id", owner_id).maybe_single().execute()
                            lns = db.table("profile_lines").select("*").eq("user_id", owner_id).order("display_order").execute()
                            if lns and lns.data:
                                from backend.app.api.routes.evaluation import _build_cv_from_profile_lines
                                reconstructed = _build_cv_from_profile_lines(prof.data if prof else None, lns.data)
                                if len(reconstructed.strip()) >= 30:
                                    cv_text = reconstructed
        except Exception as e:
            logger.warning("Could not fetch/download CV markdown from DB for resume %s: %s", req.resume_id, e)

    if req.profile_url:
        cv_text = f"{cv_text}\nGitHub: {req.profile_url}"

    result = await extract_cv_repos_and_projects(cv_text)

    repos_data = None
    if result.get("repos"):
        repos_data = [
            ExtractedRepoItem(
                repo_url=r["repo_url"],
                repo_name=r["repo_name"],
                repo_full_name=r.get("repo_full_name") or r["repo_name"],
                project_name=r.get("project_name") or r["repo_name"],
                match_type=r.get("match_type", "direct_url"),
                match_reason=r.get("match_reason", ""),
                description=r.get("description", ""),
                language=r.get("language", ""),
                stars=r.get("stars", 0),
            )
            for r in result["repos"]
        ]

    return ExtractCvReposResponse(
        found=result.get("found", False),
        repos=repos_data,
        profile_url=result.get("profile_url"),
        projects_found=result.get("projects_found", []),
        message=result.get("message", ""),
    )


@router.post("/evaluate-single", response_model=EvaluateSingleResponse)
async def evaluate_single_repo(req: EvaluateSingleRequest) -> EvaluateSingleResponse:
    """Evaluate a single GitHub repository using Agent 1 (Heuristic + LLM Code Judge).

    Returns evaluation results immediately for real-time progressive display on the UI.
    """
    norm = normalize_github_url(req.repo_url)
    if not norm:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid GitHub URL: {req.repo_url}",
        )

    cand_id = req.candidate_id or "00000000-0000-0000-0000-000000000000"
    state_input = {
        "candidate_id": cand_id,
        "repo_url": f"https://github.com/{norm}",
        "status": "pending",
    }

    try:
        res = await agent1_graph.ainvoke(
            state_input,
            config={"configurable": {"thread_id": f"single_{cand_id}_{norm}"}},
        )

        final_scores = res.get("final_scores") or {
            "completeness": 7.0,
            "complexity": 7.0,
            "optimization": 7.0,
            "code_cleanliness": 7.0,
            "project_understanding": 7.0,
            "weighted_score": 7.0,
        }
        overall_score = float(final_scores.get("weighted_score", 7.0))
        heuristic_metrics = res.get("heuristic_metrics")
        summary = res.get("summary") or "Đã hoàn thành đánh giá kỹ thuật dự án."
        llm_eval = res.get("llm_evaluation") or {}
        red_flags = llm_eval.get("red_flags") or []
        tier = "heuristic_only" if res.get("should_skip_tier2") or llm_eval.get("heuristic_fallback") else "full"

        return EvaluateSingleResponse(
            repo_full_name=norm,
            repo_url=f"https://github.com/{norm}",
            project_name=req.project_name or norm.split("/")[-1],
            overall_score=round(overall_score, 1),
            evaluation_scores=final_scores,
            heuristic_metrics=heuristic_metrics,
            summary=summary,
            red_flags=red_flags,
            evaluation_tier=tier,
            status="complete",
            error=res.get("error"),
        )
    except Exception as e:
        logger.error("Error evaluating single repo %s: %s", req.repo_url, e)
        return EvaluateSingleResponse(
            repo_full_name=norm,
            repo_url=f"https://github.com/{norm}",
            project_name=req.project_name or norm.split("/")[-1],
            overall_score=5.0,
            evaluation_scores={
                "completeness": 5.0,
                "complexity": 5.0,
                "optimization": 5.0,
                "code_cleanliness": 5.0,
                "project_understanding": 5.0,
                "weighted_score": 5.0,
            },
            heuristic_metrics=None,
            summary=f"Không thể hoàn thành đánh giá: {e}",
            red_flags=["Lỗi kết nối hoặc phân tích mã nguồn repository."],
            evaluation_tier="failed",
            status="failed",
            error=str(e),
        )


async def stream_evaluate_single_repo(
    req: EvaluateSingleRequest,
) -> AsyncGenerator[dict[str, Any], None]:
    """Phát luồng tiến trình đánh giá repository chi tiết qua LangGraph."""
    norm = normalize_github_url(req.repo_url)
    if not norm:
        yield {
            "event": "error",
            "data": {"error": f"URL GitHub không hợp lệ: {req.repo_url}"},
        }
        return

    cand_id = req.candidate_id or "00000000-0000-0000-0000-000000000000"
    state_input = {
        "candidate_id": cand_id,
        "repo_url": f"https://github.com/{norm}",
        "status": "pending",
    }

    node_labels = {
        "preflight": "Đang kiểm tra URL và thông tin repository...",
        "tier1_heuristic": "Đang quét cấu trúc tệp tin, test files, CI/CD, Docker...",
        "tier2_select_files": "Đang lựa chọn các file mã nguồn trọng tâm...",
        "tier2_fetch_content": "Đang tải nội dung file mã nguồn từ GitHub...",
        "tier2_llm_evaluate": "Đang chấm điểm bằng mô hình AI Code Judge...",
        "compute_heuristic_only": "Đang tổng hợp điểm số dựa trên heuristic...",
        "persist_results": "Đang lưu kết quả đánh giá vào hệ thống...",
    }

    yield {
        "event": "status",
        "data": {"step": "init", "label": f"Bắt đầu đánh giá repo: {norm}..."},
    }

    final_state: dict[str, Any] = dict(state_input)
    try:
        async for chunk in agent1_graph.astream(
            state_input,
            config={"configurable": {"thread_id": f"single_stream_{cand_id}_{norm}"}},
            stream_mode="updates",
        ):
            if isinstance(chunk, dict):
                for node_name, node_update in chunk.items():
                    if isinstance(node_update, dict):
                        final_state.update(node_update)
                    label = node_labels.get(node_name, f"Đang xử lý bước {node_name}...")
                    yield {
                        "event": "status",
                        "data": {"step": node_name, "label": label},
                    }

        final_scores = final_state.get("final_scores") or {
            "completeness": 7.0,
            "complexity": 7.0,
            "optimization": 7.0,
            "code_cleanliness": 7.0,
            "project_understanding": 7.0,
            "weighted_score": 7.0,
        }
        overall_score = float(final_scores.get("weighted_score", 7.0))
        heuristic_metrics = final_state.get("heuristic_metrics")
        summary = final_state.get("summary") or "Đã hoàn thành đánh giá kỹ thuật dự án."
        llm_eval = final_state.get("llm_evaluation") or {}
        red_flags = llm_eval.get("red_flags") or []
        tier = "heuristic_only" if final_state.get("should_skip_tier2") or llm_eval.get("heuristic_fallback") else "full"

        result = EvaluateSingleResponse(
            repo_full_name=norm,
            repo_url=f"https://github.com/{norm}",
            project_name=req.project_name or norm.split("/")[-1],
            overall_score=round(overall_score, 1),
            evaluation_scores=final_scores,
            heuristic_metrics=heuristic_metrics,
            summary=summary,
            red_flags=red_flags,
            evaluation_tier=tier,
            status="complete",
            error=final_state.get("error"),
        )
        yield {
            "event": "complete",
            "data": result.model_dump(),
        }
    except Exception as e:
        logger.error("Lỗi khi stream đánh giá repo %s: %s", req.repo_url, e)
        fallback = EvaluateSingleResponse(
            repo_full_name=norm,
            repo_url=f"https://github.com/{norm}",
            project_name=req.project_name or norm.split("/")[-1],
            overall_score=5.0,
            evaluation_scores={
                "completeness": 5.0,
                "complexity": 5.0,
                "optimization": 5.0,
                "code_cleanliness": 5.0,
                "project_understanding": 5.0,
                "weighted_score": 5.0,
            },
            heuristic_metrics=None,
            summary=f"Không thể hoàn thành đánh giá: {e}",
            red_flags=["Lỗi kết nối hoặc phân tích mã nguồn repository."],
            evaluation_tier="failed",
            status="failed",
            error=str(e),
        )
        yield {
            "event": "complete",
            "data": fallback.model_dump(),
        }


@router.post("/evaluate-single/stream")
async def evaluate_single_repo_stream(req: EvaluateSingleRequest) -> StreamingResponse:
    """Phát luồng Server-Sent Events cho quá trình đánh giá đơn repository."""
    async def event_generator():
        async for event in stream_evaluate_single_repo(req):
            event_name = event.get("event", "message")
            event_data = json.dumps(event.get("data", {}), ensure_ascii=False)
            yield f"event: {event_name}\ndata: {event_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/history")
async def save_repo_search_history(req: SaveRepoSearchHistoryRequest) -> dict[str, Any]:
    """Save or update repository search and evaluation history in Supabase."""
    history_id = req.id or str(uuid.uuid4())

    data = {
        "id": history_id,
        "search_type": req.search_type,
        "title": req.title,
        "cv_preview": req.cv_preview,
        "profile_url": req.profile_url,
        "extracted_repos": req.extracted_repos,
        "evaluation_results": req.evaluation_results,
        "status": req.status,
        "report_message": req.report_message,
    }
    if req.user_id:
        data["user_id"] = req.user_id
    if req.resume_id:
        data["resume_id"] = req.resume_id

    try:
        db = get_supabase_client()
        # Upsert record in repo_search_history
        db.table("repo_search_history").upsert(data).execute()
        return {"id": history_id, "status": "saved"}
    except Exception as e:
        logger.warning("Could not persist repo search history to Supabase: %s", e)
        return {"id": history_id, "status": "fallback_saved", "warning": str(e)}


@router.get("/history")
async def get_repo_search_history(
    user_id: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Retrieve repository search history from Supabase."""
    try:
        db = get_supabase_client()
        query = db.table("repo_search_history").select("*").order("created_at", desc=True).limit(limit)
        if user_id:
            query = query.eq("user_id", user_id)
        resp = query.execute()
        return resp.data or []
    except Exception as e:
        logger.warning("Could not fetch repo search history from Supabase: %s", e)
        return []


@router.delete("/history/{history_id}")
async def delete_repo_search_history(history_id: str) -> dict[str, Any]:
    """Delete a repository search history record from Supabase."""
    try:
        db = get_supabase_client()
        db.table("repo_search_history").delete().eq("id", history_id).execute()
        return {"id": history_id, "deleted": True}
    except Exception as e:
        logger.warning("Could not delete repo search history %s: %s", history_id, e)
        return {"id": history_id, "deleted": False, "error": str(e)}


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
