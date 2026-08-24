"""Candidate identity mapping for PII-safe LLM calls.

Provides anonymous ID translation so LLM calls never see real identifiers.
Use `anonymize_candidates()` before LLM calls, `deanonymize_reasons()` after.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID


@dataclass
class CandidateIdentity:
    """Stores the real identifiers for a candidate."""

    application_id: str
    applicant_user_id: str
    full_name: str | None = None
    email: str | None = None
    resume_title: str | None = None


@dataclass
class AnonymizationResult:
    """Result of anonymizing a candidate list."""

    # Anonymized candidates with IDs like CAND_001, CAND_002
    candidates: list[dict[str, Any]]
    # Map from anonymous ID → real identity
    id_map: dict[str, CandidateIdentity] = field(default_factory=dict)


def anonymize_candidates(candidates: list[dict[str, Any]]) -> AnonymizationResult:
    """Convert real identifiers to anonymous IDs.

    Use this BEFORE sending to LLM. LLM sees only:
    - CAND_001, CAND_002, etc.
    - skills, summary, clean_markdown (already PII-free)
    - scores

    Returns anonymized candidates + mapping to restore identities after LLM.
    """
    result = AnonymizationResult(candidates=[])
    for idx, row in enumerate(candidates):
        anon_id = f"CAND_{idx + 1:03d}"

        identity = CandidateIdentity(
            application_id=str(row.get("application_id") or ""),
            applicant_user_id=str(row.get("applicant_user_id") or ""),
            full_name=row.get("full_name"),
            email=row.get("email"),
            resume_title=row.get("resume_title"),
        )

        result.id_map[anon_id] = identity

        # Create anonymized copy — LLM only sees this
        anon_row = {**row}
        # Mark with anonymous ID
        anon_row["_anon_id"] = anon_id
        # Remove PII fields (belt and suspenders)
        anon_row.pop("full_name", None)
        anon_row.pop("email", None)
        anon_row.pop("resume_title", None)

        result.candidates.append(anon_row)

    return result


def deanonymize_reasons(
    reasons: dict[str, str],
    id_map: dict[str, CandidateIdentity],
) -> dict[str, str]:
    """Map anonymous IDs back to application_ids.

    Call this AFTER LLM returns to get reasons keyed by real application_id.
    """
    out: dict[str, str] = {}
    for anon_id, reason in reasons.items():
        identity = id_map.get(anon_id)
        if identity and identity.application_id:
            out[identity.application_id] = reason
    return out


def deanonymize_candidates(
    candidates: list[dict[str, Any]],
    id_map: dict[str, CandidateIdentity],
) -> list[dict[str, Any]]:
    """Restore real identifiers to candidate list.

    Call this AFTER LLM processing to restore PII for response.
    """
    result = []
    for row in candidates:
        anon_id = row.get("_anon_id")
        identity = id_map.get(anon_id) if anon_id else None

        restored = {**row}
        restored.pop("_anon_id", None)

        if identity:
            restored["application_id"] = identity.application_id
            restored["applicant_user_id"] = identity.applicant_user_id
            restored["full_name"] = identity.full_name
            restored["email"] = identity.email
            restored["resume_title"] = identity.resume_title

        result.append(restored)

    return result
