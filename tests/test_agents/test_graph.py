import pytest

from backend.app.agent.graph import build_ingest_graph


def _encode(text: str) -> list[float]:
    return [0.0] * 2560


def _complete(_prompt: str, **_kwargs) -> str:
    return '{"summary": "ok", "titles": []}'


@pytest.mark.asyncio
async def test_agent_basic_flow():
    graph = build_ingest_graph(encode=_encode, complete=_complete)
    result = await graph.ainvoke({"raw_bytes": b"Python", "mime_type": "text/plain"})
    assert "markdown" in result
    assert "embedding" in result


@pytest.mark.asyncio
async def test_agent_state_structure():
    graph = build_ingest_graph(encode=_encode, complete=_complete)
    result = await graph.ainvoke({"raw_bytes": b"Python FastAPI", "mime_type": "text/plain"})
    assert isinstance(result, dict)
    assert "metadata" in result
    assert "skills" in result["metadata"]
