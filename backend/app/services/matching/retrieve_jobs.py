from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

from backend.app.config.models import DEFAULT_EMBED_MODEL
from backend.app.services.matching.bm25 import bm25_document, bm25_query, bm25_scores
from backend.app.services.matching.ingest import try_ingest_resume
from backend.app.services.matching.ingest_jobs import _embedded_jobs_batch, try_ingest_job
from backend.app.services.matching.retrieve import (
    _as_embedding,
    _parse_constraints,
    _try_cosine,
    job_query_text,
)
from backend.app.services.matching.store import SupabaseResumeStore
from backend.app.services.recommend import _company_name
from supabase import Client

JOB_POOL_LIMIT = 200


async def retrieve_jobs_for_resume(
    client: Client,
    actor_id: UUID,
    *,
    encode=None,
    complete=None,
    store: SupabaseResumeStore | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> dict[str, Any] | None:
    resume_store = store or SupabaseResumeStore(client)

    def _default_resume() -> dict[str, Any] | None:
        result = (
            client.table("resumes")
            .select("id")
            .eq("user_id", str(actor_id))
            .eq("is_default", True)
            .is_("deleted_at", "null")
            .maybe_single()
            .execute()
        )
        return result.data

    resume_row = await asyncio.to_thread(_default_resume)
    if not resume_row or not resume_row.get("id"):
        return None
    resume_id = UUID(str(resume_row["id"]))

    status = await try_ingest_resume(
        resume_store, resume_id, encode=encode, complete=complete, api_key=api_key, base_url=base_url
    )
    if status is None:
        return None

    def _parsed() -> dict[str, Any] | None:
        result = (
            client.table("embedded_resumes")
            .select("markdown, clean_markdown, metadata, embedding, model")
            .eq("resume_id", str(resume_id))
            .maybe_single()
            .execute()
        )
        return result.data

    parsed = await asyncio.to_thread(_parsed)
    if not parsed:
        return None

    metadata = parsed.get("metadata") or {}
    verified = list(metadata.get("verified_skills") or [])
    inferred = list(metadata.get("inferred_skills") or [])
    cv_skills = list(metadata.get("skills") or [*verified, *inferred])
    clean = parsed.get("clean_markdown") or ""
    markdown = parsed.get("markdown") or ""
    cv_text = clean or markdown
    cv_embedding = _as_embedding(parsed.get("embedding"))
    cv_model = parsed.get("model") or ""
    cv_has_evidence = (
        bool(metadata.get("skill_records"))
        and (metadata.get("ingest_status") or "ok") == "ok"
        and bool(clean.strip())
    )

    def _published_jobs() -> list[dict[str, Any]]:
        result = (
            client.table("job_posts")
            .select(
                "id, title, description, requirements, location, employment_type, "
                "salary_min, salary_max, currency, skill_constraints, "
                "skill_constraints_confirmed_at, companies(name)"
            )
            .eq("status", "published")
            .order("published_at", desc=True)
            .limit(JOB_POOL_LIMIT)
            .execute()
        )
        return result.data or []

    jobs = await asyncio.to_thread(_published_jobs)
    await asyncio.gather(
        *(try_ingest_job(client, job, encode=encode, api_key=api_key, base_url=base_url) for job in jobs)
    )

    embedded_by_id = await asyncio.to_thread(_embedded_jobs_batch, client, [str(job["id"]) for job in jobs])

    candidates: list[dict[str, Any]] = []
    docs: list[str] = []
    for job in jobs:
        job_id = str(job["id"])
        embedded = embedded_by_id.get(job_id)
        job_skills = list((embedded or {}).get("skills") or [])
        job_text = job_query_text(job)
        job_embedding = _as_embedding((embedded or {}).get("embedding"))
        job_model = (embedded or {}).get("model") or ""
        distance: float | None = None
        if (
            cv_embedding is not None
            and cv_model == DEFAULT_EMBED_MODEL
            and job_embedding is not None
            and job_model == DEFAULT_EMBED_MODEL
        ):
            cosine = _try_cosine(cv_embedding, job_embedding)
            if cosine is not None:
                distance = 1.0 - cosine
        constraints = _parse_constraints(job.get("skill_constraints"))
        confirmed = job.get("skill_constraints_confirmed_at") is not None
        docs.append(bm25_document(job_text, job_skills))
        candidates.append(
            {
                "job_id": job_id,
                "title": job.get("title"),
                "company_name": _company_name(job),
                "location": job.get("location"),
                "employment_type": job.get("employment_type"),
                "salary_min": job.get("salary_min"),
                "salary_max": job.get("salary_max"),
                "currency": job.get("currency") or "VND",
                "skills": job_skills,
                "markdown": job_text,
                "clean_markdown": job_text,
                "skill_records": [],
                "skill_constraints": constraints,
                "constraints_confirmed": confirmed,
                "distance_expanded": distance,
                "bm25_score": 0.0,
            }
        )

    bm25_q = bm25_query("", cv_skills)
    scores = bm25_scores(docs, bm25_q) if docs else []
    for row, score in zip(candidates, scores, strict=False):
        row["bm25_score"] = score

    return {
        "candidates": candidates,
        "cv_skills": cv_skills,
        "cv_verified": verified,
        "cv_has_evidence": cv_has_evidence,
        "cv_text": cv_text,
    }
