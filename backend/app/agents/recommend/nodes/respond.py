from backend.app.agents.state import AgentState


async def respond_node(state: AgentState) -> dict:
    candidates = list(state.get("candidates") or [])
    intent = state.get("intent")
    query = str(state.get("query") or state.get("message") or "").strip()
    db_params = state.get("db_query_params") or {}
    domain_keyword = db_params.get("domain") or db_params.get("search_keyword") or ""

    if not candidates:
        if intent == "SEARCH_BY_DOMAIN" and domain_keyword:
            return {"response": f"Hiện chưa có tin tuyển dụng phù hợp với lĩnh vực **{domain_keyword.capitalize()}**."}
        return {"response": "Hiện chưa có tin tuyển dụng phù hợp với yêu cầu của bạn."}

    top = candidates[0]
    title = top.get("title") or "vị trí tuyển dụng"
    company = top.get("company_name") or ""
    target_name = f"{title} ({company})" if company else title

    if intent == "TARGET_SPECIFIC":
        return {"response": f"Dưới đây là kết quả tìm kiếm chi tiết cho vị trí **{target_name}** và các công việc liên quan:"}

    if intent == "SEARCH_BY_DOMAIN":
        domain_display = domain_keyword.title() if domain_keyword else (query.title() or "ngành nghề")
        return {"response": f"Dưới đây là {len(candidates)} vị trí việc làm thuộc lĩnh vực **{domain_display}** đang tuyển dụng:"}

    if intent == "LIST_AVAILABLE_JOBS":
        cv_has_evidence = bool(state.get("cv_has_evidence", False))
        if cv_has_evidence:
            return {"response": f"Dưới đây là danh sách {len(candidates)} vị trí việc làm đang tuyển dụng trên hệ thống (được sắp xếp theo mức độ phù hợp với CV của bạn):"}
        return {"response": f"Hệ thống hiện có {len(candidates)} vị trí việc làm đang mở tuyển dụng. Dưới đây là danh sách các công việc mới nhất:"}

    return {"response": f"Gợi ý {len(candidates)} việc làm phù hợp."}


