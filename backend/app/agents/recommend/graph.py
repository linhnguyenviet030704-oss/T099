from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from langgraph.graph import END, StateGraph

from backend.app.agents.matching.nodes.explain import make_explain_node
from backend.app.agents.matching.nodes.rerank import make_rerank_node
from backend.app.agents.nodes.guardrails import (
    guard_retrieved_data,
    make_ranked_output_guard_node,
    snapshot_candidates_node,
)
from backend.app.agents.nodes.retrieval import kg_retrieval_node
from backend.app.agents.nodes.router import router_node
from backend.app.agents.recommend.nodes.advice import make_advice_node
from backend.app.agents.recommend.nodes.respond import respond_node
from backend.app.agents.recommend.nodes.score import score_node
from backend.app.agents.state import AgentState
from backend.app.services.matching.explain import RECOMMEND_EXPLAIN_PROMPT_TEMPLATE
from backend.app.services.matching.rerank import RerankFn
from backend.app.shared_brain import AgentBrain

RetrieveFn = Callable[[], Awaitable[dict[str, Any]]]
ExplainComplete = Callable[..., str]


def build_recommend_graph(
    *,
    retrieve: RetrieveFn,
    rerank_fn: RerankFn | None = None,
    explain_complete: ExplainComplete | None = None,
    explain_api_key: str | None = None,
    explain_base_url: str | None = None,
    brain: AgentBrain | None = None,
):
    async def retrieve_node(state: AgentState) -> dict:
        payload = await retrieve()
        user_query = str(state.get("query") or "").strip()
        cv_text = str(payload.get("cv_text") or "").strip()
        jd_skills = payload.get("cv_skills") or []
        combined_query = f"Mục tiêu của người dùng: {user_query}\n\nNội dung CV ứng viên: {cv_text}" if user_query else cv_text
        guarded = guard_retrieved_data(
            list(payload.get("candidates") or []),
            id_field="job_id",
            context=combined_query,
            context_source="cv",
        )
        return {
            "jd_skills": jd_skills,
            "jd_query": guarded["guarded_context"],
            "job_description": guarded["guarded_context"],
            "cv_verified": payload.get("cv_verified") or [],
            "cv_has_evidence": bool(payload.get("cv_has_evidence", True)),
            "constraints_confirmed": True,
            "candidates": guarded["candidates"],
            "allowed_result_ids": guarded["allowed_result_ids"],
            "guardrail_codes": guarded["guardrail_codes"],
        }

    graph = StateGraph(AgentState)
    graph.add_node("router", router_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("kg_retrieval", kg_retrieval_node)
    graph.add_node("score", score_node)
    graph.add_node("snapshot", snapshot_candidates_node)
    graph.add_node("rerank", make_rerank_node(rerank_fn=rerank_fn))
    graph.add_node(
        "explain",
        make_explain_node(
            complete=explain_complete,
            api_key=explain_api_key,
            base_url=explain_base_url,
            prompt_template=RECOMMEND_EXPLAIN_PROMPT_TEMPLATE,
            brain=brain,
        ),
    )
    graph.add_node(
        "advice",
        make_advice_node(
            complete=explain_complete,
            api_key=explain_api_key,
            base_url=explain_base_url,
            brain=brain,
        ),
    )
    graph.add_node("respond", respond_node)
    graph.add_node(
        "output_guard",
        make_ranked_output_guard_node(mode="candidate", enforce_constraints=True),
    )

    def route_after_kg(state: AgentState) -> str:
        intent = state.get("intent")
        if intent == "SKILL_GAP_ADVICE":
            return "advice"
        return "score"

    graph.set_entry_point("router")
    graph.add_edge("router", "retrieve")
    graph.add_edge("retrieve", "kg_retrieval")
    graph.add_conditional_edges(
        "kg_retrieval",
        route_after_kg,
        {"advice": "advice", "score": "score"},
    )
    graph.add_edge("advice", END)
    graph.add_edge("score", "rerank")
    graph.add_edge("rerank", "snapshot")
    graph.add_edge("snapshot", "explain")
    graph.add_edge("explain", "output_guard")
    graph.add_edge("output_guard", "respond")
    graph.add_edge("respond", END)
    return graph.compile()

