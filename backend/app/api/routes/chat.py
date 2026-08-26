from fastapi import APIRouter, Depends

from backend.app.api.schemas.chat import ChatHistoryResponse, ChatMessageRecord, ChatRequest, ChatResponse, RecommendationItem
from backend.app.clients.supabase import get_supabase_client
from backend.app.core.exceptions import ForbiddenError
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.services import get_chat_service, get_profile_service
from backend.app.guardrails.rate_limit import enforce_chat_rate_limit
from backend.app.services.chat_service import ChatService
from backend.app.services.profile_service import ProfileService
from supabase import Client

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


@router.get("/chat/history/{session_id}", response_model=ChatHistoryResponse)
async def get_chat_history(
    session_id: str,
    _user: AuthenticatedUser = Depends(),
    client: Client = Depends(get_supabase_client),
) -> ChatHistoryResponse:
    from uuid import UUID
    sid = UUID(session_id)
    result = client.table("chat_messages").select("*").eq("user_id", _user.id).eq("session_id", sid).order("created_at").execute()
    messages = [
        ChatMessageRecord(
            id=UUID(m["id"]),
            session_id=UUID(m["session_id"]),
            role=m["role"],
            content=m["content"],
            recommendations=[RecommendationItem(**r) for r in (m.get("recommendations") or [])],
            created_at=m["created_at"],
        )
        for m in result.data
    ]
    return ChatHistoryResponse(session_id=sid, messages=messages)

