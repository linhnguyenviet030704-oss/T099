from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from langgraph.graph import END, StateGraph

from agent.nodes.example_node import analyze_node, respond_node
from agent.nodes.respond import respond_matching_node
from agent.nodes.skill import skill_node
from agent.state import AgentState

RetrieveFn = Callable[[UUID], Awaitable[dict[str, Any]]]


def should_continue(state: AgentState) -> str:
    if state.get("error"):
        return END
    return "respond"


def build_graph() -> Any:
    graph = StateGraph(AgentState)
    graph.add_node("analyze", analyze_node)
    graph.add_node("respond", respond_node)
    graph.set_entry_point("analyze")
    graph.add_conditional_edges("analyze", should_continue)
    graph.add_edge("respond", END)
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
    graph.add_node("respond", respond_matching_node)
    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "skill")
    graph.add_edge("skill", "respond")
    graph.add_edge("respond", END)
    return graph.compile()


agent = build_graph()
