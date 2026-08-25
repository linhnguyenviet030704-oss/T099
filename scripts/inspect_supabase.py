"""Inspect what jobs/applications exist in the live local Supabase."""
import json
import os
import subprocess
import sys
from urllib.parse import quote


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
    env = _status()
    svc = env["SERVICE_ROLE_KEY"]
    base = env["API_URL"]
    headers = {
        "apikey": svc,
        "Authorization": f"Bearer {svc}",
        "Content-Type": "application/json",
    }
    import urllib.request

    def fetch(path: str) -> list:
        req = urllib.request.Request(f"{base}{path}", headers=headers)
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.loads(r.read())

    # What's already in the DB?
    counts = {}
    for tbl in ["profiles", "companies", "job_posts", "job_submits", "resumes", "embedded_resumes"]:
        try:
            # Just count rows
            req = urllib.request.Request(
                f"{base}/rest/v1/{tbl}?select=id",
                headers={**headers, "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"},
            )
            with urllib.request.urlopen(req, timeout=5) as r:
                cr = r.headers.get("Content-Range", "")
                counts[tbl] = cr.split("/")[-1] if "/" in cr else "?"
        except Exception as e:
            counts[tbl] = f"err: {e}"

    print("Row counts in current Supabase:")
    for k, v in counts.items():
        print(f"  {k:25} = {v}")

    # Show a sample job
    try:
        jobs = fetch("/rest/v1/job_posts?select=id,title,status&limit=5")
        print("\nSample jobs:")
        for j in jobs:
            print(f"  - {j}")
    except Exception as e:
        print(f"  no jobs: {e}")

    try:
        subs = fetch("/rest/v1/job_submits?select=id,applicant_user_id,job_post_id&limit=5")
        print("\nSample applications:")
        for s in subs:
            print(f"  - {s}")
    except Exception as e:
        print(f"  no applications: {e}")


if __name__ == "__main__":
    main()