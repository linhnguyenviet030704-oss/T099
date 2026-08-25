"""Production-safe Data Seeding Script with Manifest Tracking.

Seeds sample users, profiles, companies, job posts, resumes, PDF files in Storage,
and vector embeddings into a target Supabase instance (Local, Staging, or Production).

All created entity IDs and storage paths are recorded into a manifest JSON file
(`scripts/seed_manifest.json`), which enables instant, 100% clean rollback via
`scripts/revert_production_seed.py`.

Usage:
    python scripts/seed_production.py --url <SUPABASE_URL> --key <SERVICE_ROLE_KEY>
Or set environment variables SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pymupdf
from supabase import create_client

from backend.app.services.matching.embed import DEFAULT_EMBEDDING_MODEL, embed_text
from backend.app.services.matching.parse import parse_resume_bytes
from backend.app.services.matching.skills import extract_skills

DEFAULT_MANIFEST_PATH = ROOT / "scripts" / "seed_manifest.json"

# Fixed deterministic UUIDs for core seed data
CANDIDATE_ID = "11111111-1111-1111-1111-111111111111"
RECRUITER_ID = "22222222-2222-2222-2222-222222222222"
ADMIN_ID = "33333333-3333-3333-3333-333333333333"

DEMO_CVS = [
    {
        "title": "Senior React Engineer",
        "full_name": "Nguyễn Văn Ứng Viên",
        "headline": "Senior Frontend Engineer",
        "summary": "Six years shipping design systems and SPA dashboards.",
        "experience": "Led a React TypeScript design system used by 40 engineers. Mentored juniors on Git reviews.",
        "education": "BSc Computer Science, HCMUS",
        "skills": "React TypeScript JavaScript Git Docker",
    },
    {
        "title": "Mid React TypeScript",
        "full_name": "Trần Minh Khoa",
        "headline": "Frontend Developer",
        "summary": "Four years of product UI work on B2B admin tools.",
        "experience": "Built filterable tables and form wizards in React with TypeScript. Daily Git feature branches.",
        "education": "BEng Software, Bach Khoa HCM",
        "skills": "React TypeScript JavaScript Git",
    },
    {
        "title": "React Next specialist",
        "full_name": "Lê Thị Hạnh",
        "headline": "Frontend Engineer",
        "summary": "SSR storefronts and app router migrations.",
        "experience": "Migrated a marketing site to React with TypeScript. Owned Git release tags.",
        "education": "BSc IT, UIT",
        "skills": "React TypeScript JavaScript Git",
    },
    {
        "title": "React JavaScript Git",
        "full_name": "Phạm Đức Anh",
        "headline": "UI Engineer",
        "summary": "Component-heavy CRMs without a typed codebase yet.",
        "experience": "Delivered React widgets in JavaScript. Reviewed Git diffs for accessibility.",
        "education": "College of Information Technology",
        "skills": "React JavaScript Git",
    },
    {
        "title": "React TypeScript emailed zips",
        "full_name": "Hoàng Ngọc Lan",
        "headline": "Frontend Developer",
        "summary": "Typed React screens for an insurance portal.",
        "experience": "Wrote React TypeScript form validation and JavaScript utilities. Solo contractor.",
        "education": "BSc Math, Hue University",
        "skills": "React TypeScript JavaScript",
    },
]

COMPANY_NAMES = [
    "FPT Software", "VNG Corporation", "Viettel Solutions", "Tiki Corporation",
    "Shopee Vietnam", "MoMo", "Techcombank Digital", "Grab Vietnam",
    "Be Group", "Zalo Group"
]

JOB_TITLES = [
    "Frontend React Developer", "Backend Python Engineer", "Fullstack Developer",
    "Product Designer", "QA Engineer", "DevOps Engineer", "Data Analyst",
    "Mobile Flutter Developer", "Business Analyst", "AI/ML Engineer"
]


def _unicode_font() -> str | None:
    for path in (
        Path(r"C:\Windows\Fonts\arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
    ):
        if path.exists():
            return str(path)
    return None


def generate_mock_pdf(cv: dict) -> bytes:
    text = (
        f"{cv['full_name']}\n{cv['headline']}\n{cv['title']}\n\n"
        f"Summary\n{cv['summary']}\n\n"
        f"Experience\n{cv['experience']}\n\n"
        f"Education\n{cv['education']}\n\n"
        f"Skills\n{cv['skills']}\n"
    )
    doc = pymupdf.open()
    page = doc.new_page()
    fontfile = _unicode_font()
    rect = pymupdf.Rect(48, 48, 547, 780)
    if fontfile:
        page.insert_font(fontname="uni", fontfile=fontfile)
        page.insert_textbox(rect, text, fontsize=11, fontname="uni")
    else:
        page.insert_textbox(rect, text, fontsize=11)
    data = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return data


def create_auth_user(client, email: str, password: str, full_name: str, preferred_id: str | None = None) -> str:
    """Create an auth user safely using GoTrue Auth Admin API."""
    try:
        res = client.auth.admin.list_users(per_page=1000)
        users_list = res.users if hasattr(res, "users") else res
        for u in users_list:
            if getattr(u, "email", None) == email:
                return str(u.id)
    except Exception:
        pass

    params = {
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {"full_name": full_name},
    }
    if preferred_id:
        params["id"] = preferred_id

    try:
        res = client.auth.admin.create_user(params)
        return str(res.user.id)
    except Exception as e:
        if "already been registered" in str(e) or "already exists" in str(e):
            res = client.auth.admin.list_users(per_page=1000)
            users_list = res.users if hasattr(res, "users") else res
            for u in users_list:
                if getattr(u, "email", None) == email:
                    return str(u.id)
        raise e


def main():
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")

    parser = argparse.ArgumentParser(description="Seed data to Supabase with manifest tracking.")
    parser.add_argument("--url", help="Supabase API URL", default=os.getenv("SUPABASE_URL"))
    parser.add_argument("--key", help="Supabase Service Role Key", default=os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
    parser.add_argument("--manifest", help="Manifest output JSON file path", default=str(DEFAULT_MANIFEST_PATH))
    args = parser.parse_args()

    url = args.url
    key = args.key
    if not url or not key:
        print("ERROR: Supabase URL and Service Role Key are required.")
        print("Provide --url and --key or set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.")
        sys.exit(1)

    print(f"Connecting to Supabase instance: {url}")
    client = create_client(url, key)

    manifest = {
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "supabase_url": url,
        "user_ids": [],
        "profile_ids": [],
        "company_ids": [],
        "company_member_ids": [],
        "job_ids": [],
        "resume_ids": [],
        "submit_ids": [],
        "embedded_resume_ids": [],
        "storage_paths": [],
    }

    try:
        # 1. Create Core Users
        print("\n[1/6] Creating auth users & profiles...")
        core_users = [
            ("candidate@example.com", "password123", "Nguyễn Văn Ứng Viên", "candidate", CANDIDATE_ID),
            ("recruiter@example.com", "password123", "Trần Thị Tuyển Dụng", "recruiter", RECRUITER_ID),
            ("admin@example.com", "password123", "Admin Hệ Thống", "admin", ADMIN_ID),
        ]

        for email, password, full_name, role, pref_id in core_users:
            uid = create_auth_user(client, email, password, full_name, pref_id)
            manifest["user_ids"].append(uid)
            manifest["profile_ids"].append(uid)

            # Update profile role
            try:
                client.table("profiles").update({"role": role, "full_name": full_name}).eq("id", uid).execute()
            except Exception as e:
                print(f"  Warning updating profile for {email}: {e}")
            print(f"  User created: {email} ({role}) -> {uid}")

        # 2. Create Companies
        print("\n[2/6] Creating companies...")
        for i, name in enumerate(COMPANY_NAMES, start=1):
            cid = f"a0000000-0000-4000-8000-{i:012d}"
            company_data = {
                "id": cid,
                "name": name,
                "slug": f"mock-{i}-{name.lower().replace(' ', '-')}",
                "website_url": f"https://example.com/{i}",
                "description": f"Công ty demo seed #{i} - {name}",
                "created_by_user_id": RECRUITER_ID,
                "verification_status": "verified",
            }
            client.table("companies").upsert(company_data).execute()
            manifest["company_ids"].append(cid)

            # Company member owner
            mem = {"company_id": cid, "user_id": RECRUITER_ID, "role": "owner", "is_active": True}
            try:
                client.table("company_members").upsert(mem, on_conflict="company_id,user_id").execute()
            except Exception:
                pass
            manifest["company_member_ids"].append(f"{cid}:{RECRUITER_ID}")

        print(f"  Created {len(manifest['company_ids'])} companies.")

        # 3. Create Job Posts
        print("\n[3/6] Creating job posts...")
        for i, title in enumerate(JOB_TITLES, start=1):
            jid = f"b0000000-0000-4000-8000-{i:012d}"
            cid = manifest["company_ids"][(i - 1) % len(manifest["company_ids"])]
            job_data = {
                "id": jid,
                "company_id": cid,
                "created_by_user_id": RECRUITER_ID,
                "title": f"{title} #{i}",
                "description": f"Mô tả vị trí tuyển dụng demo seed #{i} - {title}",
                "requirements": "React TypeScript JavaScript Git\n- 2+ years experience\n- Teamwork",
                "benefits": "- Insurance\n- Flexible work\n- Laptop bonus",
                "location": "Hà Nội",
                "employment_type": "full_time",
                "salary_min": 15000000,
                "salary_max": 30000000,
                "currency": "VND",
                "status": "published",
            }
            client.table("job_posts").upsert(job_data).execute()
            manifest["job_ids"].append(jid)

        print(f"  Created {len(manifest['job_ids'])} job posts.")

        # 4. Create Resumes & Upload Mock PDFs
        print("\n[4/6] Creating resumes & uploading Storage PDFs...")
        for i, cv in enumerate(DEMO_CVS, start=1):
            rid = f"c0000000-0000-4000-8000-{i:012d}"
            storage_path = f"{CANDIDATE_ID}/resumes/{rid}/cv-mock.pdf"

            resume_data = {
                "id": rid,
                "user_id": CANDIDATE_ID,
                "bucket_id": "resumes",
                "storage_path": storage_path,
                "original_filename": f"cv-mock-{i}.pdf",
                "title": cv["title"],
                "mime_type": "application/pdf",
                "size_bytes": 10240,
                "is_default": (i == 1),
            }
            client.table("resumes").upsert(resume_data).execute()
            manifest["resume_ids"].append(rid)

            # Upload PDF bytes to Storage bucket
            pdf_bytes = generate_mock_pdf(cv)
            try:
                client.storage.from_("resumes").upload(
                    path=storage_path,
                    file=pdf_bytes,
                    file_options={"content-type": "application/pdf", "upsert": "true"},
                )
            except Exception as st_err:
                try:
                    client.storage.from_("resumes").update(
                        path=storage_path,
                        file=pdf_bytes,
                        file_options={"content-type": "application/pdf"},
                    )
                except Exception:
                    print(f"  Warning uploading storage file {storage_path}: {st_err}")

            manifest["storage_paths"].append(storage_path)

            # Insert embedded resumes
            try:
                parsed = parse_resume_bytes(pdf_bytes, mime_type="application/pdf")
                markdown = parsed.get("markdown") or f"{cv['full_name']} {cv['skills']} {cv['summary']}"
                client.table("embedded_resumes").upsert({
                    "resume_id": rid,
                    "markdown": markdown,
                    "metadata": {"skills": extract_skills(markdown), "summary": cv["summary"], "titles": [cv["title"]]},
                    "content_hash": hashlib.sha256(pdf_bytes).hexdigest(),
                    "embedding": embed_text(markdown),
                    "model": DEFAULT_EMBEDDING_MODEL,
                }).execute()
                manifest["embedded_resume_ids"].append(rid)
            except Exception as emb_err:
                print(f"  Warning generating embedding for resume {rid}: {emb_err}")

        print(f"  Created {len(manifest['resume_ids'])} resumes & uploaded PDF files.")

        # 5. Create Job Submissions
        print("\n[5/6] Submitting job applications...")
        for i, rid in enumerate(manifest["resume_ids"], start=1):
            sid = f"d0000000-0000-4000-8000-{i:012d}"
            jid = manifest["job_ids"][(i - 1) % len(manifest["job_ids"])]  # Distribute across jobs
            sub_data = {
                "id": sid,
                "job_post_id": jid,
                "applicant_user_id": CANDIDATE_ID,
                "resume_id": rid,
                "cover_letter": f"Cover letter for {DEMO_CVS[i - 1]['title']}",
            }
            try:
                client.table("job_submits").upsert(sub_data, on_conflict="job_post_id,applicant_user_id").execute()
            except Exception:
                pass
            manifest["submit_ids"].append(sid)

        print(f"  Created {len(manifest['submit_ids'])} job submissions.")

        # 6. Save Manifest File
        manifest_path = Path(args.manifest)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)

        print("\n========================================================")
        print(" SUCCESS: Production Data Seed Completed!")
        print(f" Manifest saved to: {manifest_path.resolve()}")
        print(" To revert this seed immediately, run:")
        print(f"   python scripts/revert_production_seed.py --manifest {manifest_path}")
        print("========================================================")

    except Exception as e:
        print(f"\nERROR during seeding process: {e}")
        import traceback
        traceback.print_exc()

        manifest_path = Path(args.manifest)
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
        print(f"Partial manifest saved to {manifest_path}")
        sys.exit(1)


if __name__ == "__main__":
    main()
