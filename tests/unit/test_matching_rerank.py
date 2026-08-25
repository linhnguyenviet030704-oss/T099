from uuid import uuid4

import pytest

from backend.app.config.models import (
    DEFAULT_EMBED_MODEL,
    DEFAULT_RERANK_MODEL,
    RERANK_CONFIG_VERSION,
    RERANK_DOC_MAX_CHARS,
)
from backend.app.services.matching.rerank import apply_rerank, truncate_rerank_text
from backend.app.services.matching.retrieve import persist_match_resume_rows


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


def test_apply_rerank_respects_candidate_k_keeps_full_pool():
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
    assert len(out) == 5
    assert [r["application_id"] for r in out[:3]] == ["3", "2", "1"]
    assert [r["application_id"] for r in out[3:]] == ["4", "5"]


def test_apply_rerank_confirmed_keeps_fail_below_pass():
    rows = [
        {**_row("1", 0.9, "fail-cv"), "application_id": "fail", "constraint_status": "fail"},
        {**_row("2", 0.1, "pass-cv"), "application_id": "pass", "constraint_status": "pass"},
    ]

    def rerank_fn(query: str, documents: list[str]):
        assert documents == ["pass-cv", "fail-cv"]
        return [{"index": 0, "relevance_score": 0.1}, {"index": 1, "relevance_score": 0.99}]

    out = apply_rerank(
        rows,
        jd_query="Java",
        mode="qwen",
        rerank_fn=rerank_fn,
        confirmed=True,
    )
    assert [r["application_id"] for r in out] == ["pass", "fail"]


def test_apply_rerank_qwen_tie_break_falls_back_to_job_id():
    rows = [
        {"job_id": "j2", "rrf_score": 0.5, "markdown": "job two"},
        {"job_id": "j1", "rrf_score": 0.5, "markdown": "job one"},
    ]

    def rerank_fn(_query: str, documents: list[str]):
        assert documents == ["job two", "job one"]
        return [{"index": 0, "relevance_score": 0.5}, {"index": 1, "relevance_score": 0.5}]

    out = apply_rerank(rows, jd_query="Python", mode="qwen", rerank_fn=rerank_fn)
    assert [r["job_id"] for r in out] == ["j1", "j2"]


def test_apply_rerank_confirmed_window_includes_ungated_rows():
    rows = [
        {"job_id": "j1", "rrf_score": 0.9, "markdown": "a", "constraint_status": "ungated"},
        {"job_id": "j2", "rrf_score": 0.1, "markdown": "b", "constraint_status": "ungated"},
    ]

    def rerank_fn(_query: str, documents: list[str]):
        assert documents == ["a", "b"]
        return [{"index": 0, "relevance_score": 0.9}, {"index": 1, "relevance_score": 0.1}]

    out = apply_rerank(rows, jd_query="Python", mode="qwen", rerank_fn=rerank_fn, confirmed=True)
    assert [r["job_id"] for r in out] == ["j1", "j2"]
    assert out[0]["rerank_status"] == "success"


def test_group_order_is_derived_from_status_order():
    from backend.app.services.matching.constraints import _STATUS_ORDER
    from backend.app.services.matching.rerank import _GROUP_ORDER

    assert _GROUP_ORDER == ("pass", "ungated", "unknown", "fail")
    # ungated is tier 0 (same as pass), fail is tier 2 -- the two constants
    # must not be able to disagree about that again.
    assert [_STATUS_ORDER[s] for s in _GROUP_ORDER] == sorted(_STATUS_ORDER.values())


