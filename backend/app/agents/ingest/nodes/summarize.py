from collections.abc import Callable

from backend.app.agents.state import AgentState
from backend.app.config.models import DEFAULT_EMBED_DIM, DEFAULT_LLM_MODEL
from backend.app.services.matching.parse import redact_pii
from backend.app.services.matching.skills import (
    categories_for,
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

        # Skills came from the earlier extract node. Summarize never replaces
        # them; it only verifies whether they survived into the rewritten body
        # so matching can score verified/inferred separately.
        extract_skills = list(state.get("skills") or [])
        records, verified, inferred = merge_skill_records(extract_skills, body)
        metadata["skills"] = extract_skills
        metadata["verified_skills"] = verified
        metadata["inferred_skills"] = inferred
        metadata["skill_records"] = records

        # Major/sub fields are derived from the (already canonical) skill set,
        # never from the LLM — keeps the schema stable across prompt edits.
        sub_field: list[str] = []
        for skill_id in extract_skills:
            for cat in categories_for(skill_id):
                if cat not in sub_field:
                    sub_field.append(cat)
        metadata["sub_field"] = sub_field
        metadata["major_field"] = major_for_skills(extract_skills)

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

