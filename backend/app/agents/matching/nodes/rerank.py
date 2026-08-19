from backend.app.agents.state import AgentState
from backend.app.services.matching.rerank import RerankFn, apply_rerank


def make_rerank_node(*, rerank_fn: RerankFn | None = None):
    async def rerank_node(state: AgentState) -> dict:
        mode = state.get("rerank_mode") or "agent"
        return {
            "candidates": apply_rerank(
                list(state.get("candidates") or []),
                jd_query=state.get("jd_query") or "",
                mode=mode,
                rerank_fn=rerank_fn,
            )
        }

    return rerank_node
