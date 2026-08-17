from fastapi import APIRouter, Depends

from backend.app.api.schemas.chat import ChatRequest, ChatResponse
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.services import get_chat_service
from backend.app.guardrails.rate_limit import enforce_chat_rate_limit
from backend.app.services.chat_service import ChatService

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    _user: AuthenticatedUser = Depends(enforce_chat_rate_limit),
    service: ChatService = Depends(get_chat_service),
) -> ChatResponse:
    return await service.chat(request, _user.id)
