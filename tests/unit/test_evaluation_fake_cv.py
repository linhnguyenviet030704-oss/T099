"""End-to-End Tests cho Agent Evaluation xử lý các Edge Case CV cực ảo."""

import pytest

from backend.app.agents.evaluation.graph import build_evaluation_graph

JD_SENIOR_BACKEND = """
Vị trí: Senior Backend Engineer
Yêu cầu:
- 5+ năm kinh nghiệm phát triển hệ thống Backend
- Thành thạo Python, FastAPI, PostgreSQL, Redis, Docker, Kafka
- Có kinh nghiệm thiết kế Microservices và tối ưu cơ sở dữ liệu lớn
- Bắt buộc có kỹ năng CI/CD và kiến trúc chịu tải cao
"""

JD_JUNIOR_DEVELOPER = """
Vị trí: Junior Python Developer
Yêu cầu:
- 0-1 năm kinh nghiệm phát triển Python
- Nắm vững kiến thức cơ bản về OOP, Data Structures, Python, Git
- Biết sử dụng REST API, SQL cơ bản
"""


@pytest.mark.asyncio
async def test_edge_case_1_extreme_exaggeration():
    """
    Edge Case 1: Chém gió cực mạnh.
    Tuyên bố 10 năm kinh nghiệm Software, 20 năm Fullstack nhưng Project chỉ là 2 bài tập sinh viên (to-do list, web bán sách 3 tháng).
    """
    fake_cv = """
    Họ và tên: Lê Văn Nổ
    Tiêu đề: Senior Lead Software Architect & Principal Engineer
    Tóm tắt: Có 10 năm kinh nghiệm làm software, 20 năm kinh nghiệm fullstack. Master mọi ngôn ngữ và framework.
    Kỹ năng: Python, FastAPI, PostgreSQL, Redis, Docker, Kafka, Kubernetes, AWS, Microservices
    Học vấn: Đại học Công nghệ - Tốt nghiệp năm 2024

    DỰ ÁN:
    1. To-do list App (01/2024 - 02/2024, 1 tháng)
    Mô tả: Làm ứng dụng to-do list bằng HTML CSS JS cơ bản.

    2. Web bán sách đồ án tốt nghiệp (03/2024 - 05/2024, 2 tháng)
    Mô tả: Làm trang web bán sách có giỏ hàng và đăng nhập bằng PHP MySQL cơ bản.
    """

    graph = build_evaluation_graph()
    state = {
        "cv_text": fake_cv,
        "jd_text": JD_SENIOR_BACKEND,
    }

    result_state = await graph.ainvoke(state)
    result = result_state.get("result")

    assert result is not None
    # 1. Điểm tin cậy phải rất thấp
    assert result.authenticity["trust_score"] <= 0.45
    assert result.authenticity["authenticity_status"] == "HIGH_INFLATION_RISK"

    # 2. Phải có ít nhất 2 Red Flags cảnh báo
    assert len(result.red_flags) >= 2
    assert any("Mâu thuẫn học vấn" in rf or "Khai khống kinh nghiệm" in rf for rf in result.red_flags)

    # 3. Điểm kinh nghiệm thực tế phải bị kéo xuống rất thấp (vì chỉ làm 3 tháng thay vì 10 năm)
    exp_score = result.breakdown["experience"].score
    assert exp_score <= 30.0

    # 4. Điểm tổng thể phải bị phạt nặng (không thể vượt qua ngưỡng Senior)
    assert result.overall_score < 45.0

    # 5. Phải có cảnh báo rõ ràng cho Recruiter
    assert len(result.warnings) >= 2


@pytest.mark.asyncio
async def test_edge_case_2_tech_anachronism():
    """
    Edge Case 2: Nghịch lý thời gian công nghệ (Xuyên không).
    Claim 10 năm kinh nghiệm FastAPI (FastAPI ra mắt 2018), 12 năm Flutter (ra mắt 2017), 8 năm Next.js App Router (ra mắt 2022).
    """
    anachronism_cv = """
    Họ và tên: Phạm Xuyên Không
    Tiêu đề: Senior Fullstack Engineer
    Tóm tắt: Có 10 năm kinh nghiệm chuyên sâu FastAPI và 12 năm kinh nghiệm Flutter, 8 năm kinh nghiệm Next.js App Router.
    Kỹ năng: FastAPI, Flutter, Next.js App Router, Python, Docker
    Học vấn: Đại học Khoa Học Tự Nhiên - Tốt nghiệp năm 2014

    KINH NGHIỆM DỰ ÁN:
    1. Mobile App Flutter (2014 - 2024, 10 năm)
    Mô tả: Phát triển ứng dụng Flutter từ năm 2014.
    """

    graph = build_evaluation_graph()
    state = {
        "cv_text": anachronism_cv,
        "jd_text": JD_SENIOR_BACKEND,
    }

    result_state = await graph.ainvoke(state)
    result = result_state.get("result")

    assert result is not None
    # Phải phát hiện lỗi công nghệ xuyên không
    assert len(result.authenticity["anachronisms"]) >= 1
    assert any(
        a["skill"].lower() in ["fastapi", "flutter", "next.js app router"]
        for a in result.authenticity["anachronisms"]
    )
    assert result.authenticity["authenticity_status"] in ["HIGH_INFLATION_RISK", "QUESTIONABLE"]


