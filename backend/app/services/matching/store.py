from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

from backend.app.services.matching.embed import DEFAULT_EMBEDDING_MODEL
from supabase import Client


class SupabaseResumeStore:
    def __init__(self, client: Client) -> None:
        self._client = client

    async def get_parsed(self, resume_id: UUID) -> dict[str, Any] | None:
        def _query() -> dict[str, Any] | None:
            result = (
                self._client.table("embedded_resumes")
                .select("resume_id, markdown, metadata, content_hash")
                .eq("resume_id", str(resume_id))
                .maybe_single()
                .execute()
            )
            return result.data if result else None

        return await asyncio.to_thread(_query)

    async def get_resume(self, resume_id: UUID) -> dict[str, Any] | None:
        def _query() -> dict[str, Any] | None:
            result = (
                self._client.table("resumes")
                .select("id, user_id, bucket_id, storage_path, mime_type")
                .eq("id", str(resume_id))
                .maybe_single()
                .execute()
            )
            return result.data if result else None

        return await asyncio.to_thread(_query)

    async def download(self, bucket_id: str, storage_path: str) -> bytes:
        def _query() -> bytes:
            data = self._client.storage.from_(bucket_id).download(storage_path)
            if isinstance(data, bytes):
                return data
            return bytes(data)

        return await asyncio.to_thread(_query)

    async def save(
        self,
        resume_id: UUID,
        parsed: dict[str, Any],
        content_hash: str,
        embedding: list[float],
    ) -> None:
        rid = str(resume_id)

        def _query() -> None:
            self._client.table("embedded_resumes").upsert(
                {
                    "resume_id": rid,
                    "markdown": parsed["markdown"],
                    "clean_markdown": parsed.get("clean_markdown") or "",
                    "metadata": parsed["metadata"],
                    "content_hash": content_hash,
                    "embedding": embedding,
                    "model": DEFAULT_EMBEDDING_MODEL,
                }
            ).execute()

        await asyncio.to_thread(_query)
