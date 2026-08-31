"""Validation of provider output before response or persistence."""

from __future__ import annotations

import math
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

from backend.app.guardrails.gates import contains_secret, sanitize_sensitive_text

OutputAction = Literal["allow", "sanitize", "fallback", "block"]
_CONSTRAINT_ORDER = {"pass": 0, "ungated": 1, "unknown": 2, "fail": 3}
_PROTECTED_DISCLOSURE_RE = re.compile(
    r"(?i)\b(?:system prompt|developer (?:message|instruction)|prompt template|"
    r"internal prompt|your prompt|agent prompt|system (?:instruction|message|policy)|"
    r"tool (?:schema|configuration)|prompt hệ thống|prompt của bạn|chỉ dẫn hệ thống|"
    r"thông điệp developer|cấu hình công cụ|prompt he thong|prompt cua ban|"
    r"chi dan he thong|thong diep developer|cau hinh cong cu)\b"
)
_INTERNAL_ARCHITECTURE_DISCLOSURE_RE = re.compile(
    r"(?ix)"
    r"(?:"
    r"\b(?:database|db)\s+schema\s*:\s*[a-z_][\w.]*\s*\([^)]*\)"
    r"|\binternal\s+tables?\s*:\s*[a-z_][\w.,\s-]*"
    r"|\bdatabase[_\s-]*url\s*[:=]\s*\S+"
    r"|\b(?:supabase\s+)?service[\s_-]*role[\s_-]*key\b"
    r"|\b(?:internal|private|production)\s+(?:database|db)\s+(?:schema|structure)\b"
    r")"
)
_STACK_TRACE_RE = re.compile(
    r"(?i)(?:traceback \(most recent call last\)|(?:file|module) [\"'][^\"']+\.py[\"'].*line \d+|"
    r"(?:exception|error):\s+.*(?:backend/app|backend\\app))"
)


@dataclass(frozen=True)
class GuardedOutput:
    value: Any
    action: OutputAction
    codes: tuple[str, ...] = ()


def contains_protected_disclosure(text: str) -> bool:
    value = str(text or "")
    return bool(
        _PROTECTED_DISCLOSURE_RE.search(value)
        or _INTERNAL_ARCHITECTURE_DISCLOSURE_RE.search(value)
    )


def contains_configured_secret(text: str) -> bool:
    """Match exact runtime credentials without copying them into prompts/logs."""
    from backend.app.config.env import settings

    values = (
        settings.qwen_api_key,
        settings.openai_api_key,
        settings.gemini_api_key,
        settings.supabase_service_role_key,
        settings.supabase_jwt_secret,
        settings.supabase_anon_key,
        settings.langsmith_api_key,
    )
    output = str(text or "")
    return any(value and len(value) >= 12 and value in output for value in values)


def validate_generated_text(
    text: str,
    *,
    evidence: Sequence[str] = (),
    max_chars: int,
    fallback: str,
) -> GuardedOutput:
    value = str(text or "").strip()
    if contains_configured_secret(value):
        return GuardedOutput(fallback, "fallback", ("OUTPUT_SECRET_DETECTED",))
    if _STACK_TRACE_RE.search(value):
        return GuardedOutput(fallback, "fallback", ("OUTPUT_INTERNAL_ERROR_LEAK",))
    if contains_protected_disclosure(value):
        return GuardedOutput(fallback, "fallback", ("OUTPUT_PROMPT_LEAKAGE",))
    if not value or len(value) > max_chars or contains_secret(value):
        code = "OUTPUT_PII_DETECTED" if contains_secret(value) else "OUTPUT_INVALID_SCHEMA"
        return GuardedOutput(fallback, "fallback", (code,))

    sanitized, redacted = sanitize_sensitive_text(value)
    if redacted:
        if not sanitized:
            return GuardedOutput(fallback, "fallback", ("OUTPUT_PII_DETECTED",))
        value = sanitized

    usable_evidence = [str(item).strip().casefold() for item in evidence if str(item).strip()]
    if usable_evidence:
        folded = value.casefold()
        grounded = any(token in folded for token in usable_evidence if len(token) >= 2)
        if not grounded:
            return GuardedOutput(fallback, "fallback", ("OUTPUT_UNGROUNDED",))

    if redacted:
        return GuardedOutput(value, "sanitize", ("OUTPUT_PII_DETECTED",))
    return GuardedOutput(value, "allow")


def _item_id(item: Mapping[str, Any]) -> str:
    return str(item.get("application_id") or item.get("job_id") or "")


def _finite_scores(item: Mapping[str, Any]) -> bool:
    for field in ("rrf_score", "rerank_score", "skill_score", "overall_score"):
        value = item.get(field)
        if value is None:
            continue
        try:
            if not math.isfinite(float(value)):
                return False
        except (TypeError, ValueError):
            return False
    return True


def _constraints_monotonic(items: Sequence[Mapping[str, Any]]) -> bool:
    previous = -1
    for item in items:
        status = str(item.get("constraint_status") or "ungated")
        rank = _CONSTRAINT_ORDER.get(status)
        if rank is None or rank < previous:
            return False
        previous = rank
    return True


def validate_ranked_items(
    items: Sequence[Mapping[str, Any]],
    *,
    allowed_ids: set[str],
    max_items: int,
    deterministic_fallback: Sequence[Mapping[str, Any]],
    enforce_constraints: bool = False,
) -> GuardedOutput:
    fallback = [dict(item) for item in deterministic_fallback]
    if max_items <= 0 or len(items) > max_items:
        return GuardedOutput(fallback, "fallback", ("OUTPUT_INVALID_SCHEMA",))
    seen: set[str] = set()
    copied: list[dict[str, Any]] = []
    for item in items:
        item_id = _item_id(item)
        if not item_id or item_id not in allowed_ids or item_id in seen:
            return GuardedOutput(fallback, "fallback", ("OUTPUT_ID_NOT_ALLOWED",))
        if not _finite_scores(item):
            return GuardedOutput(fallback, "fallback", ("OUTPUT_INVALID_SCHEMA",))
        seen.add(item_id)
        copied.append(dict(item))
    if seen != allowed_ids or len(seen) != len(items):
        return GuardedOutput(fallback, "fallback", ("OUTPUT_ID_NOT_ALLOWED",))
    if enforce_constraints and not _constraints_monotonic(copied):
        return GuardedOutput(fallback, "fallback", ("OUTPUT_CONSTRAINT_VIOLATION",))
    return GuardedOutput(copied, "allow")


def validate_embedding(
    vector: Sequence[float],
    *,
    expected_dimension: int,
) -> GuardedOutput:
    if len(vector) != expected_dimension:
        return GuardedOutput([], "block", ("OUTPUT_INVALID_SCHEMA",))
    try:
        values = [float(value) for value in vector]
    except (TypeError, ValueError):
        return GuardedOutput([], "block", ("OUTPUT_INVALID_SCHEMA",))
    if not values or not all(math.isfinite(value) for value in values) or not any(value != 0.0 for value in values):
        return GuardedOutput([], "block", ("OUTPUT_INVALID_SCHEMA",))
    return GuardedOutput(values, "allow")
