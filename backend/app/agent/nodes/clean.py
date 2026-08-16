from backend.app.agent.state import AgentState
from backend.app.services.matching.parse import clean_markdown


async def clean_node(state: AgentState) -> dict:
    return {"markdown": clean_markdown(state.get("markdown") or "")}
