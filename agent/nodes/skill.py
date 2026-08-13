from __future__ import annotations

from agent.state import AgentState
from backend.app.services.matching.retrieve import rank_candidates


async def skill_node(state: AgentState) -> dict:
    ranked = rank_candidates(list(state.get("candidates") or []), list(state.get("jd_skills") or []))
    return {"candidates": ranked}
