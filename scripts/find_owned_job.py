"""Check who owns specific jobs in the live DB."""
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

    # Get all 5 recruiter_pool user_ids by querying company_members where the user is an owner
    req = urllib.request.Request(
        f"{base}/rest/v1/profiles?role=in.(recruiter)&select=id,full_name,email&limit=10",
        headers=headers,
    )
    with urllib.request.urlopen(req, timeout=5) as r:
        recruiters = json.loads(r.read())
    print("Recruiter users:")
    for r in recruiters:
        print(f"  {r['id']}  {r.get('email')!r}  {r.get('full_name')!r}")

    # For each, find a job they posted
    for rec in recruiters:
        req = urllib.request.Request(
            f"{base}/rest/v1/job_posts?created_by_user_id=eq.{rec['id']}&status=eq.published&select=id,title&limit=3",
            headers=headers,
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            jobs = json.loads(r.read())
        # Pick first one with apps
        for j in jobs:
            req = urllib.request.Request(
                f"{base}/rest/v1/job_submits?job_post_id=eq.{j['id']}&select=id&limit=1",
                headers=headers,
            )
            with urllib.request.urlopen(req, timeout=5) as r:
                apps = json.loads(r.read())
            if apps:
                print(f"  -> {rec['id']}  job={j['id']}  {j['title']!r}  apps={len(apps)}")
                break


if __name__ == "__main__":
    main()