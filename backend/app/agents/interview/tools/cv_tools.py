"""Candidate CV & Profile tools."""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.tools import tool

from backend.app.clients.supabase import get_supabase_client

logger = logging.getLogger(__name__)


@tool
def get_candidate_cv(candidate_id: str) -> dict[str, Any]:
    """Fetch candidate profile and parsed CV text from Supabase."""
    try:
        db = get_supabase_client()
        # Fetch candidate profile
        profile_res = db.table("profiles").select("*").eq("id", candidate_id).execute()
        profile_data = profile_res.data[0] if profile_res.data else {}

        # Fetch latest candidate resume
        resume_res = (
            db.table("resumes")
            .select("*")
            .eq("candidate_id", candidate_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        resume_data = resume_res.data[0] if resume_res.data else {}

        skills = resume_data.get("skills") or profile_data.get("skills") or []
        cv_text = resume_data.get("raw_text") or resume_data.get("parsed_text") or profile_data.get("bio") or ""

        return {
            "id": candidate_id,
            "name": profile_data.get("full_name") or profile_data.get("name") or "Candidate",
            "email": profile_data.get("email"),
            "cv_text": cv_text,
            "skills": skills if isinstance(skills, list) else [skills],
            "experience_summary": resume_data.get("experience_summary") or "",
        }
    except Exception as e:
        logger.warning("Error fetching candidate CV from Supabase: %s", e)
        return {
            "id": candidate_id,
            "name": "Candidate",
            "cv_text": "",
            "skills": [],
            "experience_summary": "",
        }
