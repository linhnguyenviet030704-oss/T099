from __future__ import annotations

import asyncio
import hashlib
from typing import Any, Protocol
from uuid import UUID

from backend.app.agents.ingest.graph import build_ingest_graph
from backend.app.config.models import DEFAULT_EMBED_DIM
from backend.app.core.exceptions import AppError, BadRequestError, NotFoundError
from backend.app.guardrails.input import MAX_CV_BYTES, validate_file
from backend.app.guardrails.output import validate_embedding
from backend.app.observability.logger import get_logger, request_id_ctx
from backend.app.services.matching.skills import taxonomy_version
from backend.app.services.matching.summarize import SUMMARIZE_PROMPT_VERSION

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
    validated_file = validate_file(
        blob,
        declared_mime=resume.get("mime_type") or "",
        max_bytes=MAX_CV_BYTES,
    )
    blob = validated_file.data
    digest = hashlib.sha256(blob).hexdigest()
    existing = await store.get_parsed(resume_id)
    meta = (existing or {}).get("metadata") or {}
    if (
        existing
        and existing.get("content_hash") == digest
        and meta.get("taxonomy_version") == taxonomy_version()
        and meta.get("summary_prompt_version") == SUMMARIZE_PROMPT_VERSION
    ):
        return "exists"
    graph = build_ingest_graph(encode=encode, complete=complete, api_key=api_key, base_url=base_url)
    rid = request_id_ctx.get() or "-"
    result = await graph.ainvoke(
        {
            "raw_bytes": blob,
            "mime_type": validated_file.detected_mime,
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
    guarded_embedding = validate_embedding(
        list(result.get("embedding") or []),
        expected_dimension=DEFAULT_EMBED_DIM,
    )
    if guarded_embedding.action == "block":
        raise BadRequestError("Embedding không hợp lệ", code="OUTPUT_INVALID_SCHEMA")
    await store.save(resume_id, parsed, digest, guarded_embedding.value)
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
        except AppError as exc:
            logger.warning("ingest blocked resume_id=%s code=%s", resume_id, exc.code)
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
