from collections.abc import Callable

from backend.app.agents.state import AgentState
from backend.app.config.models import DEFAULT_EMBED_DIM, DEFAULT_LLM_MODEL
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


def make_summarize_node(*, complete: Callable[..., str] | None = None, api_key: str | None = None, base_url: str | None = None):
    async def summarize_node(state: AgentState) -> dict:
        def _complete(prompt: str, **kwargs):
            if complete is not None:
                return complete(prompt, **kwargs)
            from backend.app.clients.llm import chat_complete

            return chat_complete(prompt, api_key=api_key, base_url=base_url, json_object=True)

        source = state.get("markdown") or ""
        meta = summarize_resume(source, complete=_complete)
        body = redact_pii(meta.get("body") or "")

        metadata = dict(state.get("metadata") or {})
        metadata["summary"] = meta.get("summary") or ""
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

