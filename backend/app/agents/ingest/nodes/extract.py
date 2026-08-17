from backend.app.agents.state import AgentState
from backend.app.services.matching.skills import extract_skills


async def extract_skills_node(state: AgentState) -> dict:
    skills = extract_skills(state.get("markdown") or "")
    metadata = dict(state.get("metadata") or {})
    metadata["skills"] = skills
    return {"skills": skills, "metadata": metadata}
