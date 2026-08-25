from __future__ import annotations

from types import SimpleNamespace

import pytest


def _job(**overrides) -> dict:
    base = {
        "id": "job-1",
        "title": "Backend Engineer",
        "description": "Build APIs",
        "requirements": "Python, FastAPI",
    }
    base.update(overrides)
    return base


class _FakeSingleQuery:
    def __init__(self, row: dict | None) -> None:
        self._row = row
        self.eq_args: tuple | None = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column: str, value: str):
        self.eq_args = (column, value)
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return SimpleNamespace(data=self._row)


class _FakeUpsertQuery:
    def __init__(self) -> None:
        self.upserted: dict | None = None

    def upsert(self, payload: dict):
        self.upserted = payload
        return self

    def execute(self):
        return SimpleNamespace(data=None)


class _FakeIngestClient:
    """Routes .table('embedded_jobs') to a select-fake first, then an
    upsert-fake once .select() has already been consumed once (mirrors how
    try_ingest_job first reads, then upserts, in two separate .table() calls)."""

    def __init__(self, existing_row: dict | None) -> None:
        self.select_query = _FakeSingleQuery(existing_row)
        self.upsert_query = _FakeUpsertQuery()
        self.calls = 0

    def table(self, name: str):
        assert name == "embedded_jobs"
        self.calls += 1
        return self.select_query if self.calls == 1 else self.upsert_query


def _encode(_text: str) -> list[float]:
    return [0.0] * 1536


@pytest.mark.asyncio
async def test_try_ingest_job_skips_when_content_hash_matches():
    from backend.app.services.matching.ingest_jobs import _job_content_hash, try_ingest_job

    job = _job()
    digest = _job_content_hash(job)
    client = _FakeIngestClient({"job_post_id": "job-1", "content_hash": digest})

    await try_ingest_job(client, job, encode=_encode)

    assert client.upsert_query.upserted is None


@pytest.mark.asyncio
async def test_try_ingest_job_embeds_and_upserts_when_hash_differs():
    from backend.app.services.matching.ingest_jobs import try_ingest_job

    job = _job()
    client = _FakeIngestClient({"job_post_id": "job-1", "content_hash": "stale"})

    await try_ingest_job(client, job, encode=_encode)

    assert client.upsert_query.upserted is not None
    payload = client.upsert_query.upserted
    assert payload["job_post_id"] == "job-1"
    assert "python" in payload["skills"] or "fastapi" in payload["skills"]
    assert payload["embedding"] == [0.0] * 1536


@pytest.mark.asyncio
async def test_try_ingest_job_embeds_when_no_existing_row():
    from backend.app.services.matching.ingest_jobs import try_ingest_job

    job = _job()
    client = _FakeIngestClient(None)

    await try_ingest_job(client, job, encode=_encode)

    assert client.upsert_query.upserted is not None


class _FakePrefetchedClient:
    """A client that only supports upserts. Any read attempt raises, which is
    exactly the assertion we want when the caller prefetched the cached row:
    try_ingest_job must not fall back to its own point read."""

    def __init__(self) -> None:
        self.upsert_query = _FakeUpsertQuery()
        self.calls = 0

    def table(self, name: str):
        assert name == "embedded_jobs"
        self.calls += 1
        return self.upsert_query


@pytest.mark.asyncio
async def test_try_ingest_job_skips_point_read_when_prefetched_hash_matches():
    from backend.app.services.matching.ingest_jobs import _job_content_hash, try_ingest_job

    job = _job()
    digest = _job_content_hash(job)
    client = _FakePrefetchedClient()

    result = await try_ingest_job(
        client, job, existing_row={"job_post_id": "job-1", "content_hash": digest}, encode=_encode
    )

    assert result is None
    assert client.calls == 0  # no point read, no upsert
    assert client.upsert_query.upserted is None


@pytest.mark.asyncio
async def test_try_ingest_job_embeds_when_prefetched_hash_is_stale():
    from backend.app.services.matching.ingest_jobs import try_ingest_job

    job = _job()
    client = _FakePrefetchedClient()

    result = await try_ingest_job(
        client, job, existing_row={"job_post_id": "job-1", "content_hash": "stale"}, encode=_encode
    )

    # the only .table() call is the upsert -- the select was skipped
    assert client.calls == 1
    assert client.upsert_query.upserted is not None
    assert result is not None
    assert result["job_post_id"] == "job-1"
    assert result["embedding"] == [0.0] * 1536


