from backend.app.config.models import RERANK_DOC_MAX_CHARS
from backend.app.services.matching.rerank import apply_rerank, truncate_rerank_text


def _row(i: str, rrf: float, md: str = "cv") -> dict:
    return {
        "application_id": i,
        "resume_id": f"r-{i}",
        "rrf_score": rrf,
        "rrf_rank": int(i),
        "markdown": md,
    }


def test_truncate_rerank_text_cuts_over_budget():
    blob = "á" * (RERANK_DOC_MAX_CHARS + 50)
    out = truncate_rerank_text(blob)
    assert len(out) == RERANK_DOC_MAX_CHARS
    assert len(blob) > RERANK_DOC_MAX_CHARS


def test_truncate_empty_becomes_space():
    assert truncate_rerank_text("") == " "
    assert truncate_rerank_text(None) == " "  # type: ignore[arg-type]


def test_apply_rerank_agent_keeps_rrf_order_and_null_rerank_score():
    rows = [_row("1", 0.9), _row("2", 0.2)]
    out = apply_rerank(rows, jd_query="Python", mode="agent")
    assert [r["application_id"] for r in out] == ["1", "2"]
    assert out[0]["rerank_score"] is None
    assert out[0]["rerank_status"] == "not_requested"
    assert out[0]["rrf_score"] == 0.9


def test_apply_rerank_qwen_reorders_by_relevance_leaves_rrf():
    rows = [_row("1", 0.9, "ada"), _row("2", 0.2, "bob")]

    def rerank_fn(query: str, documents: list[str]):
        assert query == "Python FastAPI"
        assert documents == ["ada", "bob"]
        return [{"index": 1, "relevance_score": 0.99}, {"index": 0, "relevance_score": 0.1}]

    out = apply_rerank(
        rows, jd_query="Python FastAPI", mode="qwen", rerank_fn=rerank_fn
    )
    assert [r["application_id"] for r in out] == ["2", "1"]
    assert out[0]["rerank_score"] == 0.99
    assert out[0]["rerank_status"] == "success"
    assert out[0]["rrf_score"] == 0.2


def test_apply_rerank_qwen_error_falls_back():
    rows = [_row("1", 0.9), _row("2", 0.2)]

    def rerank_fn(query: str, documents: list[str]):
        raise RuntimeError("dashscope down")

    out = apply_rerank(rows, jd_query="Python", mode="qwen", rerank_fn=rerank_fn)
    assert [r["application_id"] for r in out] == ["1", "2"]
    assert out[0]["rerank_score"] is None
    assert out[0]["rerank_status"] == "fallback"


def test_apply_rerank_respects_candidate_and_final_k():
    rows = [_row(str(i), 1.0 - i / 10, f"d{i}") for i in range(1, 6)]

    def rerank_fn(query: str, documents: list[str]):
        assert documents == ["d1", "d2", "d3"]
        return [{"index": i, "relevance_score": 0.1 * i} for i in range(3)]

    out = apply_rerank(
        rows,
        jd_query="q",
        mode="qwen",
        rerank_fn=rerank_fn,
        candidate_k=3,
        final_k=2,
    )
    assert len(out) == 2
    assert [r["application_id"] for r in out] == ["3", "2"]
