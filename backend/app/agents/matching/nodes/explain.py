from collections.abc import Callable

from backend.app.agents.state import AgentState
from backend.app.services.matching.explain import explain_matches

CompleteFn = Callable[..., str]


def make_explain_node(
    *,
    complete: CompleteFn | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
):
    async def explain_node(state: AgentState) -> dict:
        def _complete(prompt: str, **kwargs):
            if complete is not None:
                return complete(prompt, **kwargs)
            from backend.app.clients.llm import chat_complete

            return chat_complete(prompt, api_key=api_key, base_url=base_url, json_object=True)

        candidates = list(state.get("candidates") or [])
        jd_text = state.get("job_description") or state.get("jd_query") or ""
        jd_skills = list(state.get("jd_skills") or [])
        reasons = explain_matches(
            jd_text=jd_text,
            candidates=candidates,
            complete=_complete,
            jd_skills=jd_skills,
        )
        enriched = [
            {**row, "match_reason": reasons.get(str(row.get("application_id") or ""))}
            for row in candidates
        ]
        return {"candidates": enriched}

    return explain_node
