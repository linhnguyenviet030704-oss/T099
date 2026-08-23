from __future__ import annotations

import asyncio
import hashlib
from typing import Any

from backend.app.services.matching.embed import DEFAULT_EMBEDDING_MODEL, embed_text
from backend.app.services.matching.retrieve import job_query_text
from backend.app.services.matching.skills import expand_query, extract_skills
from supabase import Client


def _job_content_hash(job: dict[str, Any]) -> str:
    text = job_query_text(job)
    blob = f"{job.get('title') or ''}\n{text}".encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


def _embedded_jobs_batch(client: Client, job_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not job_ids:
        return {}
    result = (
        client.table("embedded_jobs")
        .select("job_post_id, embedding, model, skills")
        .in_("job_post_id", job_ids)
        .execute()
    )
    rows = result.data or []
    return {str(row["job_post_id"]): row for row in rows if row.get("job_post_id")}


async def try_ingest_job(
    client: Client,
    job: dict[str, Any],
    *,
    encode=None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> None:
    job_id = str(job["id"])
    digest = _job_content_hash(job)

    def _existing() -> dict[str, Any] | None:
        result = (
            client.table("embedded_jobs")
            .select("job_post_id, content_hash")
            .eq("job_post_id", job_id)
            .maybe_single()
            .execute()
        )
        return result.data

    existing = await asyncio.to_thread(_existing)
    if existing and existing.get("content_hash") == digest:
        return

    text = job_query_text(job)
    skills = extract_skills(text)
    embedding = embed_text(expand_query(text), encode=encode, api_key=api_key, base_url=base_url)

    def _save() -> None:
        client.table("embedded_jobs").upsert(
            {
                "job_post_id": job_id,
                "skills": skills,
                "content_hash": digest,
                "embedding": embedding,
                "model": DEFAULT_EMBEDDING_MODEL,
            }
        ).execute()

    await asyncio.to_thread(_save)
