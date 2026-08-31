"""Tests for streaming in Repo Evaluation, Interview Generation, Job Compare, and Candidate Compare.

Kiểm tra phát luồng Server-Sent Events (SSE) và sự kiện trạng thái (status, complete)
cho toàn bộ 4 dịch vụ AI mở rộng.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from backend.app.api.v1.evaluations import (
    EvaluateSingleRequest,
    stream_evaluate_single_repo,
)
from backend.app.api.v1.interviews import (
    GenerateInterviewRequest,
    stream_generate_interview,
)
from backend.app.services.matching.compare import stream_compare_candidates_for_job
from backend.app.services.matching.compare_jobs import stream_compare_jobs_for_candidate


class TestServicesStreaming:
    """Kiểm tra luồng sự kiện cho các dịch vụ AI bổ sung."""

    @pytest.mark.asyncio
    async def test_stream_evaluate_single_repo_invalid_url(self):
        """URL không hợp lệ phát ra sự kiện lỗi."""
        req = EvaluateSingleRequest(repo_url="invalid-url")
        events = []
        async for event in stream_evaluate_single_repo(req):
            events.append(event)

        assert len(events) == 1
        assert events[0]["event"] == "error"

    @pytest.mark.asyncio
    async def test_stream_evaluate_single_repo_success(self):
        """Đánh giá repository phát ra các bước status và complete."""
        req = EvaluateSingleRequest(
            repo_url="https://github.com/fastapi/fastapi",
            project_name="FastAPI",
        )

        async def fake_astream(*args, **kwargs):
            yield {"preflight": {"repo_full_name": "fastapi/fastapi"}}
            yield {"tier1_heuristic": {"heuristic_metrics": {"file_count": 50}}}
            yield {"tier2_llm_evaluate": {"summary": "Dự án tốt"}}

        with patch("backend.app.api.v1.evaluations.agent1_graph.astream", side_effect=fake_astream):
            events = []
            async for event in stream_evaluate_single_repo(req):
                events.append(event)

            event_names = [e["event"] for e in events]
            assert "status" in event_names
            assert "complete" in event_names

            complete_event = next(e for e in events if e["event"] == "complete")
            assert complete_event["data"]["repo_full_name"] == "fastapi/fastapi"
            assert complete_event["data"]["status"] == "complete"

    @pytest.mark.asyncio
    async def test_stream_generate_interview_success(self):
        """Sinh câu hỏi phỏng vấn phát ra các bước status và complete."""
        req = GenerateInterviewRequest(
            candidate_id=uuid4(),
            job_id=uuid4(),
            question_count_range=[5, 10],
            coverage_threshold=0.8,
        )

        async def fake_astream(*args, **kwargs):
            yield {"analyze_jd": {"jd_analysis": {"title": "Senior AI Engineer"}}}
            yield {"fetch_cv": {"candidate_name": "Nguyễn Văn B"}}
            yield {
                "persist": {
                    "session_id": "00000000-0000-0000-0000-000000000001",
                    "generated_questions": [
                        {
                            "id": "q1",
                            "text": "Hãy giải thích cơ chế Attention trong Transformer.",
                            "category": "technical",
                            "difficulty": "hard",
                        }
                    ],
                }
            }

        with patch("backend.app.api.v1.interviews.agent2_graph.astream", side_effect=fake_astream):
            events = []
            async for event in stream_generate_interview(req):
                events.append(event)

            event_names = [e["event"] for e in events]
            assert "status" in event_names
            assert "complete" in event_names

            complete_event = next(e for e in events if e["event"] == "complete")
            assert complete_event["data"]["job_title"] == "Senior AI Engineer"
            assert len(complete_event["data"]["questions"]) == 1

    @pytest.mark.asyncio
    async def test_stream_compare_candidates_for_job(self):
        """So sánh ứng viên phát ra các bước status và complete."""
        job_id = uuid4()
        app_ids = [uuid4(), uuid4()]
        client = MagicMock()

        mock_response = MagicMock()
        mock_response.model_dump.return_value = {
            "job_id": str(job_id),
            "job_title": "Backend Lead",
            "candidates": [],
            "summary": "So sánh 2 ứng viên hoàn tất.",
        }

        with patch(
            "backend.app.services.matching.compare.compare_candidates_for_job",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            events = []
            async for event in stream_compare_candidates_for_job(
                client=client,
                actor_id=uuid4(),
                job_id=job_id,
                application_ids=app_ids,
            ):
                events.append(event)

            event_names = [e["event"] for e in events]
            assert "status" in event_names
            assert "complete" in event_names

            steps = [e["data"]["step"] for e in events if e["event"] == "status"]
            assert "fetch_data" in steps
            assert "anonymize" in steps
            assert "ai_evaluate" in steps
            assert "synthesis" in steps

    @pytest.mark.asyncio
    async def test_stream_compare_jobs_for_candidate(self):
        """So sánh việc làm phát ra các bước status và complete."""
        job_ids = [uuid4(), uuid4()]
        client = MagicMock()

        mock_response = MagicMock()
        mock_response.model_dump.return_value = {
            "candidate_id": str(uuid4()),
            "jobs": [],
            "summary": "So sánh 2 việc làm hoàn tất.",
        }

        with patch(
            "backend.app.services.matching.compare_jobs.compare_jobs_for_candidate",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            events = []
            async for event in stream_compare_jobs_for_candidate(
                client=client,
                actor_id=uuid4(),
                job_ids=job_ids,
            ):
                events.append(event)

            event_names = [e["event"] for e in events]
            assert "status" in event_names
            assert "complete" in event_names

            steps = [e["data"]["step"] for e in events if e["event"] == "status"]
            assert "fetch_data" in steps
            assert "anonymize" in steps
            assert "ai_evaluate" in steps
            assert "synthesis" in steps
