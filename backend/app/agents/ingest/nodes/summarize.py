from collections.abc import Callable

from backend.app.agents.state import AgentState
from backend.app.services.matching.parse import redact_pii
from backend.app.services.matching.summarize import grounded_titles, summarize_resume


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
        # Preserve keys set by earlier nodes (e.g. "skills" from extract,
        # "content_chars"/"low_content" from parse) — only summary/titles
        # are owned by this node.
        metadata = dict(state.get("metadata") or {})
        metadata["summary"] = meta.get("summary") or ""
        metadata["titles"] = grounded_titles(list(meta.get("titles") or []), source)
        return {
            "markdown": body,
            "metadata": metadata,
        }

    return summarize_node
