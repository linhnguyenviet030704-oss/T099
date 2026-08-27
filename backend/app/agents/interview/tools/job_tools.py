"""Job Description tools."""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.tools import tool

from backend.app.clients.supabase import get_supabase_client

logger = logging.getLogger(__name__)


@tool
def get_job_description(job_id: str) -> dict[str, Any]:
    """Fetch full Job Description including requirements, skills, seniority from Supabase job_posts."""
    try:
        db = get_supabase_client()
        job_res = db.table("job_posts").select("*").eq("id", job_id).execute()
        job_data = job_res.data[0] if job_res.data else {}

        return {
            "id": job_id,
            "title": job_data.get("title") or "Software Engineer",
            "requirements_text": job_data.get("requirements") or job_data.get("requirements_text") or "",
            "technical_skills": job_data.get("skills") or job_data.get("technical_skills") or [],
            "seniority_level": job_data.get("seniority_level") or job_data.get("level") or "mid",
            "description": job_data.get("description") or "",
        }
    except Exception as e:
        logger.warning("Error fetching job description from Supabase: %s", e)
        return {
            "id": job_id,
            "title": "Software Engineer",
            "requirements_text": "",
            "technical_skills": [],
            "seniority_level": "mid",
            "description": "",
        }
