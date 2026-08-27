"""Agent 1 Evaluation State Definition."""

from __future__ import annotations

from typing import Any, Literal, TypedDict


class Agent1State(TypedDict, total=False):
    candidate_id: str
    repo_url: str
    repo_full_name: str | None
    is_cached: bool
    metadata: dict[str, Any] | None
    file_tree: list[dict[str, Any]] | None
    heuristic_metrics: dict[str, Any] | None
    tier1_score: float | None
    selected_files: list[dict[str, Any]] | None
    file_contents: list[tuple[str, str]] | None
    llm_evaluation: dict[str, Any] | None
    final_scores: dict[str, Any] | None
    summary: str | None
    status: Literal["pending", "tier1_done", "tier2_done", "complete", "failed"]
    error: str | None
    should_skip_tier2: bool
