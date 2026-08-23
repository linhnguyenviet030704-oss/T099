"""Inspect a single embedded resume to see why candidates get dropped."""
import json
import subprocess
import urllib.request


def _status():
    out = subprocess.run(
        "npx supabase status -o json --workdir .",
        capture_output=True,
        text=True,
        cwd=r"c:\Users\Admin\AI IA\team-Matikanefukukitaru",
        check=True,
        shell=True,
    )
    return json.loads(out.stdout)


def main():
    s = _status()
    svc = s["SERVICE_ROLE_KEY"]
    base = s["API_URL"]
    headers = {"apikey": svc, "Authorization": f"Bearer {svc}"}

    # Job #2 (Backend Python)
    # Application: d0000000-0000-4000-8000-000000000009? Need to verify
    # Let's find them
    req = urllib.request.Request(
        f"{base}/rest/v1/job_submits?job_post_id=eq.b0000000-0000-4000-8000-000000000002&select=id,applicant_user_id,resume_id",
        headers=headers,
    )
    with urllib.request.urlopen(req, timeout=5) as r:
        subs = json.loads(r.read())
    print(f"Apps: {subs}")

    for sub in subs:
        # Embedded resume
        req = urllib.request.Request(
            f"{base}/rest/v1/embedded_resumes?resume_id=eq.{sub['resume_id']}&select=resume_id,markdown,clean_markdown,metadata,model,content_hash&limit=1",
            headers=headers,
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                embs = json.loads(r.read())
            print(f"\n=== resume_id {sub['resume_id'][:8]} ===")
            if embs:
                e = embs[0]
                print(f"  model={e.get('model')}")
                print(f"  metadata={json.dumps(e.get('metadata'), indent=2)[:400]}")
                print(f"  clean_markdown first 400: {(e.get('clean_markdown') or '')[:400]!r}")
                print(f"  markdown first 400: {(e.get('markdown') or '')[:400]!r}")
            else:
                print("  no embedded_resumes for this resume")
        except Exception as ex:
            print(f"  err: {ex}")


if __name__ == "__main__":
    main()