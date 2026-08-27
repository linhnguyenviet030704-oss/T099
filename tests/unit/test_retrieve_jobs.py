from __future__ import annotations

import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest


def test_cv_query_text_prefers_titles_over_full_cv_text():
    from backend.app.services.matching.retrieve_jobs import _cv_query_text

    fields = {"titles": ["Backend Developer", "API Engineer"], "summary": "Some summary."}
    result = _cv_query_text(fields, "very long noisy full CV markdown text goes here")

    assert result == "Backend Developer API Engineer"


def test_cv_query_text_falls_back_to_summary_when_no_titles():
    from backend.app.services.matching.retrieve_jobs import _cv_query_text

    fields = {"titles": [], "summary": "Backend engineer, 3 years Python/FastAPI."}
    result = _cv_query_text(fields, "very long noisy full CV markdown text goes here")

    assert result == "Backend engineer, 3 years Python/FastAPI."


def test_cv_query_text_falls_back_to_full_text_when_nothing_else_available():
    from backend.app.services.matching.retrieve_jobs import _cv_query_text

    fields: dict = {}
    result = _cv_query_text(fields, "very long noisy full CV markdown text goes here")

    assert result == "very long noisy full CV markdown text goes here"


class _Query:
    """Generic chainable fake: records every .eq()/.is_()/.order()/.limit()
    call and returns canned `data` from .execute()/.maybe_single().execute()."""

    def __init__(self, data):
        self._data = data

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def is_(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def in_(self, *_a, **_k):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return SimpleNamespace(data=self._data)


class _RoutingClient:
    def __init__(self, table_data: dict) -> None:
        self._table_data = table_data

    def table(self, name: str):
        return _Query(self._table_data.get(name))


@pytest.mark.asyncio
async def test_returns_none_when_no_default_resume():
    from backend.app.services.matching.retrieve_jobs import retrieve_jobs_for_resume

    client = _RoutingClient({"resumes": None})
    result = await retrieve_jobs_for_resume(client, uuid4())
    assert result is None


@pytest.mark.asyncio
async def test_returns_none_when_ingest_fails(monkeypatch):
    from backend.app.services.matching import retrieve_jobs as module

    client = _RoutingClient({"resumes": {"id": str(uuid4())}})

    async def _fail_ingest(*_a, **_k):
        return None

    monkeypatch.setattr(module, "try_ingest_resume", _fail_ingest)

    result = await module.retrieve_jobs_for_resume(client, uuid4())
    assert result is None


@pytest.mark.asyncio
async def test_builds_job_rows_with_scores(monkeypatch):
    from backend.app.services.matching import retrieve_jobs as module

    resume_id = str(uuid4())
    job_id = str(uuid4())
    table_data = {
        "resumes": {"id": resume_id},
        "embedded_resumes": {
            "markdown": "Python dev",
            "clean_markdown": "Python dev",
            "metadata": {
                "skills": ["python"],
                "verified_skills": ["python"],
                "skill_records": [{"id": "python", "status": "verified"}],
                "ingest_status": "ok",
            },
            "embedding": [1.0] + [0.0] * 1535,
            "model": "qwen3.7-text-embedding",
        },
        "job_posts": [
            {
                "id": job_id,
                "title": "Backend Engineer",
                "description": "Build APIs",
                "requirements": "Python",
                "location": "Hà Nội",
                "employment_type": "full_time",
                "salary_min": None,
                "salary_max": None,
                "currency": "VND",
                "skill_constraints": {},
                "skill_constraints_confirmed_at": None,
                "companies": {"name": "Acme"},
            }
        ],
        "embedded_jobs": [
            {
                "job_post_id": job_id,
                "embedding": [1.0] + [0.0] * 1535,
                "model": "qwen3.7-text-embedding",
                "skills": ["python"],
            }
        ],
    }
    client = _RoutingClient(table_data)

    async def _ok_ingest(*_a, **_k):
        return "exists"

    async def _ok_ingest_job(*_a, **_k):
        return None

    monkeypatch.setattr(module, "try_ingest_resume", _ok_ingest)
    monkeypatch.setattr(module, "try_ingest_job", _ok_ingest_job)

    result = await module.retrieve_jobs_for_resume(client, uuid4())

    assert result is not None
    assert result["cv_skills"] == ["python"]
    assert result["cv_verified"] == ["python"]
    assert result["cv_has_evidence"] is True
    assert len(result["candidates"]) == 1
    row = result["candidates"][0]
    assert row["job_id"] == job_id
    assert row["title"] == "Backend Engineer"
    assert row["company_name"] == "Acme"
    assert row["skills"] == ["python"]
    assert row["distance_expanded"] == pytest.approx(0.0, abs=1e-6)


def _table_data_with_jobs(resume_id: str, job_ids: list[str]) -> dict:
    return {
        "resumes": {"id": resume_id},
        "embedded_resumes": {
            "markdown": "Python dev",
            "clean_markdown": "Python dev",
            "metadata": {"skills": ["python"], "verified_skills": ["python"]},
            "embedding": [1.0] + [0.0] * 1535,
            "model": "qwen3.7-text-embedding",
        },
        "job_posts": [
            {
                "id": jid,
                "title": "Backend Engineer",
                "description": "Build APIs",
                "requirements": "Python",
                "skill_constraints": {},
                "skill_constraints_confirmed_at": None,
                "companies": {"name": "Acme"},
            }
            for jid in job_ids
        ],
        "embedded_jobs": [],
    }


@pytest.mark.asyncio
async def test_job_ingest_fanout_is_concurrency_bounded(monkeypatch):
    from backend.app.services.matching import retrieve_jobs as module

    job_ids = [str(uuid4()) for _ in range(50)]
    client = _RoutingClient(_table_data_with_jobs(str(uuid4()), job_ids))

    async def _ok_ingest(*_a, **_k):
        return "exists"

    live = 0
    peak = 0

    async def _slow_ingest_job(*_a, **_k):
        nonlocal live, peak
        live += 1
        peak = max(peak, live)
        try:
            await asyncio.sleep(0)
            await asyncio.sleep(0)
        finally:
            live -= 1
        return None

    monkeypatch.setattr(module, "try_ingest_resume", _ok_ingest)
    monkeypatch.setattr(module, "try_ingest_job", _slow_ingest_job)

    result = await module.retrieve_jobs_for_resume(client, uuid4())

    assert result is not None
    assert len(result["candidates"]) == 50
    assert peak <= module.INGEST_CONCURRENCY_LIMIT


@pytest.mark.asyncio
async def test_one_job_ingest_failure_does_not_abort_the_pool(monkeypatch):
    """try_ingest_job swallows its own failures, so the fan-out returns a full
    candidate list even when one job's embedding never lands."""
    from backend.app.services.matching import retrieve_jobs as module

    job_ids = [str(uuid4()) for _ in range(3)]
    client = _RoutingClient(_table_data_with_jobs(str(uuid4()), job_ids))

    async def _ok_ingest(*_a, **_k):
        return "exists"

    monkeypatch.setattr(module, "try_ingest_resume", _ok_ingest)
    monkeypatch.setattr(module, "_BACKOFF_BASE_SECONDS", 0.0, raising=False)
    monkeypatch.setattr(
        "backend.app.services.matching.ingest_jobs._BACKOFF_BASE_SECONDS", 0.0
    )

    def _boom(*_a, **_k):
        raise RuntimeError("embedding api down")

    monkeypatch.setattr("backend.app.services.matching.ingest_jobs.embed_text", _boom)

    result = await module.retrieve_jobs_for_resume(client, uuid4())

    assert result is not None
    assert len(result["candidates"]) == 3
    assert all(row["distance_expanded"] is None for row in result["candidates"])


@pytest.mark.asyncio
async def test_ingest_reuses_batch_read_instead_of_per_job_point_reads(monkeypatch):
    from backend.app.services.matching import retrieve_jobs as module

    job_ids = [str(uuid4()) for _ in range(4)]
    table_data = _table_data_with_jobs(str(uuid4()), job_ids)
    client = _RoutingClient(table_data)

    async def _ok_ingest(*_a, **_k):
        return "exists"

    seen: list[object] = []

    async def _record(_client, job, *, existing_row=None, **_k):
        seen.append((str(job["id"]), existing_row))
        return None

    monkeypatch.setattr(module, "try_ingest_resume", _ok_ingest)
    monkeypatch.setattr(module, "try_ingest_job", _record)

    await module.retrieve_jobs_for_resume(client, uuid4())

    # every job was handed a prefetched answer (None == no cached row)
    assert len(seen) == 4
    assert all(existing is None for _jid, existing in seen)


@pytest.mark.asyncio
async def test_retrieve_jobs_without_resume_when_query_provided(monkeypatch):
    from backend.app.services.matching import retrieve_jobs as module

    job_id = str(uuid4())
    table_data = {
        "resumes": None,
        "job_posts": [
            {
                "id": job_id,
                "title": "Logistics Coordinator",
                "description": "Quản lý kho vận và vận chuyển",
                "requirements": "Kinh nghiệm Logistics",
                "location": "TP.HCM",
                "employment_type": "full_time",
                "salary_min": None,
                "salary_max": None,
                "currency": "VND",
                "skill_constraints": {},
                "skill_constraints_confirmed_at": None,
                "companies": {"name": "Logistics Express"},
            }
        ],
        "embedded_jobs": [],
    }
    client = _RoutingClient(table_data)

    async def _mock_ingest_job(*_a, **_k):
        return None

    monkeypatch.setattr(module, "try_ingest_job", _mock_ingest_job)

    result = await module.retrieve_jobs_for_resume(client, uuid4(), query="Logistic")

    assert result is not None
    assert len(result["candidates"]) == 1
    assert result["candidates"][0]["title"] == "Logistics Coordinator"
    assert result["candidates"][0]["bm25_score"] > 0


@pytest.mark.asyncio
async def test_bm25_query_uses_cv_titles_not_full_markdown(monkeypatch):
    from backend.app.services.matching import retrieve_jobs as module

    resume_id = str(uuid4())
    job_id = str(uuid4())
    table_data = {
        "resumes": {"id": resume_id},
        "embedded_resumes": {
            "markdown": "Long noisy CV text mentioning unrelated topics like logistics and retail sales for pages.",
            "clean_markdown": "Long noisy CV text mentioning unrelated topics like logistics and retail sales for pages.",
            "metadata": {
                "skills": ["python"],
                "titles": ["Backend Developer"],
                "summary": "Backend developer with Python experience.",
            },
            "embedding": [1.0] + [0.0] * 1535,
            "model": "qwen3.7-text-embedding",
        },
        "job_posts": [
            {
                "id": job_id,
                "title": "Backend Developer",
                "description": "Build APIs with Python",
                "requirements": "Python, FastAPI",
                "location": "Hà Nội",
                "employment_type": "full_time",
                "salary_min": None,
                "salary_max": None,
                "currency": "VND",
                "skill_constraints": {},
                "skill_constraints_confirmed_at": None,
                "companies": {"name": "Acme"},
            }
        ],
        "embedded_jobs": [
            {
                "job_post_id": job_id,
                "embedding": [1.0] + [0.0] * 1535,
                "model": "qwen3.7-text-embedding",
                "skills": ["python"],
            }
        ],
    }
    client = _RoutingClient(table_data)

    async def _ok_ingest(*_a, **_k):
        return "exists"

    async def _ok_ingest_job(*_a, **_k):
        return None

    monkeypatch.setattr(module, "try_ingest_resume", _ok_ingest)
    monkeypatch.setattr(module, "try_ingest_job", _ok_ingest_job)

    captured_query = {}
    real_bm25_query = module.bm25_query

    def _spy_bm25_query(title, skill_ids):
        captured_query["value"] = title
        return real_bm25_query(title, skill_ids)

    monkeypatch.setattr(module, "bm25_query", _spy_bm25_query)

    result = await module.retrieve_jobs_for_resume(client, uuid4())

    assert result is not None
    assert captured_query["value"] == "Backend Developer"
    assert "logistics" not in captured_query["value"]