def test_apply_rerank_confirmed_keeps_ungated_above_fail():
    """Regression: a job whose confirmed must-have the CV FAILS must never be
    promoted above a merely-ungated job, even with a stronger rrf/rerank score.
    The CV->JD graph sets constraints_confirmed=True at state level while
    individual job rows can still be "ungated", so this combination is live."""
    rows = [
        {"job_id": "j-fail", "rrf_score": 0.9, "markdown": "fail-doc", "constraint_status": "fail"},
        {"job_id": "j-ungated", "rrf_score": 0.1, "markdown": "ungated-doc", "constraint_status": "ungated"},
    ]

    seen: dict[str, list[str]] = {}

    def rerank_fn(_query: str, documents: list[str]):
        seen["documents"] = list(documents)
        # score by document so both rows are demonstrably reranked, and give
        # the failing row the *better* relevance score.
        scores = {"ungated-doc": 0.10, "fail-doc": 0.99}
        return [
            {"index": i, "relevance_score": scores[doc]} for i, doc in enumerate(documents)
        ]

    out = apply_rerank(rows, jd_query="Python", mode="qwen", rerank_fn=rerank_fn, confirmed=True)

    # both rows were actually reranked (in window, scored, status success)
    assert sorted(seen["documents"]) == ["fail-doc", "ungated-doc"]
    assert all(row["rerank_status"] == "success" for row in out)
    assert out[0]["rerank_score"] == 0.10
    assert out[1]["rerank_score"] == 0.99
    # ungated group must precede fail group despite the worse relevance score
    assert [row["job_id"] for row in out] == ["j-ungated", "j-fail"]


def test_apply_rerank_confirmed_orders_pass_ungated_unknown_fail():
    rows = [
        {"job_id": "j-fail", "rrf_score": 0.9, "markdown": "d-fail", "constraint_status": "fail"},
        {"job_id": "j-unknown", "rrf_score": 0.8, "markdown": "d-unknown", "constraint_status": "unknown"},
        {"job_id": "j-ungated", "rrf_score": 0.7, "markdown": "d-ungated", "constraint_status": "ungated"},
        {"job_id": "j-pass", "rrf_score": 0.6, "markdown": "d-pass", "constraint_status": "pass"},
    ]

    def rerank_fn(_query: str, documents: list[str]):
        return [{"index": i, "relevance_score": 0.5} for i in range(len(documents))]

    out = apply_rerank(rows, jd_query="Python", mode="qwen", rerank_fn=rerank_fn, confirmed=True)
    assert [row["job_id"] for row in out] == ["j-pass", "j-ungated", "j-unknown", "j-fail"]


class _RpcClient:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def rpc(self, name, params):
        self.calls.append({"name": name, "params": params})
        return self

    def execute(self):
        return type("R", (), {"data": [{"id": "run"}]})()


@pytest.mark.asyncio
async def test_persist_match_resume_rows_calls_insert_rpc_once(monkeypatch):
    async def _allow(_client, _actor_id, _job_id):
        return None

    monkeypatch.setattr("backend.app.services.matching.retrieve.assert_recruiter_job_access", _allow)

    client = _RpcClient()
    job_id = uuid4()
    actor_id = uuid4()
    resume_id = uuid4()
    await persist_match_resume_rows(
        client,  # type: ignore[arg-type]
        job_id,
        [
            {
                "resume_id": str(resume_id),
                "rrf_score": 0.4,
                "rrf_rank": 1,
                "rerank_score": 0.9,
                "skill_score": 0.5,
                "semantic_score": 0.8,
                "skills": ["Python"],
                "distance_original": 0.1,
                "distance_expanded": 0.2,
            }
        ],
        actor_id=actor_id,
        query_text="Python",
        recruiter_message="Gợi ý ứng viên phù hợp",
        rerank_mode="qwen",
        rerank_status="success",
    )
    assert len(client.calls) == 1
    assert client.calls[0]["name"] == "insert_match_resume_run"
    params = client.calls[0]["params"]
    assert params["p_job_post_id"] == str(job_id)
    assert params["p_requested_by"] == str(actor_id)
    assert params["p_query_text"] == "Python"
    assert params["p_rerank_mode"] == "qwen"
    assert params["p_rerank_status"] == "success"
    assert params["p_rerank_model"] == DEFAULT_RERANK_MODEL
    assert params["p_rerank_config_version"] == RERANK_CONFIG_VERSION
    assert params["p_embedding_model"] == DEFAULT_EMBED_MODEL
    assert params["p_matched_resume_ids"] == [str(resume_id)]
    assert params["p_evidence"][0]["resume_id"] == str(resume_id)
    assert params["p_evidence"][0]["rank"] == 1
    assert params["p_evidence"][0]["rrf_score"] == 0.4
    assert params["p_evidence"][0]["rerank_score"] == 0.9
    assert "score" not in params["p_evidence"][0]
