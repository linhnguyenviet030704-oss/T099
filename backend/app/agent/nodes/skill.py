from backend.app.agent.state import AgentState
from backend.app.services.matching.skills import coverage_score, extract_skills, load_taxonomy_index


async def extract_skills_node(state: AgentState) -> dict:
    skills = extract_skills(state.get("markdown") or "")
    metadata = dict(state.get("metadata") or {})
    metadata["skills"] = skills
    return {"skills": skills, "metadata": metadata}


async def skill_node(state: AgentState) -> dict:
    index = load_taxonomy_index()
    jd_skills = list(state.get("jd_skills") or [])
    ranked: list[dict] = []
    for row in state.get("candidates") or []:
        ranked.append(
            {
                **row,
                "skill_score": coverage_score(row.get("skills") or [], jd_skills, index),
            }
        )
    return {"candidates": ranked}
