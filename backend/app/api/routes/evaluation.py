"""Evaluation API routes."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from backend.app.agents.evaluation import EvaluationAgent
from backend.app.agents.evaluation.types import EvaluationType
from backend.app.agents.routing import RoutingAgent
from backend.app.api.schemas.evaluation import (
    EvaluationRequest,
    EvaluationResponse,
    RoutingRequest,
    RoutingResponse,
)
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.services import get_profile_service
from backend.app.observability.logger import get_logger
from backend.app.services.profile_service import ProfileService

logger = get_logger(__name__)

router = APIRouter()


def _get_evaluation_agent() -> EvaluationAgent:
    """Get evaluation agent instance."""
    return EvaluationAgent(brain=None)


def _get_routing_agent() -> RoutingAgent:
    """Get routing agent instance."""
    return RoutingAgent(brain=None)


@router.post("/route", response_model=RoutingResponse)
async def route_message(
    request: RoutingRequest,
    _user: AuthenticatedUser,
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
    except Exception as e:
        logger.exception("Routing failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(
    request: EvaluationRequest,
    _user: AuthenticatedUser,
    profile_service: ProfileService = Depends(get_profile_service),
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
            natural_language_summary=result.to_api_response().get("summary"),
        )
    except Exception as e:
        logger.exception("Evaluation failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/evaluate/file", response_model=EvaluationResponse)
async def evaluate_with_file(
    cv_file: UploadFile = File(...),
    job_id: UUID | None = None,
    jd_text: str | None = None,
    evaluation_type: str = "full",
    _user: AuthenticatedUser = Depends(AuthenticatedUser),
    profile_service: ProfileService = Depends(get_profile_service),
) -> EvaluationResponse:
    """
    Evaluate uploaded CV file against job.

    Accepts PDF, DOCX, or TXT files.
    """
    import io

    # Read file content
    content = await cv_file.read()

    # Convert to text (basic handling - for production use proper PDF/DOCX parser)
    cv_text = content.decode("utf-8", errors="ignore")

    # Create request
    request = EvaluationRequest(
        cv_text=cv_text,
        jd_text=jd_text,
        job_id=job_id,
        evaluation_type=evaluation_type,
    )

    return await evaluate(request, _user, profile_service)
