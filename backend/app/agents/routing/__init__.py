"""Routing agent - main entry point."""

from __future__ import annotations

from typing import Any

from backend.app.agents.evaluation.types import IntentType, RejectionReason
from backend.app.agents.routing.graph import build_routing_graph
from backend.app.shared_brain import AgentBrain


class RoutingAgent:
    """
    Reactive routing agent that classifies user intent and dispatches to appropriate agents.

    Key flags in result:
    - needs_cv: Should we load the user's CV?
    - needs_db: Should we query the job database?
    - requires_user_cv: Dispatch target needs CV to function

    Usage:
        agent = RoutingAgent()
        result = await agent.route("Các công việc AI Engineer")
        # result.intent -> IntentType.SEARCH_BY_DOMAIN
        # result.needs_cv -> False  (browse jobs, no CV needed)
        # result.dispatch_target -> "recommend"
    """

    def __init__(self, brain: AgentBrain | None = None) -> None:
        self.brain = brain
        self._graph = build_routing_graph(brain=brain)

    async def route(
        self,
        raw_input: str,
        user_id: str | None = None,
    ) -> RoutingResult:
        """
        Route user input to appropriate agent.

        Args:
            raw_input: User's raw input text
            user_id: Optional user ID for context

        Returns:
            RoutingResult with intent, CV/DB usage, and dispatch info
        """
        initial_state = {
            "raw_input": raw_input,
            "user_id": user_id,
            "intent": None,
            "is_valid": False,
            "rejection_reason": None,
            "dispatch_target": None,
            "context": {},
            "validation_errors": [],
        }

        final_state = await self._graph.ainvoke(initial_state)

        ctx = final_state.get("context", {})
        return RoutingResult(
            intent=final_state.get("intent"),
            is_valid=final_state.get("is_valid", False),
            rejection_reason=final_state.get("rejection_reason"),
            dispatch_target=final_state.get("dispatch_target"),
            context=ctx,
            validation_errors=final_state.get("validation_errors", []),
            response=final_state.get("response"),
            needs_db=ctx.get("needs_db", False),
            needs_cv=ctx.get("needs_cv", False),
            requires_user_cv=ctx.get("requires_user_cv", False),
            needs_vector_search=ctx.get("needs_vector_search", False),
            db_query_params=ctx.get("db_query_params", {}),
            kg_params=ctx.get("kg_params", {}),
            has_sensitive_content=ctx.get("has_sensitive_content", False),
        )


class RoutingResult:
    """Result of routing decision with CV/DB usage flags."""

    def __init__(
        self,
        intent: IntentType | None,
        is_valid: bool,
        rejection_reason: RejectionReason | None,
        dispatch_target: str | None,
        context: dict[str, Any],
        validation_errors: list[str],
        response: str | None = None,
        *,
        needs_db: bool = False,
        needs_cv: bool = False,
        requires_user_cv: bool = False,
        needs_vector_search: bool = False,
        db_query_params: dict[str, Any] | None = None,
        kg_params: dict[str, Any] | None = None,
        has_sensitive_content: bool = False,
    ) -> None:
        self.intent = intent
        self.is_valid = is_valid
        self.rejection_reason = rejection_reason
        self.dispatch_target = dispatch_target
        self.context = context
        self.validation_errors = validation_errors
        self.response = response
        self.needs_db = needs_db
        self.needs_cv = needs_cv
        self.requires_user_cv = requires_user_cv
        self.needs_vector_search = needs_vector_search
        self.db_query_params = db_query_params or {}
        self.kg_params = kg_params or {}
        self.has_sensitive_content = has_sensitive_content

    def is_rejected(self) -> bool:
        return not self.is_valid

    def should_load_cv(self) -> bool:
        """Should we load the user's CV before dispatch?"""
        return self.is_valid and self.needs_cv

    def should_query_db(self) -> bool:
        """Should we query the database before dispatch?"""
        return self.is_valid and self.needs_db

    def needs_evaluation(self) -> bool:
        return self.is_valid and self.dispatch_target == "evaluation"

    def needs_recommendation(self) -> bool:
        return self.is_valid and self.dispatch_target == "recommend"

    def should_use_vector_search(self) -> bool:
        """Should we use vector search for this flow?

        Only job_search and cv_recommend flows need VS.
        Evaluation/analysis flows work with provided CV/JD directly.
        """
        return self.is_valid and self.needs_vector_search

    def to_dict(self) -> dict[str, Any]:
        return {
            "intent": self.intent.value if self.intent else None,
            "is_valid": self.is_valid,
            "rejection_reason": self.rejection_reason.value if self.rejection_reason else None,
            "dispatch_target": self.dispatch_target,
            "needs_db": self.needs_db,
            "needs_cv": self.needs_cv,
            "requires_user_cv": self.requires_user_cv,
            "needs_vector_search": self.needs_vector_search,
            "db_query_params": self.db_query_params,
            "kg_params": self.kg_params,
            "validation_errors": self.validation_errors,
            "rejection_message": self.response,
            "has_sensitive_content": self.has_sensitive_content,
        }
