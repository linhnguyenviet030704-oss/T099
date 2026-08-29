"""Evaluation state for LangGraph agent."""

from __future__ import annotations

from typing import Any, TypedDict

from backend.app.agents.evaluation.types import (
    EvaluationResult,
    EvaluationType,
    IntentType,
    ParsedProfile,
    RejectionReason,
    SkillAnalysis,
)


class EvaluationState(TypedDict, total=False):
    """State for evaluation agent graph."""

    # Input
    raw_input: str
    cv_text: str | None
    jd_text: str | None
    resume_id: str | None
    job_id: str | None
    evaluation_type: EvaluationType
    needs_vector_search: bool  # True only for job_search / cv_recommend flows

    # Parsed profiles
    parsed_cv: ParsedProfile | None
    parsed_jd: ParsedProfile | None

    # Retrieval context
    reference_profiles: list[dict[str, Any]]
    kg_context: dict[str, Any]

    # Scoring
    skill_analysis: SkillAnalysis | None
    breakdown: dict[str, Any]  # MetricScore serialized
    overall_score: float | None
    raw_overall_score: float | None
    authenticity: dict[str, Any]
    red_flags: list[str]

    # Output
    result: EvaluationResult | None
    response: str | None
    error: str | None

    # Metadata
    confidence: float


class RoutingState(TypedDict, total=False):
    """State for routing agent."""

    # Input
    raw_input: str
    user_id: str | None

    # Routing decision
    intent: IntentType | None
    is_valid: bool
    rejection_reason: RejectionReason | None
    dispatch_target: str | None  # 'evaluation', 'matching', 'recommend', None

    # Context for downstream
    context: dict[str, Any]
    validation_errors: list[str]
    response: str | None
