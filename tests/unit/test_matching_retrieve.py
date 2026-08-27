from types import SimpleNamespace
from uuid import uuid4

import pytest

from backend.app.core.exceptions import ForbiddenError
from backend.app.services.matching.retrieve import _row, job_query_text, persist_match_resume_rows, retrieve_for_job
from backend.app.services.matching.rrf import score_candidates, semantic_score


def test_job_query_text_prefers_requirements():
    assert job_query_text({"title": "BE", "description": "code", "requirements": "Python"}) == "Python"
    assert job_query_text({"title": "BE", "description": "code", "requirements": "  "}) == "BE code"


def test_row_accepts_missing_execute_result():
    assert _row(None) is None
    assert _row(type("R", (), {"data": None})()) is None
    assert _row(type("R", (), {"data": {"metadata": {"skills": ["Python"]}}})())["metadata"]["skills"] == ["Python"]


def test_semantic_score_clamps_cosine_distance():
    assert semantic_score(0.0) == 1.0
    assert abs(semantic_score(0.2) - (0.8 - 0.65) / 0.35) < 1e-6
    assert semantic_score(0.35) == 0.0
    assert semantic_score(0.5) == 0.0
    assert semantic_score(2.0) == 0.0


def test_score_candidates_rrf_prefers_expanded_and_skill_over_one_semantic_hit():
    rows = [
        {
            "application_id": "ada",
            "resume_id": "r1",
            "skills": ["Python"],
            "distance_expanded": 0.4,
            "bm25_score": 0.0,
        },
        {
            "application_id": "bob",
            "resume_id": "r2",
            "skills": ["Python", "FastAPI", "Docker"],
            "verified_skills": ["python", "fastapi", "docker"],
            "distance_expanded": 0.1,
            "bm25_score": 0.0,
        },
    ]
    ranked = score_candidates(rows, jd_skills=["python", "fastapi", "docker"])
    assert ranked[0]["application_id"] == "bob"
    assert ranked[0]["skill_score"] == 1.0
    assert ranked[1]["skill_score"] == 1 / 3
    assert ranked[0]["rrf_score"] > ranked[1]["rrf_score"]
    assert ranked[0]["rrf_rank"] == 1
    assert ranked[1]["rrf_rank"] == 2
    assert "score" not in ranked[0]


class _ExplodingClient:
    """Raises if any data method is called — proves the authorization check
    runs strictly before any Supabase query/RPC, not just "raises somewhere"."""

    def table(self, _name):
        raise AssertionError("must not touch data before the access check")

    def rpc(self, *_args, **_kwargs):
        raise AssertionError("must not touch data before the access check")


@pytest.mark.asyncio
async def test_retrieve_for_job_blocks_before_touching_data_when_unauthorized(monkeypatch):
    actor_id = uuid4()
    job_id = uuid4()
    calls: list[tuple] = []

    async def _deny(client, passed_actor_id, passed_job_id):
        calls.append((client, passed_actor_id, passed_job_id))
        raise ForbiddenError("Not a recruiter for this job")

    monkeypatch.setattr("backend.app.services.matching.retrieve.assert_recruiter_job_access", _deny)

    client = _ExplodingClient()
    with pytest.raises(ForbiddenError):
        await retrieve_for_job(client, actor_id, job_id)

    assert calls == [(client, actor_id, job_id)]


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


def test_embedded_batch_fetches_all_ids_in_one_query():
    from backend.app.services.matching.retrieve import _embedded_batch

    rows = [
        {"resume_id": "r1", "metadata": {"skills": ["python"]}},
        {"resume_id": "r2", "metadata": {"skills": ["java"]}},
    ]
    client = _FakeInClient(rows)
    result = _embedded_batch(client, ["r1", "r2"])
    assert client.query.in_args == ("resume_id", ["r1", "r2"])
    assert result["r1"]["metadata"]["skills"] == ["python"]
    assert result["r2"]["metadata"]["skills"] == ["java"]


def test_embedded_batch_returns_empty_dict_for_empty_ids():
    from backend.app.services.matching.retrieve import _embedded_batch

    assert _embedded_batch(_FakeInClient([]), []) == {}


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
    """Unlike _FakeInClient, records every `.in_()` call it received (not just
    the last one) so tests can assert on chunking behavior across multiple
    table()/in_() invocations."""

    def __init__(self, rows_by_id: dict[str, dict]) -> None:
        self._rows_by_id = rows_by_id
        self.calls: list[tuple] = []

    def table(self, _name: str):
        return _FakeChunkedInQuery(self._rows_by_id, self.calls)


def test_embedded_batch_chunks_large_id_lists():
    from backend.app.services.matching.retrieve import _embedded_batch

    resume_ids = [f"r{i}" for i in range(150)]
    rows_by_id = {rid: {"resume_id": rid, "metadata": {"skills": [rid]}} for rid in resume_ids}
    client = _FakeChunkedInClient(rows_by_id)

    result = _embedded_batch(client, resume_ids)

    assert len(client.calls) == 2
    assert [len(values) for _column, values in client.calls] == [100, 50]
    assert all(column == "resume_id" for column, _values in client.calls)
    assert len(result) == 150
    assert result["r0"]["metadata"]["skills"] == ["r0"]
    assert result["r99"]["metadata"]["skills"] == ["r99"]
    assert result["r149"]["metadata"]["skills"] == ["r149"]


