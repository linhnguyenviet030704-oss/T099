from uuid import uuid4

import pytest

from backend.app.agents.recommend.graph import build_recommend_graph


@pytest.mark.asyncio
async def test_recommend_graph_ranks_then_responds():
    job_a = str(uuid4())
    job_b = str(uuid4())

    async def retrieve():
        return {
            "cv_skills": ["python", "fastapi", "docker"],
            "cv_verified": ["python", "fastapi", "docker"],
            "cv_has_evidence": True,
            "cv_text": "Backend dev with Python, FastAPI, Docker.",
            "candidates": [
                {
                    "job_id": job_a,
                    "title": "Backend Engineer",
                    "skills": ["python"],
                    "distance_expanded": 0.4,
                    "bm25_score": 0.0,
                    "skill_constraints": {"must": [], "preferred": [], "mentioned": [], "excluded": []},
                    "constraints_confirmed": False,
                    "markdown": "Needs Python",
                    "clean_markdown": "Needs Python",
                    "skill_records": [],
                },
                {
                    "job_id": job_b,
                    "title": "Platform Engineer",
                    "skills": ["python", "fastapi", "docker"],
                    "distance_expanded": 0.1,
                    "bm25_score": 0.0,
                    "skill_constraints": {"must": [], "preferred": [], "mentioned": [], "excluded": []},
                    "constraints_confirmed": False,
                    "markdown": "Needs Python, FastAPI, Docker",
                    "clean_markdown": "Needs Python, FastAPI, Docker",
                    "skill_records": [],
                },
            ],
        }

    graph = build_recommend_graph(retrieve=retrieve)
    result = await graph.ainvoke({"query": "Gợi ý việc phù hợp", "rerank_mode": "agent"})

    assert result["response"] == "Gợi ý 2 việc làm phù hợp."
    assert result["candidates"][0]["job_id"] == job_b
    assert result["candidates"][0]["rrf_score"] > result["candidates"][1]["rrf_score"]
    assert result["candidates"][0]["rerank_status"] == "not_requested"
    assert result["candidates"][0]["skill_score"] == 1.0


@pytest.mark.asyncio
async def test_recommend_graph_empty_pool():
    async def retrieve():
        return {
            "cv_skills": ["python"],
            "cv_verified": ["python"],
            "cv_has_evidence": True,
            "cv_text": "CV",
            "candidates": [],
        }

    graph = build_recommend_graph(retrieve=retrieve)
    result = await graph.ainvoke({"query": "hello"})
    assert result["response"] == "Hiện chưa có tin tuyển dụng phù hợp với CV của bạn."
    assert result["candidates"] == []
