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
    "match với cv", "match với tôi", "match cv",
    "suitable for my cv", "suitable for me", "match my cv", "fit my profile",
    "based on my cv", "dựa trên cv", "dựa trên hồ sơ", "theo cv của tôi",
    "theo hồ sơ của tôi", "từ cv của tôi", "cv của tôi", "hồ sơ của tôi",
)

# Case C: Deep CV evaluation - scoring, strengths, weaknesses
_EVALUATE_CV_KEYWORDS = (
    "đánh giá cv", "đánh giá resume", "đánh giá hồ sơ",
    "chấm điểm cv", "review cv", "review my cv", "rate my cv", "rate my resume",
    "evaluate my resume", "evaluate cv", "evaluate resume",
    "cv mạnh yếu", "cv tôi mạnh yếu", "cv của tôi mạnh yếu",
    "cv tốt không", "cv có tốt không",
    "điểm mạnh điểm yếu", "strengths and weaknesses",
    "cv của tôi như thế nào", "cv của tôi thế nào",
    "hồ sơ của tôi như thế nào", "hồ sơ của tôi thế nào",
)

# Case D: Skill gap advice (CV-based)
_SKILL_GAP_KEYWORDS = (
    "bổ sung", "cần học", "kỹ năng gì", "thiếu kỹ năng",
    "học thêm", "lộ trình", "skill gap", "yêu cầu thêm", "học gì",
    "cần cải thiện", "tôi cần cải thiện", "cần phát triển",
    "improve my skills", "cải thiện kỹ năng",
)

# Chitchat
_CHITCHAT_KEYWORDS = (
    "xin chào", "chào bạn", "cảm ơn", "cảm ơn bạn", "bạn là ai", "hướng dẫn", "giúp đỡ",
    "hello", "hi", "hey", "thanks", "thank you",
)

# Recruiter intents (kept for compatibility)
_TARGET_SPECIFIC_KEYWORDS = (
    "tại fpt", "tại vng", "tại viettel", "tại shopee", "tại grab",
    "tại momo", "tại tiki", "tại zalo", "tại coccoc",
)

_RECRUITER_MATCH_KEYWORDS = (
    "gợi ý ứng viên", "tìm ứng viên", "lọc ứng viên", "danh sách ứng viên",
    "các ứng viên", "ứng viên phù hợp", "xem ứng viên", "suggest candidates",
    "find candidates", "recommend candidates", "list candidates",
)

# Security, prompt injection, and credential probe keywords
_SECURITY_AND_INJECTION_KEYWORDS = (
    "api key", "apikey", "api_key", "secret key", "secret token", "token bí mật",
    "system prompt", "mật khẩu", "password", "bỏ qua hướng dẫn", "previous instructions",
    "ignore instructions", "override instructions", "disregard instructions", "output keys",
    "đưa cho tôi api", "cho tôi api", "lấy api key", "show api key", "your api key", "api key của bạn",
    "cung cấp api key", "lộ key", "lộ api", "jailbreak", "prompt injection",
)


# === Language Validation Patterns & Dictionaries ===

# Non-Latin script ranges: CJK, Kana, Hangul, Cyrillic, Arabic, Hebrew, Thai, Lao, Khmer, Indic, Greek
_NON_LATIN_SCRIPTS_PATTERN = re.compile(
    r"["
    r"\u4e00-\u9fff"  # CJK Unified Ideographs (Chinese / Japanese Kanji)
    r"\u3400-\u4dbf"  # CJK Unified Ideographs Extension A
    r"\u3040-\u309f"  # Hiragana
    r"\u30a0-\u30ff"  # Katakana
    r"\uac00-\ud7af"  # Hangul Syllables (Korean)
    r"\u1100-\u11ff"  # Hangul Jamo
    r"\u3130-\u318f"  # Hangul Compatibility Jamo
    r"\u0400-\u04ff"  # Cyrillic (Russian, Ukrainian, etc.)
    r"\u0500-\u052f"  # Cyrillic Supplementary
    r"\u0600-\u06ff"  # Arabic
    r"\u0750-\u077f"  # Arabic Supplement
    r"\u0590-\u05ff"  # Hebrew
    r"\u0e00-\u0e7f"  # Thai
    r"\u0e80-\u0eff"  # Lao
    r"\u1780-\u17ff"  # Khmer
    r"\u1000-\u109f"  # Myanmar
    r"\u0900-\u097f"  # Devanagari (Hindi, Sanskrit, Marathi, Nepali)
    r"\u0980-\u09ff"  # Bengali
    r"\u0a80-\u0aff"  # Gujarati
    r"\u0b00-\u0b7f"  # Oriya
    r"\u0b80-\u0bff"  # Tamil
    r"\u0c00-\u0c7f"  # Telugu
    r"\u0c80-\u0cff"  # Kannada
    r"\u0d00-\u0d7f"  # Malayalam
    r"\u0370-\u03ff"  # Greek and Coptic
    r"]"
)

