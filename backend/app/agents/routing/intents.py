"""Intent definitions and classification for routing agent.

User intent classification for candidate/recruiter flows.
Key dimension: should we use the user's CV? Should we query the database?

ponytail: regex patterns over a learned classifier - small dataset, transparent, fast.
Upgrade path: train a small text classifier on collected user logs.
"""

from __future__ import annotations

import re
from typing import NamedTuple

from backend.app.agents.evaluation.types import IntentType, RejectionReason
from backend.app.agents.routing.intent_patterns import (
    BROWSE_BY_FILTER_KEYWORDS,
    CHITCHAT_KEYWORDS,
    EVALUATE_CV_KEYWORDS,
    GENERIC_RECOMMEND_KEYWORDS,
    KNOWN_COMPANIES,
    KNOWN_DOMAINS,
    KNOWN_LOCATIONS,
    LIST_JOBS_KEYWORDS,
    OFF_TOPIC_KEYWORDS,
    RECRUITER_SCREEN_KEYWORDS,
    RECRUITMENT_DOMAIN_KEYWORDS,
    SKILL_GAP_KEYWORDS,
    USE_CV_KEYWORDS,
    contains_unsupported_script,
    fold_text,
)

# === Content validation ===

# This module routes chat messages, not full CV/JD documents. Document length
# requirements are enforced by their own input/data gates.
MIN_CONTENT_LENGTH = 1
MAX_INPUT_LENGTH = 50000

SENSITIVE_PATTERNS = [
    r"\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b",
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
]

# === Classification result ===


class IntentClassification(NamedTuple):
    """
    Result of intent classification.

    needs_vector_search: Only set to True for job_search and cv_recommend flows
    that need to find matching jobs/candidates from database via embedding similarity.
    Evaluation/analysis flows (SELF_EVALUATE, SKILL_GAP_ADVICE, COMPARE_CV_JOB)
    do NOT need vector search - they work with the provided CV/JD directly.
    """

    intent: IntentType
    needs_db: bool
    needs_cv: bool
    dispatch_target: str | None
    requires_user_cv: bool
    needs_vector_search: bool  # Only for job_search / cv_recommend flows
    db_query_params: dict[str, str | None]
    kg_params: dict[str, str | None]


# === Helper functions ===

def _match_any(text: str, keywords: tuple[str, ...]) -> bool:
    normalized = text.casefold()
    folded = fold_text(normalized)
    for keyword in keywords:
        normalized_keyword = keyword.casefold()
        folded_keyword = fold_text(keyword)
        if len(folded_keyword) <= 3 and folded_keyword.isalnum():
            if re.search(rf"\b{re.escape(normalized_keyword)}\b", normalized) or re.search(
                rf"\b{re.escape(folded_keyword)}\b", folded
            ):
                return True
        elif normalized_keyword in normalized or folded_keyword in folded:
            return True
    return False


def _extract_location(text: str) -> str | None:
    text_lower = text.casefold()
    text_folded = fold_text(text_lower)
    for loc in KNOWN_LOCATIONS:
        if loc.casefold() in text_lower or fold_text(loc) in text_folded:
            return loc
    return None


def _extract_domain(text: str) -> str | None:
    text_lower = text.casefold()
    text_folded = fold_text(text_lower)
    for dom in KNOWN_DOMAINS:
        dom_folded = fold_text(dom)
        if len(dom) <= 3:
            if re.search(rf"\b{re.escape(dom.casefold())}\b", text_lower) or re.search(
                rf"\b{re.escape(dom_folded)}\b", text_folded
            ):
                return dom
        else:
            if dom.casefold() in text_lower or dom_folded in text_folded:
                return dom
    return None


def _extract_company(text: str) -> str | None:
    text_lower = text.casefold()
    text_folded = fold_text(text_lower)
    for comp in KNOWN_COMPANIES:
        if comp.casefold() in text_lower or fold_text(comp) in text_folded:
            return comp
    return None


def _extract_job_number(text: str) -> str | None:
    match = re.search(r"#(\d+)", text)
    return match.group(1) if match else None


def _is_chitchat_only(text: str) -> bool:
    """Pure chitchat - no recruitment content."""
    text_lower = text.lower().strip()
    if not _match_any(text_lower, CHITCHAT_KEYWORDS):
        return False
    # If has recruitment-related terms, it's not pure chitchat
    recruitment_kw = ("cv", "resume", "job", "việc", "tuyển", "ứng", "hồ sơ", "kỹ năng", "skill")
    return not _match_any(text_lower, recruitment_kw)