@pytest.mark.asyncio
async def test_persist_match_resume_rows_blocks_before_insert_when_unauthorized(monkeypatch):
    actor_id = uuid4()
    job_id = uuid4()
    calls: list[tuple] = []

    async def _deny(client, passed_actor_id, passed_job_id):
        calls.append((client, passed_actor_id, passed_job_id))
        raise ForbiddenError("Not a recruiter for this job")

    monkeypatch.setattr("backend.app.services.matching.retrieve.assert_recruiter_job_access", _deny)

    client = _ExplodingClient()
    with pytest.raises(ForbiddenError):
        await persist_match_resume_rows(
            client,
            job_id,
            [],
            actor_id=actor_id,
            query_text="",
            recruiter_message="",
            rerank_mode="qwen",
            rerank_status="not_requested",
        )

    assert calls == [(client, actor_id, job_id)]


class _FakeRetrieveTableQuery:
    def __init__(self, data: list[dict] | dict | None):
        self._data = data

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def is_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return SimpleNamespace(data=self._data)


class _FakeRetrieveSupabaseClient:
    def __init__(self, job: dict, submits: list[dict], public_resumes: list[dict], embedded: list[dict]):
        self.job = job
        self.submits = submits
        self.public_resumes = public_resumes
        self.embedded = embedded

    def table(self, name: str):
        if name == "job_posts":
            return _FakeRetrieveTableQuery(self.job)
        if name == "job_submits":
            return _FakeRetrieveTableQuery(self.submits)
        if name == "resumes":
            return _FakeRetrieveTableQuery(self.public_resumes)
        if name == "embedded_resumes":
            return _FakeRetrieveTableQuery(self.embedded)
        return _FakeRetrieveTableQuery([])


@pytest.mark.asyncio
async def test_retrieve_for_job_includes_public_resumes(monkeypatch):
    actor_id = uuid4()
    job_id = uuid4()

    async def _allow(_client, _actor, _job):
        pass

    monkeypatch.setattr("backend.app.services.matching.retrieve.assert_recruiter_job_access", _allow)
    monkeypatch.setattr("backend.app.services.matching.retrieve.embed_text", lambda *args, **kwargs: [0.1] * 2560)

    app_id = str(uuid4())
    applicant_1 = str(uuid4())
    resume_1 = str(uuid4())

    applicant_2 = str(uuid4())
    resume_2 = str(uuid4())

    job_data = {
        "id": str(job_id),
        "title": "Backend Python Engineer",
        "description": "Looking for FastAPI and Python developer",
        "requirements": "Python FastAPI",
        "skill_constraints": None,
        "skill_constraints_confirmed_at": None,
    }

    submits_data = [
        {
            "id": app_id,
            "applicant_user_id": applicant_1,
            "resume_id": resume_1,
            "current_status": "screening",
            "resume_title_snapshot": "CV_Ada.pdf",
            "resume_storage_path_snapshot": "u/cv_ada.pdf",
            "profiles": {"full_name": "Ada Lovelace", "email": "ada@example.com"},
        }
    ]

    public_resumes_data = [
        # Duplicate applicant (already submitted) -> should be deduplicated
        {
            "id": resume_1,
            "user_id": applicant_1,
            "title": "CV_Ada_Public.pdf",
            "original_filename": "ada.pdf",
            "storage_path": "u/cv_ada.pdf",
            "profiles": {"full_name": "Ada Lovelace", "email": "ada@example.com"},
        },
        # New public applicant who hasn't submitted
        {
            "id": resume_2,
            "user_id": applicant_2,
            "title": "CV_Bob_JobSeeking.pdf",
            "original_filename": "bob.pdf",
            "storage_path": "u/cv_bob.pdf",
            "profiles": {"full_name": "Bob Smith", "email": "bob@example.com"},
        },
    ]

    embedded_data = [
        {
            "resume_id": resume_1,
            "metadata": {"skills": ["Python", "FastAPI"]},
            "markdown": "Python FastAPI developer",
            "clean_markdown": "Python FastAPI developer",
            "embedding": [0.1] * 2560,
            "model": "text-embedding-v3",
        },
        {
            "resume_id": resume_2,
            "metadata": {"skills": ["Python", "Django"]},
            "markdown": "Python Django backend engineer",
            "clean_markdown": "Python Django backend engineer",
            "embedding": [0.1] * 2560,
            "model": "text-embedding-v3",
        },
    ]

    client = _FakeRetrieveSupabaseClient(job_data, submits_data, public_resumes_data, embedded_data)

    result = await retrieve_for_job(client, actor_id, job_id)
    assert result["pool_size"] == 2
    candidates = result["candidates"]
    assert len(candidates) == 2

    # Candidate 1 is the submitted candidate
    c1 = next(c for c in candidates if c["applicant_user_id"] == applicant_1)
    assert c1["application_id"] == app_id
    assert c1["current_status"] == "screening"
    assert c1["is_public_candidate"] is False

    # Candidate 2 is the public candidate ("Đang tìm việc")
    c2 = next(c for c in candidates if c["applicant_user_id"] == applicant_2)
    assert c2["resume_id"] == resume_2
    assert c2["current_status"] == "job_seeking"
    assert c2["is_public_candidate"] is True
    assert c2["full_name"] == "Bob Smith"

