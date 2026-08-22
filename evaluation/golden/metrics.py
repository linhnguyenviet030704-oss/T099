"""Precision@K, Recall@K, NDCG@K, MRR -- pure Python, no dependencies.

ranked_ids: candidate ids in ranking order (best first), as produced by the
real Matching Agent's score_candidates() (backend/app/services/matching/rrf.py).
grades: {candidate_id: relevance grade}, grade in {0, 1, 2}. Missing id -> 0.
"""

from __future__ import annotations

import math


def _grade(grades: dict[str, int], cid: str) -> int:
    return int(grades.get(cid, 0))


def precision_at_k(ranked_ids: list[str], grades: dict[str, int], k: int, *, threshold: int = 1) -> float:
    top = ranked_ids[:k]
    if not top:
        return 0.0
    relevant = sum(1 for cid in top if _grade(grades, cid) >= threshold)
    return relevant / len(top)


def recall_at_k(ranked_ids: list[str], grades: dict[str, int], k: int, *, threshold: int = 1) -> float:
    total_relevant = sum(1 for g in grades.values() if g >= threshold)
    if total_relevant == 0:
        return 0.0
    top = ranked_ids[:k]
    hit = sum(1 for cid in top if _grade(grades, cid) >= threshold)
    return hit / total_relevant


def dcg_at_k(ranked_ids: list[str], grades: dict[str, int], k: int) -> float:
    total = 0.0
    for i, cid in enumerate(ranked_ids[:k], start=1):
        g = _grade(grades, cid)
        total += (2**g - 1) / math.log2(i + 1)
    return total


def ndcg_at_k(ranked_ids: list[str], grades: dict[str, int], k: int) -> float:
    ideal_order = sorted(grades.values(), reverse=True)[:k]
    idcg = sum((2**g - 1) / math.log2(i + 1) for i, g in enumerate(ideal_order, start=1))
    if idcg == 0:
        return 0.0
    return dcg_at_k(ranked_ids, grades, k) / idcg


def mrr(ranked_ids: list[str], grades: dict[str, int], *, threshold: int = 2) -> float:
    for i, cid in enumerate(ranked_ids, start=1):
        if _grade(grades, cid) >= threshold:
            return 1.0 / i
    return 0.0


def evaluate_ranking(ranked_ids: list[str], grades: dict[str, int], ks: tuple[int, ...] = (5, 10)) -> dict:
    out: dict = {"mrr": mrr(ranked_ids, grades)}
    for k in ks:
        out[f"precision_at_{k}"] = precision_at_k(ranked_ids, grades, k)
        out[f"recall_at_{k}"] = recall_at_k(ranked_ids, grades, k)
        out[f"ndcg_at_{k}"] = ndcg_at_k(ranked_ids, grades, k)
    return out


def macro_average(per_jd: dict[str, dict]) -> dict:
    if not per_jd:
        return {}
    keys = next(iter(per_jd.values())).keys()
    return {k: sum(v[k] for v in per_jd.values()) / len(per_jd) for k in keys}
