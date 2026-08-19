from collections.abc import Callable

from backend.app.agents.state import AgentState
from backend.app.config.models import DEFAULT_EMBED_DIM, DEFAULT_LLM_MODEL
from backend.app.services.matching.parse import redact_pii
from backend.app.services.matching.skills import categories_for, merge_skill_records, taxonomy_version
from backend.app.services.matching.summarize import SUMMARIZE_PROMPT_VERSION, summarize_resume


def make_summarize_node(*, complete: Callable[..., str] | None = None, api_key: str | None = None, base_url: str | None = None):
    async def summarize_node(state: AgentState) -> dict:
        def _complete(prompt: str, **kwargs):
            if complete is not None:
                return complete(prompt, **kwargs)
            from backend.app.clients.llm import chat_complete

            return chat_complete(prompt, api_key=api_key, base_url=base_url, json_object=True)

        clean = state.get("clean_markdown") or state.get("markdown") or ""
        meta = summarize_resume(clean, complete=_complete)
        body = redact_pii(meta.get("body") or "")
        records, verified, inferred = merge_skill_records(clean, list(meta.get("skills") or []), body)
        skills = [*verified, *inferred]
        sub_field = list(meta.get("sub_field") or [])
        for skill_id in skills:
            for cat in categories_for(skill_id):
                if cat not in sub_field:
                    sub_field.append(cat)
        return {
            "markdown": body,
            "clean_markdown": clean,
            "skills": skills,
            "metadata": {
                "summary": meta.get("summary") or "",
                "titles": [],
                "skills": skills,
                "verified_skills": verified,
                "inferred_skills": inferred,
                "skill_records": records,
                "major_field": meta.get("major_field") or "",
                "sub_field": sub_field,
                "taxonomy_version": taxonomy_version(),
                "summary_prompt_version": SUMMARIZE_PROMPT_VERSION,
                "summary_model": DEFAULT_LLM_MODEL,
                "embedding_dimension": DEFAULT_EMBED_DIM,
                "ingest_status": "ok",
            },
        }

    return summarize_node
