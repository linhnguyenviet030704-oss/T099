from backend.app.agent.state import AgentState
from backend.app.services.matching.parse import parse_resume_bytes


async def parse_node(state: AgentState) -> dict:
    parsed = parse_resume_bytes(state.get("raw_bytes") or b"", mime_type=state.get("mime_type") or "")
    return {"markdown": parsed.get("markdown") or ""}
