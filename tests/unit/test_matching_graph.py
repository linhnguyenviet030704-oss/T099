from uuid import uuid4

import pytest

from agent.graph import build_matching_graph


@pytest.mark.asyncio
async def test_matching_graph_ranks_then_responds():
    app_id = str(uuid4())

    async def retrieve(_job_id):
        return {
            "jd_skills": ["Python", "FastAPI", "Docker"],
            "candidates": [
                {
                    "application_id": str(uuid4()),
                    "applicant_user_id": str(uuid4()),
                    "resume_id": str(uuid4()),
                    "full_name": "Ada",
                    "email": "ada@example.com",
                    "resume_title": "cv.pdf",
                    "resume_storage_path": "u/cv.pdf",
                    "current_status": "pending",
                    "skills": ["Python"],
                    "distance": 0.1,
                },
                {
                    "application_id": app_id,
                    "applicant_user_id": str(uuid4()),
                    "resume_id": str(uuid4()),
                    "full_name": "Bob",
                    "email": "bob@example.com",
                    "resume_title": "cv2.pdf",
                    "resume_storage_path": "u/cv2.pdf",
                    "current_status": "pending",
                    "skills": ["Python", "FastAPI", "Docker"],
                    "distance": 0.3,
                },
            ],
        }

    graph = build_matching_graph(retrieve=retrieve)
    result = await graph.ainvoke({"job_id": str(uuid4()), "query": "Gợi ý ứng viên"})
    assert result["response"] == "Gợi ý 2 ứng viên phù hợp."
    assert result["candidates"][0]["application_id"] == app_id
    assert result["candidates"][0]["score"] > result["candidates"][1]["score"]


@pytest.mark.asyncio
async def test_matching_graph_empty_pool():
    async def retrieve(_job_id):
        return {"jd_skills": ["Python"], "candidates": []}

    graph = build_matching_graph(retrieve=retrieve)
    result = await graph.ainvoke({"job_id": str(uuid4()), "query": "hello"})
    assert result["response"] == "Chưa có CV nộp cho vị trí này."
    assert result["candidates"] == []
