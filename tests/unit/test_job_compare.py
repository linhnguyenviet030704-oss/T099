from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.api.schemas.compare import (
    CandidateMetrics,
    CompareJobsResponse,
)
from backend.app.core.exceptions import AppError
from backend.app.core.security import AuthenticatedUser
from backend.app.main import create_app
from backend.app.services.matching.compare_jobs import (
    COMPARE_JOBS_PROMPT_TEMPLATE,
    _clean_cv_text_for_prompt,
    _fallback_metrics_for_job,
    _match_job_label,
    _parse_llm_response,
    _strip_fence,
    compare_jobs_for_candidate,
)


def test_compare_jobs_prompt_template_placeholders():
    assert "{{JD_AND_REQUIREMENTS}}" in COMPARE_JOBS_PROMPT_TEMPLATE
    assert "{{ANONYMIZED_CV}}" in COMPARE_JOBS_PROMPT_TEMPLATE
    assert "Career Advisor" in COMPARE_JOBS_PROMPT_TEMPLATE
    assert "Kinh nghiệm làm việc" in COMPARE_JOBS_PROMPT_TEMPLATE
    assert "Kỹ năng chuyên môn" in COMPARE_JOBS_PROMPT_TEMPLATE
    assert "Học vấn & Chứng chỉ" in COMPARE_JOBS_PROMPT_TEMPLATE
    assert "Độ phù hợp tổng thể" in COMPARE_JOBS_PROMPT_TEMPLATE
    assert "comparison_results" in COMPARE_JOBS_PROMPT_TEMPLATE


def test_strip_fence():
    assert _strip_fence("```json\n{\"test\": 1}\n```") == '{"test": 1}'
    assert _strip_fence("```\n{\"test\": 2}\n```") == '{"test": 2}'
    assert _strip_fence("{\"test\": 3}") == '{"test": 3}'


def test_clean_cv_text_redacts_pii():
    raw_cv = (
        "Ứng viên: Trần Thị B\n"
        "Email: tranthib@gmail.com\n"
        "SĐT: 0912345678 hoặc +84987654321\n"
        "Kỹ năng: React, Next.js, TypeScript\n"
        "Kinh nghiệm: 4 năm lập trình Frontend."
    )
    cleaned = _clean_cv_text_for_prompt(raw_cv)
    assert "tranthib@gmail.com" not in cleaned
    assert "0912345678" not in cleaned
    assert "+84987654321" not in cleaned
    assert "[EMAIL ĐÃ ẨN]" in cleaned
    assert "[SĐT ĐÃ ẨN]" in cleaned
    assert "React, Next.js, TypeScript" in cleaned


def test_parse_llm_response():
    valid_json = json.dumps({
        "comparison_results": [
            {
                "job_id": "Công việc A",
                "metrics": {
                    "experience": {"score": 9.0, "reason": "4 năm kinh nghiệm rất khớp yêu cầu."},
                    "hard_skills": {"score": 9.5, "reason": "Thành thạo React và TypeScript."},
                    "education": {"score": 8.5, "reason": "Cử nhân CNTT Đại học Bách Khoa."},
                    "overall_fit": {"score": 9.0, "reason": "Độ phù hợp xuất sắc với vị trí."},
                },
            }
        ]
    })
    parsed = _parse_llm_response(valid_json)
    assert len(parsed) == 1
    assert parsed[0]["job_id"] == "Công việc A"
    assert parsed[0]["metrics"]["hard_skills"]["score"] == 9.5

    # Invalid json
    assert _parse_llm_response("error not json") == []


def test_match_job_label():
    keys = ["Công việc A", "Công việc B", "Công việc C"]
    assert _match_job_label("Công việc A", keys) == "Công việc A"
    assert _match_job_label("cong viec a", keys) == "Công việc A"
    assert _match_job_label("A", keys) == "Công việc A"
    assert _match_job_label("Công việc 2", keys) == "Công việc B"
    assert _match_job_label("job_1", keys) == "Công việc A"
    assert _match_job_label("Unknown", keys) is None


