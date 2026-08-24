from backend.app.agents.state import AgentState


async def respond_node(state: AgentState) -> dict:
    candidates = list(state.get("candidates") or [])
    intent = state.get("intent")
    if not candidates:
        return {"response": "Hiện chưa có tin tuyển dụng phù hợp với CV của bạn."}

    top = candidates[0]
    title = top.get("title") or "vị trí tuyển dụng"
    company = top.get("company_name") or ""
    target_name = f"{title} ({company})" if company else title

    if intent == "TARGET_SPECIFIC":
        return {"response": f"Dưới đây là kết quả tìm kiếm chi tiết cho vị trí **{target_name}** và các công việc liên quan:"}

    return {"response": f"Gợi ý {len(candidates)} việc làm phù hợp."}

