"""Smoke against the LIVE uvicorn server (must be running on 8765).

Uses an in-process httpx client and a self-signed JWT (default dev
secret) to drive real HTTP requests, exercising the auth middleware,
rate limiter dependency, and the route handlers without ever needing
Supabase. We only assert on the response status + body shape, not on
the JWT contents.
"""
from __future__ import annotations

import sys
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import httpx
import jwt

from backend.app.config.env import settings


def _token() -> str:
    return jwt.encode(
        {
            "sub": str(uuid4()),
            "email": "smoke@example.com",
            "aud": "authenticated",
            "role": "authenticated",
            "iat": int(datetime.now(UTC).timestamp()),
            "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )


def main() -> int:
    base = "http://127.0.0.1:8765"
    failures = 0

    # Public endpoints
    r = httpx.get(f"{base}/health")
    print(f"GET /health -> {r.status_code} body={r.text!r}")
    if r.status_code != 200 or r.json().get("status") != "ok":
        failures += 1

    r = httpx.get(f"{base}/api/v1/health")
    print(f"GET /api/v1/health -> {r.status_code}")
    if r.status_code != 200:
        failures += 1

    # Auth-required endpoints without bearer -> 401
    r = httpx.post(f"{base}/api/v1/chat", json={"message": "x"})
    print(f"POST /api/v1/chat (no auth) -> {r.status_code} code={r.json().get('code')!r}")
    if r.status_code != 401 or r.json().get("code") != "UNAUTHORIZED":
        failures += 1

    r = httpx.get(f"{base}/api/v1/profiles/me")
    print(f"GET /api/v1/profiles/me (no auth) -> {r.status_code}")
    if r.status_code != 401:
        failures += 1

    # With bearer token but no Supabase -> 500 from real query failure
    # (proves authz check passes and we hit the DB layer)
    headers = {"Authorization": f"Bearer {_token()}"}
    r = httpx.get(f"{base}/api/v1/profiles/me", headers=headers)
    print(f"GET /api/v1/profiles/me (with JWT, no DB) -> {r.status_code} body[:200]={r.text[:200]!r}")
    if r.status_code not in (404, 500):
        # 404 if profile not found; 500 if DB unreachable. Either is OK,
        # what we DON'T want is 401 (authz failed) or 200 (authz bypassed).
        failures += 1
    if r.status_code == 401:
        failures += 1

    r = httpx.post(
        f"{base}/api/v1/chat",
        headers=headers,
        json={"message": "Gợi ý ứng viên", "job_id": str(uuid4())},
    )
    print(f"POST /api/v1/chat (with JWT, job_id, no DB) -> {r.status_code} body[:200]={r.text[:200]!r}")
    if r.status_code == 401:
        failures += 1  # authz bypass

    # Empty message -> 422 validation
    r = httpx.post(f"{base}/api/v1/chat", headers=headers, json={"message": ""})
    print(f"POST /api/v1/chat (empty msg) -> {r.status_code}")
    if r.status_code != 422:
        failures += 1

    # Invalid job_id -> 422 validation
    r = httpx.post(
        f"{base}/api/v1/chat", headers=headers, json={"message": "x", "job_id": "not-a-uuid"}
    )
    print(f"POST /api/v1/chat (bad job_id) -> {r.status_code}")
    if r.status_code != 422:
        failures += 1

    # Rerank enum
    r = httpx.post(
        f"{base}/api/v1/chat", headers=headers, json={"message": "x", "rerank": "cohere"}
    )
    print(f"POST /api/v1/chat (bad rerank enum) -> {r.status_code}")
    if r.status_code != 422:
        failures += 1

    # OpenAPI
    r = httpx.get(f"{base}/openapi.json")
    print(f"GET /openapi.json -> {r.status_code}")
    if r.status_code != 200:
        failures += 1
    spec = r.json()
    paths = spec.get("paths", {})
    print(f"  OpenAPI paths: {sorted(paths.keys())}")
    chat_path = paths.get("/api/v1/chat", {})
    chat_schema = chat_path.get("post", {}).get("requestBody", {}).get("content", {}).get(
        "application/json", {}
    ).get("schema", {})
    if "match_reason" in str(chat_schema):
        print("  MATCH_REASON is in /api/v1/chat request schema")
    else:
        # Check response schema
        response_schema = (
            chat_path.get("post", {})
            .get("responses", {})
            .get("200", {})
            .get("content", {})
            .get("application/json", {})
            .get("schema", {})
        )
        print(f"  /chat response schema components: {list(response_schema.keys())}")
        # Look in components
        components = spec.get("components", {}).get("schemas", {})
        cand_schema = components.get("RecommendedCandidate", {})
        props = cand_schema.get("properties", {})
        if "match_reason" in props:
            print(f"  RecommendedCandidate.match_reason in OpenAPI: type={props['match_reason'].get('type')!r}, nullable={props['match_reason'].get('nullable')!r}")
        else:
            failures += 1
            print("  MISSING match_reason in RecommendedCandidate schema!")

    if failures:
        print(f"\n{failures} FAILURE(S)")
        return 1
    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())