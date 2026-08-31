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


@pytest.mark.asyncio
async def test_extract_cv_repos_api(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        cv_text = "Project Repo: https://github.com/encode/uvicorn"
        response = await client.post(
            "/api/v1/evaluations/extract-cv-repos",
            json={"cv_text": cv_text},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["found"] is True
        assert len(data["repos"]) == 1
        assert "uvicorn" in data["repos"][0]["repo_name"]


@pytest.mark.asyncio
async def test_extract_cv_repos_api_empty(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/evaluations/extract-cv-repos",
            json={"cv_text": "No projects or github links here"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["found"] is False
        assert data["repos"] is None
        assert "Không tìm thấy" in data["message"]


@pytest.mark.asyncio
async def test_evaluate_single_endpoint(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Mock lời gọi đồ thị agent để tránh phụ thuộc API ngoài trong unit test
        mock_result = {
            "status": "complete",
            "final_scores": {
                "completeness": 8.5,
                "complexity": 8.0,
                "optimization": 8.0,
                "code_cleanliness": 9.0,
                "project_understanding": 8.5,
                "weighted_score": 8.4,
            },
            "heuristic_metrics": {"tier1_score": 8.0, "file_count": 50},
            "summary": "Đã hoàn thành đánh giá kỹ thuật dự án.",
            "llm_evaluation": {"red_flags": []},
        }
        with patch("backend.app.api.v1.evaluations.agent1_graph.ainvoke", return_value=mock_result):
            response = await client.post(
                "/api/v1/evaluations/evaluate-single",
                json={
                    "repo_url": "https://github.com/fastapi/fastapi",
                    "project_name": "FastAPI Framework",
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["repo_full_name"] == "fastapi/fastapi"
            assert "overall_score" in data
            assert "evaluation_scores" in data
            assert data["status"] == "complete"


@pytest.mark.asyncio
async def test_repo_search_history_crud(app):
    from types import SimpleNamespace

    # Mock client Supabase trong unit test
    fake_data = []

    class FakeQuery:
        def select(self, *_args, **_kwargs):
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, *_args, **_kwargs):
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def upsert(self, data, *_args, **_kwargs):
            fake_data.append(data)
            return self

        def delete(self, *_args, **_kwargs):
            return self

        def execute(self):
            return SimpleNamespace(data=fake_data)

    class FakeClient:
        def table(self, _name: str):
            return FakeQuery()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("backend.app.api.v1.evaluations.get_supabase_client", return_value=FakeClient()):
            # 1. Save history record
            hist_id = str(uuid.uuid4())
            save_resp = await client.post(
                "/api/v1/evaluations/history",
                json={
                    "id": hist_id,
                    "search_type": "cv",
                    "title": "Nghiên cứu CV Nguyễn Văn A",
                    "extracted_repos": [{"repo_url": "https://github.com/fastapi/fastapi", "repo_name": "fastapi"}],
                    "evaluation_results": [{"repo_full_name": "fastapi/fastapi", "overall_score": 8.5}],
                    "status": "completed",
                },
            )
            assert save_resp.status_code == 200
            assert save_resp.json()["id"] == hist_id

            # 2. Get history
            get_resp = await client.get("/api/v1/evaluations/history")
            assert get_resp.status_code == 200
            assert isinstance(get_resp.json(), list)

            # 3. Delete history
            del_resp = await client.delete(f"/api/v1/evaluations/history/{hist_id}")
            assert del_resp.status_code == 200
            assert del_resp.json()["deleted"] is True
