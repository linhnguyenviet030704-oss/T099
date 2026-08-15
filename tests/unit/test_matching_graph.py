import json
from uuid import uuid4

import pytest

from backend.app.agent.graph import build_ingest_graph, build_matching_graph

EMBED_DIM = 2560


def _encode(text: str) -> list[float]:
    return [float((i + len(text)) % 7) for i in range(EMBED_DIM)]


def _complete(_prompt: str, **_kwargs) -> str:
    return json.dumps(
        {
            "summary": "Backend engineer.",
            "titles": ["Engineer"],
            "body": "## Experience\nBackend intern using FastAPI.",
        }
    )


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
                    "distance_original": 0.1,
                    "distance_expanded": 0.4,
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
                    "distance_original": 0.3,
                    "distance_expanded": 0.1,
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


@pytest.mark.asyncio
async def test_ingest_extracts_skills_from_summary_not_raw_cv():
    seen = {}

    def encode(text: str) -> list[float]:
        seen["text"] = text
        return [0.1] * EMBED_DIM

    def complete(_prompt: str, **_kwargs) -> str:
        return json.dumps(
            {
                "summary": "API intern.",
                "titles": ["Intern"],
                "skills": ["Cooking"],
                "body": "Used FastAPI at a startup.",
            }
        )

    graph = build_ingest_graph(encode=encode, complete=complete)
    result = await graph.ainvoke(
        {"raw_bytes": b"Python FastAPI Docker intern", "mime_type": "text/plain"}
    )
    assert result["metadata"]["skills"] == ["FastAPI"]
    assert result["metadata"]["summary"] == "API intern."
    assert result["metadata"]["titles"] == ["Intern"]
    assert not result["markdown"].startswith("---")
    assert "summary:" not in result["markdown"]
    assert "Used FastAPI" in result["markdown"]
    assert "summary:" not in seen["text"]
    assert "Used FastAPI" in seen["text"]
    assert len(result["embedding"]) == EMBED_DIM


@pytest.mark.asyncio
async def test_ingest_does_not_embed_pii_even_if_llm_echoes_it():
    seen = {}

    def encode(text: str) -> list[float]:
        seen["text"] = text
        return [0.1] * EMBED_DIM

    def complete(_prompt: str, **_kwargs) -> str:
        return json.dumps(
            {
                "summary": "Backend intern.",
                "titles": ["Intern"],
                "body": "Email ada@x.com. Used FastAPI.",
            }
        )

    graph = build_ingest_graph(encode=encode, complete=complete)
    result = await graph.ainvoke(
        {
            "raw_bytes": b"Nguyen Van A\nada@x.com\n0912345678\nPython FastAPI",
            "mime_type": "text/plain",
        }
    )
    blob = seen["text"] + result["markdown"]
    assert "ada@x.com" not in blob
    assert "0912345678" not in blob
    assert "Nguyen Van A" not in blob
    assert "FastAPI" in result["markdown"]
