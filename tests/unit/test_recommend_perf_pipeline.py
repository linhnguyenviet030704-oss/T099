from __future__ import annotations

import pytest

from evaluation.recommend_perf.pipeline import run_recommend_pipeline


def _fake_retrieve():
    async def retrieve():
        return {
            "candidates": [
                {"job_id": "JD-01", "title": "Backend Engineer", "skills": ["python"],
                 "distance_expanded": 0.1, "bm25_score": 0.0},
                {"job_id": "JD-02", "title": "Frontend Engineer", "skills": ["react"],
                 "distance_expanded": 0.5, "bm25_score": 0.0},
            ],
            "cv_skills": ["python"],
            "cv_text": "backend developer with python experience",
            "cv_verified": ["python"],
            "cv_has_evidence": True,
        }

    return retrieve


def _fake_explain_complete(_prompt: str, **_kwargs) -> str:
    return "{}"


def test_run_recommend_pipeline_score_path_runs_full_graph():
    result = run_recommend_pipeline(
        retrieve=_fake_retrieve(),
        query="Gợi ý công việc phù hợp với hồ sơ của tôi",
        explain_complete=_fake_explain_complete,
    )
    assert set(result["timings_ms"]) == {"router", "retrieve", "kg_retrieval", "score", "rerank", "snapshot", "explain", "output_guard", "respond"}
    assert result["total_ms"] == pytest.approx(sum(result["timings_ms"].values()), abs=0.1)


def test_run_recommend_pipeline_advice_path_skips_scoring_nodes():
    result = run_recommend_pipeline(
        retrieve=_fake_retrieve(),
        query="Tôi cần bổ sung kỹ năng gì để phù hợp hơn?",
        explain_complete=_fake_explain_complete,
    )
    assert set(result["timings_ms"]) == {"router", "retrieve", "kg_retrieval", "advice"}
    assert "score" not in result["timings_ms"]
