from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

from backend.app.core.exceptions import NotFoundError
from backend.app.services.matching.embed import embed_text
from backend.app.services.matching.ingest import ingest_resume
from backend.app.services.matching.skills import coverage_score, extract_skills, load_taxonomy_index
from backend.app.services.matching.store import SupabaseResumeStore
from supabase import Client

SEMANTIC_WEIGHT = 0.6
SKILL_WEIGHT = 0.4


def semantic_score(distance: float) -> float:
    return max(0.0, 1.0 - distance)


def combine_scores(semantic: float, coverage: float) -> float:
    return SEMANTIC_WEIGHT * semantic + SKILL_WEIGHT * coverage


def jd_skills_from_text(title: str, description: str, requirements: str | None) -> list[str]:
    blob = " ".join(part for part in (title, description, requirements or "") if part)
    return extract_skills(blob)


def rank_candidates(
    rows: list[dict[str, Any]],
    jd_skills: list[str],
    taxonomy_index: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    index = taxonomy_index or load_taxonomy_index()
    ranked: list[dict[str, Any]] = []
    for row in rows:
        coverage = coverage_score(row.get("skills") or [], jd_skills, index)
        semantic = semantic_score(float(row.get("distance") or 0.0))
        ranked.append(
            {
                **row,
                "skill_score": coverage,
                "semantic_score": semantic,
                "score": combine_scores(semantic, coverage),
            }
        )
    ranked.sort(key=lambda item: item["score"], reverse=True)
    return ranked


def _profile(row: dict[str, Any]) -> dict[str, Any]:
    profile = row.get("profiles")
    if isinstance(profile, dict):
        return profile
    if isinstance(profile, list) and profile:
        return profile[0]
    return {}


async def retrieve_for_job(
    client: Client,
    job_id: UUID,
    *,
    encode=None,
    store: SupabaseResumeStore | None = None,
) -> dict[str, Any]:
    resume_store = store or SupabaseResumeStore(client)

    def _job() -> dict[str, Any] | None:
        result = (
            client.table("job_posts")
            .select("id, title, description, requirements")
            .eq("id", str(job_id))
            .maybe_single()
            .execute()
        )
        return result.data

    job = await asyncio.to_thread(_job)
    if not job:
        raise NotFoundError("Job not found", code="JOB_NOT_FOUND")

    def _apps() -> list[dict[str, Any]]:
        result = (
            client.table("applications")
            .select(
                "id, applicant_user_id, resume_id, current_status, "
                "resume_title_snapshot, resume_storage_path_snapshot, "
                "profiles!applicant_user_id(full_name, email)"
            )
            .eq("job_post_id", str(job_id))
            .is_("withdrawn_at", "null")
            .order("applied_at", desc=True)
            .limit(50)
            .execute()
        )
        return result.data or []

    applications = await asyncio.to_thread(_apps)
    for row in applications:
        resume_id = row.get("resume_id")
        if resume_id:
            await ingest_resume(resume_store, UUID(str(resume_id)), encode=encode)

    query_text = " ".join(
        part for part in (job.get("title"), job.get("description"), job.get("requirements")) if part
    )
    query_embedding = embed_text(query_text, encode=encode)

    def _match() -> list[dict[str, Any]]:
        result = client.rpc(
            "match_resumes_for_job",
            {
                "query_embedding": query_embedding,
                "p_job_id": str(job_id),
                "match_count": 50,
            },
        ).execute()
        return result.data or []

    matches = await asyncio.to_thread(_match)
    distance_by_resume = {str(item["resume_id"]): float(item["distance"]) for item in matches}

    def _parsed(resume_id: str) -> dict[str, Any] | None:
        result = (
            client.table("parsed_resumes")
            .select("metadata")
            .eq("resume_id", resume_id)
            .maybe_single()
            .execute()
        )
        return result.data

    candidates: list[dict[str, Any]] = []
    for row in applications:
        resume_id = str(row.get("resume_id") or "")
        parsed = await asyncio.to_thread(_parsed, resume_id) if resume_id else None
        metadata = (parsed or {}).get("metadata") or {}
        skills = metadata.get("skills") or []
        profile = _profile(row)
        candidates.append(
            {
                "application_id": str(row["id"]),
                "applicant_user_id": str(row["applicant_user_id"]),
                "resume_id": resume_id,
                "full_name": profile.get("full_name"),
                "email": profile.get("email"),
                "resume_title": row.get("resume_title_snapshot"),
                "resume_storage_path": row.get("resume_storage_path_snapshot"),
                "current_status": row.get("current_status") or "pending",
                "skills": skills,
                "distance": distance_by_resume.get(resume_id, 1.0),
            }
        )

    return {
        "jd_skills": jd_skills_from_text(job.get("title") or "", job.get("description") or "", job.get("requirements")),
        "candidates": candidates,
    }

