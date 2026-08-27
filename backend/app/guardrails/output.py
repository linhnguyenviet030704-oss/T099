"""Validation of provider output before response or persistence."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

from backend.app.guardrails.gates import contains_secret, sanitize_sensitive_text

OutputAction = Literal["allow", "sanitize", "fallback", "block"]
_CONSTRAINT_ORDER = {"pass": 0, "ungated": 1, "unknown": 2, "fail": 3}


@dataclass(frozen=True)
class GuardedOutput:
    value: Any
    action: OutputAction
    codes: tuple[str, ...] = ()


def validate_generated_text(
    text: str,
    *,
    evidence: Sequence[str] = (),
    max_chars: int,
    fallback: str,
) -> GuardedOutput:
    value = str(text or "").strip()
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
