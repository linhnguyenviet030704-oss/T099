"""Agent 2 Interview State Definition."""

from __future__ import annotations

from typing import Any, Literal, TypedDict


class Agent2State(TypedDict, total=False):
    candidate_id: str
    job_id: str
    messages: list[dict[str, Any]]
    jd_analysis: dict[str, Any] | None
    cv_skills: list[str] | None
    cv_text: str | None
    candidate_name: str | None
    project_profiles: list[dict[str, Any]] | None
    question_distribution: dict[str, int] | None
    generated_questions: list[dict[str, Any]] | None
    validation_result: dict[str, Any] | None
    session_id: str | None
    status: Literal["pending", "generating", "generated", "failed"]
    refine_count: int
    coverage_threshold: float
    question_count_range: tuple[int, int]
    error: str | None
