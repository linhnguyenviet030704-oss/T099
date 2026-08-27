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
    # Intent & Query Routing
    intent: str
    needs_db_query: bool
    db_query_params: dict[str, Any]
    kg_params: dict[str, Any]
    kg_context: dict[str, Any]
    target_entity: dict[str, Any]
    allowed_result_ids: list[str]
    deterministic_candidates: list[dict[str, Any]]
    guardrail_codes: list[str]
