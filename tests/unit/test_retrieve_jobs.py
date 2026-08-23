from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest


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
