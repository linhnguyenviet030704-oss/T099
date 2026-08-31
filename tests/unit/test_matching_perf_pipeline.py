# tests/unit/test_matching_perf_pipeline.py
from __future__ import annotations

import pytest

from evaluation.matching_perf.pipeline import run_matching_pipeline


def test_run_matching_pipeline_times_every_node():
    candidates = [
        {"application_id": "cv-1", "skills": ["python"], "verified_skills": ["python"],
         "markdown": "cv one", "clean_markdown": "cv one", "distance_expanded": 0.1, "bm25_score": 0.0},
        {"application_id": "cv-2", "skills": ["java"], "verified_skills": ["java"],
         "markdown": "cv two", "clean_markdown": "cv two", "distance_expanded": 0.4, "bm25_score": 0.0},
    ]
    payload = {
        "jd_skills": ["python"],
        "jd_query": "python backend engineer",
        "job_description": "python backend engineer",
        "candidates": candidates,
        "skill_constraints": {},
        "constraints_confirmed": False,
        "pool_size": 2,
        "pool_truncated": False,
        "dropped_count": 0,
        "pool_latency_warn": False,
        "embedding_mismatch_count": 0,
    }

    async def fake_retrieve(_job_id):
        return payload

    def fake_explain_complete(_prompt: str, **_kwargs) -> str:
        return "{}"

    result = run_matching_pipeline(
        retrieve=fake_retrieve,
        initial_state={"job_id": "11111111-1111-1111-1111-111111111111", "query": "", "rerank_mode": "agent"},
        explain_complete=fake_explain_complete,
    )

    assert set(result["timings_ms"]) == {"retrieve", "skill", "rrf", "rerank", "snapshot", "explain", "output_guard", "respond"}
    assert all(ms >= 0 for ms in result["timings_ms"].values())
    assert result["total_ms"] == pytest.approx(sum(result["timings_ms"].values()), abs=0.1)
    assert len(result["final_state"]["candidates"]) == 2
