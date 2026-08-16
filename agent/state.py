from __future__ import annotations

from typing import Any, TypedDict


class AgentState(TypedDict, total=False):
    query: str
    context: str
    analysis: str
    response: str
    error: str
    metadata: dict
    job_id: str
    jd_skills: list[str]
    candidates: list[dict[str, Any]]
