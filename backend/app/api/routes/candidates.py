from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.api.schemas.compare import CompareCandidatesRequest, CompareCandidatesResponse
from backend.app.clients.supabase import get_supabase_client
from backend.app.config.env import settings
from backend.app.core.exceptions import ForbiddenError
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.services import get_profile_service
from backend.app.guardrails.rate_limit import enforce_chat_rate_limit
from backend.app.services.matching.compare import compare_candidates_for_job
from backend.app.services.profile_service import ProfileService
from supabase import Client

router = APIRouter(tags=["candidates"])


@router.post("/candidates/compare", response_model=CompareCandidatesResponse)
async def compare_candidates(
    request: CompareCandidatesRequest,
    current_user: AuthenticatedUser = Depends(enforce_chat_rate_limit),
    client: Client = Depends(get_supabase_client),
    profile_service: ProfileService = Depends(get_profile_service),
) -> CompareCandidatesResponse:
    """Compare 2-5 candidates' CVs objectively based on Job Description & Requirements using LLM."""
    profile = await profile_service.get_own_profile(current_user.id)
    if profile.role != "recruiter" and profile.role != "admin":
        raise ForbiddenError("Chỉ Nhà tuyển dụng mới có quyền so sánh CV ứng viên")

    return await compare_candidates_for_job(
        client=client,
        actor_id=current_user.id,
        job_id=request.job_id,
        application_ids=request.application_ids,
        api_key=settings.qwen_api_key,
        base_url=settings.qwen_base_url,
    )
