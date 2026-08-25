"""RRF scoring for CV -> JD: one fixed CV compared against many job rows.
Mirrors rrf.py's score_candidates, but coverage_score's argument order is
swapped (divide by each job's own skill count, not the CV's), and
constraint gating uses job_constraint_status (constraints.py) instead of
constraint_status, since the row being gated (a job) is never the
evidence source (the CV) the way a candidate row is in the JD->CV
direction. See docs/superpowers/specs/2026-08-24-cv-to-jd-recommend-design.md."""

from __future__ import annotations

import math
from typing import Any

from backend.app.services.matching.bm25 import competition_ranks
from backend.app.services.matching.constraints import (
    empty_constraints,
    job_constraint_status,
    partition_rows,
    soft_delta,
)
from backend.app.services.matching.rrf import RRF_K, rrf_fuse, rrf_normalize, semantic_score
from backend.app.services.matching.skills import coverage_score, load_taxonomy_index


def _job_doc_id(row: dict[str, Any]) -> str:
    return str(row.get("job_id") or "")


def _finite_distance(row: dict[str, Any]) -> float | None:
    value = row.get("distance_expanded")
    if value is None:
        return None
    distance = float(value)
    if not math.isfinite(distance):
        return None
    return distance


def score_jobs_for_resume(
    rows: list[dict[str, Any]],
    cv_skills: list[str],
    *,
    cv_verified: list[str],
    cv_has_evidence: bool = True,
    taxonomy_index: dict[str, str] | None = None,
    rrf_k: int = RRF_K,
) -> list[dict[str, Any]]:
    index = taxonomy_index or load_taxonomy_index()
    verified_set = set(cv_verified)
    annotated: list[dict[str, Any]] = []
    for row in rows:
        job_skills = list(row.get("skills") or [])
        distance = _finite_distance(row)
        constraints = row.get("skill_constraints") or empty_constraints()
        confirmed = bool(row.get("constraints_confirmed"))
        status = job_constraint_status(
            verified=verified_set,
            has_evidence=cv_has_evidence,
            constraints=constraints,
            confirmed=confirmed,
        )
        annotated.append(
            {
                **row,
                "skill_score": float(coverage_score(cv_skills, job_skills, index)),
                "semantic_score": semantic_score(distance) if distance is not None else 0.0,
                "soft_delta": soft_delta(list(verified_set), job_skills),
                "constraint_status": status,
                "bm25_score": float(row.get("bm25_score") or 0.0),
            }
        )

    dense_sorted = sorted(
        [row for row in annotated if _finite_distance(row) is not None],
        key=lambda row: (_finite_distance(row) or 0.0, _job_doc_id(row)),
    )
    dense_ids = [_job_doc_id(row) for row in dense_sorted]
    dense_ranks = competition_ranks([_finite_distance(row) or 0.0 for row in dense_sorted])

    bm25_sorted = sorted(
        [row for row in annotated if float(row.get("bm25_score") or 0.0) > 0.0],
        key=lambda row: (-float(row["bm25_score"]), _job_doc_id(row)),
    )
    bm25_ids = [_job_doc_id(row) for row in bm25_sorted]
    bm25_ranks = competition_ranks([-float(row["bm25_score"]) for row in bm25_sorted])

    rankings = {"expanded": dense_ids, "bm25": bm25_ids}
    ranks = {"expanded": dense_ranks, "bm25": bm25_ranks}
    fused = rrf_fuse(rankings, k=rrf_k, ranks=ranks)
    by_id = {_job_doc_id(row): row for row in annotated}
    ranked: list[dict[str, Any]] = []
    for rank, (doc_id, raw) in enumerate(fused, start=1):
        row = by_id.get(doc_id)
        if not row:
            continue
        ranked.append(
            {
                **row,
                "rrf_raw": raw,
                "rrf_score": rrf_normalize(raw, n_lists=2, k=rrf_k),
                "rrf_rank": rank,
            }
        )
    return partition_rows(ranked)
