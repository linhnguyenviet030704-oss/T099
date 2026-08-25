from backend.app.agents.state import AgentState
from backend.app.services.matching.rrf_jobs import score_jobs_for_resume


async def score_node(state: AgentState) -> dict:
    return {
        "candidates": score_jobs_for_resume(
            list(state.get("candidates") or []),
            list(state.get("jd_skills") or []),
            cv_verified=list(state.get("cv_verified") or []),
            cv_has_evidence=bool(state.get("cv_has_evidence", True)),
        )
    }
