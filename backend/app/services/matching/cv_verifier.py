"""Module xác thực độ chân thực của CV và phát hiện CV ảo (Resume Inflation & Fraud Detection).

Cung cấp các công cụ:
- Kiểm tra tính nhất quán dòng thời gian (Timeline Sanity & Anachronism)
- Phân loại kỹ năng theo cấp độ bằng chứng thực tế (Claim-to-Evidence Matrix: Ghost vs Active vs Impact)
- Chấm điểm độ sâu kỹ thuật của dự án (Project Substance & Technical Depth)
- Tính toán chỉ số tin cậy (Trust Score) và hệ số phạt gian lận (Inflation Penalty)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from backend.app.services.matching.skills import extract_skills

# Cơ sở dữ liệu năm phát hành công nghệ nhằm phát hiện nghịch lý "xuyên không"
# Ví dụ: Khai 10 năm kinh nghiệm Flutter (Flutter ra mắt 2017 -> vô lý)
TECH_RELEASE_YEARS: dict[str, int] = {
    # Web & Frameworks
    "react": 2013,
    "vue": 2014,
    "vue.js": 2014,
    "angular": 2016,  # Angular 2+
    "angularjs": 2010,
    "svelte": 2016,
    "next.js": 2016,
    "nextjs": 2016,
    "next.js app router": 2022,
    "nuxt": 2016,
    "nuxtjs": 2016,
    "fastapi": 2018,
    "nest.js": 2017,
    "nestjs": 2017,
    "tailwind": 2017,
    "tailwindcss": 2017,
    "bun": 2022,
    "deno": 2018,
    "vite": 2020,
    "remix": 2021,
    "astro": 2021,
    "htmx": 2020,
    # Mobile
    "flutter": 2017,
    "react native": 2015,
    "swift": 2014,
    "swiftui": 2019,
    "kotlin": 2011,
    "jetpack compose": 2021,
    # Cloud, DevOps & Containers
    "docker": 2013,
    "kubernetes": 2014,
    "k8s": 2014,
    "terraform": 2014,
    "istio": 2017,
    "helm": 2015,
    "argocd": 2018,
    "podman": 2018,
    # Big Data & Streaming
    "kafka": 2011,
    "apache spark": 2014,
    "spark": 2014,
    "flink": 2014,
    # AI / ML / Data
    "pytorch": 2016,
    "tensorflow": 2015,
    "transformers": 2018,
    "huggingface": 2018,
    "langchain": 2022,
    "llamaindex": 2022,
    "openai api": 2020,
    "chromadb": 2023,
    "pinecone": 2021,
    "qdrant": 2021,
    # Languages & Core
    "rust": 2015,
    "golang": 2009,
    "go": 2009,
    "typescript": 2012,
    "graphql": 2015,
    "grpc": 2015,
}

# Các từ khóa chỉ số lượng định lượng / tác động kỹ thuật cao
IMPACT_METRIC_KEYWORDS = [
    r"\b\d+[\s]*(?:%|percent|phần trăm)\b",
    r"\b\d+[\s]*(?:ms|s|giây|milliseconds?)\b",
    r"\b\d+[\s]*(?:rps|qps|tps|req/s|requests?/s)\b",
    r"\b\d+[\s]*(?:k|m|million|triệu|nghìn|ngàn)[\s]*(?:users?|người dùng|dau|mau|ccu)\b",
    r"\b(?:tối ưu|giảm|tăng|cải thiện|tiết kiệm|optimize|reduced?|increased?|improved?|saved)\b[\w\s]{1,30}\b\d+",
    r"\b(?:latency|throughput|load time|chi phí|cost|memory|cpu|bandwidth)\b",
]

# Các từ khóa thể hiện độ phức tạp kỹ thuật (Technical Complexity)
COMPLEXITY_KEYWORDS = [
    "microservices", "distributed system", "hệ thống phân tán", "concurrency",
    "sharding", "partitioning", "replication", "caching", "redis cluster",
    "load balancing", "high availability", "ha", "fault tolerance", "failover",
    "message queue", "event-driven", "kafka", "rabbitmq", "ci/cd",
    "unit test", "integration test", "benchmark", "profiling", "indexing",
    "database tuning", "bottleneck", "thread safe", "asyncio", "goroutine",
    "rate limiting", "circuit breaker", "idempotency", "grpc", "graphql",
]

# Mẫu các đồ án sinh viên/bài tập cơ bản thường bị thổi phồng
TEMPLATE_PROJECT_PATTERNS = [
    r"web\s*(?:bán hàng|thương mại điện tử|e-commerce|shop)\s*(?:đơn giản|cơ bản)?.*(?:đăng nhập|giỏ hàng|thanh toán)",
    r"to-?do\s*(?:list|app|ứng dụng)",
    r"(?:clone|bản sao)\s*(?:facebook|trello|shopee|tik\s*tok|netflix)",
    r"quản lý\s*(?:sinh viên|thư viện|nhân sự|nhà sách|bán sách|khách sạn)\s*(?:cơ bản|đơn giản)?",
    r"weather\s*app|ứng dụng thời tiết",
    r"crud\s*(?:api|app|cơ bản)",
]


@dataclass
class ProjectEvidence:
    """Dữ liệu bằng chứng dự án được bóc tách."""

    name: str
    description: str = ""
    technologies: list[str] = field(default_factory=list)
    duration_months: int = 0
    start_date: str | None = None
    end_date: str | None = None
    role: str = ""
    metrics: list[str] = field(default_factory=list)
    depth_score: float = 0.0  # 0 - 100


@dataclass
class AuthenticityReport:
    """Báo cáo chi tiết về độ chân thực và các điểm bất thường của CV."""

    trust_score: float = 1.0  # 0.0 (rất ảo) - 1.0 (hoàn toàn đáng tin)
    authenticity_status: str = "VERIFIED"  # VERIFIED | QUESTIONABLE | HIGH_INFLATION_RISK
    claimed_years: int = 0
    verified_years: float = 0.0
    experience_discrepancy_ratio: float = 0.0
    red_flags: list[str] = field(default_factory=list)
    ghost_skills: list[str] = field(default_factory=list)
    keyword_drop_skills: list[str] = field(default_factory=list)
    active_skills: list[str] = field(default_factory=list)
    impact_skills: list[str] = field(default_factory=list)
    skill_evidence_levels: dict[str, float] = field(default_factory=dict)  # skill -> level (0.0 to 1.0)
    project_substance_score: float = 50.0  # 0 - 100
    penalty_factor: float = 0.0  # Hệ số trừ điểm 0.0 - 0.8
    anachronisms: list[dict[str, Any]] = field(default_factory=list)  # Lỗi công nghệ xuyên không


def extract_project_evidences(raw_text: str) -> list[ProjectEvidence]:
    """
    Bóc tách danh sách các dự án kèm thông tin chi tiết từ nội dung CV.
    Hoạt động độc lập không phụ thuộc LLM (Deterministic/Regex Parser).
    """
    if not raw_text or len(raw_text.strip()) < 30:
        return []

    projects: list[ProjectEvidence] = []
    lines = raw_text.splitlines()

    # Tìm phân vùng Projects trong CV
    project_section_headers = [
        r"^(?:#+\s*)?(?:projects?|dự\s*án|personal\s*projects|kinh\s*nghiệm\s*dự\s*án|selected\s*projects)\b",
        r"^(?:#+\s*)?(?:work\s*experience|kinh\s*nghiệm\s*làm\s*việc|kinh\s*nghiệm\s*chuyên\s*môn)\b",
    ]
    other_section_headers = [
        r"^(?:#+\s*)?(?:education|học\s*vấn|skills|kỹ\s*năng|certifications?|chứng\s*chỉ|languages?|ngôn\s*ngữ|awards?|giải\s*thưởng|interests?|sở\s*thích)\b",
    ]

    in_project_section = False
    current_block: list[str] = []
    blocks: list[list[str]] = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current_block:
                current_block.append("")
            continue

        # Kiểm tra xem có bắt đầu section mới không
        is_proj_start = any(re.search(p, stripped, re.IGNORECASE) for p in project_section_headers)
        is_other_start = any(re.search(p, stripped, re.IGNORECASE) for p in other_section_headers)

        if is_proj_start:
            in_project_section = True
            if current_block:
                blocks.append(current_block)
                current_block = []
            continue
        elif is_other_start and in_project_section:
            if current_block:
                blocks.append(current_block)
                current_block = []
            in_project_section = False
            continue

        if in_project_section:
            # Phát hiện tiêu đề một project mới (thường là bullet lớn, tên dự án in đậm, hoặc header cấp 3-4)
            is_new_sub_project = bool(
                re.match(r"^(?:###|\*\*|•|\-|\d+\.)\s*(?:Tên\s*dự\s*án|Dự\s*án|Project|\b[A-Z][\w\s-]{2,40}\b:?)", stripped)
                or re.search(r"\b(?:20\d\d|19\d\d)\s*[-–—]\s*(?:20\d\d|present|hiện\s*tại|nay)\b", stripped, re.IGNORECASE)
            )

            if is_new_sub_project and len(current_block) > 3:
                blocks.append(current_block)
                current_block = [stripped]
            else:
                current_block.append(stripped)

    if current_block:
        blocks.append(current_block)

    # Nếu không bắt được section riêng, chỉ bóc tách nếu thực sự có từ khóa dự án/công việc cụ thể
    if not blocks:
        temp_block: list[str] = []
        found_proj_header = False
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            if re.search(r"(?:dự\s*án|project|công\s*ty|company)\s*[:：\-–]", stripped, re.IGNORECASE):
                if temp_block and found_proj_header:
                    blocks.append(temp_block)
                    temp_block = []
                found_proj_header = True
            if found_proj_header:
                temp_block.append(stripped)
        if temp_block and found_proj_header:
            blocks.append(temp_block)

    for b in blocks:
        block_text = "\n".join(b).strip()
        if len(block_text) < 20:
            continue

        # Lấy tên dự án từ dòng đầu tiên
        first_line = b[0] if b else "Project"
        proj_name = re.sub(r"^(?:###|\*\*|•|\-|\d+\.|\s*|Tên\s*dự\s*án\s*[:：]|Project\s*[:：])", "", first_line).strip(" *#:-")
        if not proj_name or len(proj_name) > 60:
            proj_name = first_line[:50]

        # Trích xuất kỹ năng sử dụng trong project này
        skills_in_proj = extract_skills(block_text)

        # Tính thời gian (tháng)
        duration_months = _extract_duration_months(block_text)

        # Tìm các số liệu định lượng (metrics)
        metrics = []
        for pat in IMPACT_METRIC_KEYWORDS:
            for match in re.finditer(pat, block_text, re.IGNORECASE):
                snippet = match.group(0).strip()
                if snippet not in metrics:
                    metrics.append(snippet)

        # Đánh giá độ sâu kỹ thuật của dự án này
        depth = _calculate_single_project_depth(block_text, skills_in_proj, metrics)

        projects.append(
            ProjectEvidence(
                name=proj_name,
                description=block_text,
                technologies=skills_in_proj,
                duration_months=duration_months,
                metrics=metrics,
                depth_score=depth,
            )
        )

    return projects


def _extract_duration_months(text: str) -> int:
    """Tính số tháng từ khoảng thời gian trong mô tả dự án/công việc."""
    # Tìm dạng ngày tháng "MM/YYYY - MM/YYYY" hoặc "YYYY - YYYY"
    date_range_match = re.search(
        r"(\d{1,2})?[/-]?(\d{4})\s*[-–—]\s*(?:(\d{1,2})?[/-]?(\d{4})|present|hiện\s*tại|nay)",
        text,
        re.IGNORECASE,
    )
    if date_range_match:
        m1, y1, m2, y2 = date_range_match.groups()
        start_year = int(y1)
        start_month = int(m1) if m1 else 1
        current_year = datetime.now().year
        end_year = int(y2) if y2 else current_year
        end_month = int(m2) if m2 else 12

        months = (end_year - start_year) * 12 + (end_month - start_month)
        return max(months, 1)

    # Tìm dạng "thời gian: X tháng", "thời lượng: X tháng", "duration: X months", "X tháng"
    month_match = re.search(r"(\d+)\s*(?:tháng|months?|mos?)\b", text, re.IGNORECASE)
    if month_match:
        return int(month_match.group(1))

    year_match = re.search(r"(?:thời\s*gian|thời\s*lượng|duration|kéo\s*dài)[:\s]+(\d+)\s*(?:năm|years?|yrs?)\b", text, re.IGNORECASE)
    if year_match:
        return int(year_match.group(1)) * 12

    return 3  # Mặc định gán 3 tháng nếu là 1 project không ghi rõ ngày


def _calculate_single_project_depth(text: str, skills: list[str], metrics: list[str]) -> float:
    """Chấm điểm độ sâu kỹ thuật của một dự án đơn lẻ (0 - 100)."""
    score = 30.0  # Điểm sàn cơ sở

    text_lower = text.lower()

    # Kiểm tra xem có dính mẫu bài tập lớn / đồ án mẫu cơ bản không
    is_template = any(re.search(pat, text_lower) for pat in TEMPLATE_PROJECT_PATTERNS)
    if is_template:
        score -= 15.0

    # Cộng điểm từ khóa phức tạp
    complexity_hits = sum(1 for kw in COMPLEXITY_KEYWORDS if kw in text_lower)
    score += min(complexity_hits * 8.0, 35.0)

    # Cộng điểm số liệu đo lường định lượng
    score += min(len(metrics) * 10.0, 25.0)

    # Cộng điểm số lượng công nghệ phối hợp thực tế
    if len(skills) >= 3:
        score += 10.0
    if len(skills) >= 6:
        score += 5.0

    # Phạt nếu mô tả quá ngắn ngủn (< 60 ký tự)
    if len(text.strip()) < 60:
        score -= 20.0

    return max(min(round(score, 1), 100.0), 0.0)


def check_tech_anachronisms(claimed_skills: list[str], claimed_years: int, current_year: int | None = None) -> list[dict[str, Any]]:
    """
    Kiểm tra các công nghệ bị ứng viên khai khống số năm kinh nghiệm vượt quá tuổi đời công nghệ.
    Ví dụ: Khai 10 năm kinh nghiệm FastAPI (FastAPI ra mắt năm 2018 -> tối đa ~6-8 năm).
    """
    current_year = current_year or datetime.now().year
    anachronisms: list[dict[str, Any]] = []

    for skill in claimed_skills:
        skill_lower = skill.strip().lower()
        if skill_lower in TECH_RELEASE_YEARS:
            release_year = TECH_RELEASE_YEARS[skill_lower]
            max_possible_years = max(current_year - release_year, 0)
            if claimed_years > max_possible_years + 1:  # Cho phép sai số 1 năm
                anachronisms.append(
                    {
                        "skill": skill,
                        "release_year": release_year,
                        "max_possible_years": max_possible_years,
                        "claimed_years": claimed_years,
                        "message": (
                            f"Công nghệ '{skill}' mới ra mắt năm {release_year} (tối đa ~{max_possible_years} năm tuổi), "
                            f"nhưng ứng viên tuyên bố có {claimed_years} năm kinh nghiệm."
                        ),
                    }
                )
    return anachronisms


def check_timeline_sanity(
    raw_text: str,
    claimed_years: int,
    projects: list[ProjectEvidence],
    education_entries: list[str],
) -> tuple[float, list[str]]:
    """
    Kiểm tra tính nhất quán giữa số năm tự xưng và thực tế dòng thời gian.
    Trả về: (demonstrated_years, red_flags)
    """
    red_flags: list[str] = []
    current_year = datetime.now().year

    # 1. Tính tổng thời gian thực tế từ các dự án / công việc
    total_project_months = sum(p.duration_months for p in projects)
    demonstrated_years = round(total_project_months / 12.0, 1)

    # 2. Kiểm tra năm tốt nghiệp đại học / năm sinh (nếu có)
    grad_year = None
    for edu in education_entries:
        # Tìm năm 4 chữ số trong phần học vấn
        years = re.findall(r"\b(19\d\d|20\d\d)\b", edu)
        if years:
            grad_year = max(int(y) for y in years)

    if not grad_year:
        # Tìm trong toàn bộ text
        edu_match = re.search(r"(?:tốt\s*nghiệp|graduated?|bachelor|cử\s*nhân|kỹ\s*sư)[\w\s,]{0,30}\b(20\d\d)\b", raw_text, re.IGNORECASE)
        if edu_match:
            grad_year = int(edu_match.group(1))

    if grad_year:
        years_since_grad = max(current_year - grad_year, 0)
        if claimed_years > years_since_grad + 2:  # Cho phép tối đa 2 năm đi làm trước khi tốt nghiệp
            red_flags.append(
                f"Mâu thuẫn học vấn: Ứng viên tốt nghiệp năm {grad_year} (cách đây {years_since_grad} năm) "
                f"nhưng tuyên bố có {claimed_years} năm kinh nghiệm làm việc chuyên nghiệp."
            )

    # 3. Kiểm tra chênh lệch cực đoan giữa số năm tự khai và dự án thực tế
    if not projects:
        red_flags.append(
            f"Thiếu bằng chứng hoàn toàn (Zero Project Evidence): Ứng viên tự nhận {claimed_years} năm kinh nghiệm nhưng hồ sơ "
            f"hoàn toàn không có bất kỳ thông tin dự án hay lịch sử công việc nào để đối soát."
        )
    elif claimed_years >= 5 and demonstrated_years < 1.0:
        red_flags.append(
            f"Khai khống kinh nghiệm cực lớn: Tuyên bố có {claimed_years} năm kinh nghiệm nhưng tổng thời gian "
            f"chứng minh qua các dự án/công việc chỉ đạt ~{demonstrated_years} năm ({total_project_months} tháng)."
        )
    elif claimed_years >= 3 and demonstrated_years * 2.5 < claimed_years:
        red_flags.append(
            f"Kinh nghiệm không tương xứng: Khai báo {claimed_years} năm kinh nghiệm, nhưng các dự án thực tế "
            f"chỉ bao quát khoảng {demonstrated_years} năm làm việc."
        )

    # 4. Kiểm tra các câu từ phóng đại bất thường (Buzzword inflation)
    exaggeration_patterns = [
        (r"20\+?\s*năm\s*kinh\s*nghiệm", "Tự nhận 20 năm kinh nghiệm"),
        (r"1[5-9]\+?\s*năm\s*kinh\s*nghiệm", "Tự nhận 15-19 năm kinh nghiệm"),
        (r"expert in (?:everything|all technologies)", "Tự nhận là chuyên gia mọi công nghệ"),
        (r"master of (?:all|fullstack|software)", "Tuyên bố master mọi khía cạnh phần mềm"),
    ]
    for pat, desc in exaggeration_patterns:
        if re.search(pat, raw_text, re.IGNORECASE):
            if demonstrated_years < 3.0:
                red_flags.append(f"Tuyên bố thái quá: '{desc}' trong khi hồ sơ dự án không có chiều sâu tương xứng.")

    return demonstrated_years, red_flags


def calculate_claim_to_evidence_matrix(
    claimed_skills: list[str],
    projects: list[ProjectEvidence],
) -> tuple[dict[str, float], list[str], list[str], list[str], list[str]]:
    """
    Phân loại từng kỹ năng theo 4 cấp độ bằng chứng:
    - Level 0 (Ghost Skill, 0%): Chỉ nằm ở list skills, không có trong bất kỳ dự án nào.
    - Level 1 (Keyword Drop, 25%): Chỉ xuất hiện thoáng qua ở danh sách công nghệ dự án, không có hành động.
    - Level 2 (Active Usage, 70%): Xuất hiện trong mô tả hành động của dự án.
    - Level 3 (Impact & Mastery, 100%): Xuất hiện kèm số liệu đo lường hoặc bài toán phức tạp.

    Trả về: (skill_evidence_levels, ghost_skills, keyword_drop_skills, active_skills, impact_skills)
    """
    skill_evidence_levels: dict[str, float] = {}
    ghost_skills: list[str] = []
    keyword_drop_skills: list[str] = []
    active_skills: list[str] = []
    impact_skills: list[str] = []

    for skill in claimed_skills:
        skill_clean = skill.strip()
        skill_lower = skill_clean.lower()

        # Kiểm tra sự xuất hiện trong các dự án
        matching_projects = [p for p in projects if skill_lower in p.description.lower() or any(skill_lower == s.lower() for s in p.technologies)]

        if not matching_projects:
            # Level 0: Kỹ năng ma
            skill_evidence_levels[skill_clean] = 0.0
            ghost_skills.append(skill_clean)
        else:
            # Kiểm tra xem có số liệu đo lường hay độ phức tạp cao đi kèm không
            has_impact = any(p.metrics and skill_lower in p.description.lower() for p in matching_projects)
            has_complexity = any(p.depth_score >= 60.0 and skill_lower in p.description.lower() for p in matching_projects)

            if has_impact or has_complexity:
                # Level 3: Làm chủ & có tác động thực tế
                skill_evidence_levels[skill_clean] = 1.0
                impact_skills.append(skill_clean)
            else:
                # Phân biệt Level 1 vs Level 2
                # Nếu chỉ xuất hiện ở tag công nghệ hoặc đúng 1 lần không kèm động từ hành động
                action_verbs = ["xây dựng", "thiết kế", "tối ưu", "triển khai", "phát triển", "tích hợp", "xử lý", "build", "design", "optimize", "implement", "develop", "integrate", "refactor"]
                is_active = False
                for p in matching_projects:
                    sentences = re.split(r"[.\n;]+", p.description.lower())
                    for s in sentences:
                        if skill_lower in s and any(v in s for v in action_verbs):
                            is_active = True
                            break

                if is_active:
                    skill_evidence_levels[skill_clean] = 0.7
                    active_skills.append(skill_clean)
                else:
                    skill_evidence_levels[skill_clean] = 0.25
                    keyword_drop_skills.append(skill_clean)

    return skill_evidence_levels, ghost_skills, keyword_drop_skills, active_skills, impact_skills


def evaluate_cv_authenticity(
    raw_text: str,
    claimed_skills: list[str],
    claimed_years: int | None,
    education_entries: list[str] | None = None,
    projects: list[ProjectEvidence] | None = None,
) -> AuthenticityReport:
    """
    Thực hiện đánh giá toàn diện độ chân thực của CV.
    Tính toán Trust Score, phát hiện Red Flags và xác định hệ số phạt gian lận.
    """
    claimed_years_val = claimed_years if (claimed_years is not None and claimed_years > 0) else 0
    education_entries = education_entries or []

    # 1. Bóc tách dự án nếu chưa có
    if projects is None:
        projects = extract_project_evidences(raw_text)

    # 2. Kiểm tra tính nhất quán dòng thời gian & mâu thuẫn học vấn
    demonstrated_years, timeline_red_flags = check_timeline_sanity(
        raw_text=raw_text,
        claimed_years=claimed_years_val,
        projects=projects,
        education_entries=education_entries,
    )

    # 3. Kiểm tra công nghệ xuyên không
    anachronisms = check_tech_anachronisms(claimed_skills, claimed_years_val)
    anachronism_red_flags = [a["message"] for a in anachronisms]

    # 4. Ma trận Bằng chứng Kỹ năng (Claim vs Evidence)
    skill_levels, ghosts, kw_drops, actives, impacts = calculate_claim_to_evidence_matrix(
        claimed_skills=claimed_skills,
        projects=projects,
    )

    # 5. Đánh giá độ sâu kỹ thuật trung bình của các dự án
    if projects:
        avg_depth = sum(p.depth_score for p in projects) / len(projects)
    else:
        avg_depth = 20.0 if len(raw_text.strip()) > 100 else 10.0

    # 6. Tính toán Trust Score & Penalty Factor
    red_flags = [*timeline_red_flags, *anachronism_red_flags]

    # Tính tỷ lệ kỹ năng ma (Ghost Skills Ratio)
    total_skills = max(len(claimed_skills), 1)
    ghost_ratio = len(ghosts) / total_skills

    # Tính tỷ lệ chênh lệch số năm kinh nghiệm
    if claimed_years_val > 0:
        exp_discrepancy = max((claimed_years_val - demonstrated_years) / claimed_years_val, 0.0)
    else:
        exp_discrepancy = 0.0

    # Bắt đầu với Trust Score chuẩn là 1.0
    trust_score = 1.0

    # Phạt vì mâu thuẫn học vấn (ví dụ tốt nghiệp 2024 nhưng claim 8-10 năm exp)
    if any("Mâu thuẫn học vấn" in rf for rf in timeline_red_flags):
        trust_score -= 0.25

    # Phạt vì kỹ năng ma
    if ghost_ratio > 0.5:
        trust_score -= 0.35 * ghost_ratio
        red_flags.append(
            f"Nhồi nhét kỹ năng ma (Ghost Skills): Có {len(ghosts)}/{total_skills} kỹ năng ({ghost_ratio:.0%}) "
            f"chỉ được liệt kê ở phần kỹ năng mà không hề xuất hiện trong bất kỳ dự án nào."
        )
    elif ghost_ratio > 0.3:
        trust_score -= 0.15 * ghost_ratio

    # Phạt vì chênh lệch năm kinh nghiệm
    if exp_discrepancy > 0.6 and claimed_years_val >= 3:
        trust_score -= 0.35
    elif exp_discrepancy > 0.3 and claimed_years_val >= 3:
        trust_score -= 0.15

    # Phạt vì lỗi công nghệ xuyên không
    if anachronisms:
        trust_score -= 0.25 * min(len(anachronisms), 3)

    # Phạt vì dự án quá hời hợt dù tự xưng Senior/Lead (Depth mismatch)
    if claimed_years_val >= 5 and avg_depth < 40.0:
        trust_score -= 0.25
        red_flags.append(
            f"Độ sâu dự án kém: Ứng viên tự nhận {claimed_years_val} năm kinh nghiệm nhưng các dự án "
            f"chỉ đạt độ phức tạp {avg_depth:.0f}/100 (tương đương cấp độ Junior/Fresher)."
        )

    # Giới hạn Trust Score trong khoảng [0.05, 1.0]
    trust_score = max(min(round(trust_score, 2), 1.0), 0.05)

    # Xác định trạng thái chân thực
    if trust_score < 0.45 or len(red_flags) >= 2 or anachronisms:
        authenticity_status = "HIGH_INFLATION_RISK"
    elif trust_score < 0.75 or len(red_flags) >= 1:
        authenticity_status = "QUESTIONABLE"
    else:
        authenticity_status = "VERIFIED"

    # Tính hệ số phạt điểm thực (Penalty Factor: 0.0 - 0.7)
    if authenticity_status == "HIGH_INFLATION_RISK":
        penalty_factor = round((1.0 - trust_score) * 0.75, 2)
    elif authenticity_status == "QUESTIONABLE":
        penalty_factor = round((1.0 - trust_score) * 0.4, 2)
    else:
        penalty_factor = 0.0

    return AuthenticityReport(
        trust_score=trust_score,
        authenticity_status=authenticity_status,
        claimed_years=claimed_years_val,
        verified_years=demonstrated_years,
        experience_discrepancy_ratio=round(exp_discrepancy, 2),
        red_flags=red_flags,
        ghost_skills=ghosts,
        keyword_drop_skills=kw_drops,
        active_skills=actives,
        impact_skills=impacts,
        skill_evidence_levels=skill_levels,
        project_substance_score=round(avg_depth, 1),
        penalty_factor=penalty_factor,
        anachronisms=anachronisms,
    )
