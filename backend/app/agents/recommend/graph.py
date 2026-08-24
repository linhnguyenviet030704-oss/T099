from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from langgraph.graph import END, StateGraph

from backend.app.agents.matching.nodes.explain import make_explain_node
from backend.app.agents.matching.nodes.rerank import make_rerank_node
from backend.app.agents.recommend.nodes.respond import respond_node
from backend.app.agents.recommend.nodes.score import score_node
from backend.app.agents.state import AgentState
from backend.app.services.matching.explain import RECOMMEND_EXPLAIN_PROMPT_TEMPLATE
from backend.app.services.matching.rerank import RerankFn

RetrieveFn = Callable[[], Awaitable[dict[str, Any]]]
ExplainComplete = Callable[..., str]


def build_recommend_graph(
    *,
    retrieve: RetrieveFn,
    rerank_fn: RerankFn | None = None,
    explain_complete: ExplainComplete | None = None,
    explain_api_key: str | None = None,
    explain_base_url: str | None = None,
):
    async def retrieve_node(state: AgentState) -> dict:
        payload = await retrieve()
        # jd_query/job_description/jd_skills hold the CV's own text/skills
        # here (not a JD) so the reused make_rerank_node/make_explain_node
        # -- which read exactly those AgentState keys -- work unchanged.
        return {
            "jd_skills": payload.get("cv_skills") or [],
            "jd_query": payload.get("cv_text") or "",
            "job_description": payload.get("cv_text") or "",
            "cv_verified": payload.get("cv_verified") or [],
            "cv_has_evidence": bool(payload.get("cv_has_evidence", True)),
            "constraints_confirmed": True,
            "candidates": payload.get("candidates") or [],
        }

    graph = StateGraph(AgentState)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("score", score_node)
    graph.add_node("rerank", make_rerank_node(rerank_fn=rerank_fn))
    graph.add_node(
        "explain",
        make_explain_node(
            complete=explain_complete,
            api_key=explain_api_key,
            base_url=explain_base_url,
            prompt_template=RECOMMEND_EXPLAIN_PROMPT_TEMPLATE,
        ),
    )
    graph.add_node("respond", respond_node)
    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "score")
    graph.add_edge("score", "rerank")
    graph.add_edge("rerank", "explain")
    graph.add_edge("explain", "respond")
    graph.add_edge("respond", END)
    return graph.compile()
