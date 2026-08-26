from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from langgraph.graph import END, StateGraph

from backend.app.agents.matching.nodes.explain import make_explain_node
from backend.app.agents.matching.nodes.rerank import make_rerank_node
from backend.app.agents.matching.nodes.respond import respond_node
from backend.app.agents.matching.nodes.rrf import rrf_node
from backend.app.agents.matching.nodes.skill import skill_node
from backend.app.agents.state import AgentState
from backend.app.services.matching.rerank import RerankFn
from backend.app.shared_brain import AgentBrain

RetrieveFn = Callable[[UUID], Awaitable[dict[str, Any]]]
ExplainComplete = Callable[..., str]


def build_matching_graph(
    *,
    retrieve: RetrieveFn,
    rerank_fn: RerankFn | None = None,
    explain_complete: ExplainComplete | None = None,
    explain_api_key: str | None = None,
    explain_base_url: str | None = None,
    brain: AgentBrain | None = None,
):
    async def retrieve_node(state: AgentState) -> dict:
        job_id = UUID(str(state["job_id"]))
        payload = await retrieve(job_id)
        return {
            "jd_skills": payload.get("jd_skills") or [],
            "jd_query": payload.get("jd_query") or "",
            "job_description": payload.get("job_description") or "",
            "candidates": payload.get("candidates") or [],
            "skill_constraints": payload.get("skill_constraints") or {},
            "constraints_confirmed": bool(payload.get("constraints_confirmed")),
            "pool_size": int(payload.get("pool_size") or 0),
            "pool_truncated": bool(payload.get("pool_truncated") or False),
            "dropped_count": int(payload.get("dropped_count") or 0),
            "pool_latency_warn": bool(payload.get("pool_latency_warn") or False),
            "embedding_mismatch_count": int(payload.get("embedding_mismatch_count") or 0),
        }

    graph = StateGraph(AgentState)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("skill", skill_node)
    graph.add_node("rrf", rrf_node)
    graph.add_node("rerank", make_rerank_node(rerank_fn=rerank_fn))
    graph.add_node(
        "explain",
        make_explain_node(
            complete=explain_complete,
            api_key=explain_api_key,
            base_url=explain_base_url,
            brain=brain,
        ),
    )
    graph.add_node("respond", respond_node)

    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "skill")
    graph.add_edge("skill", "rrf")
    graph.add_edge("rrf", "rerank")
    graph.add_edge("rerank", "explain")
    graph.add_edge("explain", "respond")
    graph.add_edge("respond", END)
    return graph.compile()
