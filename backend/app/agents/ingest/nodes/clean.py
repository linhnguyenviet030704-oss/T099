from backend.app.agents.state import AgentState


async def clean_node(state: AgentState) -> dict:
    """parse_node already returns redact_pii(clean_markdown(...)) output
    (backend/app/services/matching/parse.py:749) — this node's job is done
    before it runs. It only forwards the value under the `clean_markdown`
    key the rest of the graph expects."""
    text = state.get("markdown") or ""
    return {"markdown": text, "clean_markdown": text}
