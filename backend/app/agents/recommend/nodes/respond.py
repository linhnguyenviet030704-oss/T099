from backend.app.agents.state import AgentState


async def respond_node(state: AgentState) -> dict:
    candidates = list(state.get("candidates") or [])
    if not candidates:
        return {"response": "Hiện chưa có tin tuyển dụng phù hợp với CV của bạn."}
    return {"response": f"Gợi ý {len(candidates)} việc làm phù hợp."}
