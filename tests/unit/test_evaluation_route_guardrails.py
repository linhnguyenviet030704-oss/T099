from types import SimpleNamespace
from uuid import uuid4

import pytest

from backend.app.api.routes import evaluation as evaluation_route
from backend.app.api.schemas.evaluation import EvaluationRequest
from backend.app.core.exceptions import ForbiddenError


@pytest.mark.asyncio
async def test_evaluation_rejects_resume_owned_by_another_user(monkeypatch):
    actor_id = uuid4()
    resume_id = uuid4()

    class FakeStore:
        def __init__(self, _client):
            pass

        async def get_resume(self, _resume_id):
            return {"id": str(resume_id), "user_id": str(uuid4())}

    monkeypatch.setattr(evaluation_route, "SupabaseResumeStore", FakeStore)

    with pytest.raises(ForbiddenError):
        await evaluation_route._resolve_authorized_inputs(
            EvaluationRequest(resume_id=resume_id),
            actor_id=actor_id,
            client=object(),
        )


@pytest.mark.asyncio
async def test_evaluation_rejects_unpublished_job_from_another_recruiter():
    actor_id = uuid4()
    job_id = uuid4()

    class FakeQuery:
        def select(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def maybe_single(self):
            return self

        def execute(self):
            return SimpleNamespace(
                data={
                    "id": str(job_id),
                    "title": "Private job",
                    "status": "draft",
                    "created_by_user_id": str(uuid4()),
                }
            )

    class FakeClient:
        def table(self, name):
            assert name == "job_posts"
            return FakeQuery()

    with pytest.raises(ForbiddenError):
        await evaluation_route._resolve_authorized_inputs(
            EvaluationRequest(job_id=job_id),
            actor_id=actor_id,
            client=FakeClient(),
        )


@pytest.mark.asyncio
async def test_evaluation_loads_published_job_as_untrusted_text():
    actor_id = uuid4()
    job_id = uuid4()

    class FakeQuery:
        def select(self, *_args):
            return self

        def eq(self, *_args):
            return self

        def maybe_single(self):
            return self

        def execute(self):
            return SimpleNamespace(
                data={
                    "id": str(job_id),
                    "title": "Backend Engineer",
                    "description": "Build APIs",
                    "requirements": "Python",
                    "status": "published",
                    "created_by_user_id": str(uuid4()),
                }
            )

    class FakeClient:
        def table(self, _name):
            return FakeQuery()

    resolved = await evaluation_route._resolve_authorized_inputs(
        EvaluationRequest(job_id=job_id),
        actor_id=actor_id,
        client=FakeClient(),
    )

    assert resolved.jd_text == "Backend Engineer\n\nBuild APIs\n\nPython"
