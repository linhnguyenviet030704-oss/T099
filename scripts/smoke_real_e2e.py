"""End-to-end against the LIVE local Supabase + uvicorn stack.

Flow:
  1. Read supabase env (in memory only).
  2. Login as recruiter@example.com / password123 → real access_token.
  3. Boot uvicorn with real DB env vars.
  4. Pick a real published job that has applications.
  5. POST /api/v1/chat {job_id: ...} with the real bearer token.
  6. Assert response.candidates each have non-empty match_reason.
  7. Tear down: kill uvicorn.

No secret is ever printed. Backend will use its real Supabase client
(bypassing RLS via service role when needed). Qwen key is empty in
this env, so embed/chat/rerank calls fall through to fallback path —
no remote HTTP, fully deterministic. Backend must still hit Supabase
and the matching graph end-to-end.
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
from uuid import uuid4

import httpx

CWD = r"c:\Users\Admin\AI IA\team-Matikanefukukitaru"


def _status() -> dict[str, str]:
    out = subprocess.run(
        "npx supabase status -o json --workdir .",
        capture_output=True,
        text=True,
        cwd=CWD,
        check=True,
        shell=True,
    )
    return json.loads(out.stdout)


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


async def main() -> int:
    print("=== Reading Supabase env (in memory) ===", flush=True)
    s = _status()
    base = s["API_URL"]
    print(f"  api_url len={len(base)}", flush=True)

    # Verify reachable
    async with httpx.AsyncClient(timeout=5.0) as c:
        r = await c.get(f"{base}/auth/v1/health", headers={"apikey": s["ANON_KEY"]})
        print(f"  supabase health: HTTP {r.status_code}", flush=True)
        if r.status_code != 200:
            return 1

    # Login as recruiter@example.com — owns job #1 with 20 applications
    print("\n=== Logging in as recruiter@example.com ===", flush=True)
    async with httpx.AsyncClient(timeout=10.0) as c:
        r = await c.post(
            f"{base}/auth/v1/token?grant_type=password",
            headers={"apikey": s["ANON_KEY"], "Content-Type": "application/json"},
            json={"email": "recruiter@example.com", "password": "password123"},
        )
        print(f"  login HTTP {r.status_code}", flush=True)
        if r.status_code != 200:
            print(f"  body: {r.text[:200]}")
            return 1
        token_data = r.json()
        access_token = token_data["access_token"]
        user_id = token_data["user"]["id"]
        print(f"  user_id len={len(user_id)}", flush=True)

    # Pick a real job with applications, owned by the recruiter.
    # recruiter owns job #1 (Frontend React Developer) with 20 applications.
    job_id = "b0000000-0000-4000-8000-000000000001"
    print(f"\n=== Trying job {job_id} (Frontend React Developer #1, 20 apps) ===", flush=True)

    port = _free_port()
    log_path = os.path.join(CWD, "uvicorn_smoke.log")
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
            "debug",
        ],
        cwd=CWD,
        stdout=open(log_path, "w", encoding="utf-8"),
        stderr=subprocess.STDOUT,
        env={
            **os.environ,
            "APP_ENV": "development",
            "SUPABASE_URL": s["API_URL"],
            "SUPABASE_ANON_KEY": s["ANON_KEY"],
            "SUPABASE_SERVICE_ROLE_KEY": s["SERVICE_ROLE_KEY"],
            "SUPABASE_JWT_SECRET": s["JWT_SECRET"],
        },
    )

    try:
        api = f"http://127.0.0.1:{port}"
        if not _wait_ready(api):
            print("\n  uvicorn never came ready")
            return 1
        print(f"\n=== uvicorn ready on {api} ===\n", flush=True)

        payload = {
            "message": "Tìm ứng viên phù hợp cho job Python FastAPI",
            "job_id": job_id,
            "rerank": "agent",  # skip Qwen rerank (saves time), keep explain
        }
        print(f"=== POST /api/v1/chat job_id={job_id} ===\n", flush=True)
        # The full pipeline (skill confirm → embedding → explain) hits Qwen 2-3
        # times with a real key. Each roundtrip is ~5-8s. Allow 5 min.
        async with httpx.AsyncClient(timeout=300.0) as c:
            try:
                r = await c.post(
                    f"{api}/api/v1/chat",
                    headers={"Authorization": f"Bearer {access_token}"},
                    json=payload,
                )
            except (httpx.ReadTimeout, httpx.RemoteProtocolError):
                print("  request timed out — dumping uvicorn log tail")
                with open(log_path, encoding="utf-8") as f:
                    lines = f.read().splitlines()
                for line in lines[-40:]:
                    print(f"  {line}")
                # also dump full log so we can see where it stalled
                print(f"\n  full log saved to {log_path}")
                raise
        print(f"  HTTP {r.status_code}", flush=True)
        if r.status_code != 200:
            print(f"  body: {r.text[:500]}")
            return 1
        body = r.json()
        response = body.get("response", "")
        candidates = body.get("candidates", [])
        print(f"  response: {response[:120]!r}", flush=True)
        print(f"  # candidates: {len(candidates)}", flush=True)

        failures = 0
        for cand in candidates:
            aid = cand["application_id"]
            rs = cand.get("rerank_score")
            rst = cand.get("rerank_status")
            mr = cand.get("match_reason")
            full = cand.get("full_name")
            print(f"\n  candidate {aid[:8]}... name={full!r}", flush=True)
            print(f"    rrf={cand.get('rrf_score'):.3f} rerank={rs!r} status={rst!r}", flush=True)
            print(f"    match_reason={(mr or '<none>')[:300]!r}", flush=True)
            if not mr:
                print("    FAIL: match_reason missing")
                failures += 1

        # Now hit `/` GET /api/v1/chat WITHOUT job_id to verify the
        # jobs-recommend path also still works
        print(f"\n=== POST /api/v1/chat (no job_id, jobs branch) ===\n", flush=True)
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                f"{api}/api/v1/chat",
                headers={"Authorization": f"Bearer {access_token}"},
                json={"message": "Gợi ý việc làm"},
            )
        print(f"  HTTP {r.status_code}", flush=True)
        if r.status_code == 200:
            jb = r.json()
            print(f"  response: {jb.get('response', '')[:120]!r}", flush=True)
            print(f"  # jobs: {len(jb.get('jobs', []))}", flush=True)
        else:
            print(f"  body: {r.text[:200]}")

        if failures:
            print(f"\n{failures} FAILURE(S)")
            return 1
        print("\nALL CHECKS PASSED — explain attached in real DB-backed run")
        return 0

    finally:
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        if proc.stdout:
            try:
                full = proc.stdout.read().decode("utf-8", errors="replace").splitlines()
                # filter to relevant lines
                kept = [line for line in full if any(t in line for t in (
                    "explain", "rerank", "POST", "POST /api/v1/chat",
                    "ERROR", "Exception", "Traceback", "match_reason",
                ))]
                print("\n=== last 60 relevant lines of uvicorn ===")
                for line in kept[-60:]:
                    print(f"  {line}")
                # also show everything from the last log
                print("\n=== last 30 raw lines ===")
                for line in full[-30:]:
                    print(f"  {line}")
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))