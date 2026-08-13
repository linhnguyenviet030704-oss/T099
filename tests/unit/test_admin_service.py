from uuid import uuid4

import pytest

from backend.app.core.exceptions import ForbiddenError, NotFoundError
from backend.app.models.domain import Profile
from backend.app.schemas.profile import ProfileRoleUpdateRequest, RecruiterReviewRequest
from backend.app.services.admin_service import AdminService


class _Repo:
    def __init__(self, profiles: dict, forms: dict | None = None) -> None:
        self.profiles = profiles
        self.forms = forms or {}
        self.role_updates: list[tuple] = []
        self.form_updates: list[tuple] = []

    async def get_by_id(self, profile_id):
        return self.profiles.get(profile_id)

    async def set_role(self, profile_id, role):
        profile = self.profiles.get(profile_id)
        if profile is None:
            return None
        profile.role = role
        self.role_updates.append((profile_id, role))
        return profile

    async def get_recruiter_form(self, form_id):
        return self.forms.get(form_id)

    async def update_recruiter_form(self, form_id, **kwargs):
        form = self.forms.get(form_id)
        if form is None:
            return None
        form.update(kwargs)
        self.form_updates.append((form_id, kwargs))
        return form


def _profile(role: str, profile_id=None) -> Profile:
    return Profile(
        id=profile_id or uuid4(),
        email="a@example.com",
        full_name="A",
        phone=None,
        avatar_url=None,
        role=role,  # type: ignore[arg-type]
    )


@pytest.mark.asyncio
async def test_set_role_rejects_non_admin():
    actor = _profile("candidate")
    target = _profile("candidate")
    service = AdminService(_Repo({actor.id: actor, target.id: target}))
    with pytest.raises(ForbiddenError):
        await service.set_role(actor.id, target.id, ProfileRoleUpdateRequest(role="recruiter"))


@pytest.mark.asyncio
async def test_set_role_admin_updates_target():
    actor = _profile("admin")
    target = _profile("candidate")
    repo = _Repo({actor.id: actor, target.id: target})
    service = AdminService(repo)
    updated = await service.set_role(actor.id, target.id, ProfileRoleUpdateRequest(role="recruiter"))
    assert updated.role == "recruiter"
    assert repo.role_updates == [(target.id, "recruiter")]


@pytest.mark.asyncio
async def test_review_form_approves_and_promotes():
    actor = _profile("admin")
    applicant = _profile("candidate")
    form_id = uuid4()
    repo = _Repo(
        {actor.id: actor, applicant.id: applicant},
        {form_id: {"id": form_id, "user_id": applicant.id, "status": "pending"}},
    )
    service = AdminService(repo)
    result = await service.review_recruiter_form(
        actor.id,
        form_id,
        RecruiterReviewRequest(decision="approved", admin_note="ok"),
    )
    assert result.status == "approved"
    assert applicant.role == "recruiter"


@pytest.mark.asyncio
async def test_review_form_missing_is_not_found():
    actor = _profile("admin")
    service = AdminService(_Repo({actor.id: actor}))
    with pytest.raises(NotFoundError):
        await service.review_recruiter_form(
            actor.id,
            uuid4(),
            RecruiterReviewRequest(decision="rejected", admin_note="no"),
        )
