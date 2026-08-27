"""LangGraph checkpoints backed by the shared deterministic guardrails."""

from __future__ import annotations

from typing import Any, Literal

from backend.app.agents.state import AgentState
from backend.app.config.models import FINAL_CANDIDATE_K
from backend.app.core.exceptions import BadRequestError
from backend.app.guardrails.gates import gate_context, gate_records, sanitize_record_contexts
from backend.app.guardrails.output import validate_generated_text, validate_ranked_items
from backend.app.services.matching.explain import deterministic_reason


def guard_retrieved_data(
    candidates: list[dict[str, Any]],
    *,
    id_field: Literal["application_id", "job_id"],
    context: str,
    context_source: Literal["cv", "jd"],
    max_items: int = 50,
) -> dict[str, Any]:
    allowed_ids = {str(row.get(id_field) or "") for row in candidates}
    allowed_ids.discard("")
    records = gate_records(
        candidates,
        id_field=id_field,
        allowed_ids=allowed_ids,
        max_items=max_items,
    )
    if records.action == "block":
        raise BadRequestError("Dữ liệu retrieval nằm ngoài scope", code="DATA_SCOPE_MISMATCH")

    sanitized_records = sanitize_record_contexts(records.value)
    if sanitized_records.action == "block":
        code = sanitized_records.codes[0] if sanitized_records.codes else "DATA_SECRET_DETECTED"
        raise BadRequestError("Dữ liệu retrieval không an toàn", code=code)

    guarded_context = gate_context(context, source=context_source, max_chars=50_000)
    if guarded_context.action == "block":
        code = guarded_context.codes[0] if guarded_context.codes else "DATA_SECRET_DETECTED"
        raise BadRequestError("Context không an toàn", code=code)

    retained_ids = [str(row.get(id_field)) for row in sanitized_records.value]
    return {
        "candidates": sanitized_records.value,
        "guarded_context": guarded_context.value,
        "allowed_result_ids": retained_ids,
        "guardrail_codes": list(
            dict.fromkeys([*records.codes, *sanitized_records.codes, *guarded_context.codes])
        ),
    }


async def snapshot_candidates_node(state: AgentState) -> dict[str, Any]:
    rows = [dict(row) for row in (state.get("candidates") or [])[:FINAL_CANDIDATE_K]]
    ids = [str(row.get("application_id") or row.get("job_id") or "") for row in rows]
    return {
        "deterministic_candidates": rows,
        "allowed_result_ids": [item_id for item_id in ids if item_id],
    }


def make_ranked_output_guard_node(
    *,
    mode: Literal["recruiter", "candidate"],
    enforce_constraints: bool,
):
    async def output_guard_node(state: AgentState) -> dict[str, Any]:
        rows = [dict(row) for row in state.get("candidates") or []]
        fallback = [dict(row) for row in state.get("deterministic_candidates") or []]
        allowed_ids = set(state.get("allowed_result_ids") or [])
        guarded = validate_ranked_items(
            rows,
            allowed_ids=allowed_ids,
            max_items=50,
            deterministic_fallback=fallback,
            enforce_constraints=enforce_constraints and bool(state.get("constraints_confirmed")),
        )
        output_rows = [dict(row) for row in guarded.value]
        jd_skills = [str(skill) for skill in state.get("jd_skills") or []]
        total = len(output_rows)
        text_codes: list[str] = []
        for rank, row in enumerate(output_rows, start=1):
            deterministic = deterministic_reason(
                row=row,
                jd_skills=jd_skills,
                rank=rank,
                total=total,
                mode=mode,
            )
            reason = str(row.get("match_reason") or deterministic)
            evidence = [str(skill) for skill in row.get("verified_skills") or row.get("skills") or []]
            guarded_reason = validate_generated_text(
                reason,
                evidence=evidence,
                max_chars=1_000,
                fallback=deterministic,
            )
            row["match_reason"] = guarded_reason.value
            text_codes.extend(guarded_reason.codes)
        return {
            "candidates": output_rows,
            "guardrail_codes": list(
                dict.fromkeys([*state.get("guardrail_codes", []), *guarded.codes, *text_codes])
            ),
        }

    return output_guard_node
