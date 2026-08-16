from hashlib import sha256
from uuid import uuid4

import pytest

from backend.app.services.matching.ingest import ingest_resume, try_ingest_resume


class _FakeStore:
    def __init__(self, *, resume, blob: bytes, existing=None) -> None:
        self.resume = resume
        self.blob = blob
        self.existing = existing
        self.saved = None
        self.downloads = 0

    async def get_parsed(self, resume_id):
        return self.existing

    async def get_resume(self, resume_id):
        return self.resume

    async def download(self, bucket_id, storage_path):
        self.downloads += 1
        return self.blob

    async def save(self, resume_id, parsed, content_hash, embedding):
        self.saved = {
            "resume_id": resume_id,
            "parsed": parsed,
            "content_hash": content_hash,
            "embedding": embedding,
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
    assert store.saved["parsed"]["metadata"]["skills"] == ["FastAPI"]
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
        existing={"content_hash": digest},
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
