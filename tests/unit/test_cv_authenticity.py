"""Unit tests cho module CV Authenticity & Verification Engine (cv_verifier.py)."""


from backend.app.services.matching.cv_verifier import (
    ProjectEvidence,
    calculate_claim_to_evidence_matrix,
    check_tech_anachronisms,
    check_timeline_sanity,
    evaluate_cv_authenticity,
    extract_project_evidences,
)


def test_tech_anachronism_detection():
    """Kiểm tra phát hiện lỗi công nghệ xuyên không (khai số năm vượt tuổi đời công nghệ)."""
    # FastAPI ra đời năm 2018, Flutter ra đời 2017, Next.js App Router 2022
    claimed_skills = ["FastAPI", "Flutter", "Next.js App Router", "Python", "C++"]
    claimed_years = 12  # 12 năm kinh nghiệm

    anachronisms = check_tech_anachronisms(claimed_skills, claimed_years, current_year=2026)
    anachronism_skills = [a["skill"] for a in anachronisms]

    assert "FastAPI" in anachronism_skills
    assert "Flutter" in anachronism_skills
    assert "Next.js App Router" in anachronism_skills
    # Python và C++ ra đời từ lâu nên không bị đánh dấu xuyên không
    assert "Python" not in anachronism_skills
    assert "C++" not in anachronism_skills


def test_timeline_sanity_graduation_conflict():
    """Kiểm tra phát hiện mâu thuẫn học vấn (tốt nghiệp 2023 nhưng claim 10 năm kinh nghiệm)."""
    raw_text = "Học vấn: Đại học Bách Khoa, tốt nghiệp năm 2023. Tuyên bố có 10 năm kinh nghiệm phần mềm."
    claimed_years = 10
    projects = [
        ProjectEvidence(
            name="Project A",
            description="Làm web trong 6 tháng từ 2023 đến nay",
            duration_months=6,
        )
    ]
    education_entries = ["Đại học Bách Khoa - Tốt nghiệp 2023"]

    demonstrated_years, red_flags = check_timeline_sanity(
        raw_text=raw_text,
        claimed_years=claimed_years,
        projects=projects,
        education_entries=education_entries,
    )

    assert demonstrated_years == 0.5
    assert len(red_flags) >= 1
    assert any("Mâu thuẫn học vấn" in rf for rf in red_flags)
    assert any("Khai khống kinh nghiệm" in rf for rf in red_flags)


def test_ghost_skills_detection():
    """Kiểm tra phát hiện kỹ năng ma (Ghost Skills) chỉ có ở mục Skills, không có trong dự án."""
    claimed_skills = [
        "Kubernetes", "Kafka", "Docker", "AWS", "Terraform", "Rust", "Golang", "PHP", "MySQL"
    ]
    projects = [
        ProjectEvidence(
            name="Website bán hàng nhỏ",
            description="Phát triển trang web bán quần áo bằng PHP và MySQL cho cửa hàng địa phương.",
            technologies=["PHP", "MySQL"],
            duration_months=6,
        )
    ]

    skill_levels, ghost_skills, kw_drops, active_skills, impact_skills = calculate_claim_to_evidence_matrix(
        claimed_skills=claimed_skills,
        projects=projects,
    )

    # Các kỹ năng không hề có trong project phải là Ghost skills (Level 0)
    assert "Kubernetes" in ghost_skills
    assert "Kafka" in ghost_skills
    assert "Terraform" in ghost_skills
    assert "Rust" in ghost_skills
    assert skill_levels["Kubernetes"] == 0.0
    assert skill_levels["Kafka"] == 0.0

    # PHP và MySQL phải có bằng chứng
    assert "PHP" not in ghost_skills
    assert "MySQL" not in ghost_skills
    assert skill_levels["PHP"] > 0.0
    assert skill_levels["MySQL"] > 0.0


