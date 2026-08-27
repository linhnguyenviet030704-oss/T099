"""Interview API Endpoints (Agent 2)."""

from __future__ import annotations

import logging
import uuid
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.clients.supabase import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/interviews", tags=["interviews"])

# In-memory storage fallback for status polling when DB is unavailable
_INTERVIEW_STATUS_STORE: dict[str, dict[str, Any]] = {}


class GenerateInterviewRequest(BaseModel):
    candidate_id: str | uuid.UUID = Field(..., description="ID của ứng viên")
    job_id: str | uuid.UUID | None = Field(default=None, description="ID của bài đăng tuyển dụng")
    question_count_range: tuple[int, int] | list[int] = Field(default=(5, 30))
    coverage_threshold: float = Field(default=0.80, ge=0.0, le=1.0)
    include_project_refs: bool = True


class GenerateInterviewResponse(BaseModel):
    session_id: uuid.UUID | str
    status: Literal["generating", "generated", "failed"]
    poll_url: str


class UpdateSessionRequest(BaseModel):
    is_approved: bool | None = None
    reviewer_notes: str | None = None


@router.post("/generate", response_model=GenerateInterviewResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate_interview(
    req: GenerateInterviewRequest,
    background_tasks: BackgroundTasks,
) -> GenerateInterviewResponse:
    """Kích hoạt sinh bộ câu hỏi phỏng vấn theo hồ sơ ứng viên và JD."""
    session_id = uuid.uuid4()
    session_id_str = str(session_id)
    candidate_id_str = str(req.candidate_id)
    job_id_str = str(req.job_id) if req.job_id else ""
    count_range = tuple(req.question_count_range) if isinstance(req.question_count_range, list) else req.question_count_range

    # Khởi tạo dữ liệu phiên phỏng vấn trong bộ nhớ tạm
    _INTERVIEW_STATUS_STORE[session_id_str] = {
        "id": session_id_str,
        "candidate_id": candidate_id_str,
        "job_id": job_id_str,
        "status": "generating",
        "coverage_threshold": req.coverage_threshold,
        "questions": [],
        "is_approved": False,
        "reviewer_notes": None,
    }

    # Điều phối xử lý qua Celery hoặc chạy nền trực tiếp (BackgroundTasks)
    try:
        from backend.app.tasks.interview_tasks import run_interview_pipeline

        run_interview_pipeline.delay(
            session_id=session_id_str,
            candidate_id=candidate_id_str,
            job_id=job_id_str,
            question_count_range=count_range,
            coverage_threshold=req.coverage_threshold,
            include_project_refs=req.include_project_refs,
        )
    except Exception as e:
        logger.warning("Celery dispatch failed or broker offline, running via BackgroundTasks: %s", e)
        from backend.app.tasks.interview_tasks import execute_interview_generation_sync

        background_tasks.add_task(
            execute_interview_generation_sync,
            session_id=session_id_str,
            candidate_id=candidate_id_str,
            job_id=job_id_str,
            question_count_range=count_range,
            coverage_threshold=req.coverage_threshold,
            include_project_refs=req.include_project_refs,
        )

    return GenerateInterviewResponse(
        session_id=session_id,
        status="generating",
        poll_url=f"/api/v1/interviews/sessions/{session_id}",
    )


@router.get("/sessions/{session_id}")
async def get_interview_session(session_id: str) -> dict[str, Any]:
    """Lấy thông tin chi tiết phiên phỏng vấn và các câu hỏi đã sinh."""
    session_id_str = str(session_id)

    # Kiểm tra trong bộ nhớ tạm in-memory store trước
    if session_id_str in _INTERVIEW_STATUS_STORE:
        return _INTERVIEW_STATUS_STORE[session_id_str]

    # Kiểm tra trong bảng Supabase
    try:
        db = get_supabase_client()
        session_resp = db.table("interview_sessions").select("*").eq("id", session_id_str).execute()
        if session_resp.data and len(session_resp.data) > 0:
            session = session_resp.data[0]
            questions_resp = (
                db.table("interview_questions")
                .select("*")
                .eq("session_id", session_id_str)
                .order("question_order", desc=False)
                .execute()
            )
            return {**session, "questions": questions_resp.data or []}
    except Exception as e:
        logger.warning("Supabase interview session fetch error: %s", e)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview session not found")


@router.patch("/sessions/{session_id}")
async def update_interview_session(
    session_id: str,
    req: UpdateSessionRequest,
) -> dict[str, Any]:
    """Cập nhật trạng thái phê duyệt và ghi chú của người đánh giá."""
    session_id_str = str(session_id)
    update_data = req.model_dump(exclude_unset=True)

    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields provided to update")

    # Update in-memory store
    if session_id_str in _INTERVIEW_STATUS_STORE:
        _INTERVIEW_STATUS_STORE[session_id_str].update(update_data)
        return _INTERVIEW_STATUS_STORE[session_id_str]

    # Update in Supabase
    try:
        db = get_supabase_client()
        resp = (
            db.table("interview_sessions")
            .update(update_data)
            .eq("id", session_id_str)
            .execute()
        )
        if resp.data and len(resp.data) > 0:
            return resp.data[0]
    except Exception as e:
        logger.warning("Supabase update session error: %s", e)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview session not found")
