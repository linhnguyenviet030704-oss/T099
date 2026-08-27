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
from backend.app.agents.nodes.guardrails import (
    guard_retrieved_data,
    make_ranked_output_guard_node,
    snapshot_candidates_node,
)
from backend.app.agents.nodes.retrieval import kg_retrieval_node
from backend.app.agents.nodes.router import router_node
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
        guarded = guard_retrieved_data(
            list(payload.get("candidates") or []),
            id_field="application_id",
            context=str(payload.get("job_description") or payload.get("jd_query") or ""),
            context_source="jd",
        )
        return {
            "jd_skills": payload.get("jd_skills") or [],
            "jd_query": payload.get("jd_query") or "",
            "job_description": guarded["guarded_context"],
            "candidates": guarded["candidates"],
            "skill_constraints": payload.get("skill_constraints") or {},
            "constraints_confirmed": bool(payload.get("constraints_confirmed")),
            "allowed_result_ids": guarded["allowed_result_ids"],
            "guardrail_codes": guarded["guardrail_codes"],
        }

    graph = StateGraph(AgentState)
    graph.add_node("router", router_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("kg_retrieval", kg_retrieval_node)
    graph.add_node("skill", skill_node)
    graph.add_node("rrf", rrf_node)
    graph.add_node("snapshot", snapshot_candidates_node)
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
    graph.add_node(
        "output_guard",
        make_ranked_output_guard_node(mode="recruiter", enforce_constraints=True),
    )

    graph.set_entry_point("router")
    graph.add_edge("router", "retrieve")
    graph.add_edge("retrieve", "kg_retrieval")
    graph.add_edge("kg_retrieval", "skill")
    graph.add_edge("skill", "rrf")
    graph.add_edge("rrf", "rerank")
    graph.add_edge("rerank", "snapshot")
    graph.add_edge("snapshot", "explain")
    graph.add_edge("explain", "output_guard")
    graph.add_edge("output_guard", "respond")
    graph.add_edge("respond", END)
    return graph.compile()
