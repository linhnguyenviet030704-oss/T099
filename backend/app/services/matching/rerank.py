from __future__ import annotations

from collections.abc import Callable
from typing import Any

from backend.app.config.models import (
    FINAL_CANDIDATE_K,
    RERANK_CANDIDATE_K,
    RERANK_DOC_MAX_CHARS,
)
from backend.app.observability.logger import get_logger

logger = get_logger(__name__)

RerankFn = Callable[[str, list[str]], list[dict[str, Any]]]


def truncate_rerank_text(text: str | None, max_chars: int | None = None) -> str:
    # ponytail: char budget, not tokens. Upgrade: real tokenizer before raising RERANK_DOC_MAX_CHARS.
    limit = RERANK_DOC_MAX_CHARS if max_chars is None else max_chars
    blob = text or " "
    if not blob.strip():
        return " "
    if len(blob) <= limit:
        return blob
    return blob[:limit]


def apply_rerank(
    rows: list[dict[str, Any]],
    *,
    jd_query: str,
    mode: str,
    rerank_fn: RerankFn | None = None,
    candidate_k: int | None = None,
    final_k: int | None = None,
) -> list[dict[str, Any]]:
    window_n = candidate_k if candidate_k is not None else RERANK_CANDIDATE_K
    keep_n = final_k if final_k is not None else FINAL_CANDIDATE_K
    window = list(rows[:window_n])

    if mode != "qwen":
        # ponytail: agent CV-eval skill not implemented; do not copy rrf_score into rerank_score.
        return [
            {**row, "rerank_score": None, "rerank_status": "not_requested"}
            for row in window[:keep_n]
        ]

    documents = [truncate_rerank_text(row.get("markdown")) for row in window]
    query = truncate_rerank_text(jd_query)
    try:
        fn = rerank_fn
        if fn is None:
            from backend.app.clients.llm import rerank_query

            fn = lambda q, docs: rerank_query(q, docs)
        raw = fn(query, documents)
    except Exception:
        logger.exception("qwen rerank failed")
        return [
            {**row, "rerank_score": None, "rerank_status": "fallback"}
            for row in window[:keep_n]
        ]

    by_index: dict[int, float] = {}
    for item in raw or []:
        try:
            by_index[int(item["index"])] = float(item["relevance_score"])
        except (KeyError, TypeError, ValueError):
            continue
    if len(by_index) != len(window):
        return [
            {**row, "rerank_score": None, "rerank_status": "fallback"}
            for row in window[:keep_n]
        ]

    scored = [
        {**row, "rerank_score": by_index[i], "rerank_status": "success"}
        for i, row in enumerate(window)
    ]
    scored.sort(key=lambda row: (-float(row["rerank_score"]), str(row.get("application_id") or "")))
    return scored[:keep_n]
