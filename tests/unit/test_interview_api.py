"""Unit tests for Interview API endpoints."""

import uuid
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.mark.asyncio
async def test_generate_interview_endpoint(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("backend.app.tasks.interview_tasks.run_interview_pipeline.delay"):
            cand_id = str(uuid.uuid4())
            job_id = str(uuid.uuid4())
            response = await client.post(
                "/api/v1/interviews/generate",
                json={
                    "candidate_id": cand_id,
                    "job_id": job_id,
                    "question_count_range": [5, 15],
                    "coverage_threshold": 0.80,
                },
            )
            assert response.status_code == 202
            data = response.json()
            assert "session_id" in data
            assert data["status"] == "generating"
            assert f"/api/v1/interviews/sessions/{data['session_id']}" in data["poll_url"]


@pytest.mark.asyncio
async def test_get_and_patch_interview_session(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("backend.app.tasks.interview_tasks.run_interview_pipeline.delay"):
            cand_id = str(uuid.uuid4())
            job_id = str(uuid.uuid4())
            post_resp = await client.post(
                "/api/v1/interviews/generate",
                json={
                    "candidate_id": cand_id,
                    "job_id": job_id,
                },
            )
            session_id = post_resp.json()["session_id"]

            # GET session
            get_resp = await client.get(f"/api/v1/interviews/sessions/{session_id}")
            assert get_resp.status_code == 200
            assert get_resp.json()["id"] == session_id

            # PATCH session
            patch_resp = await client.patch(
                f"/api/v1/interviews/sessions/{session_id}",
                json={
                    "is_approved": True,
                    "reviewer_notes": "Looks solid, approved for technical round.",
                },
            )
            assert patch_resp.status_code == 200
            updated = patch_resp.json()
            assert updated["is_approved"] is True
            assert updated["reviewer_notes"] == "Looks solid, approved for technical round."


@pytest.mark.asyncio
async def test_get_session_not_found(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        random_id = str(uuid.uuid4())
        response = await client.get(f"/api/v1/interviews/sessions/{random_id}")
        assert response.status_code == 404
