"""Reciprocal Rank Fusion. k=60 default, not claimed optimal."""

from __future__ import annotations

import math
from typing import Any

from backend.app.services.matching.bm25 import competition_ranks
from backend.app.services.matching.constraints import constraint_status, empty_constraints, partition_rows, soft_delta
from backend.app.services.matching.skills import coverage_score, load_taxonomy_index

RRF_K = 60


def rrf_fuse(
    rankings: dict[str, list[str]],
    *,
    weights: dict[str, float] | None = None,
    k: int = RRF_K,
    ranks: dict[str, list[int]] | None = None,
) -> list[tuple[str, float]]:
    scores: dict[str, float] = {}
    for source, ranked_ids in rankings.items():
        weight = (weights or {}).get(source, 1.0)
        source_ranks = (ranks or {}).get(source)
        for index, doc_id in enumerate(ranked_ids):
            rank = source_ranks[index] if source_ranks else index + 1
            scores[doc_id] = scores.get(doc_id, 0.0) + weight / (k + rank)
    return sorted(scores.items(), key=lambda item: (-item[1], item[0]))


def rrf_normalize(raw: float, *, n_lists: int, k: int = RRF_K) -> float:
    if n_lists <= 0:
        return 0.0
    ceiling = n_lists / (k + 1)
    if ceiling <= 0:
        return 0.0
    return max(0.0, min(1.0, raw / ceiling))


def semantic_score(distance: float) -> float:
    return max(0.0, 1.0 - distance)


def _doc_id(row: dict[str, Any]) -> str:
    return str(row.get("application_id") or row.get("resume_id") or "")


def _finite_distance(row: dict[str, Any]) -> float | None:
    value = row.get("distance_expanded")
    if value is None:
        return None
    distance = float(value)
    if not math.isfinite(distance):
        return None
    return distance


def score_candidates(
    rows: list[dict[str, Any]],
    jd_skills: list[str],
    taxonomy_index: dict[str, str] | None = None,
    *,
    constraints: dict[str, Any] | None = None,
    confirmed: bool = False,
    rrf_k: int = RRF_K,
) -> list[dict[str, Any]]:
    index = taxonomy_index or load_taxonomy_index()
    constraint_payload = constraints or empty_constraints()
    annotated: list[dict[str, Any]] = []
    for row in rows:
        verified_raw = row.get("verified_skills")
        verified = list(verified_raw) if verified_raw is not None else None
        skills = list(row.get("skills") or verified or [])
        coverage = row.get("skill_score")
        if coverage is None:
            coverage = coverage_score(verified or skills, jd_skills, index)
        distance = _finite_distance(row)
        delta = soft_delta(verified or [], jd_skills)
        status = constraint_status(row, constraint_payload, confirmed=confirmed)
        annotated.append(
            {
                **row,
                "skills": skills,
                "verified_skills": verified,
                "skill_score": float(coverage),
                "semantic_score": semantic_score(distance) if distance is not None else 0.0,
                "soft_delta": delta,
                "constraint_status": status,
                "bm25_score": float(row.get("bm25_score") or 0.0),
            }
        )

    dense_sorted = sorted(
        [row for row in annotated if _finite_distance(row) is not None],
        key=lambda row: (_finite_distance(row) or 0.0, _doc_id(row)),
    )
    dense_ids = [_doc_id(row) for row in dense_sorted]
    dense_ranks = competition_ranks([_finite_distance(row) or 0.0 for row in dense_sorted])

    bm25_sorted = sorted(
        [row for row in annotated if float(row.get("bm25_score") or 0.0) > 0.0],
        key=lambda row: (-float(row["bm25_score"]), _doc_id(row)),
    )
    bm25_ids = [_doc_id(row) for row in bm25_sorted]
    bm25_ranks = competition_ranks([-float(row["bm25_score"]) for row in bm25_sorted])

    rankings = {"expanded": dense_ids, "bm25": bm25_ids}
    ranks = {"expanded": dense_ranks, "bm25": bm25_ranks}
    fused = rrf_fuse(rankings, k=rrf_k, ranks=ranks)
    by_id = {_doc_id(row): row for row in annotated}
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
    if not confirmed:
        ranked.sort(key=lambda row: (-float(row.get("rrf_raw") or 0.0), -float(row.get("soft_delta") or 0.0), _doc_id(row)))
        for index, row in enumerate(ranked, start=1):
            row["rrf_rank"] = index
        return ranked
    return partition_rows(ranked)
