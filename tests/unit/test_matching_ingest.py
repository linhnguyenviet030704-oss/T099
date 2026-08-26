from hashlib import sha256
from uuid import uuid4

import pytest

from backend.app.services.matching.ingest import ingest_resume, try_ingest_resume
from backend.app.services.matching.skills import taxonomy_version
from backend.app.services.matching.summarize import SUMMARIZE_PROMPT_VERSION


class _FakeStore:
    def __init__(self, *, resume, blob: bytes, existing=None, storage_updated_at="2026-08-26T00:00:00Z") -> None:
        self.resume = resume
        self.blob = blob
        self.existing = existing
        self.storage_updated_at = storage_updated_at
        self.saved = None
        self.touched = None
        self.downloads = 0
        self.storage_meta_calls = 0

    async def get_parsed(self, resume_id):
        return self.existing

    async def get_resume(self, resume_id):
        return self.resume

    async def get_storage_updated_at(self, bucket_id, storage_path):
        self.storage_meta_calls += 1
        return self.storage_updated_at

    async def touch_storage_updated_at(self, resume_id, storage_updated_at):
        self.touched = {"resume_id": resume_id, "storage_updated_at": storage_updated_at}

    async def download(self, bucket_id, storage_path):
        self.downloads += 1
        return self.blob

    async def save(self, resume_id, parsed, content_hash, embedding, storage_updated_at):
        self.saved = {
            "resume_id": resume_id,
            "parsed": parsed,
            "content_hash": content_hash,
            "embedding": embedding,
            "storage_updated_at": storage_updated_at,
        }


def _encode(text: str) -> list[float]:
    return [float((i + len(text)) % 7) for i in range(1536)]


def _complete(_prompt: str, **_kwargs) -> str:
    return '{"summary": "Python API engineer.", "titles": ["Backend"], "body": "Built FastAPI services."}'


@pytest.mark.asyncio
async def test_ingest_parses_and_saves_first_time():
    resume_id = uuid4()
    blob = b"Python FastAPI engineer"
    store = _FakeStore(
        resume={
            "id": str(resume_id),
            "bucket_id": "resumes",
            "storage_path": "u/cv.txt",
            "mime_type": "text/plain",
        },
        blob=blob,
    )
    status = await ingest_resume(store, resume_id, encode=_encode, complete=_complete)
    assert status == "indexed"
    assert store.saved is not None
    assert store.saved["content_hash"] == sha256(blob).hexdigest()
    assert store.saved["storage_updated_at"] == "2026-08-26T00:00:00Z"
    assert set(store.saved["parsed"]["metadata"]["skills"]) == {"python", "fastapi"}
    assert store.saved["parsed"]["metadata"]["summary"] == "Python API engineer."
    assert "summary:" not in store.saved["parsed"]["markdown"]
    assert "Built FastAPI services." in store.saved["parsed"]["markdown"]
    assert len(store.saved["embedding"]) == 1536


@pytest.mark.asyncio
async def test_ingest_skips_when_hash_matches():
    resume_id = uuid4()
    blob = b"same cv"
    digest = sha256(blob).hexdigest()
    store = _FakeStore(
        resume={
            "id": str(resume_id),
            "bucket_id": "resumes",
            "storage_path": "u/cv.txt",
            "mime_type": "text/plain",
        },
        blob=blob,
        existing={
            "content_hash": digest,
            "metadata": {
                "taxonomy_version": taxonomy_version(),
                "summary_prompt_version": SUMMARIZE_PROMPT_VERSION,
            },
        },
    )
    status = await ingest_resume(store, resume_id, encode=_encode, complete=_complete)
    assert status == "exists"
    assert store.saved is None
    assert store.downloads == 1


@pytest.mark.asyncio
async def test_ingest_reindexes_when_file_changed():
    resume_id = uuid4()
    blob = b"Python FastAPI"
    store = _FakeStore(
        resume={
            "id": str(resume_id),
            "bucket_id": "resumes",
            "storage_path": "u/cv.txt",
            "mime_type": "text/plain",
        },
        blob=blob,
        existing={"content_hash": "old"},
    )
    status = await ingest_resume(store, resume_id, encode=_encode, complete=_complete)
    assert status == "indexed"
    assert store.saved["content_hash"] == sha256(blob).hexdigest()
    assert store.saved["storage_updated_at"] == "2026-08-26T00:00:00Z"


