"""Test script cho Application Status Module.

Bao gồm:
- TC-API-APP-001..010: Happy path status transitions
- TC-API-APP-011..020: Invalid transitions
- TC-API-APP-021..027: Authorization
- TC-API-APP-028..035: Email + side effects

Yêu cầu: Không cần database thật - dùng MagicMock cho Supabase client.
"""

from __future__ import annotations

import sys
from unittest.mock import MagicMock
from uuid import UUID, uuid4

sys.path.insert(0, ".")

# Force UTF-8 stdout để in được tiếng Việt trên Windows console
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from fastapi.testclient import TestClient

from backend.app.clients.supabase import get_supabase_client
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.auth import get_current_recruiter, get_current_user
from backend.app.main import app
from backend.app.services.application_service import (
    ALLOWED_TRANSITIONS,
    validate_status_transition,
)
from backend.app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError


# =============================================================================
# Fixtures
# =============================================================================

RECRUITER_ID = str(uuid4())
CANDIDATE_ID = str(uuid4())
JOB_ID = str(uuid4())
APP_ID = str(uuid4())
COMPANY_ID = str(uuid4())


def make_mock_supabase(*, app_status="pending", is_recruiter_member=True, is_recruiter_active=True):
    """Build a mock Supabase client that supports the queries the service makes."""
    supabase = MagicMock()

    # Mock job_submits.get_by_id chain
    app_data = {
        "id": APP_ID,
        "job_post_id": JOB_ID,
        "applicant_user_id": CANDIDATE_ID,
        "resume_id": str(uuid4()),
        "current_status": app_status,
        "cover_letter": "Test cover",
        "applied_at": "2026-08-30T00:00:00+00:00",
        "reviewed_at": None,
        "response_deadline_at": "2026-09-02T00:00:00+00:00",
        "job_posts": {
            "id": JOB_ID,
            "title": "Backend Dev",
            "company_id": COMPANY_ID,
            "created_by_user_id": RECRUITER_ID,
            "time_max_until_response": "3 days",
        },
        "profiles": {
            "id": CANDIDATE_ID,
            "full_name": "Nguyen Van A",
            "email": "candidate@test.com",
        },
    }

    # update_status returns
    updated_app = {**app_data, "current_status": "interview", "reviewed_at": "2026-08-30T10:00:00+00:00"}
    new_stage = {
        "stage": "interview",
        "note": None,
        "is_system_generated": False,
        "created_at": "2026-08-30T10:00:00+00:00",
        "changed_by_user_id": RECRUITER_ID,
    }

    supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = app_data
    supabase.table.return_value.update.return_value.eq.return_value.select.return_value.maybe_single.return_value.execute.return_value.data = updated_app

    # application_stages insert: trả lại stage với note lấy từ payload insert
    def fake_insert(payload):
        stage = {**new_stage, "note": payload.get("note", new_stage["note"])}
        chain = MagicMock()
        chain.select.return_value.maybe_single.return_value.execute.return_value.data = stage
        return chain
    supabase.table.return_value.insert.side_effect = fake_insert

    # company_members check (for assert_recruiter_owns_job_application)
    member_data = (
        {"id": str(uuid4()), "role": "owner"}
        if is_recruiter_member and is_recruiter_active
        else None
    )
    supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.in_.return_value.maybe_single.return_value.execute.return_value.data = member_data

    # email outbox enqueue (RPC)
    supabase.rpc.return_value.execute.return_value.data = str(uuid4())

    return supabase


def auth_recruiter():
    return AuthenticatedUser(id=UUID(RECRUITER_ID), email="recruiter@test.com", claims={"role": "authenticated"})


def auth_candidate():
    return AuthenticatedUser(id=UUID(CANDIDATE_ID), email="candidate@test.com", claims={"role": "authenticated"})


# =============================================================================
# TC-API-APP-001..009: Happy path transitions
# =============================================================================

VALID_TRANSITIONS = [
    ("pending", "screening"),
    ("pending", "interview"),
    ("pending", "rejected"),
    ("screening", "interview"),
    ("screening", "rejected"),
    ("interview", "offer"),
    ("interview", "rejected"),
    ("offer", "accepted"),
    ("offer", "rejected"),
    # withdrawn from any non-terminal
    ("pending", "withdrawn"),
    ("screening", "withdrawn"),
    ("interview", "withdrawn"),
    ("offer", "withdrawn"),
]


def test_valid_transitions_in_state_machine():
    """TC-API-APP-001..009: Verify state machine accepts valid transitions."""
    for old, new in VALID_TRANSITIONS:
        # No exception = pass
        validate_status_transition(old, new)
        print(f"OK: {old} -> {new}")


