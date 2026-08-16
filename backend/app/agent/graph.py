from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from langgraph.graph import END, StateGraph

from backend.app.agent.nodes.clean import clean_node
from backend.app.agent.nodes.embed import make_embed_node
from backend.app.agent.nodes.parse import parse_node
from backend.app.agent.nodes.respond import respond_node
from backend.app.agent.nodes.rrf import rrf_node
from backend.app.agent.nodes.skill import extract_skills_node, skill_node
from backend.app.agent.nodes.summarize import make_summarize_node
from backend.app.agent.state import AgentState

RetrieveFn = Callable[[UUID], Awaitable[dict[str, Any]]]


def build_ingest_graph(
    *,
    encode=None,
    complete=None,
    api_key: str | None = None,
    base_url: str | None = None,
    embed: bool = True,
):
    graph = StateGraph(AgentState)
    graph.add_node("parse", parse_node)
    graph.add_node("clean", clean_node)
    graph.add_node("summarize", make_summarize_node(complete=complete, api_key=api_key, base_url=base_url))
    graph.add_node("extract", extract_skills_node)
    graph.set_entry_point("parse")
    graph.add_edge("parse", "clean")
    graph.add_edge("clean", "summarize")
    graph.add_edge("summarize", "extract")
    if embed:
        graph.add_node("embed", make_embed_node(encode=encode, api_key=api_key, base_url=base_url))
        graph.add_edge("extract", "embed")
        graph.add_edge("embed", END)
    else:
        graph.add_edge("extract", END)
    return graph.compile()


def build_matching_graph(*, retrieve: RetrieveFn):
    async def retrieve_node(state: AgentState) -> dict:
        job_id = UUID(str(state["job_id"]))
        payload = await retrieve(job_id)
        return {
            "jd_skills": payload.get("jd_skills") or [],
            "candidates": payload.get("candidates") or [],
        }

    graph = StateGraph(AgentState)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("skill", skill_node)
    graph.add_node("rrf", rrf_node)
    graph.add_node("respond", respond_node)
    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "skill")
    graph.add_edge("skill", "rrf")
    graph.add_edge("rrf", "respond")
    graph.add_edge("respond", END)
    return graph.compile()
