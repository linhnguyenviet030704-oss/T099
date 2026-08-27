from __future__ import annotations

import asyncio
import hashlib
from typing import Any, Protocol
from uuid import UUID

from backend.app.agents.ingest.graph import build_ingest_graph
from backend.app.core.exceptions import NotFoundError
from backend.app.observability.logger import get_logger, request_id_ctx
from backend.app.services.matching.skills import taxonomy_version
from backend.app.services.matching.summarize import SUMMARIZE_PROMPT_VERSION

logger = get_logger(__name__)


class ResumeStore(Protocol):
    async def get_parsed(self, resume_id: UUID) -> dict[str, Any] | None: ...

    async def get_resume(self, resume_id: UUID) -> dict[str, Any] | None: ...

    async def get_storage_updated_at(self, bucket_id: str, storage_path: str) -> str | None: ...

    async def touch_storage_updated_at(self, resume_id: UUID, storage_updated_at: str) -> None: ...

    async def download(self, bucket_id: str, storage_path: str) -> bytes: ...

    async def save(
        self,
        resume_id: UUID,
        parsed: dict[str, Any],
        content_hash: str,
        embedding: list[float],
        storage_updated_at: str | None,
    ) -> None: ...


async def ingest_resume(
    store: ResumeStore,
    resume_id: UUID,
    *,
    encode=None,
    complete=None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> str:
    resume = await store.get_resume(resume_id)
    if not resume:
        raise NotFoundError("Resume not found", code="RESUME_NOT_FOUND")
    bucket_id = resume.get("bucket_id") or "resumes"
    storage_path = resume["storage_path"]

    existing = await store.get_parsed(resume_id)
    meta = (existing or {}).get("metadata") or {}
    versions_current = (
        meta.get("taxonomy_version") == taxonomy_version()
        and meta.get("summary_prompt_version") == SUMMARIZE_PROMPT_VERSION
    )

    # Read the storage object's freshness token once, before downloading —
    # not after. This makes a replace-during-download race resolve toward
    # "treat as changed, re-check" rather than "treat as unchanged forever":
    # if the object is replaced after this read, the *next* call's live
    # lookup won't match what we stored here, and correctly falls through
    # to a full re-check. Reading it after download (the original version)
    # could persist (old-bytes-hash, new-file-timestamp), which would then
    # match forever and silently serve stale data — this ordering also
    # collapses what used to be two separate get_storage_updated_at calls.
    storage_updated_at = await store.get_storage_updated_at(bucket_id, storage_path)

    # Fast path: the storage object's own updated_at proves it hasn't
    # changed since we last hashed it, so skip the download+hash entirely.
    # Never trust a missing/failed metadata lookup as "unchanged" — only a
    # positive, matching timestamp short-circuits here.
    if (
        existing
        and versions_current
        and existing.get("storage_updated_at")
        and storage_updated_at is not None
        and storage_updated_at == existing["storage_updated_at"]
    ):
        return "exists"

    blob = await store.download(bucket_id, storage_path)
    digest = hashlib.sha256(blob).hexdigest()
    if existing and existing.get("content_hash") == digest and versions_current:
        if storage_updated_at is not None and storage_updated_at != existing.get("storage_updated_at"):
            await store.touch_storage_updated_at(resume_id, storage_updated_at)
        return "exists"

    graph = build_ingest_graph(encode=encode, complete=complete, api_key=api_key, base_url=base_url)
    rid = request_id_ctx.get() or "-"
    result = await graph.ainvoke(
        {
            "raw_bytes": blob,
            "mime_type": resume.get("mime_type") or "",
        },
        config={
            "run_name": "ingest_resume_pipeline",
            "tags": ["ingest", "resume"],
            "metadata": {
                "request_id": rid,
                "resume_id": str(resume_id),
            },
        },
    )
    parsed = {
        "markdown": result.get("markdown") or "",
        "clean_markdown": result.get("clean_markdown") or "",
        "metadata": result.get("metadata") or {},
    }
    await store.save(resume_id, parsed, digest, list(result.get("embedding") or []), storage_updated_at)
    return "indexed"


_MAX_ATTEMPTS = 3
_BACKOFF_BASE_SECONDS = 0.2


async def try_ingest_resume(
    store: ResumeStore,
    resume_id: UUID,
    *,
    encode=None,
    complete=None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> str | None:
    """Retries transient failures (LLM/embedding/storage hiccups) before
    giving up. A missing resume is not transient, so it fails fast."""
    last_exc: Exception | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            return await ingest_resume(
                store,
                resume_id,
                encode=encode,
                complete=complete,
                api_key=api_key,
                base_url=base_url,
            )
        except NotFoundError:
            logger.warning("ingest skipped resume_id=%s reason=not_found", resume_id)
            return None
        except Exception as exc:  # noqa: BLE001 - retry loop decides fate
            last_exc = exc
            if attempt == _MAX_ATTEMPTS:
                break
            logger.warning(
                "ingest attempt %s/%s failed resume_id=%s error=%s; retrying",
                attempt,
                _MAX_ATTEMPTS,
                resume_id,
                exc,
            )
            await asyncio.sleep(_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))

    logger.exception(
        "ingest failed after %s attempts resume_id=%s",
        _MAX_ATTEMPTS,
        resume_id,
        exc_info=last_exc,
    )
    return None