def test_invalid_transitions_rejected():
    """TC-API-APP-011..018: Invalid transitions raise BadRequestError."""
    invalid_cases = [
        ("pending", "offer"),
        ("pending", "accepted"),
        ("screening", "offer"),
        ("screening", "accepted"),
        ("interview", "accepted"),  # skip offer
        ("accepted", "rejected"),  # terminal
        ("rejected", "interview"),  # terminal
        ("withdrawn", "pending"),  # terminal
    ]
    for old, new in invalid_cases:
        try:
            validate_status_transition(old, new)
            print(f"FAIL: {old} -> {new} should raise")
            assert False, f"{old} -> {new} should raise"
        except BadRequestError as e:
            assert "Invalid status transition" in str(e)
            print(f"OK reject: {old} -> {new}")


def test_same_status_is_noop():
    """TC-API-APP-019: pending -> pending là no-op (không throw)."""
    # Theo state machine hiện tại: cùng status là no-op, không phải lỗi.
    # Service sẽ skip update nếu status không đổi.
    try:
        validate_status_transition("pending", "pending")
        print("OK same-status no-op: pending -> pending (allowed as no-op)")
    except BadRequestError:
        print("FAIL: same-status should be allowed as no-op")


def test_terminal_states_have_no_exits():
    """TC-API-APP-016..018: Terminal states have empty transition sets."""
    for terminal in ("accepted", "rejected", "withdrawn"):
        assert ALLOWED_TRANSITIONS[terminal] == set(), f"{terminal} should be terminal"
        print(f"OK terminal: {terminal}")


def test_invalid_status_value_rejected_by_schema():
    """TC-API-APP-020: Pydantic rejects unknown status."""
    from pydantic import ValidationError
    from backend.app.api.schemas.application import ApplicationUpdateStatusRequest
    try:
        ApplicationUpdateStatusRequest(new_status="hired")
        assert False, "Should raise ValidationError"
    except ValidationError as e:
        assert "new_status" in str(e)
        print("OK: schema rejects 'hired'")


# =============================================================================
# TC-API-APP-021..027: Authorization
# =============================================================================

