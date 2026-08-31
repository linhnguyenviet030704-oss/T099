from backend.app.agents.state import AgentState


async def respond_node(state: AgentState) -> dict:
    # Lấy danh sách ứng viên và tổng số hồ sơ đã quét trong pool
    candidates = list(state.get("candidates") or [])
    pool_size = state.get("pool_size")
    total_count = pool_size if pool_size and pool_size > 0 else len(candidates)
    if not candidates:
        return {"response": "Chưa có CV nộp cho vị trí này."}
    # Trả về thông báo số lượng hồ sơ đã quét
    return {"response": f"Đã quét hồ sơ của {total_count} ứng viên."}

