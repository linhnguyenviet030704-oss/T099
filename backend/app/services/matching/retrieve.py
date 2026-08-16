from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

from backend.app.core.exceptions import NotFoundError
from backend.app.services.matching.embed import DEFAULT_EMBEDDING_MODEL, embed_text
from backend.app.services.matching.ingest import try_ingest_resume
from backend.app.services.matching.skills import (
    expand_query,
    extract_skills,
    related_skills,
)
from backend.app.services.matching.store import SupabaseResumeStore
from supabase import Client


def job_query_text(job: dict[str, Any]) -> str:
    requirements = (job.get("requirements") or "").strip()
    if requirements:
        return requirements
    # ponytail: some posts leave requirements empty; title+description still match
    return " ".join(part for part in (job.get("title"), job.get("description")) if part)


def _row(result: Any) -> dict[str, Any] | None:
    if result is None:
        return None
    data = getattr(result, "data", None)
    return data if isinstance(data, dict) else None


def _profile(row: dict[str, Any]) -> dict[str, Any]:
    profile = row.get("profiles")
    if isinstance(profile, dict):
        return profile
    if isinstance(profile, list) and profile:
        return profile[0]
    return {}


def persist_match_resume_rows(
    client: Client,
    job_id: UUID,
    ranked: list[dict[str, Any]],
) -> None:
    resume_ids = [str(row["resume_id"]) for row in ranked if row.get("resume_id")]
    inserted = (
        client.table("match_resume")
        .insert(
            {
                "job_post_id": str(job_id),
                "matched_resume_ids": resume_ids,
                "embedding_model": DEFAULT_EMBEDDING_MODEL,
            }
        )
        .execute()
    )
    rows = inserted.data or []
    if not rows:
        return
    match_id = rows[0]["id"]
    evidence = []
    for rank, row in enumerate(ranked, start=1):
        resume_id = row.get("resume_id")
        if not resume_id:
            continue
        cv_skills = list(row.get("skills") or [])
        related: list[str] = []
        seen: set[str] = set()
        for skill in cv_skills:
            for neighbor in related_skills(skill, depth=2):
                if neighbor not in seen and neighbor not in cv_skills:
                    seen.add(neighbor)
                    related.append(neighbor)
        evidence.append(
            {
                "match_resume_id": match_id,
                "resume_id": str(resume_id),
                "job_post_id": str(job_id),
                "rank": rank,
                "score": row.get("score"),
                "skill_score": row.get("skill_score"),
                "semantic_score": row.get("semantic_score"),
                "semantic_rank": rank,
                "matched_skill_names": cv_skills,
                "related_skill_names": related,
                "raw_factors": {
                    "distance_original": row.get("distance_original"),
                    "distance_expanded": row.get("distance_expanded"),
                },
            }
        )
    if evidence:
        client.table("match_evidence").insert(evidence).execute()


async def retrieve_for_job(
    client: Client,
    job_id: UUID,
    *,
    encode=None,
    complete=None,
    store: SupabaseResumeStore | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
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

    def _submits() -> list[dict[str, Any]]:
        result = (
            client.table("job_submits")
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

    submits = await asyncio.to_thread(_submits)
    for row in submits:
        resume_id = row.get("resume_id")
        if resume_id:
            await try_ingest_resume(
                resume_store,
                UUID(str(resume_id)),
                encode=encode,
                complete=complete,
                api_key=api_key,
                base_url=base_url,
            )

    query_text = job_query_text(job)
    expanded = expand_query(query_text)
    original_embedding = embed_text(query_text, encode=encode, api_key=api_key, base_url=base_url)
    expanded_embedding = embed_text(expanded, encode=encode, api_key=api_key, base_url=base_url)

    def _match(query_embedding: list[float]) -> list[dict[str, Any]]:
        result = client.rpc(
            "match_resumes_for_job",
            {
                "query_embedding": query_embedding,
                "p_job_id": str(job_id),
                "match_count": 50,
            },
        ).execute()
        return result.data or []

    original_matches = await asyncio.to_thread(_match, original_embedding)
    expanded_matches = await asyncio.to_thread(_match, expanded_embedding)
    original_by_resume = {str(item["resume_id"]): float(item["distance"]) for item in original_matches}
    expanded_by_resume = {str(item["resume_id"]): float(item["distance"]) for item in expanded_matches}

    def _embedded(resume_id: str) -> dict[str, Any] | None:
        result = (
            client.table("embedded_resumes")
            .select("metadata")
            .eq("resume_id", resume_id)
            .maybe_single()
            .execute()
        )
        return _row(result)

    candidates: list[dict[str, Any]] = []
    for row in submits:
        resume_id = str(row.get("resume_id") or "")
        parsed = await asyncio.to_thread(_embedded, resume_id) if resume_id else None
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
                "distance_original": original_by_resume.get(resume_id, 1.0),
                "distance_expanded": expanded_by_resume.get(resume_id, 1.0),
            }
        )

    return {
        "jd_skills": extract_skills(query_text),
        "candidates": candidates,
    }
