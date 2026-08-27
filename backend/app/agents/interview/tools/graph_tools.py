"""Candidate Knowledge Graph & Question Vector Search tools."""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.tools import tool

from backend.app.clients.supabase import get_supabase_client

logger = logging.getLogger(__name__)


@tool
def get_candidate_projects(candidate_id: str) -> list[dict[str, Any]]:
    """Fetch project nodes and evaluations from knowledge graph via get_candidate_projects RPC."""
    try:
        db = get_supabase_client()
        # Attempt RPC first
        try:
            rpc_res = db.rpc("get_candidate_projects", {"p_candidate_id": candidate_id}).execute()
            if rpc_res.data:
                return rpc_res.data
        except Exception:
            pass

        # Fallback direct query on candidate_projects
        proj_res = (
            db.table("candidate_projects")
            .select("*")
            .eq("candidate_id", candidate_id)
            .eq("is_current", True)
            .execute()
        )
        return proj_res.data or []
    except Exception as e:
        logger.warning("Error fetching candidate projects: %s", e)
        return []


@tool
def get_candidate_skills(candidate_id: str) -> list[dict[str, Any]]:
    """Fetch skill nodes for candidate from candidate_nodes table."""
    try:
        db = get_supabase_client()
        res = (
            db.table("candidate_nodes")
            .select("*")
            .eq("candidate_id", candidate_id)
            .eq("node_type", "skill")
            .eq("is_active", True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.warning("Error fetching candidate skills: %s", e)
        return []


@tool
def get_project_evaluation(project_repo_name: str) -> dict[str, Any] | None:
    """Fetch evaluation scores for a specific repository project."""
    try:
        db = get_supabase_client()
        res = (
            db.table("candidate_projects")
            .select("*")
            .eq("repo_full_name", project_repo_name)
            .eq("is_current", True)
            .limit(1)
            .execute()
        )
        if res.data and len(res.data) > 0:
            return res.data[0]
        return None
    except Exception as e:
        logger.warning("Error fetching project evaluation for %s: %s", project_repo_name, e)
        return None


@tool
def query_similar_questions(job_id: str, category: str, limit: int = 5) -> list[dict[str, Any]]:
    """Vector / category search past interview questions to avoid duplication."""
    try:
        db = get_supabase_client()
        # Query existing questions in this category for recent sessions
        res = (
            db.table("interview_questions")
            .select("text, category, difficulty, jd_requirement_mapped")
            .eq("category", category)
            .limit(limit)
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.warning("Error querying similar questions: %s", e)
        return []
