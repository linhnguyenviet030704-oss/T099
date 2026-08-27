import json
from uuid import UUID

from fastapi import APIRouter, Depends

from backend.app.api.schemas.chat import (
    ChatHistoryResponse,
    ChatMessageRecord,
    ChatRequest,
    ChatResponse,
    ChatSessionsResponse,
    ChatSessionSummary,
    ClearChatHistoryResponse,
    DeleteChatMessageResponse,
    DeleteChatSessionResponse,
    RecommendationItem,
)
from backend.app.clients.supabase import get_supabase_client
from backend.app.core.exceptions import ForbiddenError, NotFoundError
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.auth import get_current_user
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


@router.get("/chat/sessions", response_model=ChatSessionsResponse)
async def list_chat_sessions(
    _user: AuthenticatedUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> ChatSessionsResponse:
    result = (
        client.table("chat_messages")
        .select("id, session_id, role, content, created_at")
        .eq("user_id", _user.id)
        .order("created_at", desc=False)
        .execute()
    )

    sessions_map: dict[str, dict] = {}
    for m in result.data:
        sid_str = str(m["session_id"])
        if sid_str not in sessions_map:
            sessions_map[sid_str] = {
                "id": UUID(sid_str),
                "first_message": m["content"] if m["role"] == "user" else "",
                "last_message": m["content"],
                "created_at": str(m["created_at"]),
                "updated_at": str(m["created_at"]),
                "message_count": 0,
            }

        entry = sessions_map[sid_str]
        entry["message_count"] += 1
        entry["updated_at"] = str(m["created_at"])
        entry["last_message"] = m["content"]
        if not entry["first_message"] and m["role"] == "user":
            entry["first_message"] = m["content"]

    sorted_sessions = sorted(
        [
            ChatSessionSummary(
                id=v["id"],
                first_message=v["first_message"] or v["last_message"] or "Cuộc trò chuyện",
                last_message=v["last_message"],
                created_at=v["created_at"],
                updated_at=v["updated_at"],
                message_count=v["message_count"],
            )
            for v in sessions_map.values()
        ],
        key=lambda s: s.updated_at,
        reverse=True,
    )
    return ChatSessionsResponse(sessions=sorted_sessions)


@router.delete("/chat/sessions/{session_id}", response_model=DeleteChatSessionResponse)
async def delete_chat_session(
    session_id: str,
    _user: AuthenticatedUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> DeleteChatSessionResponse:
    try:
        sid = UUID(session_id)
    except (ValueError, TypeError):
        raise NotFoundError("Chat session not found", code="CHAT_SESSION_NOT_FOUND")

    # 1. Fetch messages in this session
    res = (
        client.table("chat_messages")
        .select("id, user_id, session_id")
        .eq("session_id", str(sid))
        .execute()
    )
    if not res.data:
        raise NotFoundError("Chat session not found", code="CHAT_SESSION_NOT_FOUND")

    # 2. Strict ownership check
    if any(str(m.get("user_id")) != str(_user.id) for m in res.data):
        raise ForbiddenError("Bạn chỉ có quyền xóa cuộc trò chuyện do chính mình tạo ra")

    # 3. Delete session messages
    client.table("chat_messages").delete().eq("user_id", _user.id).eq("session_id", str(sid)).execute()
    return DeleteChatSessionResponse(
        session_id=sid,
        deleted=True,
        message="Đã xóa cuộc trò chuyện thành công.",
    )


@router.delete("/chat/history", response_model=ClearChatHistoryResponse)
async def clear_all_chat_history(
    _user: AuthenticatedUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> ClearChatHistoryResponse:
    client.table("chat_messages").delete().eq("user_id", _user.id).execute()
    return ClearChatHistoryResponse(
        deleted=True,
        message="Đã xóa toàn bộ lịch sử trò chuyện.",
    )


@router.delete("/chat/messages/{message_id}", response_model=DeleteChatMessageResponse)
async def delete_chat_message(
    message_id: str,
    _user: AuthenticatedUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> DeleteChatMessageResponse:
    try:
        mid = UUID(message_id)
    except (ValueError, TypeError):
        raise NotFoundError("Chat message not found", code="CHAT_MESSAGE_NOT_FOUND")

    res = (
        client.table("chat_messages")
        .select("id, user_id, session_id")
        .eq("id", str(mid))
        .maybe_single()
        .execute()
    )
    msg = res.data if res else None
    if not msg:
        raise NotFoundError("Chat message not found", code="CHAT_MESSAGE_NOT_FOUND")

    if str(msg.get("user_id")) != str(_user.id):
        raise ForbiddenError("Bạn chỉ có quyền xóa tin nhắn do chính mình tạo ra")

    client.table("chat_messages").delete().eq("id", str(mid)).eq("user_id", _user.id).execute()
    return DeleteChatMessageResponse(
        message_id=mid,
        deleted=True,
        message="Đã xóa tin nhắn thành công.",
    )


@router.get("/chat/history/{session_id}", response_model=ChatHistoryResponse)
async def get_chat_history(
    session_id: str,
    _user: AuthenticatedUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> ChatHistoryResponse:
    try:
        sid = UUID(session_id)
    except (ValueError, TypeError):
        raise NotFoundError("Chat session not found", code="CHAT_SESSION_NOT_FOUND")

    result = (
        client.table("chat_messages")
        .select("*")
        .eq("session_id", str(sid))
        .order("created_at")
        .execute()
    )
    if not result.data:
        raise NotFoundError("Chat session not found", code="CHAT_SESSION_NOT_FOUND")

    if any(str(m.get("user_id")) != str(_user.id) for m in result.data):
        raise ForbiddenError("Bạn chỉ có quyền xem cuộc trò chuyện do chính mình sở hữu")

    messages = []
    for m in result.data:
        raw_recs = m.get("recommendations")
        if isinstance(raw_recs, str):
            try:
                raw_recs = json.loads(raw_recs)
            except Exception:
                raw_recs = []
        if not isinstance(raw_recs, list):
            raw_recs = []

        parsed_recs = []
        for r in raw_recs:
            if isinstance(r, dict):
                try:
                    parsed_recs.append(RecommendationItem(**r))
                except Exception:
                    pass

        messages.append(
            ChatMessageRecord(
                id=UUID(str(m["id"])),
                session_id=UUID(str(m["session_id"])),
                role=m["role"],
                content=m["content"],
                recommendations=parsed_recs,
                created_at=str(m["created_at"]),
            )
        )
    return ChatHistoryResponse(session_id=sid, messages=messages)



