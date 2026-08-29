"""Module tổng hợp hồ sơ chuẩn ngành nghề (Role Benchmark Synthesizer).

Cung cấp dữ liệu chuẩn mực về kỹ năng, kinh nghiệm và mô tả công việc (JD mẫu)
cho từng vị trí và cấp bậc trong ngành CNTT / Phần mềm, phục vụ đối chiếu đánh giá CV.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from backend.app.services.matching.skills import extract_skills


@dataclass
class RoleBenchmark:
    """Hồ sơ chuẩn mực ngành nghề đối chiếu."""

    role_name: str
    level: str
    expected_years: int
    core_skills: list[str] = field(default_factory=list)
    advanced_skills: list[str] = field(default_factory=list)
    prerequisites: list[str] = field(default_factory=list)
    description: str = ""
    benchmark_jd_text: str = ""


# Từ điển chuẩn mực các vai trò và kỹ năng cốt lõi theo ngành nghề
ROLE_BENCHMARK_CATALOG: dict[str, dict[str, Any]] = {
    "backend": {
        "canonical_name": "Backend Developer",
        "aliases": ["backend", "back-end", "lập trình backend", "backend engineer", "backend developer", "server engineer"],
        "core_skills": ["python", "fastapi", "postgresql", "restful_api", "docker", "git", "sql", "linux"],
        "advanced_skills": ["redis", "kafka", "microservices", "kubernetes", "ci/cd", "concurrency", "rabbitmq"],
        "prerequisites": ["data_structures", "algorithms", "oop", "networking", "database_design"],
        "description": "Lập trình viên Backend chịu trách nhiệm thiết kế, xây dựng và tối ưu hệ thống dịch vụ phía máy chủ, cơ sở dữ liệu và API.",
    },
    "frontend": {
        "canonical_name": "Frontend Developer",
        "aliases": ["frontend", "front-end", "lập trình frontend", "frontend engineer", "frontend developer", "web developer", "react developer"],
        "core_skills": ["javascript", "typescript", "react", "html", "css", "tailwind", "next.js", "git"],
        "advanced_skills": ["state_management", "redux", "web_performance", "testing", "graphql", "pwa"],
        "prerequisites": ["html", "css", "javascript_basics", "dom_manipulation"],
        "description": "Lập trình viên Frontend phát triển giao diện người dùng tương tác cao, tối ưu trải nghiệm và hiệu năng hiển thị trên trình duyệt.",
    },
    "fullstack": {
        "canonical_name": "Fullstack Developer",
        "aliases": ["fullstack", "full-stack", "lập trình fullstack", "fullstack engineer", "fullstack developer"],
        "core_skills": ["javascript", "typescript", "react", "python", "fastapi", "postgresql", "docker", "git", "restful_api"],
        "advanced_skills": ["next.js", "redis", "ci/cd", "microservices", "cloud_deployment", "graphql"],
        "prerequisites": ["html", "css", "javascript", "oop", "sql"],
        "description": "Lập trình viên Fullstack có khả năng đảm nhiệm toàn diện từ giao diện người dùng đến kiến trúc dịch vụ phía backend và cơ sở dữ liệu.",
    },
    "mobile": {
        "canonical_name": "Mobile Developer",
        "aliases": ["mobile", "lập trình di động", "mobile developer", "flutter developer", "react native developer", "ios developer", "android developer"],
        "core_skills": ["flutter", "dart", "mobile_dev", "restful_api", "git", "ui_ux_mobile"],
        "advanced_skills": ["state_management", "native_bridge", "app_performance", "ci/cd_mobile", "firebase", "sqlite"],
        "prerequisites": ["oop", "basic_programming", "ui_design_principles"],
        "description": "Lập trình viên Mobile phát triển các ứng dụng di động đa nền tảng hoặc native trên iOS và Android.",
    },
    "ai_ml": {
        "canonical_name": "AI / Machine Learning Engineer",
        "aliases": ["ai", "ai engineer", "machine learning", "ml engineer", "deep learning", "ai/ml", "nlp engineer", "computer vision"],
        "core_skills": ["python", "pytorch", "machine_learning", "deep_learning", "numpy", "pandas", "git", "docker"],
        "advanced_skills": ["transformers", "langchain", "huggingface", "llm", "vector_database", "mlops", "model_optimization"],
        "prerequisites": ["linear_algebra", "calculus", "probability_statistics", "python_programming"],
        "description": "Kỹ sư AI/ML nghiên cứu, xây dựng và tích hợp các mô hình học máy, học sâu và ứng dụng trí tuệ nhân tạo tạo sinh vào hệ thống.",
    },
    "data_engineer": {
        "canonical_name": "Data Engineer",
        "aliases": ["data engineer", "kỹ sư dữ liệu", "big data", "etl developer"],
        "core_skills": ["python", "sql", "postgresql", "apache_spark", "kafka", "docker", "data_warehouse", "git"],
        "advanced_skills": ["airflow", "dbt", "data_lake", "distributed_computing", "cloud_data_warehouse", "flink"],
        "prerequisites": ["database_fundamentals", "sql_mastery", "python", "data_modeling"],
        "description": "Kỹ sư dữ liệu thiết kế và vận hành hệ thống thu thập, xử lý và lưu trữ dữ liệu quy mô lớn phục vụ phân tích và AI.",
    },
    "data_analyst": {
        "canonical_name": "Data Analyst",
        "aliases": ["data analyst", "phân tích dữ liệu", "bi analyst", "business intelligence"],
        "core_skills": ["sql", "python", "data_analysis", "excel", "power_bi", "data_visualization", "statistics"],
        "advanced_skills": ["tableau", "a_b_testing", "storytelling", "predictive_analytics"],
        "prerequisites": ["basic_math", "critical_thinking", "excel_basics"],
        "description": "Chuyên viên phân tích dữ liệu trích xuất thông tin chuyên sâu từ dữ liệu, xây dựng dashboard trực quan phục vụ ra quyết định kinh doanh.",
    },
    "devops": {
        "canonical_name": "DevOps / Cloud Engineer",
        "aliases": ["devops", "cloud engineer", "sre", "system engineer", "infrastructure engineer"],
        "core_skills": ["docker", "kubernetes", "linux", "ci/cd", "git", "bash", "networking", "terraform"],
        "advanced_skills": ["aws", "monitoring", "prometheus", "grafana", "istio", "security_compliance", "helm"],
        "prerequisites": ["linux_basics", "networking_basics", "scripting"],
        "description": "Kỹ sư DevOps tự động hóa quy trình triển khai, quản trị hạ tầng điện toán đám mây và đảm bảo tính sẵn sàng cao của hệ thống.",
    },
    "qa_qc": {
        "canonical_name": "QA / QC & Automation Tester",
        "aliases": ["qa", "qc", "tester", "kiem thu", "kiểm thử phần mềm", "automation test", "qa engineer"],
        "core_skills": ["testing", "test_case_design", "manual_testing", "postman", "api_testing", "git", "bug_tracking"],
        "advanced_skills": ["selenium", "playwright", "automation_framework", "performance_testing", "jmeter", "ci_cd_test"],
        "prerequisites": ["software_development_lifecycle", "attention_to_detail"],
        "description": "Chuyên viên QA/QC đảm bảo chất lượng phần mềm thông qua việc kiểm thử chức năng, hiệu năng và tự động hóa quy trình kiểm thử.",
    },
    "business_analyst": {
        "canonical_name": "Business Analyst (IT BA)",
        "aliases": ["business analyst", "ba", "it ba", "phân tích nghiệp vụ", "product owner", "po"],
        "core_skills": ["business_analysis", "requirement_gathering", "uml", "user_stories", "sql", "jira", "agile"],
        "advanced_skills": ["system_modeling", "process_optimization", "product_management", "wireframing"],
        "prerequisites": ["communication_skills", "critical_thinking", "basic_it_concepts"],
        "description": "Chuyên viên phân tích nghiệp vụ là cầu nối giữa bộ phận kinh doanh và đội ngũ kỹ thuật, chuyển hóa yêu cầu thành giải pháp phần mềm.",
    },
    "security": {
        "canonical_name": "Security Engineer",
        "aliases": ["security", "an toàn thông tin", "cyber security", "infosec", "penetration testing"],
        "core_skills": ["network_security", "linux", "owasp", "vulnerability_assessment", "cryptography", "python", "git"],
        "advanced_skills": ["penetration_testing", "siem", "incident_response", "reverse_engineering", "cloud_security"],
        "prerequisites": ["networking_protocols", "operating_systems", "programming_basics"],
        "description": "Kỹ sư bảo mật phát hiện lỗ hổng, thiết lập rào chắn bảo vệ dữ liệu và ứng phó các sự cố tấn công an ninh mạng.",
    },
}

# Tiêu chuẩn số năm kinh nghiệm theo cấp bậc
LEVEL_EXPERIENCE_MAP: dict[str, tuple[int, str]] = {
    "intern": (0, "Thực tập sinh (Intern)"),
    "fresher": (1, "Mới tốt nghiệp / Dưới 1 năm kinh nghiệm (Fresher)"),
    "junior": (2, "1-2 năm kinh nghiệm (Junior)"),
    "middle": (3, "2-4 năm kinh nghiệm (Middle)"),
    "senior": (5, "5+ năm kinh nghiệm (Senior)"),
    "lead": (7, "7+ năm kinh nghiệm / Trưởng nhóm (Technical Lead / Principal)"),
}


def _match_benchmark_category(target_role: str) -> tuple[str, dict[str, Any]]:
    """Tìm kiếm danh mục vai trò phù hợp nhất từ chuỗi nhập vào của người dùng."""
    text_lower = target_role.lower().strip()

    # Khớp chính xác alias
    for cat_id, info in ROLE_BENCHMARK_CATALOG.items():
        for alias in info.get("aliases", []):
            if alias in text_lower or text_lower in alias:
                return cat_id, info

    # Khớp qua extract_skills nếu chuỗi chứa tên công nghệ (VD: "Lập trình viên React", "Python Dev")
    extracted = extract_skills(text_lower)
    if any(s in ["python", "fastapi", "django", "java", "golang"] for s in extracted):
        return "backend", ROLE_BENCHMARK_CATALOG["backend"]
    if any(s in ["react", "vue", "javascript", "typescript", "html", "css"] for s in extracted):
        return "frontend", ROLE_BENCHMARK_CATALOG["frontend"]
    if any(s in ["flutter", "dart", "swift", "kotlin", "android", "ios"] for s in extracted):
        return "mobile", ROLE_BENCHMARK_CATALOG["mobile"]
    if any(s in ["pytorch", "tensorflow", "machine_learning", "ai", "deep_learning"] for s in extracted):
        return "ai_ml", ROLE_BENCHMARK_CATALOG["ai_ml"]
    if any(s in ["docker", "kubernetes", "terraform", "ci/cd", "devops"] for s in extracted):
        return "devops", ROLE_BENCHMARK_CATALOG["devops"]

    # Mặc định trả về Backend Developer nếu không nhận diện được ngành chuyên biệt
    return "backend", ROLE_BENCHMARK_CATALOG["backend"]


def build_role_benchmark(target_role: str, target_level: str | None = None) -> RoleBenchmark:
    """
    Xây dựng hồ sơ đối chuẩn ngành nghề (Role Benchmark) cho ngành nghề và cấp bậc mục tiêu.
    Tự động sinh JD tiêu chuẩn đối chiếu để nạp vào EvaluationAgent.
    """
    clean_role = (target_role or "").strip()
    if not clean_role:
        clean_role = "Software Engineer"

    clean_level = (target_level or "middle").lower().strip()
    if clean_level not in LEVEL_EXPERIENCE_MAP:
        clean_level = "middle"

    cat_id, info = _match_benchmark_category(clean_role)
    canonical_name = info["canonical_name"]
    expected_years, level_label = LEVEL_EXPERIENCE_MAP[clean_level]

    core_skills = list(info.get("core_skills", []))
    advanced_skills = list(info.get("advanced_skills", []))
    prerequisites = list(info.get("prerequisites", []))

    # Tùy chỉnh danh sách kỹ năng trọng yếu theo cấp bậc
    if clean_level in ("intern", "fresher"):
        target_skills = core_skills[:5]
    elif clean_level == "junior":
        target_skills = core_skills
    else:  # middle, senior, lead
        target_skills = list(dict.fromkeys(core_skills + advanced_skills[:4]))

    # Sinh nội dung JD tiêu chuẩn mẫu
    skills_text = ", ".join(target_skills)
    adv_skills_text = ", ".join(advanced_skills)
    prereq_text = ", ".join(prerequisites)

    benchmark_jd_text = f"""# VỊ TRÍ TUYỂN DỤNG TIÊU CHUẨN NGÀNH: {canonical_name} ({level_label})

