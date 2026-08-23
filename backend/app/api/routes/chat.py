from fastapi import APIRouter, Depends

from backend.app.api.schemas.chat import ChatRequest, ChatResponse
from backend.app.core.exceptions import ForbiddenError
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.services import get_chat_service, get_profile_service
from backend.app.guardrails.rate_limit import enforce_chat_rate_limit
from backend.app.services.chat_service import ChatService
from backend.app.services.profile_service import ProfileService

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    _user: AuthenticatedUser = Depends(enforce_chat_rate_limit),
    service: ChatService = Depends(get_chat_service),
    profile_service: ProfileService = Depends(get_profile_service),
) -> ChatResponse:
    profile = await profile_service.get_own_profile(_user.id)
    if request.job_id is None:
        if profile.role != "candidate":
            raise ForbiddenError("Chỉ ứng viên mới có quyền dùng chức năng gợi ý công việc")
    else:
        if profile.role != "recruiter":
            raise ForbiddenError("Chỉ Nhà tuyển dụng mới có quyền dùng chức năng gợi ý ứng viên")

    return await service.chat(request, _user.id)