@pytest.mark.asyncio
async def test_try_ingest_job_embeds_when_prefetched_row_is_absent():
    from backend.app.services.matching.ingest_jobs import try_ingest_job

    job = _job()
    client = _FakePrefetchedClient()

    result = await try_ingest_job(client, job, existing_row=None, encode=_encode)

    assert client.calls == 1  # no point read; straight to upsert
    assert result is not None
    assert result["content_hash"]


@pytest.mark.asyncio
async def test_try_ingest_job_swallows_and_retries_transient_failures(monkeypatch):
    from backend.app.services.matching import ingest_jobs as module

    attempts: list[int] = []

    def _boom(*_a, **_k):
        attempts.append(1)
        raise RuntimeError("embedding api down")

    monkeypatch.setattr(module, "embed_text", _boom)
    monkeypatch.setattr(module, "_BACKOFF_BASE_SECONDS", 0.0)

    client = _FakePrefetchedClient()
    result = await module.try_ingest_job(client, _job(), existing_row=None, encode=_encode)

    assert result is None  # degraded, not raised
    assert len(attempts) == module._MAX_ATTEMPTS
    assert client.upsert_query.upserted is None


class _FakeInQuery:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows
        self.in_args: tuple | None = None

    def select(self, *_args, **_kwargs):
        return self

    def in_(self, column: str, values: list[str]):
        self.in_args = (column, values)
        return self

    def execute(self):
        return SimpleNamespace(data=self._rows)


class _FakeInClient:
    def __init__(self, rows: list[dict]) -> None:
        self.query = _FakeInQuery(rows)

    def table(self, _name: str):
        return self.query


def test_embedded_jobs_batch_fetches_all_ids_in_one_query():
    from backend.app.services.matching.ingest_jobs import _embedded_jobs_batch

    rows = [
        {"job_post_id": "j1", "skills": ["python"]},
        {"job_post_id": "j2", "skills": ["java"]},
    ]
    client = _FakeInClient(rows)
    result = _embedded_jobs_batch(client, ["j1", "j2"])
    assert client.query.in_args == ("job_post_id", ["j1", "j2"])
    assert result["j1"]["skills"] == ["python"]
    assert result["j2"]["skills"] == ["java"]


def test_embedded_jobs_batch_returns_empty_dict_for_empty_ids():
    from backend.app.services.matching.ingest_jobs import _embedded_jobs_batch

    assert _embedded_jobs_batch(_FakeInClient([]), []) == {}


class _FakeChunkedInQuery:
    def __init__(self, rows_by_id: dict[str, dict], calls: list[tuple]) -> None:
        self._rows_by_id = rows_by_id
        self._calls = calls
        self._values: list[str] | None = None

    def select(self, *_args, **_kwargs):
        return self

    def in_(self, column: str, values: list[str]):
        self._calls.append((column, list(values)))
        self._values = list(values)
        return self

    def execute(self):
        rows = [self._rows_by_id[v] for v in (self._values or []) if v in self._rows_by_id]
        return SimpleNamespace(data=rows)


class _FakeChunkedInClient:
    """Records every `.in_()` call (not just the last) so chunking across
    multiple table()/in_() invocations can be asserted."""

    def __init__(self, rows_by_id: dict[str, dict]) -> None:
        self._rows_by_id = rows_by_id
        self.calls: list[tuple] = []

    def table(self, _name: str):
        return _FakeChunkedInQuery(self._rows_by_id, self.calls)


def test_embedded_jobs_batch_chunks_large_id_lists():
    from backend.app.services.matching.ingest_jobs import _embedded_jobs_batch

    job_ids = [f"j{i}" for i in range(200)]
    rows_by_id = {jid: {"job_post_id": jid, "skills": [jid]} for jid in job_ids}
    client = _FakeChunkedInClient(rows_by_id)

    result = _embedded_jobs_batch(client, job_ids)

    assert len(client.calls) == 2
    assert [len(values) for _column, values in client.calls] == [100, 100]
    assert all(column == "job_post_id" for column, _values in client.calls)
    # the chunks together cover every id
    covered = [value for _column, values in client.calls for value in values]
    assert covered == job_ids
    assert len(result) == 200
    assert result["j0"]["skills"] == ["j0"]
    assert result["j199"]["skills"] == ["j199"]
