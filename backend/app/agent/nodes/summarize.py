from collections.abc import Callable

from backend.app.agent.state import AgentState
from backend.app.services.matching.parse import redact_pii
from backend.app.services.matching.summarize import summarize_resume


def make_summarize_node(*, complete: Callable[..., str] | None = None, api_key: str | None = None, base_url: str | None = None):
    async def summarize_node(state: AgentState) -> dict:
        def _complete(prompt: str, **kwargs):
            if complete is not None:
                return complete(prompt, **kwargs)
            from backend.app.services.matching.llm import chat_complete

            return chat_complete(prompt, api_key=api_key, base_url=base_url, json_object=True)

        meta = summarize_resume(state.get("markdown") or "", complete=_complete)
        body = redact_pii(meta.get("body") or "")
        return {
            "markdown": body,
            "metadata": {
                "summary": meta.get("summary") or "",
                "titles": list(meta.get("titles") or []),
                "skills": [],
            },
        }

    return summarize_node
