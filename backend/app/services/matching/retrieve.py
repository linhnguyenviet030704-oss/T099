from __future__ import annotations

import asyncio
import math
from typing import Any
from uuid import UUID

from backend.app.config.models import (
    DEFAULT_EMBED_DIM,
    DEFAULT_EMBED_MODEL,
    DEFAULT_RERANK_MODEL,
    RERANK_CONFIG_VERSION,
)
from backend.app.core.exceptions import NotFoundError
from backend.app.services.matching.bm25 import bm25_document, bm25_query, bm25_scores
from backend.app.services.matching.constraints import empty_constraints
from backend.app.services.matching.embed import embed_text
from backend.app.services.matching.ingest import try_ingest_resume
from backend.app.services.matching.skills import (
    expand_query,
    extract_skills,
    related_skills,
)
from backend.app.services.matching.store import SupabaseResumeStore
from backend.app.services.recommend import assert_recruiter_job_access
from supabase import Client

POOL_WARN_N = 500
INGEST_CONCURRENCY_LIMIT = 8


def job_query_text(job: dict[str, Any]) -> str:
    requirements = (job.get("requirements") or "").strip()
    if requirements:
        return requirements
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


def _parse_constraints(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict) and ("must" in raw or "preferred" in raw):
        return {
            "must": list(raw.get("must") or []),
            "preferred": list(raw.get("preferred") or []),
            "mentioned": list(raw.get("mentioned") or []),
            "excluded": list(raw.get("excluded") or []),
        }
    return empty_constraints()


def _bm25_skill_ids(
    job: dict[str, Any], constraints: dict[str, Any], *, confirmed: bool, jd_skills: list[str]
) -> list[str]:
    if confirmed:
        ids: list[str] = []
        for group in constraints.get("must") or []:
            ids.extend(group.get("any_of") or [])
        ids.extend(constraints.get("preferred") or [])
        seen: set[str] = set()
        unique: list[str] = []
        for skill_id in ids:
            if skill_id not in seen:
                seen.add(skill_id)
                unique.append(skill_id)
        return unique
    return jd_skills


def _try_cosine(left: list[float], right: list[float]) -> float | None:
    if len(left) != len(right) or not left:
        return None
    if any(not math.isfinite(value) for value in (*left, *right)):
        return None
    dot = sum(x * y for x, y in zip(left, right, strict=True))
    norm_left = math.sqrt(sum(x * x for x in left))
    norm_right = math.sqrt(sum(y * y for y in right))
    denom = norm_left * norm_right
    if denom == 0.0:
        return None
    return dot / denom


def _as_embedding(raw: Any) -> list[float] | None:
    if isinstance(raw, str):
        try:
            import json
            raw = json.loads(raw)
        except Exception:
            return None
    if not isinstance(raw, list) or not raw:
        return None
    try:
        vector = [float(item) for item in raw]
    except (TypeError, ValueError):
        return None
    return vector


_EMBEDDED_BATCH_CHUNK_SIZE = 100


def _embedded_batch(client: Client, resume_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not resume_ids:
        return {}
    merged: dict[str, dict[str, Any]] = {}
    for i in range(0, len(resume_ids), _EMBEDDED_BATCH_CHUNK_SIZE):
        chunk = resume_ids[i : i + _EMBEDDED_BATCH_CHUNK_SIZE]
        result = (
            client.table("embedded_resumes")
            .select("resume_id, metadata, markdown, clean_markdown, embedding, model")
            .in_("resume_id", chunk)
            .execute()
        )
        rows = result.data or []
        for row in rows:
            if row.get("resume_id"):
                merged[str(row["resume_id"])] = row
    return merged


async def persist_match_resume_rows(
    client: Client,
    job_id: UUID,
    ranked: list[dict[str, Any]],
    *,
    actor_id: UUID,
    query_text: str,
    recruiter_message: str,
    rerank_mode: str,
    rerank_status: str,
    pool_size: int = 0,
    pool_truncated: bool = False,
    dropped_count: int = 0,
    pool_latency_warn: bool = False,
    embedding_mismatch_count: int = 0,
) -> None:
    await assert_recruiter_job_access(client, actor_id, job_id)
    resume_ids = [str(row["resume_id"]) for row in ranked if row.get("resume_id")]
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
                "resume_id": str(resume_id),
                "rank": rank,
                "rrf_rank": row.get("rrf_rank"),
                "rrf_score": row.get("rrf_score"),
                "rerank_score": row.get("rerank_score"),
                "skill_score": row.get("skill_score"),
                "semantic_score": row.get("semantic_score"),
                "matched_skill_names": cv_skills,
                "related_skill_names": related,
                "raw_factors": {
                    "distance_expanded": row.get("distance_expanded"),
                    "bm25_score": row.get("bm25_score"),
                    "constraint_status": row.get("constraint_status"),
                    "soft_delta": row.get("soft_delta"),
                },
            }
        )

    def _insert_run() -> None:
        client.rpc(
            "insert_match_resume_run",
            {
                "p_job_post_id": str(job_id),
                "p_requested_by": str(actor_id),
                "p_query_text": query_text,
                "p_recruiter_message": recruiter_message,
                "p_rerank_mode": rerank_mode,
                "p_rerank_status": rerank_status,
                "p_rerank_model": DEFAULT_RERANK_MODEL if rerank_mode == "qwen" else None,
                "p_rerank_config_version": RERANK_CONFIG_VERSION,
                "p_embedding_model": DEFAULT_EMBED_MODEL,
                "p_matched_resume_ids": resume_ids,
                "p_evidence": evidence,
                "p_pool_size": pool_size,
                "p_pool_truncated": pool_truncated,
                "p_dropped_count": dropped_count,
                "p_pool_latency_warn": pool_latency_warn,
                "p_embedding_mismatch_count": embedding_mismatch_count,
            },
        ).execute()

    await asyncio.to_thread(_insert_run)


