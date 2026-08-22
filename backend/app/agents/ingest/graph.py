from __future__ import annotations

from langgraph.graph import END, StateGraph

from backend.app.agents.ingest.nodes.clean import clean_node
from backend.app.agents.ingest.nodes.embed import make_embed_node
from backend.app.agents.ingest.nodes.extract_skills import extract_skills_node
from backend.app.agents.ingest.nodes.parse import parse_node
from backend.app.agents.ingest.nodes.summarize import make_summarize_node
from backend.app.agents.state import AgentState


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
    graph.add_node("extract", extract_skills_node)
    graph.add_node("summarize", make_summarize_node(complete=complete, api_key=api_key, base_url=base_url))
    graph.set_entry_point("parse")
    graph.add_edge("parse", "clean")
    # Skills are extracted from the full parsed CV *before* summarize
    # rewrites/shortens it, so no skill is lost just because the LLM
    # summary dropped it from the narrative body.
    graph.add_edge("clean", "extract")
    graph.add_edge("extract", "summarize")
    if embed:
        graph.add_node("embed", make_embed_node(encode=encode, api_key=api_key, base_url=base_url))
        graph.add_edge("summarize", "embed")
        graph.add_edge("embed", END)
    else:
        graph.add_edge("summarize", END)
    return graph.compile()
