from backend.app.services.matching.parse import parse_resume_bytes
from backend.app.services.matching.structure import structure_resume

TOPCV_TEXT = """
Dương Hồng Đức
Fresher Web Developer
THÔNG TIN CÁ NHÂN
0764181652
duc2022004@gmail.com
Minh Khai, Bắc Từ Liêm, Hà Nội
https://github.com/duonghongduc2k4
MỤC TIÊU NGHỀ NGHIỆP
Trong 3 - 6 tháng làm việc trong môi trường chuyên nghiệp để phát triển kỹ năng backend.
KỸ NĂNG
Kiến thức ngôn ngữ lập trình:
• Java, Spring Boot, Spring MVC, RESTful API và MySQL
• JavaScript, HTML5, CSS, Bootstrap và ReactJS
HỌC VẤN
Trường Đại học Thành Đô - Khoa CNTT CodeGym
(09/2021 - Hiện tại) GPA: 2.83
DỰ ÁN
Quản lý thuê nhà (Dự án nhóm)
(05/2024 - 06/2024)
1. Vai trò cá nhân: Leader, Developer
• Back-end: Spring Boot, RESTful API, MySQL
• Front-end: JavaScript, ReactJS
© topcv.vn
"""

EN_EXPERIENCE = """
Software developer with 1 year of hands-on experience in Node.js and ReactJS.
WORK EXPERIENCE
VIET BAC TECHNOLOGY JOINT STOCK COMPANY
Position: Associate
March 2023 - March 2025
- Frontend: Developed UI using ReactJS.
- Backend: Migrated APIs (NodeJS, PostgreSQL).
EDUCATION
University of Transport
September 2020 - January 2025
Information Technology Engineer
GPA: 2.8/4.0
SKILLS
Node.js, ReactJS, PostgreSQL, MySQL
"""

SENIOR_TEXT = """
Backend Engineer
WORK EXPERIENCE
Senior Backend Engineer | MoMo | Nov 2019 - Present
- Built payout services in Go, gRPC, PostgreSQL, Kafka.
Software Engineer | Techcombank | Jul 2017 - Oct 2019
- Java Spring Boot microservices.
EDUCATION
B.Sc Computer Science | HCMUT | 2013 - 2017
TECHNICAL SKILLS
Go, Java, PostgreSQL, Kafka
"""


def test_structure_strips_pii_and_contact():
    result = structure_resume(TOPCV_TEXT)
    md = result["markdown"]
    assert "duc2022004@gmail.com" not in md
    assert "0764181652" not in md
    assert "github.com" not in md
    assert "Dương Hồng Đức" not in md
    assert "topcv.vn" not in md.lower()
    assert "THÔNG TIN CÁ NHÂN" not in md
    assert "Java" in md
    assert "Spring Boot" in md


def test_structure_uses_canonical_sections_and_job_headers():
    result = structure_resume(EN_EXPERIENCE)
    md = result["markdown"]
    assert "## Profile" in md
    assert "## Work Experience" in md
    assert "## Education" in md
    assert "## Technical Skills" in md
    assert "###" in md
    assert "Associate" in md
    assert "VIET BAC" in md
    assert "March 2023" in md or "Mar 2023" in md or "2023" in md


def test_structure_writes_yaml_frontmatter():
    result = structure_resume(SENIOR_TEXT, source_name="G1-BE-01.pdf")
    md = result["markdown"]
    assert md.startswith("---\n")
    assert "cv_id: G1-BE-01" in md
    assert "group_id: 1" in md
    assert "major_field:" in md
    assert "sub_field:" in md
    assert "seniority:" in md
    assert "years_experience:" in md
    assert "skills:" in md


def test_metadata_intern_topcv():
    meta = structure_resume(TOPCV_TEXT)["metadata"]
    assert meta["seniority"] == "intern"
    assert meta["years_experience"] == 0
    assert meta["major_field"] == "web"
    assert meta["sub_field"] == "backend"
    assert "java" in meta["skills"]
    assert "spring_boot" in meta["skills"]


def test_metadata_years_and_seniority_from_jobs():
    meta = structure_resume(EN_EXPERIENCE)["metadata"]
    assert meta["years_experience"] == 2
    assert meta["seniority"] in {"junior", "mid"}
    assert meta["major_field"] == "web"
    assert meta["sub_field"] in {"backend", "frontend"}
    assert "nodejs" in meta["skills"] or "react" in meta["skills"]


def test_metadata_senior_from_title_and_span():
    meta = structure_resume(SENIOR_TEXT)["metadata"]
    assert meta["years_experience"] >= 6
    assert meta["seniority"] == "senior"
    assert meta["major_field"] == "web"
    assert meta["sub_field"] == "backend"
    assert "golang" in meta["skills"] or "java" in meta["skills"]


def test_parse_resume_bytes_fills_metadata_and_keeps_skills_in_body():
    raw = (
        b"Backend intern\n"
        b"SKILLS\n"
        b"Python FastAPI PostgreSQL\n"
        b"WORK EXPERIENCE\n"
        b"Intern | Startup | Jun 2024 - Aug 2024\n"
        b"- Built APIs in Python FastAPI\n"
    )
    parsed = parse_resume_bytes(raw, mime_type="text/plain")
    md = parsed["markdown"]
    meta = parsed["metadata"]
    assert "Python" in md
    assert "FastAPI" in md
    assert meta["seniority"] == "intern"
    assert "python" in meta["skills"]
    assert "fastapi" in meta["skills"]
    assert meta["major_field"] == "web"


def test_emoji_prefixed_section_headers_are_detected():
    md = structure_resume(
        "Intern Backend\n"
        "👨‍💻KỸ NĂNG CHUYÊN MÔN\n"
        "Java Spring Boot MySQL\n"
        "📚HỌC VẤN\n"
        "FPT Polytechnic\n"
        "9/2022 - Now\n"
    )["markdown"]
    assert "## Technical Skills" in md
    assert "## Education" in md
    assert "Spring Boot" in md


def test_hien_nay_is_present_and_education_keeps_school():
    md = structure_resume(
        "HỌC VẤN\n"
        "Đại học Công Thương\n"
        "CÔNG NGHỆ THÔNG TIN\n"
        "09/2020 - Hiện nay\n"
        "KỸ NĂNG\n"
        "PHP Laravel\n"
    )["markdown"]
    assert "Present" in md
    assert "Đại học Công Thương" in md
    assert "## Education" in md


def test_project_bullets_are_not_duplicated():
    md = structure_resume(
        "DỰ ÁN\n"
        "Shop\n"
        "(05/2024 - 06/2024)\n"
        "- Built checkout with Spring Boot\n"
        "Kanban\n"
        "(10/2023 - 11/2023)\n"
        "- Built boards\n"
    )["markdown"]
    assert md.count("Built checkout") == 1
    assert md.count("Built boards") == 1


def test_numbered_mo_ta_stays_inside_project():
    md = structure_resume(
        "Fresher Web Developer\n"
        "DỰ ÁN\n"
        "Quản lý thuê nhà\n"
        "(05/2024 - 06/2024)\n"
        "2. Mô tả:\n"
        "Trang web cung cấp nền tảng đặt nhà.\n"
        "KỸ NĂNG\n"
        "Java Spring Boot\n"
    )["markdown"]
    assert "## Profile" in md
    profile = md.split("## Profile")[1].split("## ")[0]
    assert "Trang web cung cấp" not in profile
    assert "## Projects" in md
    assert "Trang web cung cấp" in md
