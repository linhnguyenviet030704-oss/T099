from __future__ import annotations

import hashlib
from typing import Any, Protocol
from uuid import UUID

from backend.app.agents.ingest.graph import build_ingest_graph
from backend.app.core.exceptions import NotFoundError
from backend.app.observability.logger import get_logger

logger = get_logger(__name__)


class ResumeStore(Protocol):
    async def get_parsed(self, resume_id: UUID) -> dict[str, Any] | None: ...

    async def get_resume(self, resume_id: UUID) -> dict[str, Any] | None: ...

    async def download(self, bucket_id: str, storage_path: str) -> bytes: ...

    async def save(
        self,
        resume_id: UUID,
        parsed: dict[str, Any],
        content_hash: str,
        embedding: list[float],
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
    blob = await store.download(resume.get("bucket_id") or "resumes", resume["storage_path"])
    digest = hashlib.sha256(blob).hexdigest()
    existing = await store.get_parsed(resume_id)
    if existing and existing.get("content_hash") == digest:
        return "exists"
    graph = build_ingest_graph(encode=encode, complete=complete, api_key=api_key, base_url=base_url)
    result = await graph.ainvoke(
        {
            "raw_bytes": blob,
            "mime_type": resume.get("mime_type") or "",
        }
    )
    parsed = {"markdown": result.get("markdown") or "", "metadata": result.get("metadata") or {}}
    await store.save(resume_id, parsed, digest, list(result.get("embedding") or []))
    return "indexed"


async def try_ingest_resume(
    store: ResumeStore,
    resume_id: UUID,
    *,
    encode=None,
    complete=None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> str | None:
    try:
        return await ingest_resume(
            store,
            resume_id,
            encode=encode,
            complete=complete,
            api_key=api_key,
            base_url=base_url,
        )
    except Exception:
        logger.exception("ingest skipped resume_id=%s", resume_id)
        return None
