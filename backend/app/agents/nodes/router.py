"""Intent & Data Router Node for Antigravity AI Agent System.

Classifies user message intent, decides if DB/KG retrieval is required,
and extracts target parameters for candidate and recruiter recommendation flows.
"""

from __future__ import annotations

import re
from typing import Any

from backend.app.agents.state import AgentState
from backend.app.observability.logger import get_logger

logger = get_logger(__name__)

_SKILL_GAP_KEYWORDS = (
    "bổ sung", "cần học", "kỹ năng gì", "thiếu kỹ năng",
    "học thêm", "lộ trình", "skill gap", "yêu cầu thêm", "học gì",
)

_CHITCHAT_KEYWORDS = (
    "xin chào", "chào bạn", "cảm ơn", "bạn là ai", "hướng dẫn", "giúp đỡ",
)

_KNOWN_COMPANIES = (
    "vng", "fpt", "viettel", "tiki", "shopee", "momo",
    "techcombank", "grab", "be group", "zalo", "cmc", "nashtech",
    "kms", "axon active", "logivan", "base.vn", "sky mavis", "coccoc",
)


def classify_intent(message: str) -> dict[str, Any]:
    text = (message or "").strip().lower()
    if not text:
        return {
            "intent": "RECOMMEND_GENERAL",
            "needs_db_query": True,
            "db_query_params": {},
            "kg_params": {},
        }

    # Check for Skill Gap Advice intent
    is_skill_gap = any(kw in text for kw in _SKILL_GAP_KEYWORDS)

    # Check for Target Specific company/job
    target_company = next((comp for comp in _KNOWN_COMPANIES if comp in text), None)

    # Check for job title / number mention (e.g. #2, #142, Backend Python...)
    has_target_mention = bool(target_company or "#" in text or "tại " in text or "vị trí " in text)

    # Check for Chitchat
    is_chitchat = any(kw == text for kw in _CHITCHAT_KEYWORDS) and not is_skill_gap and not has_target_mention

    if is_chitchat:
        return {
            "intent": "CHITCHAT",
            "needs_db_query": False,
            "db_query_params": {},
            "kg_params": {},
        }

    if is_skill_gap:
        intent = "SKILL_GAP_ADVICE"
    elif has_target_mention:
        intent = "TARGET_SPECIFIC"
    else:
        intent = "RECOMMEND_GENERAL"

    db_params: dict[str, Any] = {}
    if target_company:
        db_params["company_name"] = target_company

    # Extract target job index or title if present
    match_job_num = re.search(r"#(\d+)", text)
    if match_job_num:
        db_params["target_job_num"] = match_job_num.group(1)

    kg_params = {
        "entity_name": target_company or "target_job",
        "relation_type": "REQUIRES_SKILL" if is_skill_gap else "CAREER_PATH",
    }

    return {
        "intent": intent,
        "needs_db_query": True,
        "db_query_params": db_params,
        "kg_params": kg_params,
    }


async def router_node(state: AgentState) -> dict:
    prompt = state.get("query") or state.get("jd_query") or state.get("message") or ""
    routing = classify_intent(str(prompt))
    logger.info("Router node classified intent: %s (needs_db_query=%s)", routing["intent"], routing["needs_db_query"])
    return {
        "intent": routing["intent"],
        "needs_db_query": routing["needs_db_query"],
        "db_query_params": routing["db_query_params"],
        "kg_params": routing["kg_params"],
    }
