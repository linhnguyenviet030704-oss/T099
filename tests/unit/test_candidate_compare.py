from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from backend.app.core.exceptions import AppError
from backend.app.services.matching.compare import (
    COMPARE_PROMPT_TEMPLATE,
    _clean_cv_text_for_prompt,
    _fallback_metrics_for_candidate,
    _match_label,
    _parse_llm_response,
    _strip_fence,
    compare_candidates_for_job,
)


def test_compare_prompt_template_placeholders():
    assert "{job_description_and_requirements}" in COMPARE_PROMPT_TEMPLATE
    assert "{anonymized_cvs}" in COMPARE_PROMPT_TEMPLATE
    assert "Kinh nghiệm làm việc" in COMPARE_PROMPT_TEMPLATE
    assert "Kỹ năng chuyên môn" in COMPARE_PROMPT_TEMPLATE
    assert "Học vấn & Chứng chỉ" in COMPARE_PROMPT_TEMPLATE
    assert "Độ phù hợp tổng thể" in COMPARE_PROMPT_TEMPLATE
    assert "comparison_results" in COMPARE_PROMPT_TEMPLATE


def test_strip_fence():
    assert _strip_fence("```json\n{\"test\": 1}\n```") == '{"test": 1}'
    assert _strip_fence("```\n{\"test\": 2}\n```") == '{"test": 2}'
    assert _strip_fence("{\"test\": 3}") == '{"test": 3}'


def test_clean_cv_text_redacts_pii():
    raw_cv = (
        "Họ và tên: Nguyễn Văn A\n"
        "Email: nguyenvana@gmail.com\n"
        "Số điện thoại: 0987654321 hoặc +84912345678\n"
        "Kỹ năng: React, TypeScript, Python\n"
        "Kinh nghiệm: 3 năm làm việc tại công ty X."
    )
    cleaned = _clean_cv_text_for_prompt(raw_cv)
    assert "nguyenvana@gmail.com" not in cleaned
    assert "0987654321" not in cleaned
    assert "+84912345678" not in cleaned
    assert "[EMAIL ĐÃ ẨN]" in cleaned
    assert "[SĐT ĐÃ ẨN]" in cleaned
    assert "React, TypeScript, Python" in cleaned


def test_parse_llm_response():
    valid_json = json.dumps({
        "comparison_results": [
            {
                "candidate_id": "Ứng viên A",
                "metrics": {
                    "experience": {"score": 8.5, "reason": "Kinh nghiệm 3 năm phù hợp JD."},
                    "hard_skills": {"score": 9.0, "reason": "Thành thạo React và TypeScript."},
                    "education": {"score": 8.0, "reason": "Cử nhân CNTT Đại học Bách Khoa."},
                    "overall_fit": {"score": 8.5, "reason": "Hồ sơ rất tiềm năng."},
                },
            }
        ]
    })
    parsed = _parse_llm_response(valid_json)
    assert len(parsed) == 1
    assert parsed[0]["candidate_id"] == "Ứng viên A"
    assert parsed[0]["metrics"]["hard_skills"]["score"] == 9.0

    # Invalid json
    assert _parse_llm_response("error not json") == []


def test_match_label():
    keys = ["Ứng viên A", "Ứng viên B", "Ứng viên C"]
    assert _match_label("Ứng viên A", keys) == "Ứng viên A"
    assert _match_label("ung vien a", keys) == "Ứng viên A"
    assert _match_label("A", keys) == "Ứng viên A"
    assert _match_label("Ứng viên 2", keys) == "Ứng viên B"
    assert _match_label("Unknown", keys) is None


def test_fallback_metrics():
    cand = {
        "skills": ["Python", "FastAPI", "React"],
        "clean_markdown": "Đại học Bách Khoa. 3 năm kinh nghiệm phát triển web.",
    }
    jd_skills = ["Python", "FastAPI", "Docker"]
    metrics = _fallback_metrics_for_candidate(cand, jd_skills, rank_hint=1, total=3)
    assert metrics.hard_skills.score >= 5.0
    assert metrics.experience.score >= 5.0
    assert metrics.education.score >= 5.0
    assert metrics.overall_fit.score >= 5.0
    assert len(metrics.hard_skills.reason) > 0


