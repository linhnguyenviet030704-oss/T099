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

# === Domain / location / title keywords ===

_KNOWN_LOCATIONS = (
    "hà nội", "hanoi", "tp hcm", "tphcm", "hồ chí minh", "ho chi minh",
    "đà nẵng", "da nang", "hải phòng", "hai phong", "cần thơ", "can tho",
    "bình dương", "binh duong", "đồng nai", "dong nai",
    "remote", "online", "từ xa", "tai nha",
    "vn", "việt nam", "vietnam",
)

_KNOWN_DOMAINS = (
    "ai", "machine learning", "ml", "deep learning", "data scientist",
    "data engineer", "data analyst", "data", "ai engineer",
    "logistic", "logistics", "vận tải", "kho vận", "supply chain", "chuỗi cung ứng",
    "marketing", "digital marketing", "seo", "content", "truyền thông",
    "kế toán", "kiểm toán", "accounting", "finance", "tài chính", "ngân hàng", "banking",
    "bán hàng", "sales", "kinh doanh", "business development",
    "nhân sự", "hr", "recruitment", "tuyển dụng",
    "it", "lập trình", "developer", "software", "backend", "frontend", "fullstack",
    "mobile", "ios", "android", "devops", "cloud", "product manager", "product owner",
    "business analyst", "ba", "qc", "qa", "tester", "ui/ux", "designer", "thiết kế",
    "security", "an toàn thông tin", "ecommerce", "thương mại điện tử",
    "python", "java", "javascript", "react", "node", "golang",
)

_KNOWN_COMPANIES = (
    "vng", "fpt", "viettel", "tiki", "shopee", "momo",
    "techcombank", "grab", "be group", "zalo", "cmc", "nashtech",
    "kms", "axon active", "logivan", "base.vn", "sky mavis", "coccoc",
)


# === Intent pattern groups ===

# Case A: Pure job browsing - search/filter jobs, NO CV
_LIST_JOBS_KEYWORDS = (
    "các công việc hiện có", "công việc hiện có", "danh sách việc làm", "danh sách công việc",
    "tất cả công việc", "tất cả việc làm", "những việc đang tuyển", "những việc làm đang tuyển",
    "có những việc nào", "có việc gì", "hiện có những việc nào", "việc làm hiện có",
    "xem danh sách việc", "xem việc làm", "các việc làm hiện có", "các vị trí đang tuyển",
    "vị trí đang tuyển", "danh sách tuyển dụng", "các tin tuyển dụng", "tin tuyển dụng hiện có",
    "show all jobs", "all jobs", "list jobs", "show jobs",
)

# Case B: Browse by keyword/location/filter - NO CV (just filter results)
# Examples: "Tìm việc AI Engineer", "Công việc tại Hà Nội", "Việc làm Python"
_BROWSE_BY_FILTER_KEYWORDS = (
    "tìm việc", "tìm công việc", "tìm việc làm", "tìm job",
    "công việc", "việc làm", "vị trí",
    "jobs about", "jobs for", "job opening", "job openings",
)

# Explicit "use my CV" - strong CV-based matching
_USE_CV_KEYWORDS = (
    "phù hợp với cv", "phù hợp với tôi", "phù hợp với mình",
    "match với cv", "match với tôi",
    "suitable for my cv", "suitable for me", "match my cv", "fit my profile",
    "based on my cv", "dựa trên cv", "dựa trên hồ sơ", "theo cv của tôi",
    "theo hồ sơ của tôi", "từ cv của tôi", "cv của tôi", "hồ sơ của tôi",
)

# Case C: Deep CV evaluation - scoring, strengths, weaknesses
_EVALUATE_CV_KEYWORDS = (
    "đánh giá cv", "đánh giá resume", "đánh giá hồ sơ",
    "chấm điểm cv", "review cv", "rate my cv", "evaluate my resume",
    "cv mạnh yếu", "cv tốt không", "cv có tốt không",
    "điểm mạnh điểm yếu", "strengths and weaknesses",
    "cv của tôi như thế nào", "hồ sơ của tôi thế nào",
)

# Case D: Skill gap advice (CV-based)
_SKILL_GAP_KEYWORDS = (
    "bổ sung", "cần học", "kỹ năng gì", "thiếu kỹ năng",
    "học thêm", "lộ trình", "skill gap", "yêu cầu thêm", "học gì",
    "cần cải thiện", "cần phát triển",
)

