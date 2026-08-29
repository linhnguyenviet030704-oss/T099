"""Kiểm thử tự động cho tính năng Đánh giá CV theo Ngành nghề mục tiêu (CV Assessment Agent).

Bao gồm:
- Kiểm thử Role Benchmark Synthesizer
- Kiểm thử tích hợp EvaluationAgent với Benchmark Profile
- Kiểm thử phát hiện Kỹ năng ma (Ghost Skills) và Bằng chứng thực tế
- Kiểm thử bộ sinh Lộ trình học tập 3 giai đoạn
- Kiểm thử Endpoint API /api/v1/cv-assessment
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.agents.evaluation import EvaluationAgent
from backend.app.agents.evaluation.nodes.report import build_learning_roadmap
from backend.app.agents.evaluation.types import EvaluationType, SkillAnalysis
from backend.app.api.routes.evaluation import _format_cv_assessment_response
from backend.app.api.schemas.evaluation import CvAssessmentRequest, CvAssessmentResponse
from backend.app.clients.supabase import get_supabase_client
from backend.app.core.security import AuthenticatedUser
from backend.app.main import app
from backend.app.services.kg.benchmarks import build_role_benchmark


class TestRoleBenchmarkSynthesizer:
    """Kiểm thử bộ sinh hồ sơ chuẩn ngành nghề (Role Benchmark)."""

    def test_benchmark_backend_developer(self) -> None:
        benchmark = build_role_benchmark("Backend Developer", "middle")
        assert benchmark.role_name == "Backend Developer"
        assert benchmark.level == "middle"
        assert benchmark.expected_years >= 3
        assert "python" in benchmark.core_skills or "fastapi" in benchmark.core_skills
        assert len(benchmark.benchmark_jd_text) > 100
        assert "VỊ TRÍ TUYỂN DỤNG TIÊU CHUẨN NGÀNH" in benchmark.benchmark_jd_text

    def test_benchmark_ai_engineer(self) -> None:
        benchmark = build_role_benchmark("AI / Machine Learning Engineer", "senior")
        assert benchmark.role_name == "AI / Machine Learning Engineer"
        assert benchmark.level == "senior"
        assert benchmark.expected_years >= 5
        assert "pytorch" in benchmark.core_skills or "python" in benchmark.core_skills

    def test_benchmark_levels(self) -> None:
        fresher = build_role_benchmark("Frontend Developer", "fresher")
        senior = build_role_benchmark("Frontend Developer", "senior")

        assert fresher.expected_years <= 1
        assert senior.expected_years >= 5
        assert len(senior.core_skills) >= len(fresher.core_skills)


class TestCvAssessmentEvaluationAgent:
    """Kiểm thử Agent chạy pipeline đánh giá CV đối chiếu với chuẩn ngành."""

    @pytest.mark.asyncio
    async def test_evaluate_cv_against_backend_benchmark(self) -> None:
        cv_text = """
# NGUYỄN VĂN A - BACKEND DEVELOPER
Kinh nghiệm: 3 năm làm việc với Python và FastAPI.
Học vấn: Đại học Bách Khoa Hà Nội (2019 - 2023)

## Kỹ năng chuyên môn
- Python, FastAPI, PostgreSQL, Docker, Git, RESTful API, Redis

## Dự án thực tế
### Hệ thống Thương mại điện tử E-Commerce
- Thời gian: 06/2023 - 06/2024 (12 tháng)
- Vị trí: Backend Developer
- Công nghệ: Python, FastAPI, PostgreSQL, Docker, Redis
- Mô tả: Thiết kế và phát triển RESTful API xử lý 1000 RPS, tối ưu truy vấn PostgreSQL giảm 40% latency và thiết lập Docker CI/CD.

### Nền tảng Dịch vụ Vận tải Ride-Hailing
- Thời gian: 06/2021 - 05/2023 (24 tháng)
- Vị trí: Junior/Middle Backend Developer
- Công nghệ: Python, FastAPI, PostgreSQL, Linux, Git, SQL
- Mô tả: Xây dựng hệ thống định vị thời gian thực, quản trị cơ sở dữ liệu PostgreSQL và triển khai trên môi trường Linux.
"""
        benchmark = build_role_benchmark("Backend Developer", "middle")
        agent = EvaluationAgent(brain=None)

        result = await agent.evaluate(
            cv_text=cv_text,
            jd_text=benchmark.benchmark_jd_text,
            evaluation_type=EvaluationType.FULL,
            needs_vector_search=False,
        )

        assert result is not None
        assert result.overall_score > 50
        assert "technical" in result.breakdown
        assert "experience" in result.breakdown
        assert result.skill_analysis is not None
        assert len(result.skill_analysis.matched_skills) > 0
        assert result.radar_chart is not None

        # Kiểm tra định dạng response
        response = _format_cv_assessment_response(result, benchmark)
        assert isinstance(response, CvAssessmentResponse)
        assert response.target_role == "Backend Developer"
        assert len(response.strengths) > 0
        assert len(response.learning_roadmap) == 3

    @pytest.mark.asyncio
    async def test_ghost_skills_detection_in_assessment(self) -> None:
        # CV liệt kê rất nhiều kỹ năng nhưng không có dự án chứng minh
        cv_ghost = """