@pytest.mark.asyncio
async def test_compare_candidates_validation():
    client = MagicMock()
    actor_id = uuid4()
    job_id = uuid4()

    # Reject 1 candidate
    with pytest.raises(AppError) as exc_info:
        await compare_candidates_for_job(
            client=client,
            actor_id=actor_id,
            job_id=job_id,
            application_ids=[uuid4()],
        )
    assert exc_info.value.code == "INVALID_CANDIDATE_COUNT"

    # Reject 6 candidates
    with pytest.raises(AppError) as exc_info:
        await compare_candidates_for_job(
            client=client,
            actor_id=actor_id,
            job_id=job_id,
            application_ids=[uuid4() for _ in range(6)],
        )
    assert exc_info.value.code == "INVALID_CANDIDATE_COUNT"


@pytest.mark.asyncio
async def test_compare_candidates_for_job_flow():
    client = MagicMock()
    actor_id = uuid4()
    job_id = uuid4()
    app_id_1 = uuid4()
    app_id_2 = uuid4()
    user_id_1 = uuid4()
    user_id_2 = uuid4()
    resume_id_1 = uuid4()
    resume_id_2 = uuid4()

    # Mock assert_recruiter_job_access
    with patch("backend.app.services.matching.compare.assert_recruiter_job_access", new=AsyncMock()):
        # Mock DB queries
        def table_side_effect(table_name: str):
            mock_table = MagicMock()
            if table_name == "job_posts":
                mock_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
                    "id": str(job_id),
                    "title": "Senior Frontend Developer",
                    "description": "Phát triển web app React & TypeScript",
                    "requirements": "3+ năm kinh nghiệm React, TypeScript, Tailwind",
                    "skill_constraints": {},
                }
            elif table_name == "job_submits":
                mock_table.select.return_value.eq.return_value.in_.return_value.is_.return_value.execute.return_value.data = [
                    {
                        "id": str(app_id_1),
                        "applicant_user_id": str(user_id_1),
                        "resume_id": str(resume_id_1),
                        "current_status": "pending",
                        "resume_title_snapshot": "CV Nguyễn Văn A",
                        "resume_storage_path_snapshot": "resumes/a.pdf",
                        "profiles": {"full_name": "Nguyễn Văn A", "email": "a@example.com"},
                    },
                    {
                        "id": str(app_id_2),
                        "applicant_user_id": str(user_id_2),
                        "resume_id": str(resume_id_2),
                        "current_status": "screening",
                        "resume_title_snapshot": "CV Trần Thị B",
                        "resume_storage_path_snapshot": "resumes/b.pdf",
                        "profiles": {"full_name": "Trần Thị B", "email": "b@example.com"},
                    },
                ]
            elif table_name == "embedded_resumes":
                mock_table.select.return_value.in_.return_value.execute.return_value.data = [
                    {
                        "resume_id": str(resume_id_1),
                        "metadata": {"skills": ["React", "TypeScript", "Tailwind"], "summary": "Frontend Dev 4 năm kinh nghiệm"},
                        "clean_markdown": "Kinh nghiệm 4 năm React, TypeScript. Bằng cử nhân CNTT.",
                    },
                    {
                        "resume_id": str(resume_id_2),
                        "metadata": {"skills": ["Vue", "JavaScript", "HTML"], "summary": "Web Dev 2 năm kinh nghiệm"},
                        "clean_markdown": "Kinh nghiệm 2 năm Vue.js. Bằng cao đẳng tin học.",
                    },
                ]
            return mock_table

        client.table.side_effect = table_side_effect

        # Mock LLM complete function
        def mock_complete(prompt: str, **kwargs) -> str:
            return json.dumps({
                "comparison_results": [
                    {
                        "candidate_id": "Ứng viên A",
                        "metrics": {
                            "experience": {"score": 9.0, "reason": "4 năm kinh nghiệm React chuyên sâu."},
                            "hard_skills": {"score": 9.5, "reason": "Thành thạo toàn bộ stack yêu cầu."},
                            "education": {"score": 8.5, "reason": "Cử nhân CNTT chính quy."},
                            "overall_fit": {"score": 9.0, "reason": "Rất phù hợp vị trí Senior."},
                        },
                    },
                    {
                        "candidate_id": "Ứng viên B",
                        "metrics": {
                            "experience": {"score": 7.0, "reason": "2 năm kinh nghiệm Vue thay vì React."},
                            "hard_skills": {"score": 6.5, "reason": "Thiếu TypeScript và React trong CV."},
                            "education": {"score": 7.0, "reason": "Tốt nghiệp Cao đẳng chuyên ngành tin học."},
                            "overall_fit": {"score": 6.8, "reason": "Cần đào tạo thêm về React."},
                        },
                    },
                ]
            })

        response = await compare_candidates_for_job(
            client=client,
            actor_id=actor_id,
            job_id=job_id,
            application_ids=[app_id_1, app_id_2],
            complete=mock_complete,
        )

        assert response.job_title == "Senior Frontend Developer"
        assert len(response.candidates) == 2
        # Check Rank #1
        top = response.candidates[0]
        assert top.application_id == app_id_1
        assert top.full_name == "Nguyễn Văn A"
        assert top.rank == 1
        assert top.average_score == 9.0
        assert top.metrics.hard_skills.score == 9.5

        # Check Rank #2
        second = response.candidates[1]
        assert second.application_id == app_id_2
        assert second.full_name == "Trần Thị B"
        assert second.rank == 2
        assert second.average_score == 6.8


