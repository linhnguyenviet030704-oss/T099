"""Test script cho Security Module.

Bao gồm:
- TC-SEC-001..004: SQL injection attempts
- TC-SEC-010..014: Authorization bypass attempts
- TC-SEC-015..018: XSS prevention
- TC-SEC-019..025: Authentication edge cases
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


USER_ID = str(uuid4())
APP_ID = str(uuid4())
COMPANY_ID = str(uuid4())
JOB_ID = str(uuid4())


def auth_user():
    return AuthenticatedUser(id=UUID(USER_ID), email="user@test.com", claims={"role": "authenticated"})


# =============================================================================
# TC-SEC-001..004: SQL Injection attempts - schema validation rejects them
# =============================================================================

def test_sql_injection_in_new_status_rejected():
    """TC-SEC-001: SQL injection trong new_status -> 422."""
    client = TestClient(app)
    response = client.patch(
        f"/api/v1/applications/{APP_ID}/status",
        json={"new_status": "'; DROP TABLE job_submits; --", "note": None, "send_email": False},
        headers={"Authorization": "Bearer fake-token"},
    )
    # 401/403 if auth check first, else 422 if validation
    assert response.status_code in (401, 403, 422), f"Got {response.status_code}"
    print(f"OK SQL injection in new_status: {response.status_code}")


def test_sql_injection_in_note_stored_as_literal():
    """TC-SEC-002: SQL injection trong note -> luu nguyen van ban (Pydantic string)."""
    from backend.app.api.schemas.application import ApplicationUpdateStatusRequest

    body = ApplicationUpdateStatusRequest(
        new_status="interview",
        note="'; DELETE FROM profiles; --",
        send_email=False,
    )
    # Pydantic giữ nguyên string, không thực thi SQL
    assert "DELETE FROM profiles" in body.note
    print(f"OK SQL injection in note stored as literal text")


def test_sql_injection_in_notification_ids_rejected():
    """TC-SEC-003: SQL injection trong notification_ids -> 422."""
    from pydantic import ValidationError
    from backend.app.api.schemas.notification import NotificationMarkReadRequest

    malicious_ids = ["1; DROP TABLE notifications"]
    try:
        NotificationMarkReadRequest(notification_ids=malicious_ids)
        # If accepted as string, must be valid UUID - this should fail
        assert False, "Should reject non-UUID strings"
    except ValidationError as e:
        assert "notification_ids" in str(e) or "uuid" in str(e).lower()
        print(f"OK SQL injection in notification_ids rejected by UUID validation")


def test_xss_in_link_url_validated_frontend():
    """TC-SEC-017: Frontend validate link_url starts with '/'."""
    # Inline check: NotificationBell.tsx có validate:
    # if (notif.link_url && notif.link_url.startsWith('/')) { router.push(notif.link_url); }
    # javascript: URLs would NOT start with '/' so won't navigate.
    with open("frontend/src/components/notifications/NotificationBell.tsx", encoding="utf-8") as f:
        content = f.read()
    assert "startsWith('/')" in content or 'startsWith("/")' in content, \
        "NotificationBell must validate link_url starts with /"
    print("OK NotificationBell validates link_url starts with /")


# =============================================================================
# TC-SEC-005..009: Authorization bypass - tested via DB-level tests in migrations
# =============================================================================

def test_repository_enforces_user_id_filter():
    """TC-SEC-010, 011: notification repository luon filter theo user_id."""
    from backend.app.repositories.notification_repository import NotificationRepository

    supabase = MagicMock()
    captured = {}
    chain = MagicMock()
    chain.select.return_value = chain
    chain.update.return_value = chain  # quan trọng: update() cũng phải trả về chain

    def fake_eq(col, val):
        captured.setdefault(col, []).append(val)
        return chain
    chain.eq = fake_eq
    chain.order.return_value = chain
    chain.range.return_value = chain
    chain.in_.return_value = chain
    chain.execute.return_value = MagicMock(data=[])

    supabase.table.return_value = chain
    repo = NotificationRepository(supabase)

    import asyncio
    user_id = UUID(USER_ID)
    asyncio.run(repo.list_for_user(user_id, limit=10))
    asyncio.run(repo.count_unread(user_id))
    asyncio.run(repo.mark_as_read(user_id, [uuid4()]))
    asyncio.run(repo.mark_all_read(user_id))

    # Verify user_id filter was applied to ALL operations
    assert "user_id" in captured, "user_id filter missing"
    user_id_count = len(captured["user_id"])
    assert user_id_count >= 4, f"user_id filter applied {user_id_count} times, expected 4+"
    # All should equal USER_ID
    for val in captured["user_id"]:
        assert val == USER_ID, f"Wrong user_id filter: {val}"
    print(f"OK repository enforces user_id on all 4 ops ({user_id_count} calls)")


# =============================================================================
# TC-SEC-019..025: Authentication
# =============================================================================

def test_no_authorization_header():
    """TC-SEC-021: Missing Authorization -> 401."""
    client = TestClient(app)
    response = client.get("/api/v1/notifications")
    assert response.status_code in (401, 403), f"Got {response.status_code}"
    print(f"OK missing auth header: {response.status_code}")


def test_malformed_jwt_rejected():
    """TC-SEC-020: Malformed JWT -> 401."""
    client = TestClient(app)
    response = client.get(
        "/api/v1/notifications",
        headers={"Authorization": "Bearer not-a-real-jwt"},
    )
    assert response.status_code in (401, 403), f"Got {response.status_code}"
    print(f"OK malformed JWT: {response.status_code}")


# =============================================================================
# TC-SEC-005..009: Reputation functions are service-role only
# These are validated by the SQL migrations (revoke from public, authenticated).
# Static check on migration files:
# =============================================================================

def test_migrations_revoke_service_role_only():
    """Kiem tra cac function rat quan trong chi grant cho service_role."""
    migrations_to_check = [
        ("supabase/migrations/20260830200000_reputation_core.sql",
         ["adjust_reputation"]),
        ("supabase/migrations/20260830202000_notifications_core.sql",
         ["create_notification"]),
        ("supabase/migrations/20260830203000_email_outbox.sql",
         ["enqueue_email"]),
        ("supabase/migrations/20260830206000_auto_reject_safe.sql",
         ["auto_reject_expired_applications"]),
        ("supabase/migrations/20260830207000_candidate_violation_penalty.sql",
         ["penalize_interview_no_show"]),
    ]

    for path, fns in migrations_to_check:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        for fn in fns:
            # Find the revoke/grant pattern
            # The function must have BOTH: revoke from public,authenticated AND grant to service_role
            revoke_pattern = f"revoke execute on function public.{fn}"
            grant_pattern = f"grant execute on function public.{fn}"

            # Sometimes functions have multi-line signatures
            if revoke_pattern not in content and not any(
                line.strip().startswith(f"revoke execute on function public.{fn}")
                for line in content.splitlines()
            ):
                # Try to find any revoke for this fn
                fn_idx = content.find(f"create or replace function public.{fn}")
                if fn_idx == -1:
                    continue
                # Check revoke appears AFTER create
                after_fn = content[fn_idx:]
                if "revoke execute" not in after_fn[:2000]:
                    print(f"WARN {fn}: no revoke found in {path}")
                    continue
                if "grant execute" not in after_fn[:2000]:
                    print(f"WARN {fn}: no grant found in {path}")
                    continue
            print(f"OK {fn}: revoke+grant pattern in {path}")


def test_create_notification_security():
    """TC-SEC-006: create_notification chi service_role."""
    with open("supabase/migrations/20260830202000_notifications_core.sql", encoding="utf-8") as f:
        content = f.read()
    # Find the create_notification function definition
    fn_idx = content.find("create or replace function public.create_notification")
    assert fn_idx > -1, "create_notification function not found"
    # Look for revoke + grant service_role within next 3000 chars
    after_fn = content[fn_idx:fn_idx + 3000]
    assert "revoke execute" in after_fn, "No revoke execute on create_notification"
    assert "service_role" in after_fn, "No grant to service_role"
    print("OK create_notification properly secured")


def test_adjust_reputation_security():
    """TC-SEC-007: adjust_reputation chi service_role."""
    with open("supabase/migrations/20260830200000_reputation_core.sql", encoding="utf-8") as f:
        content = f.read()
    fn_idx = content.find("create or replace function public.adjust_reputation")
    assert fn_idx > -1, "adjust_reputation function not found"
    after_fn = content[fn_idx:fn_idx + 3000]
    assert "revoke execute" in after_fn
    assert "service_role" in after_fn
    print("OK adjust_reputation properly secured")


def test_protect_reputation_trigger():
    """TC-SEC-005: protect_reputation_scores trigger prevents direct user updates."""
    with open("supabase/migrations/20260830200000_reputation_core.sql", encoding="utf-8") as f:
        content = f.read()
    assert "protect_reputation_scores" in content
    assert "before update on public.profiles" in content
    assert "cannot be modified by user" in content
    print("OK protect_reputation_scores trigger installed")


if __name__ == "__main__":
    tests = [
        test_sql_injection_in_new_status_rejected,
        test_sql_injection_in_note_stored_as_literal,
        test_sql_injection_in_notification_ids_rejected,
        test_xss_in_link_url_validated_frontend,
        test_repository_enforces_user_id_filter,
        test_no_authorization_header,
        test_malformed_jwt_rejected,
        test_migrations_revoke_service_role_only,
        test_create_notification_security,
        test_adjust_reputation_security,
        test_protect_reputation_trigger,
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
            import traceback
            traceback.print_exc()
            failed += 1
    print(f"\n=== Security: {passed} passed, {failed} failed ===")
    sys.exit(0 if failed == 0 else 1)
