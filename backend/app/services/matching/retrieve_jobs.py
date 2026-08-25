from __future__ import annotations

import asyncio
import re
from typing import Any
from uuid import UUID

from backend.app.config.models import (
    DEFAULT_EMBED_MODEL,
    DEFAULT_RERANK_MODEL,
    RERANK_CONFIG_VERSION,
)
from backend.app.services.matching.bm25 import bm25_document, bm25_query, bm25_scores
from backend.app.services.matching.ingest import try_ingest_resume
from backend.app.services.matching.ingest_jobs import _embedded_jobs_batch, try_ingest_job
from backend.app.services.matching.retrieve import (
    INGEST_CONCURRENCY_LIMIT,
    _as_embedding,
    _parse_constraints,
    _try_cosine,
    job_query_text,
)
from backend.app.services.matching.store import SupabaseResumeStore
from backend.app.services.recommend import _company_name
from supabase import Client

JOB_POOL_LIMIT = 200


async def persist_recommend_job_rows(
    client: Client,
    user_id: UUID,
    ranked: list[dict[str, Any]],
    *,
    candidate_message: str,
    rerank_mode: str,
    rerank_status: str,
    cv_id: UUID | None = None,
) -> None:
    """Persist recommend job run to database for analytics/observability."""
    job_ids = [str(row.get("job_id") or "") for row in ranked if row.get("job_id")]
    evidence = []
    for rank, row in enumerate(ranked, start=1):
        job_id = row.get("job_id")
        if not job_id:
            continue
        cv_skills = list(row.get("skills") or [])
        evidence.append(
            {
                "job_id": str(job_id),
                "rank": rank,
                "rrf_score": row.get("rrf_score"),
                "rerank_score": row.get("rerank_score"),
                "semantic_score": row.get("distance_expanded"),
                "bm25_score": row.get("bm25_score"),
                "matched_skill_names": cv_skills[:10],
                "related_skill_names": [],
                "raw_factors": {
                    "location": row.get("location"),
                    "employment_type": row.get("employment_type"),
                },
            }
        )

    def _insert_run() -> None:
        client.rpc(
            "insert_recommend_job_run",
            {
                "p_user_id": str(user_id),
                "p_candidate_message": candidate_message,
                "p_rerank_mode": rerank_mode,
                "p_rerank_status": rerank_status,
                "p_rerank_model": DEFAULT_RERANK_MODEL if rerank_mode == "qwen" else None,
                "p_rerank_config_version": RERANK_CONFIG_VERSION,
                "p_embedding_model": DEFAULT_EMBED_MODEL,
                "p_pool_size": len(ranked),
                "p_matched_job_ids": job_ids,
                "p_cv_id": str(cv_id) if cv_id else None,
                "p_evidence": evidence,
            },
        ).execute()

    await asyncio.to_thread(_insert_run)


async def retrieve_jobs_for_resume(
    client: Client,
    actor_id: UUID,
    *,
    query: str = "",
    encode=None,
    complete=None,
    store: SupabaseResumeStore | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> dict[str, Any] | None:
    resume_store = store or SupabaseResumeStore(client)

    def _default_resume() -> dict[str, Any] | None:
        # Try to find explicitly marked default resume first
        result = (
            client.table("resumes")
            .select("id")
            .eq("user_id", str(actor_id))
            .eq("is_default", True)
            .is_("deleted_at", "null")
            .maybe_single()
            .execute()
        )
        if result and result.data and result.data.get("id"):
            return result.data

        # Fallback: get the most recent non-deleted resume
        result = (
            client.table("resumes")
            .select("id")
            .eq("user_id", str(actor_id))
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .limit(1)
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

    # One batched read of embedded_jobs serves both purposes: it tells each
    # try_ingest_job whether its cached embedding is still current (so no
    # per-job point read), and it carries the scoring data below. Jobs that
    # actually get re-embedded hand back their fresh row, which we merge in.
    embedded_by_id = await asyncio.to_thread(
        _embedded_jobs_batch, client, [str(job["id"]) for job in jobs]
    )

    ingest_semaphore = asyncio.Semaphore(INGEST_CONCURRENCY_LIMIT)

    async def _ingest_bounded(job: dict[str, Any]) -> dict[str, Any] | None:
        async with ingest_semaphore:
            return await try_ingest_job(
                client,
                job,
                existing_row=embedded_by_id.get(str(job["id"])),
                encode=encode,
                api_key=api_key,
                base_url=base_url,
            )

    # ponytail: For issue #3, consider pre-embedding jobs at publish time via
    # a background worker or Supabase Edge Functions instead of on-the-fly here.
    # This prevents potential HTTP Gateway Timeout (504) when many jobs lack
    # embeddings and the user request must wait for sequential Qwen API calls.
    # Current on-the-fly approach is acceptable for MVP with reasonable cache hit rate.
    refreshed = await asyncio.gather(*(_ingest_bounded(job) for job in jobs))
    for row in refreshed:
        if row and row.get("job_post_id"):
            embedded_by_id[str(row["job_post_id"])] = row

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

    bm25_q = bm25_query(cv_text, cv_skills)
    scores = bm25_scores(docs, bm25_q) if docs else []
    for row, score in zip(candidates, scores, strict=False):
        row["bm25_score"] = score

    # If user provided a query message, boost jobs matching keywords or job numbers
    if query and query.strip():
        query_lower = query.lower()
        match_num = re.search(r"#(\d+)", query_lower)
        target_num = match_num.group(1) if match_num else None

        for candidate in candidates:
            boost = 0.0
            title = (candidate.get("title") or "").lower()
            location = (candidate.get("location") or "").lower()
            company = (candidate.get("company_name") or "").lower()

            if target_num and (f"#{target_num}" in title or f"#{target_num}" in (candidate.get("id") or "")):
                boost += 5.0  # Dominant boost for exact job number match like #4 or #2

            for word in query_lower.split():
                clean_word = word.strip("#,?.!").lower()
                if len(clean_word) > 1:
                    if clean_word in title:
                        boost += 0.4
                    if clean_word in company:
                        boost += 0.4
                    if clean_word in location:
                        boost += 0.2

            if boost > 0:
                current_bm25 = float(candidate.get("bm25_score") or 0.0)
                candidate["bm25_score"] = (current_bm25 if current_bm25 > 0 else 0.5) + boost

    return {
        "candidates": candidates,
        "cv_skills": cv_skills,
        "cv_text": cv_text,
        "cv_verified": verified,
        "cv_has_evidence": cv_has_evidence,
    }
