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
        return {
            "embedding": embed_text(
                state.get("markdown") or " ",
                encode=encode,
                api_key=api_key,
                base_url=base_url,
            )
        }

    return embed_node
