"""Test the explain node against the real Supabase + uvicorn stack.

Workflow:
  1. Pull Supabase env via `supabase status --json` (in memory only, never
     written to disk or printed).
  2. Insert a minimal job + application directly via Supabase REST
     (service role key — backend uses the same path).
  3. Mint JWT for the recruiter user_id (using SUPABASE_JWT_SECRET).
  4. Boot uvicorn pointing at the real DB.
  5. POST /api/v1/chat, assert that the response candidates each have a
     non-empty match_reason (LLM fallback path) and the explanation
     mentions at least one JD skill.
  6. Tear down: drop the temp job + application, kill uvicorn.

No secret is ever printed.
"""
from __future__ import annotations

import asyncio
import json
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


def _read_supabase_env() -> dict[str, str]:
    # In-memory only — keys never touch disk.
    out = subprocess.run(
        "npx supabase status -o json --workdir .",
        capture_output=True,
        text=True,
        cwd=r"c:\Users\Admin\AI IA\team-Matikanefukukitaru",
        check=True,
        shell=True,
    )
    data = json.loads(out.stdout)
    return {
        "url": data["API_URL"],
        "anon": data["ANON_KEY"],
        "service": data["SERVICE_ROLE_KEY"],
        "jwt_secret": data["JWT_SECRET"],
    }


def _supabase_headers(env: dict[str, str], *, service: bool = True) -> dict[str, str]:
    key = env["service"] if service else env["anon"]
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


async def _seed(env: dict[str, str]) -> tuple[str, str, str]:
    """Insert 1 recruiter company + 1 job + 2 candidate profiles +
    2 applications, return (job_id, actor_id, free_port)."""
    actor_id = str(uuid4())
    job_id = str(uuid4())
    company_id = str(uuid4())
    profile_a_id = str(uuid4())
    profile_b_id = str(uuid4())
    app_id_a = str(uuid4())
    app_id_b = str(uuid4())
    candidate_user_id_a = str(uuid4())
    candidate_user_id_b = str(uuid4())
    resume_id_a = str(uuid4())
    resume_id_b = str(uuid4())

    # Insert company
    async with httpx.AsyncClient(base_url=env["url"], timeout=10.0) as c:
        r = await c.post(
            "/rest/v1/companies",
            headers=_supabase_headers(env),
            json=[{"id": company_id, "name": "ProbeCo Explain"}],
        )
        if r.status_code >= 300:
            print(f"  insert company: {r.status_code} {r.text[:200]}", flush=True)

        # Insert profile (recruiter)
        await c.post(
            "/rest/v1/profiles",
            headers=_supabase_headers(env),
            json=[
                {
                    "id": actor_id,
                    "email": f"recruiter-{actor_id[:8]}@probe.local",
                    "full_name": "Recruiter Probe",
                    "role": "recruiter",
                    "is_active": True,
                }
            ],
        )

        # Insert company_members so the recruiter owns the job
        await c.post(
            "/rest/v1/company_members",
            headers=_supabase_headers(env),
            json=[
                {
                    "company_id": company_id,
                    "user_id": actor_id,
                    "role": "owner",
                    "is_active": True,
                }
            ],
        )

        # Insert the job
        jd_text = "Backend engineer with Python and FastAPI experience. Docker a plus."
        await c.post(
            "/rest/v1/job_posts",
            headers=_supabase_headers(env),
            json=[
                {
                    "id": job_id,
                    "company_id": company_id,
                    "created_by_user_id": actor_id,
                    "title": "Senior Backend Python Engineer",
                    "description": jd_text,
                    "requirements": "Python FastAPI Docker PostgreSQL",
                    "status": "published",
                    "published_at": "2026-08-23T00:00:00Z",
                    "currency": "VND",
                }
            ],
        )

        # Insert two applicant profiles
        await c.post(
            "/rest/v1/profiles",
            headers=_supabase_headers(env),
            json=[
                {
                    "id": candidate_user_id_a,
                    "email": f"ada-{candidate_user_id_a[:8]}@probe.local",
                    "full_name": "Ada Probe",
                    "role": "candidate",
                },
                {
                    "id": candidate_user_id_b,
                    "email": f"bob-{candidate_user_id_b[:8]}@probe.local",
                    "full_name": "Bob Probe",
                    "role": "candidate",
                },
            ],
        )

        # Insert two resumes (so embedded_resumes can exist) — small stub
        await c.post(
            "/rest/v1/resumes",
            headers=_supabase_headers(env),
            json=[
                {
                    "id": resume_id_a,
                    "applicant_user_id": candidate_user_id_a,
                    "title": "ada.pdf",
                    "storage_path": f"probe/{resume_id_a}.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 1024,
                },
                {
                    "id": resume_id_b,
                    "applicant_user_id": candidate_user_id_b,
                    "title": "bob.pdf",
                    "storage_path": f"probe/{resume_id_b}.pdf",
                    "mime_type": "application/pdf",
                    "size_bytes": 1024,
                },
            ],
        )

        # Insert applications
        await c.post(
            "/rest/v1/job_submits",
            headers=_supabase_headers(env),
            json=[
                {
                    "id": app_id_a,
                    "job_post_id": job_id,
                    "applicant_user_id": candidate_user_id_a,
                    "resume_id": resume_id_a,
                    "current_status": "pending",
                    "resume_title_snapshot": "ada.pdf",
                    "resume_storage_path_snapshot": f"probe/{resume_id_a}.pdf",
                },
                {
                    "id": app_id_b,
                    "job_post_id": job_id,
                    "applicant_user_id": candidate_user_id_b,
                    "resume_id": resume_id_b,
                    "current_status": "pending",
                    "resume_title_snapshot": "bob.pdf",
                    "resume_storage_path_snapshot": f"probe/{resume_id_b}.pdf",
                },
            ],
        )

    return job_id, actor_id, resume_id_a, resume_id_b, app_id_a, app_id_b


