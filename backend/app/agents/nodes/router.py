"""Intent & Data Router Node for Antigravity AI Agent System.

Classifies user message intent, decides if DB/KG retrieval is required,
and extracts target parameters for candidate and recruiter recommendation flows.
"""

from __future__ import annotations

import re
from typing import Any

from backend.app.agents.routing.intents import is_supported_language
from backend.app.agents.state import AgentState
from backend.app.observability.logger import get_logger

logger = get_logger(__name__)

_SKILL_GAP_KEYWORDS = (
    "bổ sung", "cần học", "kỹ năng gì", "thiếu kỹ năng",
    "học thêm", "lộ trình", "skill gap", "yêu cầu thêm", "học gì",
)

_CHITCHAT_KEYWORDS = (
    "xin chào", "chào bạn", "cảm ơn", "bạn là ai", "hướng dẫn", "giúp đỡ", "hello", "hi",
)

_LIST_JOBS_KEYWORDS = (
    "các công việc hiện có", "công việc hiện có", "danh sách việc làm", "danh sách công việc",
    "tất cả công việc", "tất cả việc làm", "những việc đang tuyển", "những việc làm đang tuyển",
    "có những việc nào", "có việc gì", "hiện có những việc nào", "việc làm hiện có",
    "xem danh sách việc", "xem việc làm", "các việc làm hiện có", "các vị trí đang tuyển",
    "vị trí đang tuyển", "danh sách tuyển dụng", "các tin tuyển dụng", "tin tuyển dụng hiện có",
    "show all jobs", "all jobs", "list jobs", "show jobs",
)

_KNOWN_COMPANIES = (
    "vng", "fpt", "viettel", "tiki", "shopee", "momo",
    "techcombank", "grab", "be group", "zalo", "cmc", "nashtech",
    "kms", "axon active", "logivan", "base.vn", "sky mavis", "coccoc",
)

_KNOWN_DOMAINS = (
    "logistic", "logistics", "vận tải", "kho vận", "supply chain", "chuỗi cung ứng",
    "marketing", "digital marketing", "seo", "content", "truyền thông",
    "kế toán", "kiểm toán", "accounting", "finance", "tài chính", "ngân hàng", "banking",
    "bán hàng", "sales", "kinh doanh", "business development",
    "nhân sự", "hr", "recruitment", "tuyển dụng",
    "it", "lập trình", "developer", "software", "backend", "frontend", "fullstack",
    "mobile", "ios", "android", "devops", "cloud", "data analyst", "data engineer",
    "data science", "data", "ai", "machine learning", "product manager", "product owner",
    "business analyst", "ba", "qc", "qa", "tester", "ui/ux", "designer", "thiết kế",
    "security", "an toàn thông tin", "ecommerce", "thương mại điện tử",
)


def _matches_domain(text: str) -> str | None:
    for dom in _KNOWN_DOMAINS:
        if len(dom) <= 3:
            if re.search(rf"\b{re.escape(dom)}\b", text):
                return dom
        else:
            if dom in text:
                return dom
    return None


def classify_intent(message: str) -> dict[str, Any]:
    raw_text = (message or "").strip()
    if not raw_text:
        return {
            "intent": "RECOMMEND_GENERAL",
            "needs_db_query": True,
            "db_query_params": {},
            "kg_params": {},
        }

    is_supported, _ = is_supported_language(raw_text)
    if not is_supported:
        return {
            "intent": "UNSUPPORTED_LANGUAGE",
            "needs_db_query": False,
            "db_query_params": {},
            "kg_params": {},
        }

    text = raw_text.lower()

    # Check for Skill Gap Advice intent
    is_skill_gap = any(kw in text for kw in _SKILL_GAP_KEYWORDS)

    # Check for Target Specific company/job
    target_company = next((comp for comp in _KNOWN_COMPANIES if comp in text), None)

    # Check for List All Available Jobs intent
    is_list_jobs = any(kw in text for kw in _LIST_JOBS_KEYWORDS) or text in ("việc làm", "công việc", "tuyển dụng")

    # Check for Domain / Industry Search (e.g. Logistic, Marketing, Data...)
    matched_domain = _matches_domain(text)

    # Check for job title / number mention (e.g. #2, #142, Backend Python...)
    has_target_mention = bool(target_company or "#" in text or "tại " in text or "vị trí " in text)

    # Check for Chitchat
    is_chitchat = any(kw == text for kw in _CHITCHAT_KEYWORDS) and not is_skill_gap and not has_target_mention and not matched_domain and not is_list_jobs

    if is_chitchat:
        return {
            "intent": "CHITCHAT",
            "needs_db_query": False,
            "db_query_params": {},
            "kg_params": {},
        }

    if is_skill_gap:
        intent = "SKILL_GAP_ADVICE"
    elif target_company or has_target_mention:
        intent = "TARGET_SPECIFIC"
    elif matched_domain:
        intent = "SEARCH_BY_DOMAIN"
    elif is_list_jobs:
        intent = "LIST_AVAILABLE_JOBS"
    else:
        intent = "RECOMMEND_GENERAL"

    db_params: dict[str, Any] = {}
    if target_company:
        db_params["company_name"] = target_company
    if matched_domain:
        db_params["domain"] = matched_domain
        db_params["search_keyword"] = matched_domain

    # Extract target job index or title if present
    match_job_num = re.search(r"#(\d+)", text)
    if match_job_num:
        db_params["target_job_num"] = match_job_num.group(1)

    kg_params = {
        "entity_name": target_company or matched_domain or "target_job",
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

