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
                .select("resume_id, markdown, metadata, content_hash, storage_updated_at")
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

    async def get_storage_updated_at(self, bucket_id: str, storage_path: str) -> str | None:
        def _query() -> str | None:
            parts = storage_path.rsplit("/", 1)
            folder, filename = (parts[0], parts[1]) if len(parts) == 2 else ("", parts[0])
            try:
                entries = self._client.storage.from_(bucket_id).list(folder, {"search": filename})
            except Exception:
                return None
            for entry in entries or []:
                if entry.get("name") == filename:
                    updated_at = entry.get("updated_at")
                    return str(updated_at) if updated_at else None
            return None

        return await asyncio.to_thread(_query)

    async def touch_storage_updated_at(self, resume_id: UUID, storage_updated_at: str) -> None:
        rid = str(resume_id)

        def _query() -> None:
            self._client.table("embedded_resumes").update(
                {"storage_updated_at": storage_updated_at}
            ).eq("resume_id", rid).execute()

        await asyncio.to_thread(_query)

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
        storage_updated_at: str | None,
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
                    "storage_updated_at": storage_updated_at,
                }
            ).execute()

        await asyncio.to_thread(_query)
