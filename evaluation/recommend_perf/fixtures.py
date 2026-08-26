"""Offline fixture for benchmarking build_recommend_graph() against realistic data,
built from the already-ingested golden dataset (same rationale as
evaluation/matching_perf/fixtures.py). Reuses cosine_distance from there instead of
redefining it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from evaluation.matching_perf.fixtures import cosine_distance

REPO_ROOT = Path(__file__).resolve().parents[2]
GOLDEN_DIR = REPO_ROOT / "evaluation" / "golden"
INGEST_RESULTS_PATH = GOLDEN_DIR / "ingest_results.json"
JDS_PATH = GOLDEN_DIR / "jds.json"


def load_recommend_fixture(cv_id: str | None = None) -> dict[str, Any]:
    """Build the payload recommend_graph's retrieve() callback expects: one CV scored
    against all 20 golden JDs. bm25_score is left at 0.0, same simplification as
    matching_perf's fixture (see that module's docstring)."""
    from backend.app.services.matching.skills import expand_query
    from evaluation.golden.llm_openai import embed_text as oai_embed

    ingest_results: dict[str, dict] = json.loads(INGEST_RESULTS_PATH.read_text(encoding="utf-8"))
    jds: list[dict] = json.loads(JDS_PATH.read_text(encoding="utf-8"))
    cv_id = cv_id or next(iter(ingest_results))
    cv_row = ingest_results[cv_id]

    candidates = []
    for jd in jds:
        jd_text = (jd.get("requirements_text") or "").strip() or f"{jd['title']} {jd['description']}"
        jd_embedding = oai_embed(expand_query(jd_text))
        candidates.append(
            {
                "job_id": jd["jd_id"],
                "title": jd["title"],
                "skills": jd["taxonomy_skills"],
                "distance_expanded": cosine_distance(cv_row["embedding"], jd_embedding),
                "bm25_score": 0.0,
            }
        )

    payload = {
        "candidates": candidates,
        "cv_skills": cv_row["extracted_skills"],
        "cv_text": cv_row["original_markdown"],
        "cv_verified": cv_row["extracted_skills"],
        "cv_has_evidence": True,
    }

    async def retrieve():
        return payload

    return {"retrieve": retrieve, "cv_id": cv_id}
