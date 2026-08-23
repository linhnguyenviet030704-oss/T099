"""One LLM call that explains why each shortlisted CV fits the JD, and
why each candidate is ranked above the others in the same shortlist.
The output is a {candidate_id: reasoning} map attached to each candidate
in the chat response."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

from backend.app.clients.llm import chat_complete

CompleteFn = Callable[..., str]

_PROMPT_PATH = Path(__file__).resolve().parents[2] / "prompts" / "system" / "explain_match.txt"
EXPLAIN_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")
EXPLAIN_PROMPT_VERSION = "2026-08-23.v1"

_MAX_JD_CHARS = 4000
_MAX_BRIEF_CHARS = 500
_MAX_CANDIDATES = 50


def _truncate(text: str | None, limit: int) -> str:
    blob = (text or "").strip()
    if not blob:
        return ""
    if len(blob) <= limit:
        return blob
    return blob[:limit].rstrip()


def _brief(row: dict[str, Any]) -> tuple[str, str]:
    """Return (candidate_id, brief) for the prompt. The brief uses facts
    that are already extracted and known-safe (name, title, match score,
    skill names, summary, body fragment) — never raw markdown that may
    contain PII. The markdown passed to retrieve() is already PII-redacted."""
    cid = str(row.get("application_id") or "")
    parts: list[str] = []
    name = row.get("full_name")
    if name:
        parts.append(f"name={name}")
    title = row.get("resume_title")
    if title:
        parts.append(f"title={title}")
    score = row.get("rerank_score")
    if score is not None:
        pct = round(float(score) * 100)
        parts.append(f"match_score={pct}% (rerank={float(score):.2f})")
    elif row.get("rrf_score") is not None:
        pct = round(float(row["rrf_score"]) * 100)
        parts.append(f"match_score={pct}% (rrf={float(row['rrf_score']):.2f})")
    skills = row.get("skills") or []
    if skills:
        parts.append("skills=" + ", ".join(str(s) for s in skills))
    summary = _truncate(row.get("summary"), 200)
    if summary:
        parts.append("summary=" + summary)
    body = _truncate(row.get("clean_markdown") or row.get("markdown"), 300)
    if body:
        parts.append("body=" + body)
    return cid, "; ".join(parts)


def _build_prompt(jd_text: str, candidates: list[dict[str, Any]]) -> str:
    briefs: list[str] = []
    for row in candidates[:_MAX_CANDIDATES]:
        cid, brief = _brief(row)
        if not cid or not brief:
            continue
        briefs.append(f"- id={cid}: {brief}")
    candidate_block = "\n".join(briefs) if briefs else "(no candidates)"
    return EXPLAIN_PROMPT_TEMPLATE.replace(
        "{job_description}", _truncate(jd_text, _MAX_JD_CHARS)
    ).replace("{candidate_briefs}", candidate_block)


def _strip_fence(raw: str) -> str:
    text = raw.strip()
    match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, flags=re.DOTALL | re.IGNORECASE)
    return match.group(1) if match else text


def _parse_map(raw: str) -> dict[str, str]:
    text = _strip_fence(raw)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, str] = {}
    for key, value in data.items():
        if not isinstance(key, str) or not isinstance(value, str):
            continue
        cleaned = value.strip()
        if cleaned:
            out[key] = cleaned
    return out


def _extract_skills(row: dict[str, Any]) -> list[str]:
    seen: list[str] = []
    for skill in row.get("skills") or []:
        token = str(skill).strip()
        if token and token not in seen:
            seen.append(token)
    return seen


def deterministic_reason(
    *,
    row: dict[str, Any],
    jd_skills: list[str],
    rank: int,
    total: int,
) -> str:
    """Evidence-grounded 1-sentence reason when LLM is unavailable.
    Provides matched-skill list, match score percentage and ordinal position in the shortlist."""
    candidate_skills = _extract_skills(row)
    wanted = [str(s).strip() for s in jd_skills if str(s).strip()]
    matched = [s for s in candidate_skills if s in wanted]
    score_pick = row.get("rerank_score")
    if score_pick is None:
        score_pick = row.get("rrf_score")
    pct_phrase = f" ({round(float(score_pick) * 100)}%)" if score_pick is not None else ""
    rank_phrase = "" if total <= 1 else f", xếp thứ {rank}/{total} trong shortlist"

    if matched:
        skills_phrase = ", ".join(matched[:5])
        return (
            f"Đạt điểm phù hợp{pct_phrase} nhờ đáp ứng các kỹ năng cốt lõi: {skills_phrase}{rank_phrase}."
        )
    if candidate_skills:
        skills_phrase = ", ".join(candidate_skills[:3])
        return (
            f"Đạt điểm phù hợp{pct_phrase} nhờ các kỹ năng liên quan: {skills_phrase}{rank_phrase}."
        )
    return f"Được đánh giá phù hợp JD{pct_phrase} dựa trên phân tích tổng thể hồ sơ{rank_phrase}."


def explain_matches(
    *,
    jd_text: str,
    candidates: list[dict[str, Any]],
    complete: CompleteFn | None = None,
    jd_skills: list[str] | None = None,
) -> dict[str, str]:
    """Return {application_id: reasoning} for the given candidates, or {} on failure.

    Runs a single LLM call so all candidates are reasoned about in
    context of each other (relative ranking is part of the prompt).
    Only ids present in the input `candidates` are kept — the LLM is
    free to invent ids, and we never trust those.

    If the LLM fails (no API key, network error, JSON parse, etc.) we
    fall back to a deterministic per-candidate reason so the recruiter
    always sees something better than `null`.
    """
    if not candidates:
        return {}
    allowed_ids = {str(row.get("application_id") or "") for row in candidates}
    allowed_ids.discard("")
    fn = complete or chat_complete
    prompt = _build_prompt(jd_text, candidates)
    parsed: dict[str, str] = {}
    try:
        raw = fn(prompt, json_object=True)
        parsed = _parse_map(raw)
    except Exception:
        parsed = {}
    llm_reasons = {cid: reason for cid, reason in parsed.items() if cid in allowed_ids}
    if len(llm_reasons) == len(allowed_ids) and allowed_ids:
        return llm_reasons
    # ponytail: deterministic fallback so the recruiter still gets an
    # evidence-grounded explanation when LLM is unavailable (no API key,
    # network error, JSON garbled, or partial response). Ceiling: no deep
    # relative-ranking narrative; only matched-skill list and ordinal
    # position. Upgrade path: keep retrying LLM with exponential backoff
    # before falling back if richer prose is required.
    skills = jd_skills or []
    total = len(allowed_ids)
    out: dict[str, str] = dict(llm_reasons)
    for rank, row in enumerate(candidates[:_MAX_CANDIDATES], start=1):
        cid = str(row.get("application_id") or "")
        if not cid or cid in out:
            continue
        out[cid] = deterministic_reason(
            row=row, jd_skills=skills, rank=rank, total=total
        )
    return out
