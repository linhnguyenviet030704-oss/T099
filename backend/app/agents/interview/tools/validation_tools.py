"""Interview Question Validation & Persistence tools."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from langchain_core.tools import tool

from backend.app.clients.supabase import get_supabase_client

logger = logging.getLogger(__name__)


@tool
def validate_coverage(
    questions: list[dict[str, Any]],
    jd_requirements: list[str],
    threshold: float = 0.80,
) -> dict[str, Any]:
    """Check requirements coverage ratio.

    Returns:
        dict with {covered: [...], missing: [...], ratio: float, passed: bool}
    """
    if not jd_requirements:
        return {
            "covered": questions,
            "missing": [],
            "ratio": 1.0,
            "passed": True,
        }

    # Match each question to requirements
    covered_requirements: set[str] = set()
    covered_questions: list[dict[str, Any]] = []

    for q in questions:
        mapped = str(q.get("jd_requirement_mapped", "")).strip().lower()
        matched = False
        for req in jd_requirements:
            req_lower = req.strip().lower()
            if req_lower == mapped or req_lower in mapped or mapped in req_lower:
                covered_requirements.add(req)
                matched = True
        if matched:
            covered_questions.append(q)

    missing_requirements = [
        req for req in jd_requirements if req not in covered_requirements
    ]
    ratio = len(covered_requirements) / len(jd_requirements)
    passed = ratio >= threshold

    return {
        "covered": covered_questions,
        "missing": missing_requirements,
        "ratio": round(ratio, 2),
        "passed": passed,
    }


@tool
def persist_interview_session(
    candidate_id: str,
    job_id: str | None,
    questions: list[dict[str, Any]],
    distribution: dict[str, int],
    coverage_ratio: float,
    coverage_threshold: float = 0.80,
    model_used: str = "qwen-plus",
    session_id: str | None = None,
) -> str:
    """Save interview session and generated questions to Supabase. Returns session_id."""
    session_id = session_id or str(uuid.uuid4())

    try:
        db = get_supabase_client()
        session_data = {
            "id": session_id,
            "candidate_id": candidate_id,
            "job_id": job_id if job_id else None,
            "status": "generated",
            "question_distribution": distribution,
            "total_questions": len(questions),
            "coverage_ratio": coverage_ratio,
            "coverage_threshold": coverage_threshold,
            "model_used": model_used,
            "is_approved": False,
        }
        db.table("interview_sessions").insert(session_data).execute()

        # Insert question rows
        for idx, q in enumerate(questions):
            q_data = {
                "id": q.get("id") or str(uuid.uuid4()),
                "session_id": session_id,
                "text": q.get("text", ""),
                "category": q.get("category", "technical"),
                "difficulty": q.get("difficulty", "medium"),
                "project_reference": q.get("project_reference"),
                "jd_requirement_mapped": q.get("jd_requirement_mapped"),
                "skills_tested": q.get("skills_tested", []),
                "expected_answer_outline": q.get("expected_answer_outline"),
                "rubric": q.get("rubric"),
                "follow_ups": q.get("follow_ups", []),
                "question_order": idx + 1,
            }
            try:
                db.table("interview_questions").insert(q_data).execute()
            except Exception as e:
                logger.warning("Failed to insert question %d: %s", idx + 1, e)

    except Exception as e:
        logger.warning("Could not persist interview session to Supabase: %s", e)

    return session_id