def _has_cv_mention(text: str) -> bool:
    """Check if user explicitly mentions their CV."""
    return _match_any(text.lower(), USE_CV_KEYWORDS)


def _has_filter_query(text: str) -> bool:
    """Check if user is querying with specific filter (keyword/location/domain)."""
    text_lower = text.lower()
    return bool(
        _extract_location(text_lower)
        or _extract_domain(text_lower)
        or _extract_company(text_lower)
        or _extract_job_number(text_lower)
    )


def classify_intent(message: str) -> IntentClassification:
    """
    Classify user intent with CV/DB usage flags.

    Thứ tự ưu tiên: ngôn ngữ, hội thoại, ngoài phạm vi, rồi các intent tuyển dụng.
    """
    text = (message or "").strip().lower()
    if not text:
        return IntentClassification(
            intent=IntentType.UNKNOWN,
            needs_db=False,
            needs_cv=False,
            dispatch_target=None,
            requires_user_cv=False,
            needs_vector_search=False,
            db_query_params={},
            kg_params={},
        )

    # Chỉ Việt–Anh được phép đi tiếp vào phân loại nghiệp vụ.
    if contains_unsupported_script(text):
        return IntentClassification(
            intent=IntentType.UNSUPPORTED_LANGUAGE,
            needs_db=False,
            needs_cv=False,
            dispatch_target=None,
            requires_user_cv=False,
            needs_vector_search=False,
            db_query_params={},
            kg_params={},
        )

    # === 1. Chitchat ===
    if _is_chitchat_only(text):
        return IntentClassification(
            intent=IntentType.CHITCHAT,
            needs_db=False,
            needs_cv=False,
            dispatch_target=None,
            requires_user_cv=False,
            needs_vector_search=False,
            db_query_params={},
            kg_params={},
        )

    # === 2. Explicitly out of recruitment scope ===
    if _match_any(text, OFF_TOPIC_KEYWORDS):
        return IntentClassification(
            intent=IntentType.OUT_OF_SCOPE,
            needs_db=False,
            needs_cv=False,
            dispatch_target=None,
            requires_user_cv=False,
            needs_vector_search=False,
            db_query_params={},
            kg_params={},
        )

    # === 3. Recruiter candidate screening ===
    if _match_any(text, RECRUITER_SCREEN_KEYWORDS):
        return IntentClassification(
            intent=IntentType.RECRUITER_SCREEN,
            needs_db=True,
            needs_cv=True,
            dispatch_target="matching",
            requires_user_cv=False,
            needs_vector_search=True,
            db_query_params={},
            kg_params={"entity_name": "candidate_profile"},
        )

    # === 4. Skill gap (CV-based, no DB needed for jobs) ===
    if _match_any(text, SKILL_GAP_KEYWORDS):
        return IntentClassification(
            intent=IntentType.SKILL_GAP_ADVICE,
            needs_db=False,
            needs_cv=True,
            dispatch_target="evaluation",
            requires_user_cv=True,
            needs_vector_search=False,  # Analysis-only, no VS needed
            db_query_params={},
            kg_params={
                "entity_name": _extract_domain(text) or "target_skill",
                "relation_type": "REQUIRES_SKILL",
            },
        )

    # === 5. Deep CV evaluation ===
    if _match_any(text, EVALUATE_CV_KEYWORDS):
        return IntentClassification(
            intent=IntentType.SELF_EVALUATE,
            needs_db=False,
            needs_cv=True,
            dispatch_target="evaluation",
            requires_user_cv=True,
            needs_vector_search=False,  # Direct analysis, no VS needed
            db_query_params={},
            kg_params={"entity_name": "cv_profile", "relation_type": "STRENGTHS"},
        )

    # === 6. List available jobs (browse only, NO CV) ===
    if _match_any(text, LIST_JOBS_KEYWORDS):
        return IntentClassification(
            intent=IntentType.LIST_AVAILABLE_JOBS,
            needs_db=True,
            needs_cv=False,
            dispatch_target="recommend",
            requires_user_cv=False,
            needs_vector_search=True,  # Job browse needs VS for similarity ranking
            db_query_params={
                "location": _extract_location(text) or "",
                "domain": _extract_domain(text) or "",
            },
            kg_params={},
        )

    # === 7. Browse by filter (NO CV) ===
    # Examples: "Tìm việc AI Engineer", "Công việc Python tại Hà Nội"
    has_filter = _has_filter_query(text)
    has_browse_kw = _match_any(text, BROWSE_BY_FILTER_KEYWORDS)

    if has_browse_kw and has_filter and not _has_cv_mention(text):
        domain = _extract_domain(text)
        location = _extract_location(text)
        company = _extract_company(text)
        job_num = _extract_job_number(text)

        return IntentClassification(
            intent=IntentType.SEARCH_BY_DOMAIN if domain else IntentType.TARGET_SPECIFIC,
            needs_db=True,
            needs_cv=False,
            dispatch_target="recommend",
            requires_user_cv=False,
            needs_vector_search=True,  # Job search needs VS for ranking
            db_query_params={
                "domain": domain or "",
                "location": location or "",
                "company_name": company or "",
                "target_job_num": job_num or "",
            },
            kg_params={"entity_name": domain or "target_job"},
        )

    # === 8. Use CV explicitly ===
    if _has_cv_mention(text):
        return IntentClassification(
            intent=IntentType.RECOMMEND_GENERAL,
            needs_db=True,
            needs_cv=True,
            dispatch_target="recommend",
            requires_user_cv=True,
            needs_vector_search=True,  # CV-based job matching needs VS
            db_query_params={
                "domain": _extract_domain(text) or "",
                "location": _extract_location(text) or "",
            },
            kg_params={"entity_name": _extract_domain(text) or "cv_profile"},
        )

    # === 9. Target specific company ===
    company = _extract_company(text)
    if company:
        return IntentClassification(
            intent=IntentType.TARGET_SPECIFIC,
            needs_db=True,
            needs_cv=False,
            dispatch_target="recommend",
            requires_user_cv=False,
            needs_vector_search=True,
            db_query_params={"company_name": company},
            kg_params={"entity_name": company, "relation_type": "CAREER_PATH"},
        )

    # === 10. Generic but explicit recruitment request ===
    if _match_any(text, GENERIC_RECOMMEND_KEYWORDS):
        return IntentClassification(
            intent=IntentType.RECOMMEND_GENERAL,
            needs_db=True,
            needs_cv=True,
            dispatch_target="recommend",
            requires_user_cv=True,
            needs_vector_search=True,
            db_query_params={},
            kg_params={"entity_name": "target_job"},
        )

    # === 11. Domain-only recruitment query ===
    # If has domain but no browse keyword, still browse by domain (no CV)
    if _extract_domain(text):
        return IntentClassification(
            intent=IntentType.SEARCH_BY_DOMAIN,
            needs_db=True,
            needs_cv=False,
            dispatch_target="recommend",
            requires_user_cv=False,
            needs_vector_search=True,
            db_query_params={"domain": _extract_domain(text)},
            kg_params={"entity_name": _extract_domain(text)},
        )

    # Vague recruitment wording is still in-domain, but must not silently
    # trigger retrieval/provider work without a supported intent.
    if _match_any(text, RECRUITMENT_DOMAIN_KEYWORDS):
        return IntentClassification(
            intent=IntentType.UNKNOWN,
            needs_db=False,
            needs_cv=False,
            dispatch_target=None,
            requires_user_cv=False,
            needs_vector_search=False,
            db_query_params={},
            kg_params={},
        )

    # Không nhận diện được thì đóng luồng, không tự động gọi DB/provider.
    return IntentClassification(
        intent=IntentType.OUT_OF_SCOPE,
        needs_db=False,
        needs_cv=False,
        dispatch_target=None,
        requires_user_cv=False,
        needs_vector_search=False,
        db_query_params={},
        kg_params={},
    )


# === Validation ===

def validate_content(text: str) -> tuple[bool, RejectionReason | None]:
    """Validate content meets minimum requirements."""
    if not text or len(text.strip()) < MIN_CONTENT_LENGTH:
        return False, RejectionReason.MINIMUM_CONTENT_NOT_MET

    if len(text) > MAX_INPUT_LENGTH:
        return False, RejectionReason.MALFORMED_REQUEST

    return True, None


def check_sensitive_content(text: str) -> bool:
    """Detect sensitive content (phone, email)."""
    for pattern in SENSITIVE_PATTERNS:
        if re.search(pattern, text):
            return True
    return False


def check_off_topic(text: str) -> bool:
    """Check if input is clearly off-topic."""
    text_lower = text.lower()
    off_topic_count = sum(1 for keyword in OFF_TOPIC_KEYWORDS if _match_any(text_lower, (keyword,)))

    if off_topic_count >= 2:
        return True

    recruitment_keywords = (
        "cv", "resume", "job", "việc", "tuyển", "ứng", "hồ sơ",
        "kỹ năng", "skill", "experience", "kinh nghiệm",
    )
    has_recruitment = _match_any(text_lower, recruitment_keywords)

    return off_topic_count > 0 and not has_recruitment
