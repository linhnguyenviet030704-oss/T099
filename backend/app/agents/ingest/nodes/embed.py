from collections.abc import Callable, Sequence

from backend.app.agents.state import AgentState
from backend.app.services.matching.embed import embed_text


def make_embed_node(
    *,
    encode: Callable[[str], Sequence[float]] | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
):
    async def embed_node(state: AgentState) -> dict:
        metadata = state.get("metadata") or {}
        quotes: list[str] = []
        for record in metadata.get("skill_records") or []:
            if record.get("status") != "verified":
                continue
            quote = str(record.get("quote") or "").strip()
            if quote:
                quotes.append(quote)
            if len(quotes) >= 8:
                break
        blob = state.get("markdown") or " "
        if quotes:
            blob = blob + "\n" + "\n".join(quotes)
        return {
            "embedding": embed_text(
                blob,
                encode=encode,
                api_key=api_key,
                base_url=base_url,
            )
        }

    return embed_node
