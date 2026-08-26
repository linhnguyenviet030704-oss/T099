"""Evaluation agent - main entry point."""

from __future__ import annotations

from typing import Any

from backend.app.agents.evaluation.graph import build_evaluation_graph
from backend.app.agents.evaluation.state import EvaluationState
from backend.app.agents.evaluation.types import EvaluationResult, EvaluationType
from backend.app.shared_brain import AgentBrain


class EvaluationAgent:
    """
    Evaluation agent for CV/Job assessment.

    Vector search is opt-in via needs_vector_search parameter.
    Default: False (no VS) - evaluation works directly with provided CV/JD.

    Usage:
        # Evaluation only - no VS
        agent = EvaluationAgent(brain=my_brain)
        result = await agent.evaluate(cv_text="...", jd_text="...")

        # With VS for benchmarking (job_search / cv_recommend flow)
        result = await agent.evaluate(
            cv_text="...",
            jd_text="...",
            needs_vector_search=True,
        )
    """

    _DEFAULT_NEEDS_VS = False

    def __init__(
        self,
        brain: AgentBrain | None = None,
        weights: dict[str, float] | None = None,
        default_needs_vector_search: bool = False,
    ) -> None:
        self.brain = brain
        self.weights = weights
        self.default_needs_vector_search = default_needs_vector_search
        self._graph = build_evaluation_graph(brain=brain, weights=weights)

    async def evaluate(
        self,
        *,
        cv_text: str | None = None,
        jd_text: str | None = None,
        resume_id: str | None = None,
        job_id: str | None = None,
        evaluation_type: EvaluationType = EvaluationType.FULL,
        needs_vector_search: bool | None = None,
    ) -> EvaluationResult:
        """
        Evaluate CV against JD or perform standalone assessment.

        Args:
            cv_text: Raw CV/resume text
            jd_text: Job description text
            resume_id: Optional existing resume ID in database
            job_id: Optional existing job ID in database
            evaluation_type: Type of evaluation to perform
            needs_vector_search: Opt-in flag for vector search (default: False).
                Set True only for job_search / cv_recommend flows that need
                similar reference profiles for benchmarking.

        Returns:
            EvaluationResult with scores and recommendations
        """
        use_vs = needs_vector_search if needs_vector_search is not None else self.default_needs_vector_search

        initial_state: EvaluationState = {
            "cv_text": cv_text,
            "jd_text": jd_text,
            "resume_id": resume_id,
            "job_id": job_id,
            "evaluation_type": evaluation_type,
            "needs_vector_search": use_vs,
            "parsed_cv": None,
            "parsed_jd": None,
            "reference_profiles": [],
            "kg_context": {},
            "skill_analysis": None,
            "breakdown": {},
            "overall_score": None,
            "result": None,
            "response": None,
            "error": None,
            "confidence": 0.5,
        }

        final_state = await self._graph.ainvoke(initial_state)

        if final_state.get("error"):
            raise ValueError(final_state["error"])

        result = final_state.get("result")
        if not result:
            raise ValueError("Evaluation failed: no result returned")

        return result

    async def evaluate_stream(
        self,
        *,
        cv_text: str | None = None,
        jd_text: str | None = None,
        resume_id: str | None = None,
        job_id: str | None = None,
        evaluation_type: EvaluationType = EvaluationType.FULL,
        needs_vector_search: bool | None = None,
    ):
        """Stream evaluation results node by node."""
        use_vs = needs_vector_search if needs_vector_search is not None else self.default_needs_vector_search

        initial_state: EvaluationState = {
            "cv_text": cv_text,
            "jd_text": jd_text,
            "resume_id": resume_id,
            "job_id": job_id,
            "evaluation_type": evaluation_type,
            "needs_vector_search": use_vs,
            "parsed_cv": None,
            "parsed_jd": None,
            "reference_profiles": [],
            "kg_context": {},
            "skill_analysis": None,
            "breakdown": {},
            "overall_score": None,
            "result": None,
            "response": None,
            "error": None,
            "confidence": 0.5,
        }

        async for state in self._graph.astream(initial_state):
            yield state
