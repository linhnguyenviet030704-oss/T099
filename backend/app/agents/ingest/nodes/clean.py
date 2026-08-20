from backend.app.agents.state import AgentState
from backend.app.services.matching.parse import clean_markdown, redact_pii


async def clean_node(state: AgentState) -> dict:
    text = redact_pii(clean_markdown(state.get("markdown") or ""))
    return {"markdown": text, "clean_markdown": text}