def test_project_depth_and_template_detection():
    """Kiểm tra đánh giá độ sâu kỹ thuật và phát hiện đồ án sinh viên/template cơ bản."""
    template_cv = """
    Dự án: Web bán hàng thương mại điện tử đơn giản
    Mô tả: Làm trang web bán hàng có đăng nhập, giỏ hàng, thanh toán cơ bản bằng PHP MySQL.
    Thời gian: 3 tháng.
    """
    complex_cv = """
    Dự án: Hệ thống giao dịch phân tán High Throughput Payment Gateway
    Mô tả: Thiết kế kiến trúc microservices chịu tải cao với Kafka và Redis cluster.
    Tối ưu hóa database query PostgreSQL và indexing, giảm latency từ 450ms xuống 35ms.
    Xử lý 10,000 req/s với 99.99% high availability, cấu hình load balancing và fault tolerance.
    Thời gian: 24 tháng.
    """

    template_projects = extract_project_evidences(template_cv)
    complex_projects = extract_project_evidences(complex_cv)

    assert len(template_projects) >= 1
    assert len(complex_projects) >= 1

    # Template project phải có điểm độ sâu thấp
    assert template_projects[0].depth_score < 40.0
    # Complex project có metrics, concurrency, microservices phải có điểm độ sâu cao
    assert complex_projects[0].depth_score >= 70.0


def test_full_authenticity_evaluation_fake_vs_real():
    """Kiểm tra tổng thể: CV ảo bị gắn cờ HIGH_INFLATION_RISK, CV thật được VERIFIED."""
    fake_cv_text = """
    HỌ TÊN: NGUYỄN VĂN ẢO
    Tóm tắt: Có 10 năm kinh nghiệm làm software engineer, 20 năm kinh nghiệm fullstack. Chuyên gia hàng đầu.
    Kỹ năng: React, Flutter, FastAPI, Kubernetes, Kafka, AWS, Docker, AI, ML, Blockchain, Solidity, Rust
    Học vấn: Đại học Công Nghệ - Tốt nghiệp 2024

    DỰ ÁN:
    1. To-do list App: Làm ứng dụng to-do list bằng HTML, CSS, JS cơ bản. (1 tháng)
    2. Web bán sách: Web bán sách sinh viên có đăng nhập và giỏ hàng. (2 tháng)
    """

    fake_report = evaluate_cv_authenticity(
        raw_text=fake_cv_text,
        claimed_skills=["React", "Flutter", "FastAPI", "Kubernetes", "Kafka", "AWS", "Docker", "AI", "ML", "Blockchain", "Solidity", "Rust"],
        claimed_years=10,
        education_entries=["Đại học Công Nghệ - Tốt nghiệp 2024"],
    )

    assert fake_report.authenticity_status == "HIGH_INFLATION_RISK"
    assert fake_report.trust_score <= 0.4
    assert fake_report.penalty_factor > 0.3
    assert len(fake_report.red_flags) >= 2
    assert len(fake_report.ghost_skills) >= 5

    # CV Thật chuẩn chỉnh
    real_cv_text = """
    HỌ TÊN: TRẦN VĂN THỰC
    Tóm tắt: Senior Backend Engineer với 6 năm kinh nghiệm thiết kế hệ thống phân tán và tối ưu database.
    Kỹ năng: Python, FastAPI, PostgreSQL, Docker, Redis, Kafka, CI/CD
    Học vấn: Đại học Bách Khoa Hà Nội - Tốt nghiệp 2018

    KINH NGHIỆM LÀM VIỆC & DỰ ÁN:
    1. E-Commerce Core Service (2021 - 2024, 36 tháng)
    - Vai trò: Tech Lead / Senior Backend Engineer
    - Thiết kế hệ thống microservices với FastAPI, PostgreSQL và Kafka.
    - Xây dựng giải pháp caching với Redis cluster, tối ưu query giảm latency 60% cho 500k active users.
    - Xây dựng pipeline CI/CD tự động test và deploy lên Docker Swarm.

    2. Payment Gateway Service (2018 - 2021, 36 tháng)
    - Vai trò: Backend Developer
    - Phát triển API xử lý giao dịch tài chính bằng Python và PostgreSQL.
    - Đảm bảo tính nhất quán dữ liệu (idempotency) và xử lý 2,000 req/s.
    """

    real_report = evaluate_cv_authenticity(
        raw_text=real_cv_text,
        claimed_skills=["Python", "FastAPI", "PostgreSQL", "Docker", "Redis", "Kafka", "CI/CD"],
        claimed_years=6,
        education_entries=["Đại học Bách Khoa Hà Nội - Tốt nghiệp 2018"],
    )

    assert real_report.authenticity_status == "VERIFIED"
    assert real_report.trust_score >= 0.85
    assert real_report.penalty_factor == 0.0
    assert len(real_report.red_flags) == 0
