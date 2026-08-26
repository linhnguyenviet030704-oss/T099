"""Evaluation agent LangGraph graph builder."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from langgraph.graph import END, StateGraph

from backend.app.agents.evaluation.nodes import (
    generate_report_node,
    parse_input_node,
    retrieve_reference_node,
    score_node,
)
from backend.app.agents.evaluation.state import EvaluationState
from backend.app.agents.evaluation.types import EvaluationType
from backend.app.shared_brain import AgentBrain


ScoreWeights = dict[str, float]


def build_evaluation_graph(
    *,
    brain: AgentBrain | None = None,
    weights: ScoreWeights | None = None,
) -> Any:
    """
    Build the evaluation agent LangGraph.

    Graph flow:
        parse_input → retrieve_reference → score → generate_report

    Args:
        brain: Optional LLM brain for structured extraction and summary
        weights: Optional custom weights for scoring components

    Returns:
        Compiled StateGraph
    """
    graph = StateGraph(EvaluationState)

    # Add nodes
    graph.add_node("parse", _wrap_parse(brain))
    graph.add_node("retrieve", retrieve_reference_node)
    graph.add_node("score", _wrap_score(brain, weights))
    graph.add_node("report", _wrap_report(brain))

    # Set entry point
    graph.set_entry_point("parse")

    # Add edges
    graph.add_edge("parse", "retrieve")
    graph.add_edge("retrieve", "score")
    graph.add_edge("score", "report")
    graph.add_edge("report", END)

    return graph.compile()


def _wrap_parse(brain: AgentBrain | None) -> Callable[..., dict[str, Any]]:
    """Wrap parse node with optional brain."""
    async def node(state: EvaluationState) -> dict[str, Any]:
        return await parse_input_node(state, brain=brain)

    return node


def _wrap_score(
    brain: AgentBrain | None,
    weights: ScoreWeights | None,
) -> Callable[..., dict[str, Any]]:
    """Wrap score node with optional brain and weights."""
    async def node(state: EvaluationState) -> dict[str, Any]:
        return await score_node(state, brain=brain, weights=weights)

    return node


def _wrap_report(brain: AgentBrain | None) -> Callable[..., dict[str, Any]]:
    """Wrap report node with optional brain."""
    async def node(state: EvaluationState) -> dict[str, Any]:
        return await generate_report_node(state, brain=brain)

    return node
