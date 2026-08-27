"""Unit tests for Evaluation API endpoints."""

import uuid
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from backend.app.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.mark.asyncio
async def test_evaluate_endpoint_valid_request(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("backend.app.tasks.eval_tasks.run_evaluation_pipeline.delay"):
            cand_id = str(uuid.uuid4())
            response = await client.post(
                "/api/v1/evaluations",
                json={
                    "candidate_id": cand_id,
                    "repo_urls": ["https://github.com/fastapi/fastapi"],
                },
            )
            assert response.status_code == 202
            data = response.json()
            assert "evaluation_id" in data
            assert data["status"] == "pending"
            assert f"/api/v1/evaluations/{data['evaluation_id']}" in data["poll_url"]


@pytest.mark.asyncio
async def test_evaluate_endpoint_invalid_url(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        cand_id = str(uuid.uuid4())
        response = await client.post(
            "/api/v1/evaluations",
            json={
                "candidate_id": cand_id,
                "repo_urls": ["https://gitlab.com/invalid/repo"],
            },
        )
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_evaluation_status_existing(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("backend.app.tasks.eval_tasks.run_evaluation_pipeline.delay"):
            cand_id = str(uuid.uuid4())
            post_resp = await client.post(
                "/api/v1/evaluations",
                json={
                    "candidate_id": cand_id,
                    "repo_urls": ["https://github.com/psf/black"],
                },
            )
            eval_id = post_resp.json()["evaluation_id"]

            get_resp = await client.get(f"/api/v1/evaluations/{eval_id}")
            assert get_resp.status_code == 200
            assert get_resp.json()["id"] == eval_id


@pytest.mark.asyncio
async def test_get_evaluation_status_not_found(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        random_id = str(uuid.uuid4())
        response = await client.get(f"/api/v1/evaluations/{random_id}")
        assert response.status_code == 404