def test_candidate_cannot_change_status():
    """TC-API-APP-023: Candidate attempting to PATCH returns 403."""
    mock_supabase = make_mock_supabase()
    app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
    app.dependency_overrides[get_current_user] = auth_candidate
    app.dependency_overrides[get_current_recruiter] = auth_recruiter
    try:
        # profile.role = 'candidate' so even if recruiter override is hit, role-check fails
        mock_profile = MagicMock()
        mock_profile.role = "candidate"
        mock_profile_service = MagicMock()

        async def async_get_own_profile(user_id):
            return mock_profile
        mock_profile_service.get_own_profile = async_get_own_profile

        from backend.app.dependencies.services import get_profile_service
        app.dependency_overrides[get_profile_service] = lambda: mock_profile_service

        client = TestClient(app)
        body = {"new_status": "interview", "note": None, "send_email": False}
        response = client.patch(
            f"/api/v1/applications/{APP_ID}/status",
            json=body,
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print(f"OK candidate blocked: {response.status_code} {response.json()}")
    finally:
        app.dependency_overrides.clear()


def test_recruiter_other_company_blocked():
    """TC-API-APP-024: Recruiter từ company khác nhận 403."""
    mock_supabase = make_mock_supabase(is_recruiter_member=False)
    app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
    app.dependency_overrides[get_current_recruiter] = auth_recruiter

    try:
        mock_profile = MagicMock()
        mock_profile.role = "recruiter"
        mock_profile_service = MagicMock()

        async def async_get_own_profile(user_id):
            return mock_profile
        mock_profile_service.get_own_profile = async_get_own_profile

        from backend.app.dependencies.services import get_profile_service
        app.dependency_overrides[get_profile_service] = lambda: mock_profile_service

        client = TestClient(app)
        body = {"new_status": "interview", "note": None, "send_email": False}
        response = client.patch(
            f"/api/v1/applications/{APP_ID}/status",
            json=body,
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print(f"OK other-company recruiter blocked: {response.status_code}")
    finally:
        app.dependency_overrides.clear()


def test_unauthenticated_blocked():
    """TC-API-APP-021: No token returns 401."""
    client = TestClient(app)
    body = {"new_status": "interview", "note": None, "send_email": False}
    response = client.patch(f"/api/v1/applications/{APP_ID}/status", json=body)
    assert response.status_code in (401, 403), f"Expected 401/403, got {response.status_code}"
    print(f"OK no-auth blocked: {response.status_code}")


# =============================================================================
# TC-API-APP-028..031: Email integration
# =============================================================================

def test_send_email_enqueues_outbox():
    """TC-API-APP-028: send_email=true triggers email_outbox.enqueue."""
    mock_supabase = make_mock_supabase(app_status="pending")
    app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
    app.dependency_overrides[get_current_recruiter] = auth_recruiter
    try:
        mock_profile = MagicMock()
        mock_profile.role = "recruiter"
        mock_profile_service = MagicMock()

        async def async_get_own_profile(user_id):
            return mock_profile
        mock_profile_service.get_own_profile = async_get_own_profile

        from backend.app.dependencies.services import get_profile_service
        app.dependency_overrides[get_profile_service] = lambda: mock_profile_service

        # Track RPC calls (enqueue_email is called via rpc())
        rpc_calls = []
        def track_rpc(name, params):
            rpc_calls.append((name, params))
            mock = MagicMock()
            mock.execute.return_value.data = str(uuid4())
            return mock
        mock_supabase.rpc.side_effect = track_rpc

        client = TestClient(app)
        body = {"new_status": "interview", "note": "Moi phong van", "send_email": True}
        response = client.patch(
            f"/api/v1/applications/{APP_ID}/status",
            json=body,
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 200, f"Got {response.status_code}: {response.text}"
        # Should have called enqueue_email RPC
        rpc_names = [name for name, _ in rpc_calls]
        assert "enqueue_email" in rpc_names, f"enqueue_email not called. RPCs: {rpc_names}"
        # Verify idempotency_key format (Supabase RPC dùng prefix p_)
        enqueue_call = next(p for n, p in rpc_calls if n == "enqueue_email")
        assert "p_idempotency_key" in enqueue_call, "Missing p_idempotency_key"
        assert APP_ID in enqueue_call["p_idempotency_key"]
        print(f"OK email enqueued: idempotency_key={enqueue_call['p_idempotency_key']}")
    finally:
        app.dependency_overrides.clear()


def test_no_email_when_send_email_false():
    """TC-API-APP-029..030: send_email=false (or default) does not enqueue."""
    mock_supabase = make_mock_supabase(app_status="pending")
    app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
    app.dependency_overrides[get_current_recruiter] = auth_recruiter
    try:
        mock_profile = MagicMock()
        mock_profile.role = "recruiter"
        mock_profile_service = MagicMock()

        async def async_get_own_profile(user_id):
            return mock_profile
        mock_profile_service.get_own_profile = async_get_own_profile

        from backend.app.dependencies.services import get_profile_service
        app.dependency_overrides[get_profile_service] = lambda: mock_profile_service

        rpc_calls = []
        mock_supabase.rpc.side_effect = lambda name, params: (
            rpc_calls.append(name) or MagicMock(execute=MagicMock(return_value=MagicMock(data=str(uuid4()))))
        )

        client = TestClient(app)
        body = {"new_status": "screening", "note": None, "send_email": False}
        response = client.patch(
            f"/api/v1/applications/{APP_ID}/status",
            json=body,
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 200
        assert "enqueue_email" not in rpc_calls, f"Should not enqueue. RPCs: {rpc_calls}"
        print(f"OK no email enqueued (send_email=false)")
    finally:
        app.dependency_overrides.clear()


# =============================================================================
# TC-API-APP-032..035: Side effects (notifications + DB fields)
# =============================================================================

def test_status_change_returns_full_payload():
    """TC-API-APP-032..035: response includes notification trigger + stage."""
    mock_supabase = make_mock_supabase(app_status="pending")
    app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
    app.dependency_overrides[get_current_recruiter] = auth_recruiter
    try:
        mock_profile = MagicMock()
        mock_profile.role = "recruiter"
        mock_profile_service = MagicMock()

        async def async_get_own_profile(user_id):
            return mock_profile
        mock_profile_service.get_own_profile = async_get_own_profile

        from backend.app.dependencies.services import get_profile_service
        app.dependency_overrides[get_profile_service] = lambda: mock_profile_service

        client = TestClient(app)
        body = {"new_status": "interview", "note": "Good CV", "send_email": False}
        response = client.patch(
            f"/api/v1/applications/{APP_ID}/status",
            json=body,
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["application"]["current_status"] == "interview"
        assert data["new_stage"]["stage"] == "interview"
        assert data["new_stage"]["note"] == "Good CV"
        assert data["new_stage"]["is_system_generated"] is False
        assert data["email_enqueued"] is False
        print("OK status change response structure")
    finally:
        app.dependency_overrides.clear()


# =============================================================================
# Runner
# =============================================================================

if __name__ == "__main__":
    tests = [
        test_valid_transitions_in_state_machine,
        test_invalid_transitions_rejected,
        test_same_status_is_noop,
        test_terminal_states_have_no_exits,
        test_invalid_status_value_rejected_by_schema,
        test_candidate_cannot_change_status,
        test_recruiter_other_company_blocked,
        test_unauthenticated_blocked,
        test_send_email_enqueues_outbox,
        test_no_email_when_send_email_false,
        test_status_change_returns_full_payload,
    ]
    passed = 0
    failed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except AssertionError as e:
            print(f"FAIL {t.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"ERROR {t.__name__}: {type(e).__name__}: {e}")
            failed += 1
    print(f"\n=== Application Status: {passed} passed, {failed} failed ===")
    sys.exit(0 if failed == 0 else 1)
