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
    clean_markdown: str
    metadata: dict[str, Any]
    skills: list[str]
    embedding: list[float]
    skill_constraints: dict[str, Any]
    constraints_confirmed: bool
    dense_query: str
    bm25_query: str
    match_reasons: dict[str, str]
    job_description: str
    cv_verified: list[str]
    cv_has_evidence: bool