@pytest.mark.asyncio
async def test_edge_case_3_ghost_skills_keyword_stuffing():
    """
    Edge Case 3: Nhồi nhét kỹ năng ma (Ghost Skills).
    Mục Skills liệt kê 25 buzzwords để ăn trọn điểm match, nhưng các dự án thực tế chỉ dùng jQuery và PHP.
    """
    stuffed_cv = """
    Họ và tên: Trần Nhồi Từ Khóa
    Tiêu đề: Fullstack Developer
    Tóm tắt: 4 năm kinh nghiệm lập trình web.
    Kỹ năng: Python, FastAPI, PostgreSQL, Redis, Docker, Kafka, Kubernetes, AWS, Terraform, Microservices, CI/CD, Rust, Golang, GraphQL, Spark
    Học vấn: Đại học Bách Khoa - Tốt nghiệp 2020

    DỰ ÁN:
    1. Quản lý nhân sự công ty ABC (2020 - 2024, 48 tháng)
    Mô tả: Xây dựng hệ thống quản lý nhân sự bằng PHP thuần, jQuery và MySQL. Quản lý thông tin nhân viên, chấm công và xuất file Excel.
    """

    graph = build_evaluation_graph()
    state = {
        "cv_text": stuffed_cv,
        "jd_text": JD_SENIOR_BACKEND,
    }

    result_state = await graph.ainvoke(state)
    result = result_state.get("result")

    assert result is not None
    # Phần lớn kỹ năng yêu cầu trong JD (FastAPI, Redis, Kafka, Docker) không có trong dự án
    ghost_skills_lower = [s.lower() for s in result.authenticity["ghost_skills"]]
    assert len(ghost_skills_lower) >= 3
    assert any(k in ghost_skills_lower for k in ["fastapi", "kafka", "redis", "docker", "kubernetes"])

    # Technical match rate thực tế phải bị kéo giảm mạnh (không được 100%)
    tech_score = result.breakdown["technical"].score
    assert tech_score < 40.0


@pytest.mark.asyncio
async def test_edge_case_4_graduation_conflict():
    """
    Edge Case 4: Mâu thuẫn học vấn.
    Mới tốt nghiệp đại học năm 2024 nhưng tự xưng có 8 năm kinh nghiệm chuyên nghiệp.
    """
    conflict_cv = """
    Họ và tên: Hoàng Sinh Viên
    Tiêu đề: Lead Architect
    Tóm tắt: 8 năm kinh nghiệm phát triển phần mềm chuyên nghiệp.
    Kỹ năng: Python, FastAPI, PostgreSQL, Git
    Học vấn: Đại học Bách Khoa Hà Nội - Tốt nghiệp năm 2024

    DỰ ÁN:
    1. Đồ án môn học: Xây dựng web API bằng Python FastAPI và PostgreSQL (3 tháng).
    """

    graph = build_evaluation_graph()
    state = {
        "cv_text": conflict_cv,
        "jd_text": JD_SENIOR_BACKEND,
    }

    result_state = await graph.ainvoke(state)
    result = result_state.get("result")

    assert result is not None
    # Phải có cờ cảnh báo mâu thuẫn học vấn
    assert any("Mâu thuẫn học vấn" in rf for rf in result.red_flags)
    assert result.authenticity["trust_score"] < 0.6


@pytest.mark.asyncio
async def test_edge_case_5_legitimate_senior():
    """
    Edge Case 5: CV Senior thật chuẩn mực (Đối chứng).
    6 năm kinh nghiệm thật, dự án rõ ràng, có số liệu đo lường kiến trúc và tối ưu hóa.
    """
    legit_cv = """
    Họ và tên: Vũ Minh Thật
    Tiêu đề: Senior Backend Engineer
    Tóm tắt: Senior Backend Engineer với 6 năm kinh nghiệm thiết kế hệ thống phân tán, xử lý giao dịch chịu tải cao.
    Kỹ năng: Python, FastAPI, PostgreSQL, Redis, Docker, Kafka, CI/CD, Microservices
    Học vấn: Đại học Bách Khoa Hà Nội - Tốt nghiệp năm 2018

    KINH NGHIỆM LÀM VIỆC & DỰ ÁN:
    1. Core Banking & Payment System (06/2021 - 06/2024, 36 tháng)
    - Vai trò: Senior Backend Engineer / Tech Lead
    - Thiết kế kiến trúc microservices với FastAPI, PostgreSQL và Kafka.
    - Triển khai Redis caching và tối ưu hóa database queries, giảm latency từ 320ms xuống 45ms.
    - Xử lý hệ thống phân tán chịu tải 5,000 req/s với độ khả dụng 99.99%.
    - Thiết lập pipeline CI/CD tự động build và deploy lên cụm Docker.

    2. E-Commerce Platform API (06/2018 - 05/2021, 35 tháng)
    - Vai trò: Backend Developer
    - Xây dựng RESTful API bằng Python và PostgreSQL phục vụ 300k người dùng.
    - Tích hợp cổng thanh toán và quản lý đơn hàng.
    """

    graph = build_evaluation_graph()
    state = {
        "cv_text": legit_cv,
        "jd_text": JD_SENIOR_BACKEND,
    }

    result_state = await graph.ainvoke(state)
    result = result_state.get("result")

    assert result is not None
    # Điểm tin cậy phải cao
    assert result.authenticity["trust_score"] >= 0.85
    assert result.authenticity["authenticity_status"] == "VERIFIED"
    assert len(result.red_flags) == 0

    # Không bị phạt điểm gian lận
    assert result.authenticity["penalty_factor"] == 0.0

    # Điểm technical và experience phải cao vì có đầy đủ bằng chứng dự án
    assert result.breakdown["technical"].score >= 70.0
    assert result.breakdown["experience"].score >= 70.0
    assert result.overall_score >= 75.0