@pytest.mark.asyncio
async def test_try_ingest_skips_missing_storage_object():
    resume_id = uuid4()

    class _MissingFile(_FakeStore):
        async def download(self, bucket_id, storage_path):
            raise RuntimeError("Object not found")

    store = _MissingFile(
        resume={
            "id": str(resume_id),
            "bucket_id": "resumes",
            "storage_path": "missing/cv-mock.pdf",
            "mime_type": "application/pdf",
        },
        blob=b"",
    )
    assert await try_ingest_resume(store, resume_id, encode=_encode, complete=_complete) is None
    assert store.saved is None


@pytest.mark.asyncio
async def test_ingest_skips_download_when_storage_timestamp_unchanged():
    resume_id = uuid4()
    blob = b"same cv"
    digest = sha256(blob).hexdigest()
    store = _FakeStore(
        resume={
            "id": str(resume_id),
            "bucket_id": "resumes",
            "storage_path": "u/cv.txt",
            "mime_type": "text/plain",
        },
        blob=blob,
        existing={
            "content_hash": digest,
            "storage_updated_at": "2026-08-26T00:00:00Z",
            "metadata": {
                "taxonomy_version": taxonomy_version(),
                "summary_prompt_version": SUMMARIZE_PROMPT_VERSION,
            },
        },
        storage_updated_at="2026-08-26T00:00:00Z",
    )
    status = await ingest_resume(store, resume_id, encode=_encode, complete=_complete)
    assert status == "exists"
    assert store.saved is None
    assert store.downloads == 0
    assert store.storage_meta_calls == 1


@pytest.mark.asyncio
async def test_ingest_falls_back_to_download_when_storage_timestamp_changed():
    resume_id = uuid4()
    blob = b"same cv"
    digest = sha256(blob).hexdigest()
    store = _FakeStore(
        resume={
            "id": str(resume_id),
            "bucket_id": "resumes",
            "storage_path": "u/cv.txt",
            "mime_type": "text/plain",
        },
        blob=blob,
        existing={
            "content_hash": digest,
            "storage_updated_at": "2026-08-01T00:00:00Z",
            "metadata": {
                "taxonomy_version": taxonomy_version(),
                "summary_prompt_version": SUMMARIZE_PROMPT_VERSION,
            },
        },
        storage_updated_at="2026-08-26T00:00:00Z",
    )
    status = await ingest_resume(store, resume_id, encode=_encode, complete=_complete)
    assert status == "exists"  # bytes are still the same, just detected the slow way
    assert store.downloads == 1
    assert store.touched == {"resume_id": resume_id, "storage_updated_at": "2026-08-26T00:00:00Z"}
    # storage_updated_at is read once (before download) and reused for the
    # touch check, not fetched again afterward.
    assert store.storage_meta_calls == 1


@pytest.mark.asyncio
async def test_ingest_falls_back_to_download_when_storage_metadata_unavailable():
    resume_id = uuid4()
    blob = b"same cv"
    digest = sha256(blob).hexdigest()

    class _NoMeta(_FakeStore):
        async def get_storage_updated_at(self, bucket_id, storage_path):
            self.storage_meta_calls += 1
            return None

    store = _NoMeta(
        resume={
            "id": str(resume_id),
            "bucket_id": "resumes",
            "storage_path": "u/cv.txt",
            "mime_type": "text/plain",
        },
        blob=blob,
        existing={
            "content_hash": digest,
            "storage_updated_at": "2026-08-26T00:00:00Z",
            "metadata": {
                "taxonomy_version": taxonomy_version(),
                "summary_prompt_version": SUMMARIZE_PROMPT_VERSION,
            },
        },
    )
    status = await ingest_resume(store, resume_id, encode=_encode, complete=_complete)
    assert status == "exists"
    assert store.downloads == 1  # missing metadata must never skip the correctness-critical hash check
    # A single lookup attempt up front, not a retry after download.
    assert store.storage_meta_calls == 1
