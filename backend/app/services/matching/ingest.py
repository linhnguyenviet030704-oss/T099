from __future__ import annotations

import hashlib
from typing import Any, Protocol
from uuid import UUID

from backend.app.core.exceptions import NotFoundError
from backend.app.services.matching.embed import embed_text
from backend.app.services.matching.parse import parse_resume_bytes


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


async def ingest_resume(store: ResumeStore, resume_id: UUID, *, encode=None) -> str:
    resume = await store.get_resume(resume_id)
    if not resume:
        raise NotFoundError("Resume not found", code="RESUME_NOT_FOUND")
    blob = await store.download(resume.get("bucket_id") or "resumes", resume["storage_path"])
    digest = hashlib.sha256(blob).hexdigest()
    existing = await store.get_parsed(resume_id)
    if existing and existing.get("content_hash") == digest:
        return "exists"
    parsed = parse_resume_bytes(blob, mime_type=resume.get("mime_type") or "")
    embedding = embed_text(parsed["markdown"], encode=encode)
    await store.save(resume_id, parsed, digest, embedding)
    return "indexed"
