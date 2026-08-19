from backend.app.agents.state import AgentState
from backend.app.services.matching.rrf import score_candidates


async def rrf_node(state: AgentState) -> dict:
    return {
        "candidates": score_candidates(
            list(state.get("candidates") or []),
            list(state.get("jd_skills") or []),
            constraints=state.get("skill_constraints"),
            confirmed=bool(state.get("constraints_confirmed")),
        )
    }