def test_fallback_metrics_for_job():
    cv_info = {
        "skills": ["React", "TypeScript", "Tailwind CSS"],
        "clean_markdown": "Đại học Bách Khoa. 3 năm kinh nghiệm lập trình React.",
    }
    job = {
        "title": "Senior Frontend Developer",
        "requirements": "Yêu cầu 3 năm kinh nghiệm React, TypeScript, Redux, REST API.",
        "description": "Phát triển giao diện web ứng dụng.",
    }
    metrics = _fallback_metrics_for_job(cv_info, job, rank_hint=1, total=3)
    assert isinstance(metrics, CandidateMetrics)
    assert 1.0 <= metrics.experience.score <= 10.0
    assert 1.0 <= metrics.hard_skills.score <= 10.0
    assert 1.0 <= metrics.education.score <= 10.0
    assert 1.0 <= metrics.overall_fit.score <= 10.0
    assert len(metrics.experience.reason) > 0
    assert len(metrics.hard_skills.reason) > 0


@pytest.mark.asyncio
async def test_compare_jobs_count_validation():
    client = MagicMock()
    actor_id = uuid4()

    # < 2 jobs
    with pytest.raises(AppError) as exc:
        await compare_jobs_for_candidate(client, actor_id, [uuid4()])
    assert exc.value.code == "INVALID_JOB_COUNT"

    # > 5 jobs
    with pytest.raises(AppError) as exc2:
        await compare_jobs_for_candidate(client, actor_id, [uuid4() for _ in range(6)])
    assert exc2.value.code == "INVALID_JOB_COUNT"


