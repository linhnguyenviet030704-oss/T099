# evaluation/matching_perf/fixtures.py
"""Offline fixture for benchmarking build_matching_graph() against realistic data,
built from the already-ingested golden dataset instead of live Supabase -- same
approach evaluation/golden/run_eval.py uses, for the same repeatability reason.

Requires evaluation/golden/ingest_results.json and evaluation/golden/jds.json to
already exist (produced by `python -m evaluation.golden.run_eval`, Task 7).
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any
from uuid import uuid4

REPO_ROOT = Path(__file__).resolve().parents[2]
GOLDEN_DIR = REPO_ROOT / "evaluation" / "golden"
INGEST_RESULTS_PATH = GOLDEN_DIR / "ingest_results.json"
JDS_PATH = GOLDEN_DIR / "jds.json"


def cosine_distance(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 1.0
    return 1.0 - dot / (na * nb)


def load_matching_fixture(jd_id: str = "JD-01") -> dict[str, Any]:
    """Build the payload matching_graph's retrieve_node expects, from cached golden data.
    bm25_score is left at 0.0 for every candidate (same simplification golden/run_eval.py's
    reverse-ranking fixture uses): BM25 scoring itself is benchmarked in isolation by
    evaluation/service_bench/compute_local_bench.py (Task 3), and matching_graph's node
    latencies here don't depend on whether bm25_score is populated.
    """
    from backend.app.services.matching.skills import extract_skills, load_taxonomy_index
    from evaluation.golden.llm_openai import embed_text as oai_embed

    ingest_results: dict[str, dict] = json.loads(INGEST_RESULTS_PATH.read_text(encoding="utf-8"))
    jds: list[dict] = json.loads(JDS_PATH.read_text(encoding="utf-8"))
    jd = next(row for row in jds if row["jd_id"] == jd_id)
    jd_text = (jd.get("requirements_text") or "").strip() or f"{jd['title']} {jd['description']}"

    index = load_taxonomy_index()
    jd_skills = extract_skills(jd_text, index)
    jd_embedding = oai_embed(jd_text)

    candidates = []
    for cv_id, row in ingest_results.items():
        skills = row["extracted_skills"]
        candidates.append(
            {
                "application_id": cv_id,
                "resume_id": cv_id,
                "full_name": cv_id,
                "skills": skills,
                "verified_skills": skills,
                "inferred_skills": [],
                "skill_records": [],
                "ingest_status": "ok",
                "markdown": row["original_markdown"],
                "clean_markdown": row["original_markdown"],
                "distance_expanded": cosine_distance(jd_embedding, row["embedding"]),
                "bm25_score": 0.0,
            }
        )

    payload = {
        "jd_skills": jd_skills,
        "jd_query": jd_text,
        "job_description": jd_text,
        "candidates": candidates,
        "skill_constraints": {},
        "constraints_confirmed": False,
        "pool_size": len(candidates),
        "pool_truncated": False,
        "dropped_count": 0,
        "pool_latency_warn": False,
        "embedding_mismatch_count": 0,
    }

    async def retrieve(_job_id):
        return payload

    initial_state = {"job_id": str(uuid4()), "query": "", "rerank_mode": "agent"}
    return {"retrieve": retrieve, "initial_state": initial_state}