async def retrieve_for_job(
    client: Client,
    actor_id: UUID,
    job_id: UUID,
    *,
    encode=None,
    complete=None,
    store: SupabaseResumeStore | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    await assert_recruiter_job_access(client, actor_id, job_id)
    resume_store = store or SupabaseResumeStore(client)

    def _job() -> dict[str, Any] | None:
        result = (
            client.table("job_posts")
            .select(
                "id, title, description, requirements, skill_constraints, skill_constraints_confirmed_at"
            )
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
            .execute()
        )
        return result.data or []

    submits = await asyncio.to_thread(_submits)
    resume_uuids = [UUID(str(row["resume_id"])) for row in submits if row.get("resume_id")]

    ingest_semaphore = asyncio.Semaphore(INGEST_CONCURRENCY_LIMIT)

    async def _ingest_bounded(resume_uuid: UUID) -> None:
        async with ingest_semaphore:
            await try_ingest_resume(
                resume_store,
                resume_uuid,
                encode=encode,
                complete=complete,
                api_key=api_key,
                base_url=base_url,
            )

    await asyncio.gather(*(_ingest_bounded(resume_uuid) for resume_uuid in resume_uuids))

    constraints = _parse_constraints(job.get("skill_constraints"))
    confirmed = job.get("skill_constraints_confirmed_at") is not None
    query_text = job_query_text(job)
    jd_skills_extracted = extract_skills(query_text)
    dense_q = expand_query(query_text, extracted=jd_skills_extracted)
    bm25_skills = _bm25_skill_ids(job, constraints, confirmed=confirmed, jd_skills=jd_skills_extracted)
    bm25_q = bm25_query(str(job.get("title") or ""), bm25_skills)
    query_embedding = embed_text(dense_q, encode=encode, api_key=api_key, base_url=base_url)

    resume_ids = [str(row.get("resume_id") or "") for row in submits if row.get("resume_id")]
    embedded_by_id = await asyncio.to_thread(_embedded_batch, client, resume_ids)

    candidates: list[dict[str, Any]] = []
    docs: list[str] = []
    mismatch = 0
    for row in submits:
        resume_id = str(row.get("resume_id") or "")
        parsed = embedded_by_id.get(resume_id)
        metadata = (parsed or {}).get("metadata") or {}
        verified = list(metadata.get("verified_skills") or [])
        inferred = list(metadata.get("inferred_skills") or [])
        skills = list(metadata.get("skills") or [*verified, *inferred])
        clean = (parsed or {}).get("clean_markdown") or ""
        markdown = (parsed or {}).get("markdown") or ""
        embedding = _as_embedding((parsed or {}).get("embedding"))
        model = (parsed or {}).get("model") or ""
        distance: float | None = None
        if embedding is None or model != DEFAULT_EMBED_MODEL or len(embedding) != DEFAULT_EMBED_DIM:
            if resume_id:
                mismatch += 1
        else:
            cosine = _try_cosine(query_embedding, embedding)
            if cosine is None:
                mismatch += 1
            else:
                distance = 1.0 - cosine
        docs.append(bm25_document(clean or markdown, [*verified, *inferred]))
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
                "verified_skills": verified,
                "inferred_skills": inferred,
                "skill_records": metadata.get("skill_records") or [],
                "ingest_status": metadata.get("ingest_status") or ("ok" if parsed else "missing"),
                "markdown": markdown,
                "clean_markdown": clean,
                "distance_expanded": distance,
                "bm25_score": 0.0,
            }
        )

    scores = bm25_scores(docs, bm25_q) if docs else []
    for row, score in zip(candidates, scores, strict=False):
        row["bm25_score"] = score

    pool_size = len(submits)
    job_description = "\n".join(
        part.strip() for part in (job.get("title"), job.get("description"), job.get("requirements")) if part
    )
    return {
        "jd_skills": jd_skills_extracted,
        "jd_query": query_text,
        "job_description": job_description,
        "dense_query": dense_q,
        "bm25_query": bm25_q,
        "skill_constraints": constraints,
        "constraints_confirmed": confirmed,
        "pool_size": pool_size,
        "pool_truncated": False,
        "dropped_count": 0,
        "pool_latency_warn": pool_size > POOL_WARN_N,
        "embedding_mismatch_count": mismatch,
        "candidates": candidates,
    }
