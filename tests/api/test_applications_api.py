from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from backend.app.api.schemas.application import (
    ApplicationDetailResponse,
    ApplicationStageResponse,
    ApplicationUpdateStatusResponse,
)
from backend.app.config.env import settings
from backend.app.core.exceptions import ForbiddenError
from backend.app.dependencies.services import (
    get_application_service,
    get_profile_service,
)
from backend.app.main import app
from backend.app.models.domain import Profile


def _make_token(*, sub: str | None = None, email: str = "user@example.com") -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": sub or str(uuid4()),
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


@pytest_asyncio.fixture
async def api_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_application_unauthorized(api_client: AsyncClient):
    """Không có token -> 401 Unauthorized."""
    app_id = uuid4()
    response = await api_client.get(f"/api/v1/applications/{app_id}")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_application_candidate_success(api_client: AsyncClient):
    """Ứng viên xem chi tiết đơn của mình -> 200 OK."""
    user_id = uuid4()
    app_id = uuid4()
    job_id = uuid4()
    resume_id = uuid4()

    mock_profile_service = AsyncMock()
    mock_profile_service.get_own_profile.return_value = Profile(
        id=user_id,
        email="candidate@test.com",
        full_name="Candidate A",
        phone=None,
        avatar_url=None,
        role="candidate",
    )

    mock_app_service = AsyncMock()
    mock_app_service.get_detail.return_value = ApplicationDetailResponse(
        id=app_id,
        job_post_id=job_id,
        applicant_user_id=user_id,
        resume_id=resume_id,
        current_status="pending",
        applied_at=datetime.now(UTC),
        applicant_name="Candidate A",
        job_title="Software Engineer",
    )

    app.dependency_overrides[get_profile_service] = lambda: mock_profile_service
    app.dependency_overrides[get_application_service] = lambda: mock_app_service

    token = _make_token(sub=str(user_id))
    response = await api_client.get(
        f"/api/v1/applications/{app_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(app_id)
    assert data["applicant_name"] == "Candidate A"


@pytest.mark.asyncio
async def test_get_application_forbidden_for_other(api_client: AsyncClient):
    """Ứng viên xem đơn của người khác -> 403 Forbidden."""
    user_id = uuid4()
    app_id = uuid4()

    mock_profile_service = AsyncMock()
    mock_profile_service.get_own_profile.return_value = Profile(
        id=user_id,
        email="candidate@test.com",
        full_name="Candidate A",
        phone=None,
        avatar_url=None,
        role="candidate",
    )

    mock_app_service = AsyncMock()
    mock_app_service.get_detail.side_effect = ForbiddenError("Bạn không có quyền xem application này")

    app.dependency_overrides[get_profile_service] = lambda: mock_profile_service
    app.dependency_overrides[get_application_service] = lambda: mock_app_service

    token = _make_token(sub=str(user_id))
    response = await api_client.get(
        f"/api/v1/applications/{app_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_update_application_status_recruiter_success(api_client: AsyncClient):
    """Nhà tuyển dụng đổi trạng thái đơn -> 200 OK."""
    recruiter_id = uuid4()
    app_id = uuid4()

    mock_profile_service = AsyncMock()
    mock_profile_service.get_own_profile.return_value = Profile(
        id=recruiter_id,
        email="recruiter@test.com",
        full_name="Recruiter",
        phone=None,
        avatar_url=None,
        role="recruiter",
    )

    mock_app_service = AsyncMock()
    mock_app_service.update_status.return_value = ApplicationUpdateStatusResponse(
        application=ApplicationDetailResponse(
            id=app_id,
            job_post_id=uuid4(),
            applicant_user_id=uuid4(),
            resume_id=uuid4(),
            current_status="interview",
            applied_at=datetime.now(UTC),
            applicant_name="Candidate A",
            job_title="Software Engineer",
        ),
        new_stage=ApplicationStageResponse(
            stage="interview",
            note="OK",
            is_system_generated=False,
            created_at=datetime.now(UTC),
            changed_by_user_id=recruiter_id,
        ),
        email_enqueued=True,
    )

    app.dependency_overrides[get_profile_service] = lambda: mock_profile_service
    app.dependency_overrides[get_application_service] = lambda: mock_app_service

    token = _make_token(sub=str(recruiter_id))
    response = await api_client.patch(
        f"/api/v1/applications/{app_id}/status",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "new_status": "interview",
            "note": "OK",
            "send_email": True,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["application"]["current_status"] == "interview"
    assert data["email_enqueued"] is True


@pytest.mark.asyncio
async def test_get_interview_invitation_api(api_client: AsyncClient):
    """Lấy thông tin lời mời phỏng vấn qua API -> 200 OK."""
    user_id = uuid4()
    app_id = uuid4()
    inv_id = uuid4()

    mock_profile_service = AsyncMock()
    mock_profile_service.get_own_profile.return_value = Profile(
        id=user_id,
        email="candidate@test.com",
        full_name="Candidate A",
        phone=None,
        avatar_url=None,
        role="candidate",
    )

    from backend.app.api.schemas.application import InterviewInvitationResponse

    mock_app_service = AsyncMock()
    mock_app_service.get_interview_invitation.return_value = InterviewInvitationResponse(
        id=inv_id,
        application_id=app_id,
        scheduled_at=None,
        proposed_time_slots=["2026-09-02T09:00:00Z", "2026-09-02T14:00:00Z"],
        status="pending",
        location="Office",
    )

    app.dependency_overrides[get_profile_service] = lambda: mock_profile_service
    app.dependency_overrides[get_application_service] = lambda: mock_app_service

    token = _make_token(sub=str(user_id))
    response = await api_client.get(
        f"/api/v1/applications/{app_id}/interview-invitation",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(inv_id)
    assert len(data["proposed_time_slots"]) == 2


@pytest.mark.asyncio
async def test_candidate_respond_interview_api(api_client: AsyncClient):
    """Ứng viên phản hồi lời mời phỏng vấn qua API -> 200 OK."""
    user_id = uuid4()
    app_id = uuid4()
    inv_id = uuid4()

    from backend.app.api.schemas.application import InterviewInvitationResponse

    mock_app_service = AsyncMock()
    mock_app_service.candidate_respond_interview.return_value = InterviewInvitationResponse(
        id=inv_id,
        application_id=app_id,
        scheduled_at=datetime.now(UTC),
        proposed_time_slots=["2026-09-02T09:00:00Z"],
        status="confirmed",
    )

    app.dependency_overrides[get_application_service] = lambda: mock_app_service

    token = _make_token(sub=str(user_id))
    response = await api_client.post(
        f"/api/v1/applications/{app_id}/interview-invitation/respond",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "action": "confirm",
            "selected_slot": "2026-09-02T09:00:00Z",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "confirmed"


@pytest.mark.asyncio
async def test_candidate_respond_interview_api_with_slot_range(api_client: AsyncClient):
    """Ứng viên phản hồi lời mời với slot dạng range 'start/end' -> 200 OK."""
    user_id = uuid4()
    app_id = uuid4()
    inv_id = uuid4()

    from backend.app.api.schemas.application import InterviewInvitationResponse

    mock_app_service = AsyncMock()
    mock_app_service.candidate_respond_interview.return_value = InterviewInvitationResponse(
        id=inv_id,
        application_id=app_id,
        scheduled_at=datetime(2026, 9, 11, 17, 0, 0, tzinfo=UTC),
        proposed_time_slots=["2026-09-11T17:00:00/2026-09-15T11:00:00"],
        status="confirmed",
    )

    app.dependency_overrides[get_application_service] = lambda: mock_app_service

    token = _make_token(sub=str(user_id))
    response = await api_client.post(
        f"/api/v1/applications/{app_id}/interview-invitation/respond",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "action": "confirm",
            "selected_slot": "2026-09-11T17:00:00/2026-09-15T11:00:00",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "confirmed"


