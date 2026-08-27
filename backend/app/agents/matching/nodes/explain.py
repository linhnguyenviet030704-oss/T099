import asyncio
from collections.abc import Callable

from backend.app.agents.state import AgentState
from backend.app.services.matching.explain import explain_matches
from backend.app.shared_brain import AgentBrain, get_brain

CompleteFn = Callable[..., str]


def make_explain_node(
    *,
    complete: CompleteFn | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    prompt_template: str | None = None,
    max_candidates: int = 10,
    brain: AgentBrain | None = None,
):
    async def explain_node(state: AgentState) -> dict:
        def _complete(prompt: str, **kwargs):
            if complete is not None:
                return complete(prompt, **kwargs)
            active_brain = brain or get_brain("matching")
            return active_brain.chat(prompt, api_key=api_key, base_url=base_url, json_object=True)

        candidates = list(state.get("candidates") or [])
        if max_candidates is not None and max_candidates > 0:
            candidates = candidates[:max_candidates]
        jd_text = state.get("job_description") or state.get("jd_query") or ""
        jd_skills = list(state.get("jd_skills") or [])
        reasons = await asyncio.to_thread(
            explain_matches,
            jd_text=jd_text,
            candidates=candidates,
            complete=_complete,
            jd_skills=jd_skills,
            prompt_template=prompt_template,
        )
        enriched = [
            {**row, "match_reason": reasons.get(str(row.get("application_id") or row.get("job_id") or ""))}
            for row in candidates
        ]
        return {"candidates": enriched}

    return explain_node