# TRẦN VĂN B
Kinh nghiệm: 5 năm
Kỹ năng: Python, Java, C++, Kubernetes, Docker, React, Flutter, Kafka, AWS, TensorFlow, PyTorch

## Kinh nghiệm làm việc
- Nhân viên văn phòng công ty XYZ (01/2024 - 03/2024): Nhập liệu dữ liệu và hỗ trợ giấy tờ.
"""
        benchmark = build_role_benchmark("Backend Developer", "senior")
        agent = EvaluationAgent(brain=None)

        result = await agent.evaluate(
            cv_text=cv_ghost,
            jd_text=benchmark.benchmark_jd_text,
            evaluation_type=EvaluationType.FULL,
            needs_vector_search=False,
        )

        auth = result.authenticity or {}
        ghost_skills = auth.get("ghost_skills") or []
        assert len(ghost_skills) > 0
        # Trust score phải bị giảm do kỹ năng ma
        assert auth.get("trust_score", 1.0) < 0.9

        response = _format_cv_assessment_response(result, benchmark)
        assert any("Ghost Skills" in w for w in response.weaknesses)


class TestLearningRoadmapBuilder:
    """Kiểm thử bộ sinh lộ trình phát triển 3 giai đoạn."""

    def test_build_roadmap_phases(self) -> None:
        skill_analysis = SkillAnalysis(
            matched_skills=["python", "fastapi"],
            missing_critical=["kubernetes", "kafka", "redis"],
            unexpected_skills=[],
            skill_match_rate=60.0,
        )
        kg_context = {
            "skill_prerequisites": {
                "kubernetes": ["docker", "linux"],
                "kafka": ["java", "message_queue"],
                "redis": ["caching"],
            }
        }

        roadmap = build_learning_roadmap(
            skill_analysis=skill_analysis,
            kg_context=kg_context,
            target_role="Backend Developer",
            target_level="middle",
        )

        assert len(roadmap) == 3
        assert roadmap[0]["phase"] == 1
        assert roadmap[1]["phase"] == 2
        assert roadmap[2]["phase"] == 3
        assert any("docker" in str(s).lower() or "linux" in str(s).lower() for s in roadmap[0]["focus_skills"])
        assert any("kubernetes" in str(s).lower() or "kafka" in str(s).lower() for s in roadmap[1]["focus_skills"])


class TestCvAssessmentApiEndpoint:
    """Kiểm thử endpoint HTTP /api/v1/cv-assessment."""

    def test_api_cv_assessment_success(self) -> None:
        from backend.app.dependencies.auth import get_current_candidate

        mock_user = AuthenticatedUser(
            id=uuid4(),
            email="candidate@example.com",
            claims={"sub": str(uuid4()), "role": "candidate"},
        )
        app.dependency_overrides[get_current_candidate] = lambda: mock_user

        mock_supabase = MagicMock()
        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase

        client = TestClient(app)
        payload = {
            "cv_text": """
# NGUYỄN VĂN TEST - AI ENGINEER
3 năm kinh nghiệm phát triển mô hình Machine Learning với Python, PyTorch.

## Kỹ năng
- Python, PyTorch, NumPy, Pandas, Docker, Git

## Dự án
### Phân loại văn bản thông minh (NLP)
- 12 tháng: Thiết kế mô hình Transformer đạt 92% F1-score, đóng gói Docker API.
""",
            "target_role": "AI / Machine Learning Engineer",
            "target_level": "junior",
        }

        try:
            response = client.post("/api/v1/cv-assessment", json=payload)
            assert response.status_code == 200
            data = response.json()
            assert data["target_role"] == "AI / Machine Learning Engineer"
            assert "overall_score" in data
            assert "breakdown" in data
            assert "strengths" in data
            assert "weaknesses" in data
            assert "learning_roadmap" in data
            assert len(data["learning_roadmap"]) == 3
        finally:
            app.dependency_overrides.clear()
