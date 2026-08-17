from __future__ import annotations

from typing import Any, TypedDict


class AgentState(TypedDict, total=False):
    query: str
    job_id: str
    rerank_mode: str
    jd_query: str
    jd_skills: list[str]
    candidates: list[dict[str, Any]]
    response: str
    raw_bytes: bytes
    mime_type: str
    markdown: str
    metadata: dict[str, Any]
    skills: list[str]
    embedding: list[float]