# Foreign Latin letters / diacritics not present in English or Vietnamese
_FOREIGN_LATIN_CHARS_PATTERN = re.compile(
    r"[äöüßÄÖÜẞçœæÇŒÆñÑ¿¡ąęłśźżćńğşıİțșčšžřďťňůőűåøÅØĄĘŁŚŹŻĆŃĞŞȚȘČŠŽŘĎŤŇŮŐŰ]"
)

# Distinctive foreign words / stopwords (French, German, Spanish, Portuguese, Italian, Japanese Romaji, Russian Translit)
_FOREIGN_LANGUAGE_KEYWORDS = {
    # French
    "bonjour", "bonsoir", "merci", "cherche", "recherche", "emploi", "travail",
    "poste", "postes", "candidat", "candidats", "recrutement", "dans", "avec", "pour",
    "vous", "nous", "ils", "elle", "suis", "une", "les", "des", "sur", "par", "qui",
    "que", "faire", "quelles", "sont", "cette", "ces", "salut", "bien", "vouloir",
    "évaluer", "evaluer", "compétence", "compétences", "competence", "competences",
    "requise", "requises", "mon", "ton", "son", "notre", "votre", "leur", "développeur", "developpeur",
    # German
    "guten", "morgen", "abend", "danke", "bitte", "suche", "stelle", "stellen",
    "arbeit", "beruf", "bewerbung", "lebenslauf", "fähigkeiten", "kenntnisse",
    "ich", "sie", "wir", "nicht", "und", "der", "die", "das", "ein", "eine",
    "einer", "einem", "einen", "mit", "für", "fuer", "auf", "kann", "welche",
    "sind", "brauche", "woher", "warum", "diesen", "dieser", "bewerten", "softwareentwickler",
    # Spanish / Portuguese
    "hola", "buenos", "dias", "días", "tardes", "noches", "gracias", "favor",
    "busco", "trabajo", "empleo", "puesto", "puestos", "vacante", "vacantes",
    "candidatos", "curriculum", "currículum", "habilidades", "experiencia", "para",
    "como", "cómo", "esta", "está", "estoy", "donde", "dónde", "cuales", "cuáles",
    "quiero", "necesito", "olá", "obrigado", "obrigada", "procuro", "vaga", "vagas",
    "curriculo", "currículo", "quais", "muito", "evalúa", "evalua", "disponibles",
    "pela", "ajuda", "desenvolvedor", "desarrollador",
    # Italian
    "ciao", "buongiorno", "buonasera", "grazie", "prego", "cerco", "lavoro",
    "competenze", "sono", "cosa", "dove", "voglio", "posso", "posizioni", "aperte",
    "quali",
    # Japanese Romaji
    "konnichiwa", "arigatou", "arigato", "sayonara", "ohayou", "hajimemashite", "gozaimasu",
    # Russian Transliteration
    "privet", "spasibo", "pozhaluysta", "rabota", "ischu",
}

# Vietnamese diacritics pattern
_VIETNAMESE_DIACRITICS_PATTERN = re.compile(
    r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ"
    r"ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]"
)

