import json
from uuid import uuid4

import pytest

from backend.app.agents.ingest.graph import build_ingest_graph
from backend.app.agents.matching.graph import build_matching_graph

EMBED_DIM = 1536


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
    result = await graph.ainvoke(
        {"job_id": str(uuid4()), "query": "Gợi ý ứng viên", "rerank_mode": "agent"}
    )
    assert result["response"] == "Gợi ý 2 ứng viên phù hợp."
    assert result["candidates"][0]["application_id"] == app_id
    assert result["candidates"][0]["rrf_score"] > result["candidates"][1]["rrf_score"]
    assert result["candidates"][0]["rerank_status"] == "not_requested"
    assert result["candidates"][0]["rerank_score"] is None


@pytest.mark.asyncio
async def test_matching_graph_empty_pool():
    async def retrieve(_job_id):
        return {"jd_skills": ["Python"], "candidates": []}

    graph = build_matching_graph(retrieve=retrieve)
    result = await graph.ainvoke({"job_id": str(uuid4()), "query": "hello"})
    assert result["response"] == "Chưa có CV nộp cho vị trí này."
    assert result["candidates"] == []


@pytest.mark.asyncio
async def test_matching_graph_qwen_rerank_reorders():
    ada = str(uuid4())
    bob = str(uuid4())

    async def retrieve(_job_id):
        return {
            "jd_query": "Python FastAPI",
            "jd_skills": ["Python"],
            "candidates": [
                {
                    "application_id": ada,
                    "applicant_user_id": str(uuid4()),
                    "resume_id": str(uuid4()),
                    "full_name": "Ada",
                    "email": "a@x",
                    "resume_title": "a.pdf",
                    "resume_storage_path": "a",
                    "current_status": "pending",
                    "skills": ["Python"],
                    "markdown": "ada cv",
                    "distance_original": 0.1,
                    "distance_expanded": 0.1,
                },
                {
                    "application_id": bob,
                    "applicant_user_id": str(uuid4()),
                    "resume_id": str(uuid4()),
                    "full_name": "Bob",
                    "email": "b@x",
                    "resume_title": "b.pdf",
                    "resume_storage_path": "b",
                    "current_status": "pending",
                    "skills": ["Python"],
                    "markdown": "bob cv",
                    "distance_original": 0.2,
                    "distance_expanded": 0.2,
                },
            ],
        }

    def rerank_fn(query: str, documents: list[str]):
        assert query == "Python FastAPI"
        assert documents == ["ada cv", "bob cv"]
        return [{"index": 1, "relevance_score": 0.95}, {"index": 0, "relevance_score": 0.1}]

    graph = build_matching_graph(retrieve=retrieve, rerank_fn=rerank_fn)
    result = await graph.ainvoke(
        {"job_id": str(uuid4()), "query": "Gợi ý ứng viên", "rerank_mode": "qwen"}
    )
    assert result["candidates"][0]["application_id"] == bob
    assert result["candidates"][0]["rerank_status"] == "success"
    assert result["candidates"][0]["rerank_score"] == 0.95


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
