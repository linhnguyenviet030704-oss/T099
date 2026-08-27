"""Cấu hình từ khóa song ngữ cho bộ định tuyến hội thoại."""

from __future__ import annotations

import re
import unicodedata

KNOWN_LOCATIONS = (
    "hà nội", "hanoi", "tp hcm", "tphcm", "hồ chí minh", "ho chi minh",
    "đà nẵng", "da nang", "hải phòng", "hai phong", "cần thơ", "can tho",
    "bình dương", "binh duong", "đồng nai", "dong nai",
    "remote", "online", "từ xa", "tại nhà",
    "vn", "việt nam", "vietnam",
)

KNOWN_DOMAINS = (
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

KNOWN_COMPANIES = (
    "vng", "fpt", "viettel", "tiki", "shopee", "momo",
    "techcombank", "grab", "be group", "zalo", "cmc", "nashtech",
    "kms", "axon active", "logivan", "base.vn", "sky mavis", "coccoc",
)

LIST_JOBS_KEYWORDS = (
    "các công việc hiện có", "công việc hiện có", "danh sách việc làm", "danh sách công việc",
    "tất cả công việc", "tất cả việc làm", "những việc đang tuyển", "những việc làm đang tuyển",
    "có những việc nào", "có việc gì", "hiện có những việc nào", "việc làm hiện có",
    "xem danh sách việc", "xem việc làm", "các việc làm hiện có", "các vị trí đang tuyển",
    "vị trí đang tuyển", "danh sách tuyển dụng", "các tin tuyển dụng", "tin tuyển dụng hiện có",
    "show all jobs", "all jobs", "list jobs", "show jobs", "available jobs",
    "available positions", "open positions", "current openings", "job vacancies",
    "give me list of job", "give me a list of jobs", "give me the list of jobs",
    "show me jobs", "what jobs are available", "any jobs available",
)

BROWSE_BY_FILTER_KEYWORDS = (
    "tìm việc", "tìm công việc", "tìm việc làm", "tìm job",
    "công việc", "việc làm", "vị trí",
    "find jobs", "find a job", "search jobs", "search for jobs", "looking for work",
    "jobs about", "jobs for", "job opening", "job openings", "openings", "positions",
)

USE_CV_KEYWORDS = (
    "phù hợp với cv", "phù hợp với tôi", "phù hợp với mình",
    "match với cv", "match với tôi", "match cv với", "match resume with",
    "suitable for my cv", "suitable for me", "match my cv", "fit my profile",
    "based on my cv", "based on my resume", "using my cv", "using my resume",
    "jobs for my cv", "jobs for my resume",
    "dựa trên cv", "dựa trên hồ sơ", "theo cv của tôi",
    "theo hồ sơ của tôi", "từ cv của tôi", "cv của tôi", "hồ sơ của tôi",
)

EVALUATE_CV_KEYWORDS = (
    "đánh giá cv", "đánh giá resume", "đánh giá hồ sơ",
    "chấm điểm cv", "review cv", "review my cv", "review my resume",
    "rate my cv", "rate my resume", "evaluate my cv", "evaluate my resume",
    "cv mạnh yếu", "cv tôi mạnh yếu", "cv tốt không", "cv có tốt không",
    "điểm mạnh điểm yếu", "strengths and weaknesses", "resume feedback", "cv feedback",
    "cv của tôi như thế nào", "hồ sơ của tôi thế nào", "hồ sơ của tôi như thế nào",
    "feedback on my resume", "feedback on my cv",
)

SKILL_GAP_KEYWORDS = (
    "bổ sung", "cần học", "kỹ năng gì", "thiếu kỹ năng",
    "học thêm", "lộ trình", "skill gap", "yêu cầu thêm", "học gì",
    "cần cải thiện", "cần phát triển",
    "what should i learn", "what do i need to learn", "skills do i need",
    "missing skills", "skills am i missing", "learning path", "career roadmap",
    "improve my skills", "skills to improve", "skills should i improve",
)

RECRUITER_SCREEN_KEYWORDS = (
    "gợi ý ứng viên", "tìm ứng viên", "ứng viên phù hợp", "lọc ứng viên",
    "đánh giá ứng viên", "xếp hạng ứng viên", "candidate matching",
    "find candidates", "screen candidates", "rank candidates", "recommend candidates",
    "suitable candidates", "candidate shortlist", "shortlist candidates",
)

GENERIC_RECOMMEND_KEYWORDS = (
    "gợi ý việc", "gợi ý công việc", "gợi ý job", "việc phù hợp",
    "công việc phù hợp", "tôi cần việc", "tìm việc", "tìm công việc",
    "tìm việc làm", "recommend jobs", "recommend a job", "job recommendation",
    "job search", "find me a job", "help me find a job", "suggest jobs",
)

RECRUITMENT_DOMAIN_KEYWORDS = (
    "cv", "resume", "hồ sơ", "việc", "công việc", "job", "jobs", "career", "nghề nghiệp",
    "tuyển dụng", "ứng viên", "candidate", "candidates", "nhà tuyển dụng", "recruiter",
    "phỏng vấn", "interview", "kỹ năng", "skill", "skills", "kinh nghiệm", "experience",
    "mức lương", "salary", "job description", "jd", "vacancy", "opening", "position",
)

CHITCHAT_KEYWORDS = (
    "xin chào", "chào bạn", "cảm ơn", "bạn là ai", "hướng dẫn", "giúp đỡ",
    "hello", "hi", "hey", "thanks", "thank you", "who are you", "help me",
)

TARGET_SPECIFIC_KEYWORDS = (
    "tại fpt", "tại vng", "tại viettel", "tại shopee", "tại grab",
    "tại momo", "tại tiki", "tại zalo", "tại coccoc",
)

OFF_TOPIC_KEYWORDS = (
    "thời tiết", "tin tức thế giới", "chứng khoán", "crypto", "bitcoin",
    "nấu ăn", "du lịch không liên quan", "y tế không liên quan",
    "weather", "world news", "stock market", "cryptocurrency", "cooking recipe",
    "travel itinerary", "medical diagnosis",
)

_UNSUPPORTED_SCRIPT_RE = re.compile(
    "[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]"
)


def fold_text(text: str) -> str:
    """Tạo bản văn bản không dấu để so khớp Việt–Anh ổn định."""

    folded = unicodedata.normalize("NFKD", str(text)).casefold()
    folded = "".join(char for char in folded if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", folded.replace("đ", "d")).strip()


def contains_unsupported_script(text: str) -> bool:
    """Nhận diện các hệ chữ nằm ngoài phạm vi Việt–Anh đã công bố."""

    return bool(_UNSUPPORTED_SCRIPT_RE.search(str(text)))
