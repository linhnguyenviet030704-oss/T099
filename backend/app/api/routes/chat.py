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
    RecommendationItem,
)
from backend.app.clients.supabase import get_supabase_client
from backend.app.core.exceptions import ForbiddenError
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


@router.delete("/chat/sessions/{session_id}")
async def delete_chat_session(
    session_id: str,
    _user: AuthenticatedUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> dict:
    sid = UUID(session_id)
    client.table("chat_messages").delete().eq("user_id", _user.id).eq("session_id", sid).execute()
    return {"deleted": True, "session_id": str(sid)}


@router.get("/chat/history/{session_id}", response_model=ChatHistoryResponse)
async def get_chat_history(
    session_id: str,
    _user: AuthenticatedUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> ChatHistoryResponse:
    sid = UUID(session_id)
    result = (
        client.table("chat_messages")
        .select("*")
        .eq("user_id", _user.id)
        .eq("session_id", sid)
        .order("created_at")
        .execute()
    )
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


