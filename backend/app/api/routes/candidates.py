from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.agents.routing.compare_flags import (
    COMPARE_CANDIDATES_FLAGS,
    COMPARE_JOBS_FLAGS,
    assert_compare_flow_is_pure,
)
from backend.app.api.schemas.compare import (
    CompareCandidatesRequest,
    CompareCandidatesResponse,
    CompareJobsRequest,
    CompareJobsResponse,
)
from backend.app.clients.supabase import get_supabase_client
from backend.app.config.env import settings
from backend.app.core.exceptions import ForbiddenError
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.services import get_profile_service
from backend.app.guardrails.rate_limit import enforce_chat_rate_limit
from backend.app.observability.logger import get_logger
from backend.app.services.matching.compare import compare_candidates_for_job
from backend.app.services.matching.compare_jobs import compare_jobs_for_candidate
from backend.app.services.profile_service import ProfileService
from backend.app.shared_brain.registry import get_brain
from supabase import Client

router = APIRouter(tags=["compare"])
logger = get_logger(__name__)


def _make_eval_complete_fn():
    """Build a complete fn bound to evaluation brain (MAX tier).

    Compare flows are evaluation tasks — they need the same model tier
    as the evaluation agent (per AGENT_MODELS in config/models.py).
    """
    eval_brain = get_brain("evaluation")

    def _complete(prompt: str, **kwargs):
        return eval_brain.chat(
            prompt,
            api_key=kwargs.get("api_key", settings.qwen_api_key),
            base_url=kwargs.get("base_url", settings.qwen_base_url),
            json_object=kwargs.get("json_object", True),
        )

    return _complete


@router.post("/candidates/compare", response_model=CompareCandidatesResponse)
async def compare_candidates(
    request: CompareCandidatesRequest,
    current_user: AuthenticatedUser = Depends(enforce_chat_rate_limit),
    client: Client = Depends(get_supabase_client),
    profile_service: ProfileService = Depends(get_profile_service),
) -> CompareCandidatesResponse:
    """Compare 2-5 candidates' CVs objectively based on Job Description & Requirements using LLM.

    Flow flags: needs_cv=True, needs_db=True, needs_vector_search=False.
    Operates on already-provided resumes from DB - no similarity search needed.
    Uses evaluation brain (MAX tier) for LLM analysis.
    """
    assert_compare_flow_is_pure(COMPARE_CANDIDATES_FLAGS)
    logger.info(
        "compare_candidates job_id=%s app_count=%d flags=needs_cv/needs_db/needs_vs=%s/%s/%s",
        request.job_id,
        len(request.application_ids),
        COMPARE_CANDIDATES_FLAGS.needs_cv,
        COMPARE_CANDIDATES_FLAGS.needs_db,
        COMPARE_CANDIDATES_FLAGS.needs_vector_search,
    )

    profile = await profile_service.get_own_profile(current_user.id)
    if profile.role != "recruiter" and profile.role != "admin":
        raise ForbiddenError("Chỉ Nhà tuyển dụng mới có quyền so sánh CV ứng viên")

    return await compare_candidates_for_job(
        client=client,
        actor_id=current_user.id,
        job_id=request.job_id,
        application_ids=request.application_ids,
        complete=_make_eval_complete_fn(),
        api_key=settings.qwen_api_key,
        base_url=settings.qwen_base_url,
    )


@router.post("/jobs/compare", response_model=CompareJobsResponse)
async def compare_jobs(
    request: CompareJobsRequest,
    current_user: AuthenticatedUser = Depends(enforce_chat_rate_limit),
    client: Client = Depends(get_supabase_client),
) -> CompareJobsResponse:
    """Compare 2-5 Job Descriptions visually for a candidate based on candidate's anonymized CV using AI Career Advisor.

    Flow flags: needs_cv=True, needs_db=True, needs_vector_search=False.
    Operates on already-provided jobs + candidate's CV - no similarity search needed.
    Uses evaluation brain (MAX tier) for LLM analysis.
    """
    assert_compare_flow_is_pure(COMPARE_JOBS_FLAGS)
    logger.info(
        "compare_jobs candidate=%s job_count=%d flags=needs_cv/needs_db/needs_vs=%s/%s/%s",
        current_user.id,
        len(request.job_ids),
        COMPARE_JOBS_FLAGS.needs_cv,
        COMPARE_JOBS_FLAGS.needs_db,
        COMPARE_JOBS_FLAGS.needs_vector_search,
    )

    return await compare_jobs_for_candidate(
        client=client,
        actor_id=current_user.id,
        job_ids=request.job_ids,
        resume_id=request.resume_id,
        complete=_make_eval_complete_fn(),
        api_key=settings.qwen_api_key,
        base_url=settings.qwen_base_url,
    )