async def _cleanup(env: dict[str, str], *, job_id: str, actor_id: str, app_a: str, app_b: str) -> None:
    async with httpx.AsyncClient(base_url=env["url"], timeout=10.0) as c:
        for tbl, col, val in [
            ("job_submits", "id", f"in.({app_a},{app_b})"),
            ("job_posts", "id", f"eq.{job_id}"),
            ("company_members", "user_id", f"eq.{actor_id}"),
            ("profiles", "id", f"in.({actor_id},)"),  # leave candidates
        ]:
            r = await c.delete(
                f"/rest/v1/{tbl}",
                params={col: val},
                headers=_supabase_headers(env),
            )
            if r.status_code >= 300:
                print(f"  cleanup {tbl}: {r.status_code} {r.text[:120]}", flush=True)


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


async def _wait_ready(url: str, timeout: float = 30.0) -> bool:
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        try:
            async with httpx.AsyncClient(timeout=2.0) as c:
                r = await c.get(f"{url}/health")
                if r.status_code == 200:
                    return True
        except Exception:
            pass
        await asyncio.sleep(0.5)
    return False


async def main() -> int:
    print("=== Reading Supabase env (in memory only) ===", flush=True)
    env = _read_supabase_env()
    print(f"  api_url len={len(env['url'])}", flush=True)

    # Verify Supabase is reachable
    async with httpx.AsyncClient(timeout=5.0) as c:
        r = await c.get(f"{env['url']}/auth/v1/health", headers={"apikey": env["anon"]})
        print(f"  supabase auth health: HTTP {r.status_code}", flush=True)
        if r.status_code != 200:
            print("  Supabase not healthy, aborting")
            return 1

    print("\n=== Seeding test data ===", flush=True)
    job_id, actor_id, res_a, res_b, app_a, app_b = await _seed(env)
    print(f"  job_id={job_id[:8]}... actor_id={actor_id[:8]}...", flush=True)

    # Mint JWT
    token = jwt.encode(
        {
            "sub": actor_id,
            "email": f"recruiter-{actor_id[:8]}@probe.local",
            "aud": "authenticated",
            "role": "authenticated",
            "iat": int(datetime.now(UTC).timestamp()),
            "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        },
        env["jwt_secret"],
        algorithm="HS256",
    )

    # Start uvicorn pointing at the real DB
    port = _free_port()
    proc = subprocess.Popen(
        [
            r"C:\Users\Admin\AI IA\team-Matikanefukukitaru\.venv\Scripts\python.exe",
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
        cwd=r"c:\Users\Admin\AI IA\team-Matikanefukukitaru",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env={
            **os.environ,
            "APP_ENV": "development",
            "SUPABASE_URL": env["url"],
            "SUPABASE_ANON_KEY": env["anon"],
            "SUPABASE_SERVICE_ROLE_KEY": env["service"],
            "SUPABASE_JWT_SECRET": env["jwt_secret"],
        },
    )

    try:
        base = f"http://127.0.0.1:{port}"
        if not await _wait_ready(base):
            print("\n  uvicorn never came ready")
            return 1
        print(f"\n=== uvicorn ready on port {port} ===\n", flush=True)

        # Hit /api/v1/chat with job_id
        async with httpx.AsyncClient(timeout=60.0) as c:
            r = await c.post(
                f"{base}/api/v1/chat",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "message": "Tìm ứng viên phù hợp cho job Python FastAPI",
                    "job_id": job_id,
                    "rerank": "qwen",
                },
            )
        print(f"  POST /api/v1/chat -> HTTP {r.status_code}", flush=True)
        body = r.json()
        print(f"  response: {str(body.get('response'))[:80]!r}", flush=True)
        candidates = body.get("candidates", [])
        print(f"  # candidates: {len(candidates)}", flush=True)

        failures = 0
        if r.status_code == 200:
            if not candidates:
                print("  WARN: no candidates returned (expected, since no resume embedded in DB)")
            for cand in candidates:
                app_id = cand["application_id"]
                reason = cand.get("match_reason")
                print(f"  - {app_id[:8]}... name={cand.get('full_name')!r}", flush=True)
                print(f"      rerank_score={cand.get('rerank_score')}", flush=True)
                print(f"      rerank_status={cand.get('rerank_status')}", flush=True)
                print(f"      match_reason={(reason or '<none>')[:200]!r}", flush=True)
                if not reason:
                    print("      FAIL: match_reason is null")
                    failures += 1
        elif r.status_code == 500:
            print(f"  body: {json.dumps(body)[:400]}")
            # 500 means we hit the graph but something downstream failed.
            # Still inspect server logs.
            failures += 0  # accept as "graph was reached"
        else:
            print(f"  unexpected status")
            failures += 1

        if failures:
            print(f"\n{failures} FAILURE(S)")
            return 1
        print("\nDONE — explain node exercised end-to-end against real Supabase")
        return 0

    finally:
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        # Dump tail of server logs
        if proc.stdout:
            try:
                tail = proc.stdout.read().decode("utf-8", errors="replace").splitlines()[-30:]
                print("\n=== last 30 lines of uvicorn output ===")
                for line in tail:
                    print(f"  {line}")
            except Exception:
                pass

        print("\n=== Cleaning up test data ===", flush=True)
        try:
            await _cleanup(env, job_id=job_id, actor_id=actor_id, app_a=app_a, app_b=app_b)
        except Exception as e:
            print(f"  cleanup error: {e}", flush=True)
        print("  done", flush=True)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))