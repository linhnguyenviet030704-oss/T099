from backend.app.agents.state import AgentState
from backend.app.services.matching.skills import coverage_score, load_taxonomy_index


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