## 1. MÔ TẢ VAI TRÒ CHUẨN NGHỀ NGHIỆP:
{info.get("description", "")}
Vị trí yêu cầu ứng viên có năng lực thực chiến, tư duy giải quyết vấn đề tốt và đáp ứng chuẩn mực phát triển phần mềm hiện đại ở cấp độ {level_label}.

## 2. YÊU CẦU KINH NGHIỆM:
- Số năm kinh nghiệm kỳ vọng: {expected_years}+ năm làm việc thực tế với vai trò {canonical_name}.
- Có bằng chứng dự án thực tế, mã nguồn minh bạch hoặc số liệu đo lường cụ thể về hiệu năng, quy mô sản phẩm.

## 3. YÊU CẦU KỸ NĂNG CỐT LÕI (CORE SKILLS):
- Kỹ năng bắt buộc: {skills_text}
- Kỹ năng nâng cao & kiến trúc hệ thống: {adv_skills_text}
- Nền tảng tư duy & kỹ năng tiên quyết: {prereq_text}

## 4. TIÊU CHÍ ĐÁNH GIÁ CHẤT LƯỢNG HỒ SƠ:
- Khả năng áp dụng kỹ năng vào các bài toán thực tế thay vì chỉ liệt kê từ khóa (No Ghost Skills).
- Chiều sâu kỹ thuật của các dự án đã tham gia (độ phức tạp, xử lý lỗi, tối ưu hiệu năng).
- Tính nhất quán giữa số năm kinh nghiệm, học vấn và tiến trình phát triển nghề nghiệp.
"""

    return RoleBenchmark(
        role_name=canonical_name,
        level=clean_level,
        expected_years=expected_years,
        core_skills=target_skills,
        advanced_skills=advanced_skills,
        prerequisites=prerequisites,
        description=info.get("description", ""),
        benchmark_jd_text=benchmark_jd_text.strip(),
    )
