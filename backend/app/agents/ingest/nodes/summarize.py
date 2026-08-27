from collections.abc import Callable

from backend.app.agents.state import AgentState
from backend.app.config.models import DEFAULT_EMBED_DIM, DEFAULT_LLM_MODEL
from backend.app.guardrails.gates import gate_context, gate_parsed_quality
from backend.app.guardrails.output import validate_generated_text
from backend.app.services.matching.parse import redact_pii
from backend.app.services.matching.skills import (
    categories_for,
    extract_skills,
    major_for_skills,
    merge_skill_records,
    taxonomy_version,
)
from backend.app.services.matching.summarize import (
    SUMMARIZE_PROMPT_VERSION,
    grounded_titles,
    summarize_resume,
)
from backend.app.shared_brain import AgentBrain, get_brain


def make_summarize_node(
    *,
    complete: Callable[..., str] | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    brain: AgentBrain | None = None,
):
    async def summarize_node(state: AgentState) -> dict:
        def _complete(prompt: str, **kwargs):
            if complete is not None:
                return complete(prompt, **kwargs)
            active_brain = brain or get_brain("ingest")
            return active_brain.chat(prompt, api_key=api_key, base_url=base_url, json_object=True)

        source = state.get("markdown") or ""
        quality = gate_parsed_quality(state.get("metadata") or {}, source)
        context = gate_context(source, source="cv", max_chars=50_000)
        gate_codes = list(dict.fromkeys([*quality.codes, *context.codes]))
        if context.action == "block" or not context.value:
            meta = {"summary": "", "titles": [], "body": "", "skills": []}
        else:
            meta = summarize_resume(str(context.value), complete=_complete)

        guarded_body = validate_generated_text(
            str(meta.get("body") or ""),
            max_chars=50_000,
            # If the model omits/invalidates `body`, retain the already
            # normalized and sanitized parser output deterministically.
            fallback=str(context.value or ""),
        )
        guarded_summary = validate_generated_text(
            str(meta.get("summary") or ""),
            max_chars=1_000,
            fallback="",
        )
        body = redact_pii(str(guarded_body.value or ""))

        metadata = dict(state.get("metadata") or {})
        metadata["summary"] = guarded_summary.value or ""
        metadata["titles"] = grounded_titles(list(meta.get("titles") or []), source)

        # Extract-first: skills come from the full CV (not the LLM rewrite),
        # and summarize only verifies which ones survived into the body.
        extract_skill_set = list(state.get("skills") or []) or extract_skills(source)
        extract_skills_ = sorted(set(extract_skill_set))
        records, verified, inferred = merge_skill_records(extract_skills_, body)
        metadata["skills"] = extract_skills_
        metadata["verified_skills"] = verified
        metadata["inferred_skills"] = inferred
        metadata["skill_records"] = records

        # Major/sub fields are derived from the (already canonical) skill set,
        # never from the LLM — keeps the schema stable across prompt edits.
        sub_field: list[str] = []
        for skill_id in extract_skills_:
            for cat in categories_for(skill_id):
                if cat not in sub_field:
                    sub_field.append(cat)
        metadata["sub_field"] = sub_field
        metadata["major_field"] = major_for_skills(extract_skills_)
        metadata["guardrail_codes"] = list(
            dict.fromkeys([*metadata.get("guardrail_codes", []), *gate_codes, *guarded_body.codes, *guarded_summary.codes])
        )

        # Ingestion Quality Guardrails: Assess whether CV has valid professional indicators
        has_skills = bool(extract_skills_)
        has_titles = bool(metadata.get("titles"))
        is_valid = has_skills or (has_titles and len(source.strip()) >= 100)
        metadata["quality_status"] = "standard" if is_valid else "insufficient"
        metadata["is_valid_cv"] = is_valid

        metadata["taxonomy_version"] = taxonomy_version()
        metadata["summary_prompt_version"] = SUMMARIZE_PROMPT_VERSION
        metadata["summary_model"] = DEFAULT_LLM_MODEL
        metadata["embedding_dimension"] = DEFAULT_EMBED_DIM
        metadata["ingest_status"] = "ok"

        return {
            "markdown": body,
            "metadata": metadata,
        }

    return summarize_node

