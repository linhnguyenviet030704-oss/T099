from __future__ import annotations

from backend.app.schemas.chat import ChatRequest, ChatResponse


class ChatService:
    async def chat(self, request: ChatRequest) -> ChatResponse:
        from agent.graph import agent

        result = await agent.ainvoke({"query": request.message})
        return ChatResponse(
            response=result.get("response", ""),
            analysis=result.get("analysis", ""),
        )
