"""Test script cho Internal Cron Endpoint.

Bao gồm:
- TC-API-CRON-001..012: POST /internal/cron/auto-reject-expired
- TC-SEC-022: Cron secret brute force protection
"""

from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch
from uuid import uuid4

sys.path.insert(0, ".")

# Force UTF-8 stdout để in được tiếng Việt trên Windows console
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

from fastapi.testclient import TestClient

from backend.app.clients.supabase import get_supabase_client
from backend.app.main import app


VALID_SECRET = "test-cron-secret-key-2026"
INVALID_SECRET = "wrong-secret"


def make_mock_supabase(*, rejected_count=0):
    """Build mock Supabase for cron endpoint."""
    supabase = MagicMock()
    apps = [
        {
            "application_id": str(uuid4()),
            "job_post_id": str(uuid4()),
            "recruiter_user_id": str(uuid4()),
            "expired_at": "2026-08-30T00:00:00+00:00",
            "new_reputation": 95,
        }
        for _ in range(rejected_count)
    ]

    rpc_mock = MagicMock()
    rpc_mock.execute.return_value = MagicMock(data=apps)
    supabase.rpc.return_value = rpc_mock

    return supabase


class _CronPatch:
    """Context manager: patch settings + get_supabase_client nơi route dùng."""

    def __init__(self, mock_supabase, secret):
        self._mock_supabase = mock_supabase
        self._secret = secret
        self._patches = []

    def __enter__(self):
        settings_patch = patch("backend.app.api.routes.internal.settings")
        # Route dùng lazy import `from backend.app.clients.supabase import get_supabase_client`
        # bên trong hàm, nên phải patch tại module gốc.
        client_patch = patch(
            "backend.app.clients.supabase.get_supabase_client",
            return_value=self._mock_supabase,
        )
        # __enter__ trả về mock đã thay thế attribute trong module
        self._settings_mock = settings_patch.__enter__()
        client_patch.__enter__()
        self._patches.append(settings_patch)
        self._patches.append(client_patch)
        # Gán cron_secret trên MOCK (không phải target gốc)
        self._settings_mock.cron_secret = self._secret
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        for p in reversed(self._patches):
            p.__exit__(exc_type, exc_val, exc_tb)
        self._patches.clear()


def test_valid_secret_succeeds():
    """TC-API-CRON-001: Valid secret -> 200, success=true."""
    mock_supabase = make_mock_supabase(rejected_count=3)
    with _CronPatch(mock_supabase, VALID_SECRET):
        try:
            client = TestClient(app)
            response = client.post(
                "/api/v1/internal/cron/auto-reject-expired?batch_size=100",
                headers={"X-Cron-Secret": VALID_SECRET},
            )
            assert response.status_code == 200, f"Got {response.status_code}: {response.text}"
            data = response.json()
            assert data["success"] is True
            assert data["rejected_count"] == 3
            assert len(data["applications"]) == 3
            print(f"OK valid secret: rejected_count={data['rejected_count']}")
        finally:
            app.dependency_overrides.clear()


def test_invalid_secret_rejected():
    """TC-API-CRON-002: Invalid secret -> 403."""
    mock_supabase = make_mock_supabase()
    with _CronPatch(mock_supabase, VALID_SECRET):
        try:
            client = TestClient(app)
            response = client.post(
                "/api/v1/internal/cron/auto-reject-expired",
                headers={"X-Cron-Secret": INVALID_SECRET},
            )
            assert response.status_code == 403, f"Expected 403, got {response.status_code}"
            print(f"OK invalid secret blocked: {response.status_code}")
        finally:
            app.dependency_overrides.clear()


def test_missing_secret_rejected():
    """TC-API-CRON-003: Missing header -> 422 (FastAPI Header required)."""
    mock_supabase = make_mock_supabase()
    with _CronPatch(mock_supabase, VALID_SECRET):
        try:
            client = TestClient(app)
            response = client.post("/api/v1/internal/cron/auto-reject-expired")
            assert response.status_code == 422, f"Expected 422, got {response.status_code}"
            print(f"OK missing secret header: {response.status_code}")
        finally:
            app.dependency_overrides.clear()


def test_no_expired_apps():
    """TC-API-CRON-006: Khong co apps qua han -> rejected_count=0."""
    mock_supabase = make_mock_supabase(rejected_count=0)
    with _CronPatch(mock_supabase, VALID_SECRET):
        try:
            client = TestClient(app)
            response = client.post(
                "/api/v1/internal/cron/auto-reject-expired",
                headers={"X-Cron-Secret": VALID_SECRET},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["rejected_count"] == 0
            print(f"OK no expired apps: rejected_count=0")
        finally:
            app.dependency_overrides.clear()


def test_cron_secret_unconfigured():
    """TC-SEC-022: Neu settings.cron_secret empty -> all requests blocked."""
    mock_supabase = make_mock_supabase()
    with _CronPatch(mock_supabase, ""):
        try:
            client = TestClient(app)
            # Any secret is rejected when not configured
            response = client.post(
                "/api/v1/internal/cron/auto-reject-expired",
                headers={"X-Cron-Secret": "anything"},
            )
            assert response.status_code == 403, f"Expected 403, got {response.status_code}"
            print(f"OK unconfigured secret blocks all: {response.status_code}")
        finally:
            app.dependency_overrides.clear()


def test_brute_force_protection():
    """TC-SEC-022: Multiple wrong secrets all return 403."""
    mock_supabase = make_mock_supabase()
    with _CronPatch(mock_supabase, VALID_SECRET):
        try:
            client = TestClient(app)
            for guess in ["guess1", "guess2", "admin", "password", "12345"]:
                response = client.post(
                    "/api/v1/internal/cron/auto-reject-expired",
                    headers={"X-Cron-Secret": guess},
                )
                assert response.status_code == 403, f"Guess '{guess}' got {response.status_code}"
            print(f"OK brute force protected: 5 wrong secrets all 403")
        finally:
            app.dependency_overrides.clear()


if __name__ == "__main__":
    tests = [
        test_valid_secret_succeeds,
        test_invalid_secret_rejected,
        test_missing_secret_rejected,
        test_no_expired_apps,
        test_cron_secret_unconfigured,
        test_brute_force_protection,
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
    print(f"\n=== Cron Endpoint: {passed} passed, {failed} failed ===")
    sys.exit(0 if failed == 0 else 1)