@pytest.mark.asyncio
async def test_edge_case_6_honest_junior():
    """
    Edge Case 6: Ứng viên Junior/Fresher chân thật.
    Mới ra trường 1 năm kinh nghiệm, khai thật không phóng đại, ứng tuyển vị trí Junior.
    Hệ thống không được phạt nhầm họ là "lừa đảo".
    """
    junior_cv = """
    Họ và tên: Nguyễn Văn Thẳng Thắn
    Tiêu đề: Junior Python Developer
    Tóm tắt: 1 năm kinh nghiệm lập trình Python, đam mê học hỏi và xây dựng backend APIs.
    Kỹ năng: Python, Git, SQL, REST API
    Học vấn: Đại học Công Nghệ - Tốt nghiệp năm 2023

    DỰ ÁN:
    1. Blog API Platform (06/2023 - 05/2024, 11 tháng)
    - Vai trò: Junior Developer
    - Phát triển CRUD REST API bằng Python và SQLite cho hệ thống blog.
    - Viết unit tests cơ bản và quản lý mã nguồn bằng Git.
    """

    graph = build_evaluation_graph()
    state = {
        "cv_text": junior_cv,
        "jd_text": JD_JUNIOR_DEVELOPER,
    }

    result_state = await graph.ainvoke(state)
    result = result_state.get("result")

    assert result is not None
    # Ứng viên thành thật -> Trust score cao, không bị cắm cờ lừa đảo
    assert result.authenticity["trust_score"] >= 0.80
    assert result.authenticity["authenticity_status"] == "VERIFIED"
    assert len(result.red_flags) == 0
    assert result.authenticity["penalty_factor"] == 0.0

    # Điểm phù hợp với vị trí Junior
    assert result.overall_score >= 60.0


@pytest.mark.asyncio
async def test_edge_case_7_claim_20_years_zero_projects():
    """
    Edge Case 7: Tuyên bố 20 năm kinh nghiệm nhưng trong CV hoàn toàn không có mục Project/Kinh nghiệm thực tế.
    """
    empty_projects_cv = """
    Họ và tên: Nguyễn Siêu Ảo
    Tiêu đề: Senior Principal Architect Fullstack
    Tóm tắt: Có 20 năm kinh nghiệm làm phần mềm, chuyên gia kiến trúc hệ thống và fullstack.
    Kỹ năng: Python, FastAPI, PostgreSQL, Redis, Docker, Kafka, Kubernetes, AWS, Microservices, CI/CD
    Học vấn: Đại học Tổng Hợp
    Sở thích: Đọc sách, nghiên cứu công nghệ
    """

    graph = build_evaluation_graph()
    state = {
        "cv_text": empty_projects_cv,
        "jd_text": JD_SENIOR_BACKEND,
    }

    result_state = await graph.ainvoke(state)
    result = result_state.get("result")

    assert result is not None
    # 1. Điểm tin cậy bị trừ tối đa, trạng thái HIGH_INFLATION_RISK
    assert result.authenticity["trust_score"] <= 0.25
    assert result.authenticity["authenticity_status"] == "HIGH_INFLATION_RISK"
    assert result.authenticity["penalty_factor"] >= 0.50

    # 2. Số năm chứng minh được phải bằng 0.0
    assert result.authenticity["verified_years"] == 0.0

    # 3. 100% kỹ năng khai báo trở thành kỹ năng ma (Ghost Skills)
    ghost_skills = result.authenticity["ghost_skills"]
    assert len(ghost_skills) >= 5

    # 4. Phải có Red Flag cảnh báo thiếu bằng chứng dự án hoàn toàn
    assert any("Zero Project Evidence" in rf or "Thiếu bằng chứng hoàn toàn" in rf for rf in result.red_flags)

    # 5. Điểm kinh nghiệm và điểm tổng thể phải bị đánh sập (< 25 điểm)
    assert result.breakdown["experience"].score <= 20.0
    assert result.overall_score <= 25.0