# Common Vietnamese words/syllables
_VIETNAMESE_WORDS = {
    "toi", "tôi", "minh", "mình", "ban", "bạn", "cac", "các", "nhung", "những",
    "viec", "việc", "lam", "làm", "tim", "tìm", "cong", "công", "tuyen", "tuyển",
    "dung", "dụng", "ung", "ứng", "vien", "viên", "ho", "hồ", "so", "sơ",
    "danh", "sach", "sách", "phu", "phù", "hop", "hợp", "cho", "tai", "tại",
    "voi", "với", "ve", "về", "de", "để", "co", "có", "khong", "không",
    "nao", "nào", "gi", "gì", "sao", "the", "thế", "can", "cần", "hoc", "học",
    "diem", "điểm", "manh", "mạnh", "yeu", "yếu", "chua", "chưa", "chao", "chào",
    "xin", "cam", "cảm", "on", "ơn", "tot", "tốt", "kem", "kém", "nhieu", "nhiều",
    "it", "ít", "cao", "thap", "thấp", "muc", "mức", "luong", "lương",
    "kinh", "nghiem", "nghiệm", "ky", "kỹ", "nang", "năng", "nganh", "ngành",
    "nghe", "nghề", "vi", "vị", "tri", "trí", "ty", "fpt", "vng", "viettel",
    "shopee", "tiki", "momo", "zalo", "coccoc", "hcm", "tphcm", "hanoi", "danang",
    "ha", "noi", "da", "nang", "sai", "gon", "saigon", "tro", "ly", "giup", "do",
    "huong", "dan", "lo", "trinh", "bo", "sung", "them", "cai", "thien", "danh",
    "gia", "cham", "duoi", "tren", "theo", "tu", "cua", "nhan", "su", "lap", "trinh",
    "phat", "trien", "kiem", "toan", "ke", "tai", "chinh", "ngan", "hang", "ban",
    "hang", "kho", "van", "chuoi", "cung", "ung", "an", "toan", "thong", "tin",
}

# Common English words
_ENGLISH_WORDS = {
    "a", "about", "above", "after", "again", "against", "ai", "all", "am", "an",
    "and", "any", "are", "as", "at", "backend", "be", "because", "been", "before",
    "being", "below", "best", "between", "both", "browse", "but", "by", "can",
    "candidate", "candidates", "cloud", "company", "compare", "cv", "data",
    "developer", "devops", "do", "does", "doing", "down", "during", "each",
    "engineer", "engineering", "evaluate", "evaluation", "experience", "few",
    "filter", "find", "fit", "for", "from", "frontend", "fullstack", "further",
    "gap", "get", "give", "good", "had", "has", "have", "having", "he", "hello",
    "help", "her", "here", "hers", "herself", "hey", "hi", "him", "himself",
    "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "java",
    "javascript", "jd", "job", "jobs", "just", "kubernetes", "learn", "list",
    "logistic", "logistics", "looking", "machine", "marketing", "match", "matching",
    "me", "ml", "mobile", "more", "most", "my", "myself", "need", "no", "nor",
    "not", "now", "of", "off", "on", "once", "only", "open", "opening", "openings",
    "or", "other", "our", "ours", "ourselves", "out", "over", "own", "please",
    "position", "positions", "profile", "python", "rate", "react", "recommend",
    "recommendation", "recruiter", "recruitment", "remote", "resume", "review",
    "role", "roles", "salary", "same", "search", "senior", "she", "should", "show",
    "skill", "skills", "so", "software", "some", "such", "suitable", "tech",
    "than", "thank", "thanks", "that", "the", "their", "theirs", "them",
    "themselves", "then", "there", "these", "they", "this", "those", "through",
    "to", "too", "top", "under", "until", "up", "us", "very", "want", "was",
    "we", "were", "what", "when", "where", "which", "while", "who", "whom",
    "why", "with", "work", "working", "would", "you", "your", "yours", "yourself",
    "yourselves",
}