@pytest.mark.asyncio
async def test_compare_jobs_success_flow():
    actor_id = uuid4()
    resume_id = uuid4()
    job_id_1 = uuid4()
    job_id_2 = uuid4()
    company_id_1 = uuid4()
    company_id_2 = uuid4()

    # Mock client table queries
    mock_client = MagicMock()

    def mock_table(table_name: str):
        table_mock = MagicMock()
        if table_name == "resumes":
            # Return candidate default resume
            table_mock.select.return_value.eq.return_value.is_.return_value.order.return_value.limit.return_value.maybe_single.return_value.execute.return_value.data = {
                "id": str(resume_id),
                "title": "Fullstack Developer CV",
                "storage_path": "resumes/user1/cv.pdf",
                "created_at": "2026-08-01T00:00:00Z",
            }
            table_mock.select.return_value.eq.return_value.eq.return_value.is_.return_value.maybe_single.return_value.execute.return_value.data = {
                "id": str(resume_id),
                "title": "Fullstack Developer CV",
                "storage_path": "resumes/user1/cv.pdf",
                "created_at": "2026-08-01T00:00:00Z",
            }
        elif table_name == "embedded_resumes":
            table_mock.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
                "metadata": {"skills": ["Python", "FastAPI", "React", "Docker"]},
                "clean_markdown": "Đại học Bách Khoa. 4 năm kinh nghiệm Fullstack Python FastAPI và React.",
                "markdown": "Đại học Bách Khoa. 4 năm kinh nghiệm.",
            }
        elif table_name == "job_posts":
            table_mock.select.return_value.in_.return_value.execute.return_value.data = [
                {
                    "id": str(job_id_1),
                    "title": "Senior Python Developer",
                    "description": "Phát triển hệ thống backend hiệu năng cao",
                    "requirements": "Yêu cầu 3+ năm Python, FastAPI, Docker",
                    "benefits": "Lương tháng 13, bảo hiểm sức khỏe",
                    "location": "Hà Nội",
                    "employment_type": "full_time",
                    "salary_min": 25000000,
                    "salary_max": 40000000,
                    "currency": "VND",
                    "deadline_at": "2026-09-30T00:00:00Z",
                    "status": "published",
                    "companies": {
                        "id": str(company_id_1),
                        "name": "Công ty Công nghệ TechNova",
                        "logo_storage_path": "logos/tech.png",
                    },
                },
                {
                    "id": str(job_id_2),
                    "title": "Frontend React Engineer",
                    "description": "Xây dựng ứng dụng web hiện đại",
                    "requirements": "Yêu cầu 2+ năm React, TypeScript, CSS",
                    "benefits": "MacBook Pro, hybrid working",
                    "location": "TP.HCM",
                    "employment_type": "hybrid",
                    "salary_min": 20000000,
                    "salary_max": 35000000,
                    "currency": "VND",
                    "deadline_at": "2026-09-15T00:00:00Z",
                    "status": "published",
                    "companies": {
                        "id": str(company_id_2),
                        "name": "Công ty Giải pháp Web NextWave",
                        "logo_storage_path": "logos/wave.png",
                    },
                },
            ]
        return table_mock

    mock_client.table.side_effect = mock_table

    # Mock LLM complete response
    mock_llm_json = json.dumps({
        "comparison_results": [
            {
                "job_id": "Công việc A",
                "metrics": {
                    "experience": {"score": 9.0, "reason": "4 năm Python rất khớp yêu cầu vị trí."},
                    "hard_skills": {"score": 9.5, "reason": "Thành thạo toàn bộ Python, FastAPI, Docker."},
                    "education": {"score": 8.5, "reason": "Bằng cử nhân CNTT chuẩn chỉ."},
                    "overall_fit": {"score": 9.2, "reason": "Độ phù hợp vượt trội."},
                },
            },
            {
                "job_id": "Công việc B",
                "metrics": {
                    "experience": {"score": 8.0, "reason": "Kinh nghiệm đáp ứng tốt yêu cầu frontend."},
                    "hard_skills": {"score": 8.5, "reason": "Có kinh nghiệm React vững chắc."},
                    "education": {"score": 8.5, "reason": "Học vấn phù hợp yêu cầu."},
                    "overall_fit": {"score": 8.2, "reason": "Phù hợp tốt với vị trí."},
                },
            },
        ]
    })

    def mock_complete(prompt: str, **kwargs):
        return mock_llm_json

    with patch("backend.app.services.matching.compare_jobs.try_ingest_resume", new_callable=AsyncMock):
        response = await compare_jobs_for_candidate(
            mock_client,
            actor_id,
            [job_id_1, job_id_2],
            complete=mock_complete,
        )

    assert isinstance(response, CompareJobsResponse)
    assert response.candidate_id == actor_id
    assert response.resume_id == resume_id
    assert len(response.jobs) == 2
    assert response.top_job_id == job_id_1
    assert response.jobs[0].job_id == job_id_1
    assert response.jobs[0].rank == 1
    assert response.jobs[0].average_score == 9.1
    assert response.jobs[0].company.name == "Công ty Công nghệ TechNova"
    assert response.jobs[1].job_id == job_id_2
    assert response.jobs[1].rank == 2
    assert "TechNova" in (response.summary or "")


def test_api_jobs_compare_route():
    app = create_app()
    user_id = uuid4()
    job_id_1 = uuid4()
    job_id_2 = uuid4()
    resume_id = uuid4()

    mock_resp = CompareJobsResponse(
        candidate_id=user_id,
        resume_id=resume_id,
        resume_title="CV Test",
        jobs=[],
        top_job_id=job_id_1,
        summary="Đã so sánh 2 công việc",
    )

    from backend.app.guardrails.rate_limit import enforce_chat_rate_limit

    app.dependency_overrides[enforce_chat_rate_limit] = lambda: AuthenticatedUser(
        id=user_id, email="cand@test.com", claims={}
    )

    with patch(
        "backend.app.api.routes.candidates.compare_jobs_for_candidate",
        new_callable=AsyncMock,
        return_value=mock_resp,
    ):
        client = TestClient(app)
        res = client.post(
            "/api/v1/jobs/compare",
            json={"job_ids": [str(job_id_1), str(job_id_2)]},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["candidate_id"] == str(user_id)
        assert data["top_job_id"] == str(job_id_1)

