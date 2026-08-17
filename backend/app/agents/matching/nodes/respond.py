from backend.app.agents.state import AgentState


async def respond_node(state: AgentState) -> dict:
    candidates = list(state.get("candidates") or [])
    if not candidates:
        return {"response": "Chưa có CV nộp cho vị trí này."}
    return {"response": f"Gợi ý {len(candidates)} ứng viên phù hợp."}
