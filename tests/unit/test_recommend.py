from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from backend.app.services.recommend import (
    MOCK_SCORES,
    list_applications_for_job,
    list_published_jobs,
    mock_recommend,
    mock_recommend_candidates,
)


def test_mock_recommend_assigns_descending_fake_scores():
    first_id = uuid4()
    second_id = uuid4()
    rows = [
        {
            "id": str(first_id),
            "title": "Backend Engineer",
            "location": "Hà Nội",
            "employment_type": "full_time",
            "salary_min": 20_000_000,
            "salary_max": 35_000_000,
            "currency": "VND",
            "companies": {"name": "Acme"},
        },
        {
            "id": str(second_id),
            "title": "Intern",
            "location": None,
            "employment_type": "internship",
            "salary_min": None,
            "salary_max": None,
            "currency": "VND",
            "companies": {"name": "Beta"},
        },
    ]

    jobs = mock_recommend(rows)

    assert [job.score for job in jobs] == [MOCK_SCORES[0], MOCK_SCORES[1]]
    assert jobs[0].id == first_id
    assert jobs[0].title == "Backend Engineer"
    assert jobs[0].company_name == "Acme"
    assert jobs[1].company_name == "Beta"
    assert jobs[1].location is None


def test_mock_recommend_empty_rows():
    assert mock_recommend([]) == []


def test_mock_recommend_caps_at_five():
    rows = [
        {
            "id": str(uuid4()),
            "title": f"Job {i}",
            "location": None,
            "employment_type": "full_time",
            "salary_min": None,
            "salary_max": None,
            "currency": "VND",
            "companies": {"name": "Co"},
        }
        for i in range(8)
    ]
    jobs = mock_recommend(rows)
    assert len(jobs) == 5
    assert [job.score for job in jobs] == list(MOCK_SCORES)


class _FakeQuery:
    def __init__(self, data: list[dict]) -> None:
        self._data = data
        self.eq_args: tuple | None = None
        self.is_args: tuple | None = None
        self.order_args: tuple | None = None
        self.limit_n: int | None = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, column: str, value: str):
        self.eq_args = (column, value)
        return self

    def is_(self, column: str, value: str | None):
        self.is_args = (column, value)
        return self

    def order(self, column: str, desc: bool = False):
        self.order_args = (column, desc)
        return self

    def limit(self, n: int):
        self.limit_n = n
        return self

    def execute(self):
        return SimpleNamespace(data=self._data)


class _FakeClient:
    def __init__(self, data: list[dict]) -> None:
        self.data = data
        self.table_name: str | None = None
        self.query: _FakeQuery | None = None

    def table(self, name: str) -> _FakeQuery:
        self.table_name = name
        self.query = _FakeQuery(self.data)
        return self.query


@pytest.mark.asyncio
async def test_list_published_jobs_queries_published_limit():
    rows = [{"id": str(uuid4()), "title": "A"}]
    client = _FakeClient(rows)
    result = await list_published_jobs(client, limit=5)
    assert result == rows
    assert client.table_name == "job_posts"
    assert client.query is not None
    assert client.query.eq_args == ("status", "published")
    assert client.query.order_args == ("published_at", True)
    assert client.query.limit_n == 5


def _application_row(**overrides):
    base = {
        "id": str(uuid4()),
        "applicant_user_id": str(uuid4()),
        "current_status": "pending",
        "resume_title_snapshot": "CV.pdf",
        "resume_storage_path_snapshot": "u/cv.pdf",
        "profiles": {"full_name": "Ada", "email": "ada@example.com"},
    }
    base.update(overrides)
    return base


def test_mock_recommend_candidates_scores_and_profile():
    app_id = uuid4()
    user_id = uuid4()
    rows = [
        _application_row(
            id=str(app_id),
            applicant_user_id=str(user_id),
        ),
        _application_row(profiles={"full_name": "Bob", "email": "bob@example.com"}),
    ]
    candidates = mock_recommend_candidates(rows)
    assert [c.score for c in candidates] == [MOCK_SCORES[0], MOCK_SCORES[1]]
    assert candidates[0].application_id == app_id
    assert candidates[0].applicant_user_id == user_id
    assert candidates[0].full_name == "Ada"
    assert candidates[0].resume_title == "CV.pdf"


def test_mock_recommend_candidates_empty():
    assert mock_recommend_candidates([]) == []


@pytest.mark.asyncio
async def test_list_applications_for_job_filters_job_and_not_withdrawn():
    job_id = uuid4()
    rows = [_application_row()]
    client = _FakeClient(rows)
    result = await list_applications_for_job(client, job_id)
    assert result == rows
    assert client.table_name == "job_submits"
    assert client.query is not None
    assert client.query.eq_args == ("job_post_id", str(job_id))
    assert client.query.is_args == ("withdrawn_at", "null")
    assert client.query.limit_n == 5
