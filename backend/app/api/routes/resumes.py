from uuid import UUID

from fastapi import APIRouter, Depends
from supabase import Client

from backend.app.api.schemas.common import IngestResponse
from backend.app.clients.supabase import get_supabase_client
from backend.app.config.env import settings
from backend.app.core.exceptions import ForbiddenError, NotFoundError
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.auth import get_current_user
from backend.app.services.matching.ingest import ingest_resume
from backend.app.services.matching.store import SupabaseResumeStore

router = APIRouter()


@router.post("/resumes/{resume_id}/ingest", response_model=IngestResponse)
async def ingest_own_resume(
    resume_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> IngestResponse:
    store = SupabaseResumeStore(client)
    resume = await store.get_resume(resume_id)
    if not resume:
        raise NotFoundError("Resume not found", code="RESUME_NOT_FOUND")
    if str(resume.get("user_id")) != str(current_user.id):
        raise ForbiddenError("Not your resume")
    status = await ingest_resume(
        store,
        resume_id,
        api_key=settings.qwen_api_key,
        base_url=settings.qwen_base_url,
    )
    return IngestResponse(status=status)
