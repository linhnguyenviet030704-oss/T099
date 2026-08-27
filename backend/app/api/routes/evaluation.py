"""Evaluation API routes."""

from __future__ import annotations

import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from backend.app.agents.evaluation import EvaluationAgent
from backend.app.agents.evaluation.types import EvaluationType
from backend.app.agents.routing import RoutingAgent
from backend.app.api.schemas.evaluation import (
    EvaluationRequest,
    EvaluationResponse,
    RoutingRequest,
    RoutingResponse,
)
from backend.app.clients.supabase import get_supabase_client
from backend.app.core.exceptions import AppError, BadRequestError, ForbiddenError, NotFoundError
from backend.app.core.security import AuthenticatedUser
from backend.app.guardrails.input import MAX_CV_BYTES, validate_file
from backend.app.observability.logger import get_logger
from backend.app.services.matching.parse import parse_resume_bytes
from backend.app.services.matching.store import SupabaseResumeStore
from supabase import Client

logger = get_logger(__name__)

router = APIRouter()


def _get_evaluation_agent() -> EvaluationAgent:
    """Get evaluation agent instance."""
    return EvaluationAgent(brain=None)


def _get_routing_agent() -> RoutingAgent:
    """Get routing agent instance."""
    return RoutingAgent(brain=None)


async def _resolve_authorized_inputs(
    request: EvaluationRequest,
    *,
    actor_id: UUID,
    client: Client,
) -> EvaluationRequest:
    cv_text = request.cv_text
    jd_text = request.jd_text

    if cv_text is None and request.resume_id is not None:
        store = SupabaseResumeStore(client)
        resume = await store.get_resume(request.resume_id)
        if not resume:
            raise NotFoundError("Resume not found", code="RESUME_NOT_FOUND")
        if str(resume.get("user_id")) != str(actor_id):
            raise ForbiddenError("Not your resume")

        parsed = await store.get_parsed(request.resume_id)
        cv_text = str((parsed or {}).get("clean_markdown") or (parsed or {}).get("markdown") or "")
        if not cv_text:
            blob = await store.download(resume.get("bucket_id") or "resumes", resume["storage_path"])
            validated = validate_file(
                blob,
                declared_mime=resume.get("mime_type") or "",
                max_bytes=MAX_CV_BYTES,
            )
            parsed_local = parse_resume_bytes(validated.data, mime_type=validated.detected_mime)
            cv_text = str(parsed_local.get("markdown") or "")

    if jd_text is None and request.job_id is not None:
        def _fetch_job() -> dict | None:
            return (
                client.table("job_posts")
                .select("id, title, description, requirements, status, created_by_user_id")
                .eq("id", str(request.job_id))
                .maybe_single()
                .execute()
                .data
            )

        job = await asyncio.to_thread(_fetch_job)
        if not job:
            raise NotFoundError("Job not found", code="JOB_NOT_FOUND")
        if job.get("status") != "published" and str(job.get("created_by_user_id")) != str(actor_id):
            raise ForbiddenError("Job is not available")
        jd_text = "\n\n".join(
            part
            for part in (
                str(job.get("title") or "").strip(),
                str(job.get("description") or "").strip(),
                str(job.get("requirements") or "").strip(),
            )
            if part
        )

    return request.model_copy(update={"cv_text": cv_text, "jd_text": jd_text})


@router.post("/route", response_model=RoutingResponse)
async def route_message(
    request: RoutingRequest,
    _user: AuthenticatedUser = Depends(),
) -> RoutingResponse:
    """
    Route user message to appropriate agent.

    Classifies intent and validates input, returns dispatch target.
    """
    agent = _get_routing_agent()

    try:
        result = await agent.route(request.message, user_id=str(_user.id))

        if result.is_rejected():
            return RoutingResponse(
                intent=result.intent.value if result.intent else "unknown",
                is_valid=False,
                dispatch_target=None,
                context=result.context,
                rejection_reason=result.rejection_reason.value if result.rejection_reason else None,
                rejection_message=result.response,
            )

        return RoutingResponse(
            intent=result.intent.value if result.intent else "unknown",
            is_valid=True,
            dispatch_target=result.dispatch_target,
            context=result.context,
            rejection_reason=None,
            rejection_message=None,
        )
    except AppError:
        raise
    except Exception:
        logger.exception("Routing failed")
        raise HTTPException(status_code=500, detail="Internal routing error")