def is_supported_language(text: str) -> tuple[bool, str | None]:
    """
    Check whether the input text is in a supported language (Vietnamese or English).

    Returns:
        (True, "vi") if Vietnamese,
        (True, "en") if English,
        (False, None) if foreign script, foreign language, or unsupported.
    """
    cleaned = (text or "").strip()
    if not cleaned:
        return False, None

    # 1. Non-Latin scripts check (Chinese, Japanese, Korean, Cyrillic, Arabic, Thai, Hindi, etc.)
    if _NON_LATIN_SCRIPTS_PATTERN.search(cleaned):
        return False, None

    # 2. Distinct foreign Latin characters / diacritics check (German, French, Spanish, etc.)
    if _FOREIGN_LATIN_CHARS_PATTERN.search(cleaned):
        return False, None

    text_lower = cleaned.lower()

    # 3. Foreign distinctive words check
    words = re.findall(r"\b[^\W\d_]+\b", text_lower, re.UNICODE)
    if words:
        foreign_matches = sum(1 for w in words if w in _FOREIGN_LANGUAGE_KEYWORDS)
        vi_count = sum(1 for w in words if w in _VIETNAMESE_WORDS)
        en_count = sum(
            1 for w in words
            if w in _ENGLISH_WORDS or w in _KNOWN_DOMAINS or w in _KNOWN_COMPANIES or w in KNOWN_LOCATIONS
        )

        if foreign_matches >= 1 and foreign_matches >= vi_count and foreign_matches >= en_count:
            return False, None

    # 4. Check for Vietnamese diacritics
    if _VIETNAMESE_DIACRITICS_PATTERN.search(cleaned):
        return True, "vi"

    # 5. Check words against Vietnamese and English dictionaries + known entities
    if not words:
        return True, "en"

    vi_count = sum(1 for w in words if w in _VIETNAMESE_WORDS)
    en_count = sum(
        1 for w in words
        if w in _ENGLISH_WORDS or w in _KNOWN_DOMAINS or w in _KNOWN_COMPANIES or w in KNOWN_LOCATIONS
    )

    if vi_count > en_count:
        return True, "vi"
    return True, "en"


# === Content validation ===

# Luồng xác thực đầy đủ yêu cầu đủ nội dung trước khi chuyển sang agent phía sau.
# ChatService vẫn xử lý riêng các câu hội thoại ngắn như "hi" hoặc "xin chào".
MIN_CONTENT_LENGTH = 100
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
        # Luôn khớp theo ranh giới từ để "data" không khớp nhầm
        # bên trong "database", "metadata" hoặc các từ dài khác.
        if re.search(rf"(?<!\w){re.escape(dom.casefold())}(?!\w)", text_lower) or re.search(
            rf"(?<!\w){re.escape(dom_folded)}(?!\w)", text_folded
        ):
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
    recruitment_kw = (
        "cv", "resume", "job", "việc", "tuyển", "ứng", "hồ sơ", "kỹ năng", "skill",
        "cải thiện", "đánh giá", "lộ trình", "học", "match",
    )
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

    Thứ tự ưu tiên: kiểm tra ngôn ngữ và an toàn, hội thoại, ngoài phạm vi,
    sau đó mới phân loại các intent tuyển dụng cụ thể.
    """
    raw_text = (message or "").strip()
    if not raw_text:
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
    if contains_unsupported_script(raw_text):
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

    # === 0. Language Check (Reject non-English and non-Vietnamese) ===
    is_supported, _ = is_supported_language(raw_text)
    if not is_supported:
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

    text = raw_text.lower()

    # === 0.1 Security / Injection / Off-topic Check ===
    if _match_any(text, _SECURITY_AND_INJECTION_KEYWORDS) or check_off_topic(text):
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
    """Validate content meets minimum requirements and language policy."""
    if not text or len(text.strip()) < MIN_CONTENT_LENGTH:
        return False, RejectionReason.MINIMUM_CONTENT_NOT_MET

    if len(text) > MAX_INPUT_LENGTH:
        return False, RejectionReason.MALFORMED_REQUEST

    is_supported, _ = is_supported_language(text)
    if not is_supported:
        return False, RejectionReason.UNSUPPORTED_LANGUAGE

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
