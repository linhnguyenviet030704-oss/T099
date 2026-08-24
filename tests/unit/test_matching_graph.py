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
    assert set(result["metadata"]["skills"]) == {"python", "fastapi", "docker"}
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

    def complete(prompt: str, **_kwargs) -> str:
        seen["prompt"] = prompt
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
    blob = seen["text"] + result["markdown"] + seen.get("prompt", "")
    assert "ada@x.com" not in blob
    assert "0912345678" not in blob
    assert "Nguyen Van A" not in blob
    assert "FastAPI" in result["markdown"]


@pytest.mark.asyncio
async def test_ingest_flags_low_content_through_to_final_metadata():
    """The parse-stage quality gate flag must survive extract/summarize
    overwriting other metadata keys, since it's how downstream systems can
    tell a thin/failed extraction from a genuinely short CV."""

    def encode(_text: str) -> list[float]:
        return [0.1] * EMBED_DIM

    graph = build_ingest_graph(encode=encode, complete=_complete)
    result = await graph.ainvoke({"raw_bytes": b"Hi", "mime_type": "text/plain"})
    assert result["metadata"]["low_content"] is True


def _matching_retrieve(candidates: list[dict], jd_description: str = "Python FastAPI") -> dict:
    return {
        "jd_skills": ["Python", "FastAPI"],
        "jd_query": "Python FastAPI",
        "job_description": jd_description,
        "candidates": candidates,
    }


def _candidate(i: str, *, skills=None) -> dict:
    return {
        "application_id": i,
        "applicant_user_id": str(uuid4()),
        "resume_id": str(uuid4()),
        "full_name": f"User {i}",
        "email": f"{i}@x",
        "resume_title": f"cv{i}.pdf",
        "resume_storage_path": f"u/{i}",
        "current_status": "pending",
        "skills": skills or [],
        "distance_expanded": 0.2,
        "bm25_score": 0.5,
    }


@pytest.mark.asyncio
async def test_matching_graph_explain_node_attaches_match_reason_per_candidate():
    candidates = [_candidate("a", skills=["python"]), _candidate("b", skills=["python", "fastapi"])]
    seen_ids: list[str] = []

    def explain_complete(prompt: str, **_kwargs):
        seen_ids.append(prompt)
        return json.dumps(
            {
                "a": "Có Python nhưng thiếu FastAPI trong JD.",
                "b": "Đủ cả Python và FastAPI như JD yêu cầu, vượt trội hơn a.",
            }
        )

    async def retrieve(_job_id):
        return _matching_retrieve(candidates)

    graph = build_matching_graph(
        retrieve=retrieve,
        rerank_fn=lambda _q, _docs: [],
        explain_complete=explain_complete,
    )
    result = await graph.ainvoke({"job_id": str(uuid4()), "query": "x", "rerank_mode": "agent"})

    reasons = {row["application_id"]: row.get("match_reason") for row in result["candidates"]}
    assert reasons["a"] == "Có Python nhưng thiếu FastAPI trong JD."
    assert reasons["b"] == "Đủ cả Python và FastAPI như JD yêu cầu, vượt trội hơn a."
    assert len(seen_ids) == 1


@pytest.mark.asyncio
async def test_matching_graph_explain_node_falls_back_to_deterministic_reason_on_llm_error():
    """When the LLM call fails, the node must still attach a
    deterministic per-candidate reason so the recruiter sees something
    better than `null` — no API key, no network, no JSON, all OK."""
    candidates = [
        _candidate("a", skills=["python", "fastapi"]),
        _candidate("b", skills=["python"]),
    ]

    def explain_complete(_prompt: str, **_kwargs):
        raise RuntimeError("llm down")

    async def retrieve(_job_id):
        return _matching_retrieve(candidates)

    graph = build_matching_graph(
        retrieve=retrieve,
        rerank_fn=lambda _q, _docs: [],
        explain_complete=explain_complete,
    )
    result = await graph.ainvoke({"job_id": str(uuid4()), "query": "x", "rerank_mode": "agent"})
    reasons = {row["application_id"]: row.get("match_reason") for row in result["candidates"]}
    assert reasons["a"] and reasons["b"]
    assert "python" in reasons["a"].lower() or "fastapi" in reasons["a"].lower()
    assert "python" in reasons["b"].lower()


@pytest.mark.asyncio
async def test_matching_graph_explain_node_uses_jd_query_when_description_missing():
    candidates = [_candidate("a")]
    seen_jd: list[str] = []

    def explain_complete(prompt: str, **_kwargs):
        seen_jd.append(prompt)
        return json.dumps({"a": "ok"})

    async def retrieve_no_desc(_job_id):
        return {
            "jd_skills": ["Python"],
            "jd_query": "Python developer needed",
            "candidates": candidates,
        }

    graph = build_matching_graph(
        retrieve=retrieve_no_desc,
        rerank_fn=lambda _q, _docs: [],
        explain_complete=explain_complete,
    )
    await graph.ainvoke({"job_id": str(uuid4()), "query": "x", "rerank_mode": "agent"})
    assert "Python developer needed" in seen_jd[0]


@pytest.mark.asyncio
async def test_matching_graph_explain_node_no_candidates_skips_llm():
    calls: list[str] = []

    def explain_complete(prompt: str, **_kwargs):
        calls.append(prompt)
        return "{}"

    async def retrieve(_job_id):
        return {"jd_skills": [], "jd_query": "", "candidates": []}

    graph = build_matching_graph(
        retrieve=retrieve,
        rerank_fn=None,
        explain_complete=explain_complete,
    )
    result = await graph.ainvoke({"job_id": str(uuid4()), "query": "x"})
    assert result["response"] == "Chưa có CV nộp cho vị trí này."
    assert calls == []


@pytest.mark.asyncio
async def test_explain_node_forwards_custom_prompt_template():
    from backend.app.agents.matching.nodes.explain import make_explain_node

    captured: dict = {}

    def complete(prompt: str, **_kwargs):
        captured["prompt"] = prompt
        return '{"a": "ok"}'

    node = make_explain_node(complete=complete, prompt_template="CUSTOM {job_description} {candidate_briefs}")
    result = await node({"candidates": [{"application_id": "a", "skills": ["python"]}], "job_description": "JD"})
    assert captured["prompt"].startswith("CUSTOM JD")
    assert result["candidates"][0]["match_reason"] == "ok"


@pytest.mark.asyncio
async def test_ingest_graph_runs_extract_node_before_summarize(monkeypatch):
    calls: list[str] = []

    from backend.app.agents.ingest.nodes.extract import extract_skills_node as original_extract

    async def _spy_extract(state):
        calls.append("extract")
        return await original_extract(state)

    monkeypatch.setattr(
        "backend.app.agents.ingest.graph.extract_skills_node", _spy_extract
    )

    graph = build_ingest_graph(encode=_encode, complete=_complete)
    result = await graph.ainvoke(
        {"raw_bytes": b"Python FastAPI Docker intern", "mime_type": "text/plain"}
    )

    assert calls == ["extract"]
    assert set(result["metadata"]["skills"]) == {"python", "fastapi", "docker"}