@router.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(
    request: EvaluationRequest,
    _user: AuthenticatedUser = Depends(),
    client: Client = Depends(get_supabase_client),
) -> EvaluationResponse:
    """
    Evaluate CV against JD or perform standalone assessment.

    Supports:
    - CV text + JD text: Full comparison
    - CV text only: Self-assessment
    - JD text only: Job quality assessment
    - resume_id: Load CV from database
    - job_id: Load JD from database
    """
    # Validate at least one input
    if not any([request.cv_text, request.jd_text, request.resume_id, request.job_id]):
        raise HTTPException(
            status_code=400,
            detail="At least one of cv_text, jd_text, resume_id, or job_id is required",
        )

    request = await _resolve_authorized_inputs(request, actor_id=_user.id, client=client)

    # Determine evaluation type
    eval_type = EvaluationType(request.evaluation_type)

    agent = _get_evaluation_agent()

    try:
        result = await agent.evaluate(
            cv_text=request.cv_text,
            jd_text=request.jd_text,
            resume_id=str(request.resume_id) if request.resume_id else None,
            job_id=str(request.job_id) if request.job_id else None,
            evaluation_type=eval_type,
        )

        return EvaluationResponse(
            overall_score=result.overall_score,
            breakdown={
                name: {
                    "score": ms.score,
                    "weight": ms.weight,
                    "details": ms.details,
                    "confidence": ms.confidence,
                }
                for name, ms in result.breakdown.items()
            },
            skill_analysis={
                "matched": result.skill_analysis.matched_skills,
                "missing": result.skill_analysis.missing_critical,
                "unexpected": result.skill_analysis.unexpected_skills,
                "match_rate": result.skill_analysis.skill_match_rate,
            },
            recommendations=result.recommendations,
            warnings=result.warnings,
            confidence=result.confidence,
            radar_chart=result.radar_chart.to_chart_format() if result.radar_chart else None,
            benchmark={
                "percentile": result.comparison_with_benchmark.percentile,
                "vs_average": result.comparison_with_benchmark.compared_to_average,
                "industry": result.comparison_with_benchmark.industry_std,
            }
            if result.comparison_with_benchmark
            else None,
            natural_language_summary=result.natural_language_summary,
        )
    except AppError:
        raise
    except Exception:
        logger.exception("Evaluation failed")
        raise HTTPException(status_code=500, detail="Internal evaluation error")


@router.post("/evaluate/file", response_model=EvaluationResponse)
async def evaluate_with_file(
    cv_file: UploadFile = File(...),
    job_id: UUID | None = None,
    jd_text: str | None = None,
    evaluation_type: str = "full",
    _user: AuthenticatedUser = Depends(),
    client: Client = Depends(get_supabase_client),
) -> EvaluationResponse:
    """
    Evaluate uploaded CV file against job.

    Accepts PDF, DOCX, or TXT files.
    """

    content = await cv_file.read()
    validated = validate_file(
        content,
        declared_mime=cv_file.content_type or "",
        max_bytes=MAX_CV_BYTES,
    )
    parsed = parse_resume_bytes(validated.data, mime_type=validated.detected_mime)
    cv_text = str(parsed.get("markdown") or "")
    if not cv_text:
        raise BadRequestError("Không trích xuất được nội dung CV", code="DATA_LOW_CONTENT")

    # Create request
    request = EvaluationRequest(
        cv_text=cv_text,
        jd_text=jd_text,
        job_id=job_id,
        evaluation_type=evaluation_type,
    )

    return await evaluate(request, _user, client)
