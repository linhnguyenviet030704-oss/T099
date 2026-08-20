from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from langgraph.graph import END, StateGraph

from backend.app.agents.matching.nodes.rerank import make_rerank_node
from backend.app.agents.matching.nodes.respond import respond_node
from backend.app.agents.matching.nodes.rrf import rrf_node
from backend.app.agents.matching.nodes.skill import skill_node
from backend.app.agents.state import AgentState
from backend.app.services.matching.rerank import RerankFn

RetrieveFn = Callable[[UUID], Awaitable[dict[str, Any]]]


def build_matching_graph(*, retrieve: RetrieveFn, rerank_fn: RerankFn | None = None):
    async def retrieve_node(state: AgentState) -> dict:
        job_id = UUID(str(state["job_id"]))
        payload = await retrieve(job_id)
        return {
            "jd_skills": payload.get("jd_skills") or [],
            "jd_query": payload.get("jd_query") or "",
            "candidates": payload.get("candidates") or [],
            "skill_constraints": payload.get("skill_constraints") or {},
            "constraints_confirmed": bool(payload.get("constraints_confirmed")),
        }

    graph = StateGraph(AgentState)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("skill", skill_node)
    graph.add_node("rrf", rrf_node)
    graph.add_node("rerank", make_rerank_node(rerank_fn=rerank_fn))
    graph.add_node("respond", respond_node)
    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "skill")
    graph.add_edge("skill", "rrf")
    graph.add_edge("rrf", "rerank")
    graph.add_edge("rerank", "respond")
    graph.add_edge("respond", END)
    return graph.compile()
