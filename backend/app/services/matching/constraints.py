"""JD skill constraints: propose (rules) + pass/unknown/fail partition."""

from __future__ import annotations

import re
from typing import Any

from backend.app.services.matching.skills import _normalize_text, extract_skills

SOFT_WEIGHT = 0.05
_STATUS_ORDER = {"pass": 0, "unknown": 1, "fail": 2, "ungated": 0}

_MUST_HINTS = ("bat buoc", "required", "must have", "must-have")
_PREFERRED_HINTS = ("diem cong", "nice to have", "nice-to-have", "preferred", "plus")
_MENTIONED_HINTS = (
    "dang chuyen",
    "team",
    "not required",
    "khong bat buoc",
    "khong yeu cau",
)
_OR_HINTS = (" hoac ", " or ", " either ")


def empty_constraints() -> dict[str, Any]:
    return {"must": [], "preferred": [], "mentioned": [], "excluded": []}


def _sentences(text: str) -> list[str]:
    parts = re.split(r"[.!?\n]+", text)
    return [part.strip() for part in parts if part.strip()]


def _has_hint(normalized: str, hints: tuple[str, ...]) -> bool:
    return any(hint in normalized for hint in hints)


def propose_skill_constraints(text: str) -> dict[str, Any]:
    proposed = empty_constraints()
    seen_must: set[str] = set()
    seen_pref: set[str] = set()
    seen_ment: set[str] = set()
    for sentence in _sentences(text):
        skills = extract_skills(sentence)
        if not skills:
            continue
        norm = f" {_normalize_text(sentence)} "
        if _has_hint(norm, _MUST_HINTS):
            group = [skill for skill in skills if skill not in seen_must]
            if not group:
                continue
            seen_must.update(group)
            if _has_hint(norm, _OR_HINTS) or " hoac " in norm:
                proposed["must"].append({"any_of": group})
            else:
                for skill in group:
                    proposed["must"].append({"any_of": [skill]})
        elif _has_hint(norm, _PREFERRED_HINTS):
            for skill in skills:
                if skill not in seen_pref and skill not in seen_must:
                    seen_pref.add(skill)
                    proposed["preferred"].append(skill)
        elif _has_hint(norm, _MENTIONED_HINTS):
            for skill in skills:
                if skill not in seen_ment and skill not in seen_must and skill not in seen_pref:
                    seen_ment.add(skill)
                    proposed["mentioned"].append(skill)
    return proposed


def soft_delta(verified: list[str], jd_skills: list[str]) -> float:
    return SOFT_WEIGHT * len(set(verified) & set(jd_skills))


def _must_satisfied(verified: set[str], constraints: dict[str, Any]) -> bool:
    groups = constraints.get("must") or []
    if not groups:
        return True
    for group in groups:
        options = list(group.get("any_of") or [])
        if not options:
            continue
        if not (set(options) & verified):
            return False
    return True


def constraint_status(row: dict[str, Any], constraints: dict[str, Any], *, confirmed: bool) -> str:
    if not confirmed:
        return "ungated"
    records = row.get("skill_records")
    ingest_ok = (row.get("ingest_status") or "ok") == "ok"
    clean = (row.get("clean_markdown") or "").strip()
    if not records or not ingest_ok or not clean:
        return "unknown"
    verified = set(row.get("verified_skills") or [])
    excluded = set(constraints.get("excluded") or [])
    if verified & excluded:
        return "fail"
    if _must_satisfied(verified, constraints):
        return "pass"
    return "fail"


def job_constraint_status(
    *,
    verified: set[str],
    has_evidence: bool,
    constraints: dict[str, Any],
    confirmed: bool,
) -> str:
    """Same pass/unknown/fail rule as constraint_status, but for the
    reverse (CV -> JD) direction: the row being gated (a job) is never the
    evidence source (the CV). Evidence quality (`has_evidence`) and the
    skill set being checked (`verified`) both come from the CV, constant
    across every job row; `constraints`/`confirmed` come from the job row."""
    if not confirmed:
        return "ungated"
    if not has_evidence:
        return "unknown"
    excluded = set(constraints.get("excluded") or [])
    if verified & excluded:
        return "fail"
    if _must_satisfied(verified, constraints):
        return "pass"
    return "fail"


def partition_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: _STATUS_ORDER.get(str(row.get("constraint_status") or "ungated"), 0))