# Chitchat
_CHITCHAT_KEYWORDS = (
    "xin chào", "chào bạn", "cảm ơn", "bạn là ai", "hướng dẫn", "giúp đỡ",
    "hello", "hi", "hey", "thanks", "thank you",
)

# Recruiter intents (kept for compatibility)
_TARGET_SPECIFIC_KEYWORDS = (
    "tại fpt", "tại vng", "tại viettel", "tại shopee", "tại grab",
    "tại momo", "tại tiki", "tại zalo", "tại coccoc",
)


# === Content validation ===

MIN_CONTENT_LENGTH = 100
MAX_INPUT_LENGTH = 50000

SENSITIVE_PATTERNS = [
    r"\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b",
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
]

OFF_TOPIC_KEYWORDS = [
    "thời tiết", "tin tức thế giới", "chứng khoán", "crypto", "bitcoin",
    "nấu ăn", "du lịch không liên quan", "y tế không liên quan",
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
    return any(kw in text for kw in keywords)


def _extract_location(text: str) -> str | None:
    text_lower = text.lower()
    for loc in _KNOWN_LOCATIONS:
        if loc in text_lower:
            return loc
    return None


def _extract_domain(text: str) -> str | None:
    text_lower = text.lower()
    for dom in _KNOWN_DOMAINS:
        if len(dom) <= 3:
            if re.search(rf"\b{re.escape(dom)}\b", text_lower):
                return dom
        else:
            if dom in text_lower:
                return dom
    return None


def _extract_company(text: str) -> str | None:
    text_lower = text.lower()
    for comp in _KNOWN_COMPANIES:
        if comp in text_lower:
            return comp
    return None


def _extract_job_number(text: str) -> str | None:
    match = re.search(r"#(\d+)", text)
    return match.group(1) if match else None


def _is_chitchat_only(text: str) -> bool:
    """Pure chitchat - no recruitment content."""
    text_lower = text.lower().strip()
    if not _match_any(text_lower, _CHITCHAT_KEYWORDS):
        return False
    # If has recruitment-related terms, it's not pure chitchat
    recruitment_kw = ("cv", "resume", "job", "việc", "tuyển", "ứng", "hồ sơ", "kỹ năng", "skill")
    return not _match_any(text_lower, recruitment_kw)


def _has_cv_mention(text: str) -> bool:
    """Check if user explicitly mentions their CV."""
    return _match_any(text.lower(), _USE_CV_KEYWORDS)


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

    Priority order:
    1. Chitchat (no recruitment context)
    2. Skill gap (always CV-based)
    3. Evaluate CV (deep evaluation)
    4. List jobs / browse by filter (NO CV)
    5. Use CV explicitly (CV-based matching)
    6. Default: browse jobs
    """
    text = (message or "").strip().lower()
    if not text:
        return IntentClassification(
            intent=IntentType.RECOMMEND_GENERAL,
            needs_db=True,
            needs_cv=True,
            dispatch_target="recommend",
            requires_user_cv=True,
            needs_vector_search=True,  # Default job search needs VS
            db_query_params={},
            kg_params={"entity_name": "target_job"},
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

    # === 2. Skill gap (CV-based, no DB needed for jobs) ===
    if _match_any(text, _SKILL_GAP_KEYWORDS):
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

    # === 3. Deep CV evaluation ===
    if _match_any(text, _EVALUATE_CV_KEYWORDS):
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

    # === 4. List available jobs (browse only, NO CV) ===
    if _match_any(text, _LIST_JOBS_KEYWORDS):
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

    # === 5. Browse by filter (NO CV) ===
    # Examples: "Tìm việc AI Engineer", "Công việc Python tại Hà Nội"
    has_filter = _has_filter_query(text)
    has_browse_kw = _match_any(text, _BROWSE_BY_FILTER_KEYWORDS)

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

    # === 6. Use CV explicitly ===
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

    # === 7. Target specific company ===
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

    # === Default: recommend general ===
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
    off_topic_count = sum(1 for kw in OFF_TOPIC_KEYWORDS if kw in text_lower)

    if off_topic_count >= 2:
        return True

    recruitment_keywords = (
        "cv", "resume", "job", "việc", "tuyển", "ứng", "hồ sơ",
        "kỹ năng", "skill", "experience", "kinh nghiệm",
    )
    has_recruitment = any(kw in text_lower for kw in recruitment_keywords)

    return off_topic_count > 0 and not has_recruitment
