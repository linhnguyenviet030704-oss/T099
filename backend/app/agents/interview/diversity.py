"""Diversity Enforcement for Generated Interview Questions."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class DiversityViolation(Exception):
    """Raised when generated questions violate hard diversity constraints."""


def enforce_diversity(
    questions: list[dict[str, Any]],
    *,
    min_categories: int = 3,
    max_per_category: int = 5,
    min_hard_ratio: float = 0.15,
) -> list[dict[str, Any]]:
    """Enforce diversity constraints on generated interview questions.

    Rules:
    1. Category spread: min 3 distinct categories used (raises DiversityViolation if not met)
    2. Exact text deduplication (case-insensitive & trimmed)
    3. Max 5 questions per category
    4. Difficulty check: logs warning if hard questions < 15%

    Returns:
        Filtered, deduplicated, and balanced list of question dicts.
    """
    if not questions:
        return []

    # 1. Deduplicate by question text (case-insensitive)
    seen_texts: set[str] = set()
    unique_questions: list[dict[str, Any]] = []
    for q in questions:
        text = str(q.get("text", "")).strip().lower()
        if not text:
            continue
        if text not in seen_texts:
            seen_texts.add(text)
            unique_questions.append(q)

    # 2. Check category spread
    categories = {q.get("category") for q in unique_questions if q.get("category")}
    if len(categories) < min_categories:
        raise DiversityViolation(
            f"Only {len(categories)} categories ({categories}), need at least {min_categories}"
        )

    # 3. Max questions per category
    by_category: dict[str, list[dict[str, Any]]] = {}
    for q in unique_questions:
        cat = q.get("category", "technical")
        by_category.setdefault(cat, []).append(q)

    filtered_questions: list[dict[str, Any]] = []
    for _cat, qs in by_category.items():
        filtered_questions.extend(qs[:max_per_category])

    # 4. Check hard difficulty ratio
    if filtered_questions:
        hard_count = sum(1 for q in filtered_questions if q.get("difficulty") == "hard")
        hard_ratio = hard_count / len(filtered_questions)
        if hard_ratio < min_hard_ratio:
            logger.warning(
                "Hard question ratio is %.1f%% (target: >= %.1f%%)",
                hard_ratio * 100,
                min_hard_ratio * 100,
            )

    return filtered_questions
