from __future__ import annotations

import asyncio
import hashlib
from typing import Any

from backend.app.observability.logger import get_logger
from backend.app.services.matching.embed import DEFAULT_EMBEDDING_MODEL, embed_text
from backend.app.services.matching.ingest import _BACKOFF_BASE_SECONDS, _MAX_ATTEMPTS
from backend.app.services.matching.retrieve import (
    _EMBEDDED_BATCH_CHUNK_SIZE,
    job_query_text,
)
from backend.app.services.matching.skills import expand_query, extract_skills
from supabase import Client

logger = get_logger(__name__)

# Distinguishes "caller has no prefetched answer, do your own read" from
# "caller prefetched and there is genuinely no cached row" -- a plain None
# default cannot tell those apart, and would make every cold-cache job pay
# for a redundant point-read on top of the caller's batch read.
_NOT_PREFETCHED: Any = object()


def _job_content_hash(job: dict[str, Any]) -> str:
    text = job_query_text(job)
    blob = f"{job.get('title') or ''}\n{text}".encode()
    return hashlib.sha256(blob).hexdigest()


def _embedded_jobs_batch(client: Client, job_ids: list[str]) -> dict[str, dict[str, Any]]:
    """One read of embedded_jobs for a whole job pool. Chunked because
    PostgREST passes `in_` filters in the query string, and the caller's pool
    can be larger than a single URL comfortably holds."""
    if not job_ids:
        return {}
    merged: dict[str, dict[str, Any]] = {}
    for i in range(0, len(job_ids), _EMBEDDED_BATCH_CHUNK_SIZE):
        chunk = job_ids[i : i + _EMBEDDED_BATCH_CHUNK_SIZE]
        result = (
            client.table("embedded_jobs")
            .select("job_post_id, embedding, model, skills, content_hash")
            .in_("job_post_id", chunk)
            .execute()
        )
        rows = result.data or []
        for row in rows:
            if row.get("job_post_id"):
                merged[str(row["job_post_id"])] = row
    return merged


async def ingest_job(
    client: Client,
    job: dict[str, Any],
    *,
    existing_row: Any = _NOT_PREFETCHED,
    encode=None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> dict[str, Any] | None:
    """Embed + upsert one job when its content hash changed.

    Returns the row written to embedded_jobs, or None when the cached row is
    already current. Pass `existing_row` (the job's embedded_jobs row, or None
    if it has none) to reuse a caller-side batch read instead of doing a
    per-job point read; omit it and this does its own read.
    """
    job_id = str(job["id"])
    digest = _job_content_hash(job)

    if existing_row is _NOT_PREFETCHED:

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
    else:
        existing = existing_row

    if existing and existing.get("content_hash") == digest:
        return None

    text = job_query_text(job)
    skills = extract_skills(text)
    embedding = await asyncio.to_thread(
        embed_text, expand_query(text), encode=encode, api_key=api_key, base_url=base_url
    )
    row = {
        "job_post_id": job_id,
        "skills": skills,
        "content_hash": digest,
        "embedding": embedding,
        "model": DEFAULT_EMBEDDING_MODEL,
    }

    def _save() -> None:
        client.table("embedded_jobs").upsert(row).execute()

    await asyncio.to_thread(_save)
    return row


async def try_ingest_job(
    client: Client,
    job: dict[str, Any],
    *,
    existing_row: Any = _NOT_PREFETCHED,
    encode=None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> dict[str, Any] | None:
    """Retries transient failures (embedding/storage hiccups) before giving up,
    and never raises: this runs fanned out over a whole job pool, so one bad
    job must degrade to a missing embedding, not abort every other job."""
    job_id = str(job.get("id") or "")
    last_exc: Exception | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            return await ingest_job(
                client,
                job,
                existing_row=existing_row,
                encode=encode,
                api_key=api_key,
                base_url=base_url,
            )
        except Exception as exc:  # noqa: BLE001 - retry loop decides fate
            last_exc = exc
            if attempt == _MAX_ATTEMPTS:
                break
            logger.warning(
                "job ingest attempt %s/%s failed job_id=%s error=%s; retrying",
                attempt,
                _MAX_ATTEMPTS,
                job_id,
                exc,
            )
            await asyncio.sleep(_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))

    logger.exception(
        "job ingest failed after %s attempts job_id=%s",
        _MAX_ATTEMPTS,
        job_id,
        exc_info=last_exc,
    )
    return None
