from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from backend.app.config.models import RERANK_CANDIDATE_K, RERANK_DOC_MAX_CHARS
from backend.app.observability.logger import get_logger
from backend.app.services.matching.constraints import _STATUS_ORDER
from backend.app.services.matching.skills import extract_skills

logger = get_logger(__name__)

RerankFn = Callable[[str, list[str]], list[dict[str, Any]]]
_YEAR = re.compile(r"\b(?:19|20)\d{2}\b")
_EMAIL = re.compile(r"\S+@\S+")
# Derived from _STATUS_ORDER (not hand-written) so the rerank window's group
# ordering can never drift from the partition ordering constraints.py applies
# in partition_rows. Stable sort keeps equal-tier statuses in dict order, so
# this is ("pass", "ungated", "unknown", "fail").
_GROUP_ORDER = tuple(sorted(_STATUS_ORDER, key=lambda status: _STATUS_ORDER[status]))


def truncate_rerank_text(text: str | None, max_chars: int | None = None) -> str:
    limit = RERANK_DOC_MAX_CHARS if max_chars is None else max_chars
    blob = text or " "
    if not blob.strip():
        return " "
    if len(blob) <= limit:
        return blob
    return blob[:limit]


def rerank_document(row: dict[str, Any], jd_query: str) -> str:
    wanted = set(extract_skills(jd_query))
    quotes: list[str] = []
    for record in row.get("skill_records") or []:
        if wanted and record.get("id") not in wanted:
            continue
        quote = str(record.get("quote") or "").strip()
        if quote:
            quotes.append(quote)
    title = str(row.get("title") or "").strip()
    company = str(row.get("company_name") or "").strip()
    header = f"{title} - {company}" if title and company else (title or company)
    markdown = str(row.get("markdown") or "").strip()
    blob_parts = [header, markdown, *quotes] if header else [markdown, *quotes]
    blob = "\n".join(part for part in blob_parts if part)
    blob = _EMAIL.sub(" ", blob)
    blob = _YEAR.sub(" ", blob)
    return truncate_rerank_text(blob)


def _status(row: dict[str, Any]) -> str:
    value = str(row.get("constraint_status") or "ungated")
    return value if value in _GROUP_ORDER else "ungated"


def _fill_window(rows: list[dict[str, Any]], window_n: int, *, confirmed: bool) -> list[dict[str, Any]]:
    if not confirmed:
        return list(rows[:window_n])
    window: list[dict[str, Any]] = []
    for status in _GROUP_ORDER:
        for row in rows:
            if _status(row) != status:
                continue
            window.append(row)
            if len(window) >= window_n:
                return window
    return window


def _annotate(rows: list[dict[str, Any]], *, score: float | None, status: str) -> list[dict[str, Any]]:
    return [{**row, "rerank_score": score, "rerank_status": status} for row in rows]


def calibrate_rerank_score(
    raw_score: float,
    *,
    has_skills: bool = True,
    skill_cov: float = 1.0,
    has_jd_skills: bool = True,
    baseline: float = 0.0,
) -> float:
    """Hiệu chuẩn điểm số của mô hình AI Reranker (Cross-Encoder).
    Khi hồ sơ ứng viên rỗng hoặc không có kỹ năng phù hợp so với yêu cầu JD,
    áp dụng ngưỡng phạt (penalty clamp <= 0.08 / <= 0.15) để loại trừ điểm nền ảo
    của văn bản tiếng Việt ngoài phân phối (ví dụ 0.68)."""
    score = float(raw_score)
    if baseline > 0.0:
        if score <= baseline:
            score = 0.0
        else:
            score = min(1.0, max(0.0, (score - baseline) / (1.0 - baseline)))
    if has_jd_skills and not has_skills:
        score = min(score * 0.1, 0.08)
    elif has_jd_skills and skill_cov == 0.0:
        score = min(score * 0.2, 0.15)
    return round(score, 4)


def apply_rerank(
    rows: list[dict[str, Any]],
    *,
    jd_query: str,
    mode: str,
    rerank_fn: RerankFn | None = None,
    candidate_k: int | None = None,
    final_k: int | None = None,
    confirmed: bool = False,
) -> list[dict[str, Any]]:
    del final_k
    window_n = candidate_k if candidate_k is not None else RERANK_CANDIDATE_K
    window = _fill_window(rows, window_n, confirmed=confirmed)
    window_ids = {id(row) for row in window}
    rest = [row for row in rows if id(row) not in window_ids]

    if mode != "qwen":
        return _annotate(window, score=None, status="not_requested") + _annotate(
            rest, score=None, status="not_requested"
        )

    documents = [rerank_document(row, jd_query) for row in window]
    query = truncate_rerank_text(jd_query)
    try:
        fn = rerank_fn
        if fn is None:
            from backend.app.clients.llm import rerank_query

            fn = rerank_query
        raw = fn(query, documents)
    except Exception:
        logger.exception("qwen rerank failed")
        return _annotate(window, score=None, status="fallback") + _annotate(rest, score=None, status="fallback")

    by_index: dict[int, float] = {}
    for item in raw or []:
        try:
            by_index[int(item["index"])] = float(item["relevance_score"])
        except (KeyError, TypeError, ValueError):
            continue
    if len(by_index) != len(window):
        return _annotate(window, score=None, status="fallback") + _annotate(rest, score=None, status="fallback")

    wanted_skills = set(extract_skills(jd_query))
    has_wanted = bool(wanted_skills)

    scored: list[dict[str, Any]] = []
    for i, row in enumerate(window):
        raw_val = by_index[i]
        if "skills" in row or "verified_skills" in row:
            row_skills = list(row.get("skills") or row.get("verified_skills") or [])
            has_skills = bool(row_skills)
        else:
            row_skills = None
            has_skills = True

        skill_score_val = row.get("skill_score")
        if skill_score_val is not None:
            skill_cov = float(skill_score_val)
        elif has_wanted and row_skills is not None:
            matched = [s for s in row_skills if s in wanted_skills]
            skill_cov = len(matched) / len(wanted_skills) if wanted_skills else 1.0
        else:
            skill_cov = 1.0

        calibrated_score = calibrate_rerank_score(
            raw_val,
            has_skills=has_skills,
            skill_cov=skill_cov,
            has_jd_skills=has_wanted,
        )
        scored.append(
            {**row, "rerank_score": calibrated_score, "rerank_status": "success"}
        )

    grouped: dict[str, list[dict[str, Any]]] = {key: [] for key in _GROUP_ORDER}
    for row in scored:
        grouped[_status(row)].append(row)
    ordered: list[dict[str, Any]] = []
    for key in _GROUP_ORDER:
        chunk = grouped[key]
        chunk.sort(key=lambda item: (-float(item["rerank_score"]), str(item.get("application_id") or item.get("job_id") or "")))
        ordered.extend(chunk)
    return ordered + _annotate(rest, score=None, status="not_requested")
