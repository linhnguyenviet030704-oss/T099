"""Reciprocal Rank Fusion. k=60 from the matching spec."""

from __future__ import annotations

from typing import Any

from backend.app.services.matching.skills import coverage_score, load_taxonomy_index

RRF_K = 60


def rrf_fuse(
    rankings: dict[str, list[str]],
    *,
    weights: dict[str, float] | None = None,
    k: int = RRF_K,
) -> list[tuple[str, float]]:
    scores: dict[str, float] = {}
    for source, ranked_ids in rankings.items():
        weight = (weights or {}).get(source, 1.0)
        for rank, doc_id in enumerate(ranked_ids, start=1):
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


def _ids_by_distance(rows: list[dict[str, Any]], key: str) -> list[str]:
    return [_doc_id(row) for row in sorted(rows, key=lambda item: float(item.get(key) or 1.0))]


def _ids_by_skill(rows: list[dict[str, Any]]) -> list[str]:
    return [_doc_id(row) for row in sorted(rows, key=lambda item: -float(item.get("skill_score") or 0.0))]


def score_candidates(
    rows: list[dict[str, Any]],
    jd_skills: list[str],
    taxonomy_index: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    index = taxonomy_index or load_taxonomy_index()
    annotated: list[dict[str, Any]] = []
    for row in rows:
        d_orig = float(
            row["distance_original"]
            if row.get("distance_original") is not None
            else row.get("distance") or 1.0
        )
        d_exp = float(row["distance_expanded"] if row.get("distance_expanded") is not None else d_orig)
        coverage = row.get("skill_score")
        if coverage is None:
            coverage = coverage_score(row.get("skills") or [], jd_skills, index)
        annotated.append(
            {
                **row,
                "distance_original": d_orig,
                "distance_expanded": d_exp,
                "skill_score": float(coverage),
                "semantic_score": semantic_score(d_orig),
            }
        )
    fused = rrf_fuse(
        {
            "original": _ids_by_distance(annotated, "distance_original"),
            "expanded": _ids_by_distance(annotated, "distance_expanded"),
            "skill": _ids_by_skill(annotated),
        }
    )
    by_id = {_doc_id(row): row for row in annotated}
    ranked: list[dict[str, Any]] = []
    for rank, (doc_id, raw) in enumerate(fused, start=1):
        row = by_id.get(doc_id)
        if not row:
            continue
        ranked.append(
            {
                **row,
                "rrf_score": rrf_normalize(raw, n_lists=3),
                "rrf_rank": rank,
            }
        )
    return ranked
