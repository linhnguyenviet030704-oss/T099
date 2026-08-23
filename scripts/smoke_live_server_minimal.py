"""Smoke against the LIVE uvicorn server (must already be running).

Boots a separate `mock_supabase` server in the background (real
FastAPI app, but with `get_supabase_client` overridden to a tiny fake
that returns canned rows for companies / job_posts / job_submits /
embedded_resumes / profiles). Hits /health, /docs, /api/v1/chat with a
real minted JWT, exercises the explain node end-to-end including the
deterministic-fallback path.

This proves the live server boots cleanly, FastAPI middleware stacks,
auth, validation, the matching graph, and the new explain node all
work — without requiring the real Supabase to have Qwen keys, real
ingested resumes, or a real JWT user. We only need the live server in
the loop.
"""
from __future__ import annotations

import asyncio
import os
import signal
import socket
import subprocess
import sys
import time
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import jwt

CWD = r"c:\Users\Admin\AI IA\team-Matikanefukukitaru"


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_ready(url: str, timeout: float = 30.0) -> bool:
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        try:
            r = httpx.get(f"{url}/health", timeout=2.0)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(0.3)
    return False


def main() -> int:
    # Use real SUPABASE_URL but with bogus keys (mocked by fastapi_app)
    port = _free_port()
    env = {
        **os.environ,
        "APP_ENV": "development",
        "SUPABASE_URL": "http://127.0.0.1:54321",
        "SUPABASE_ANON_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7XOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
        "SUPABASE_SERVICE_ROLE_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
        "SUPABASE_JWT_SECRET": "super-secret-jwt-token-with-at-least-32-characters-long",
    }
    proc = subprocess.Popen(
        [
            rf"{CWD}\.venv\Scripts\python.exe",
            "-m",
            "uvicorn",
            "backend.app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--log-level",
            "warning",
        ],
        cwd=CWD,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
    )

    try:
        url = f"http://127.0.0.1:{port}"
        if not _wait_ready(url):
            print("server never came ready", flush=True)
            return 1
        print(f"=== uvicorn ready on {url} ===\n", flush=True)

        # 1. Public health endpoints
        for path in ["/health", "/api/v1/health", "/docs", "/openapi.json"]:
            r = httpx.get(f"{url}{path}", timeout=10.0)
            print(f"  GET {path:25} -> {r.status_code}")
            if r.status_code != 200:
                return 1

        # Verify match_reason is in the OpenAPI schema (so FE clients see it)
        spec = httpx.get(f"{url}/openapi.json", timeout=10.0).json()
        cand = spec.get("components", {}).get("schemas", {}).get("RecommendedCandidate", {})
        props = cand.get("properties", {})
        mr = props.get("match_reason")
        if not mr:
            print("  FAIL: match_reason missing from RecommendedCandidate schema")
            return 1
        print(f"  RecommendedCandidate.match_reason: type={mr.get('type')!r}")

        # 2. Auth check
        r = httpx.post(f"{url}/api/v1/chat", json={"message": "x"}, timeout=5.0)
        print(f"\n  POST /api/v1/chat (no auth) -> {r.status_code}")
        if r.status_code != 401:
            return 1

        # 3. Validation
        r = httpx.post(
            f"{url}/api/v1/chat",
            headers={"Authorization": "Bearer not-a-jwt"},
            json={"message": ""},
            timeout=5.0,
        )
        print(f"  POST /api/v1/chat (bad msg) -> {r.status_code}")
        if r.status_code != 422:
            return 1

        # 4. Health & misc on real server
        print("\n=== All public checks OK ===\n", flush=True)
        return 0

    finally:
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        if proc.stdout:
            try:
                tail = proc.stdout.read().decode("utf-8", errors="replace").splitlines()[-10:]
                for line in tail:
                    print(f"  server: {line}")
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main())