@pytest.mark.asyncio
async def test_compare_candidates_fallback_on_llm_failure():
    client = MagicMock()
    actor_id = uuid4()
    job_id = uuid4()
    app_id_1 = uuid4()
    app_id_2 = uuid4()

    with patch("backend.app.services.matching.compare.assert_recruiter_job_access", new=AsyncMock()):
        def table_side_effect(table_name: str):
            mock_table = MagicMock()
            if table_name == "job_posts":
                mock_table.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
                    "id": str(job_id),
                    "title": "Backend Python Developer",
                    "description": "FastAPI + PostgreSQL",
                    "requirements": "Python, FastAPI",
                    "skill_constraints": {},
                }
            elif table_name == "job_submits":
                mock_table.select.return_value.eq.return_value.in_.return_value.is_.return_value.execute.return_value.data = [
                    {
                        "id": str(app_id_1),
                        "applicant_user_id": str(uuid4()),
                        "resume_id": str(uuid4()),
                        "current_status": "pending",
                        "resume_title_snapshot": "CV 1",
                        "resume_storage_path_snapshot": None,
                        "profiles": {"full_name": "Ứng viên 1", "email": "1@test.com"},
                    },
                    {
                        "id": str(app_id_2),
                        "applicant_user_id": str(uuid4()),
                        "resume_id": str(uuid4()),
                        "current_status": "pending",
                        "resume_title_snapshot": "CV 2",
                        "resume_storage_path_snapshot": None,
                        "profiles": {"full_name": "Ứng viên 2", "email": "2@test.com"},
                    },
                ]
            elif table_name == "embedded_resumes":
                mock_table.select.return_value.in_.return_value.execute.return_value.data = []
            return mock_table

        client.table.side_effect = table_side_effect

        def failing_complete(prompt: str, **kwargs) -> str:
            raise RuntimeError("LLM network timeout")

        response = await compare_candidates_for_job(
            client=client,
            actor_id=actor_id,
            job_id=job_id,
            application_ids=[app_id_1, app_id_2],
            complete=failing_complete,
        )

        assert len(response.candidates) == 2
        for cand in response.candidates:
            assert cand.total_score > 0
            assert cand.average_score > 0
            assert cand.metrics.experience.reason != ""
