"""Seed data_find/generated_cv (synthetic IT resumes) into Supabase local.

For each row in metadata.csv: create a candidate auth user (idempotent — safe
to re-run), upload the matching PDF into the `resumes` Storage bucket, and
upsert a `resumes` row. Does NOT create job_submits — this corpus is meant as
a CV pool for embedding / matching evaluation, not demo applications.

Requires `npx supabase start` (or `db reset`) already run and
SUPABASE_SERVICE_ROLE_KEY set.

    python scripts/seed_generated_cvs.py [--limit N] [--ingest]

--ingest also embeds each CV via the matching pipeline (calls the embedding
API for every row) — costs time/money, so it's opt-in.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from supabase import create_client

from backend.app.config.env import Settings
from backend.app.services.matching.embed import DEFAULT_EMBEDDING_MODEL, embed_text
from backend.app.services.matching.parse import parse_resume_bytes
from backend.app.services.matching.skills import extract_skills

CV_ROOT = ROOT / "data_find" / "generated_cv"
METADATA_CSV = CV_ROOT / "metadata.csv"
EMAIL_DOMAIN = "seed.local"
SEED_PASSWORD = "password123"
NAMESPACE = uuid.UUID("6f6d1e2a-6c0a-4c7b-8d0e-2a6b1f0c5a11")


def resume_id_for(cv_id: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"resume:{cv_id}"))


def email_for(cv_id: str) -> str:
    return f"{cv_id.lower()}@{EMAIL_DOMAIN}"


def _load_existing_users(client, email_to_id: dict[str, str]) -> None:
    page = 1
    while True:
        users = client.auth.admin.list_users(page=page, per_page=200)
        if not users:
            break
        for u in users:
            if u.email:
                email_to_id[u.email] = u.id
        page += 1


def ensure_candidate(client, email_to_id: dict[str, str], cv_id: str, full_name: str) -> str:
    email = email_for(cv_id)
    if email in email_to_id:
        return email_to_id[email]
    try:
        created = client.auth.admin.create_user(
            {
                "email": email,
                "password": SEED_PASSWORD,
                "email_confirm": True,
                "user_metadata": {"full_name": full_name},
            }
        )
        email_to_id[email] = created.user.id
        return created.user.id
    except Exception as exc:
        if "already" not in str(exc).lower() and "duplicate" not in str(exc).lower():
            raise
    _load_existing_users(client, email_to_id)
    if email not in email_to_id:
        raise RuntimeError(f"user {email} reported duplicate but not found via list_users")
    return email_to_id[email]


def _ingest(client, resume_id: str, pdf: bytes, extra_metadata: dict) -> None:
    parsed = parse_resume_bytes(pdf, mime_type="application/pdf")
    markdown = parsed.get("markdown") or ""
    client.table("embedded_resumes").upsert(
        {
            "resume_id": resume_id,
            "markdown": markdown,
            "metadata": {
                "skills": extract_skills(markdown),
                "summary": "",
                "titles": [],
                **extra_metadata,
            },
            "content_hash": hashlib.sha256(pdf).hexdigest(),
            "embedding": embed_text(markdown),
            "model": DEFAULT_EMBEDDING_MODEL,
        }
    ).execute()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=None, help="only seed the first N rows")
    parser.add_argument(
        "--ingest", action="store_true", help="also embed each CV (calls the embedding API)"
    )
    args = parser.parse_args()

    settings = Settings()
    if not settings.supabase_service_role_key:
        raise SystemExit("SUPABASE_SERVICE_ROLE_KEY is empty")
    if args.ingest and not settings.qwen_api_key:
        raise SystemExit("--ingest requires QWEN_API_KEY")
    client = create_client(settings.supabase_url, settings.supabase_service_role_key)

    with METADATA_CSV.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    if args.limit:
        rows = rows[: args.limit]

    email_to_id: dict[str, str] = {}
    seeded = 0
    for row in rows:
        cv_id = row["cv_id"]
        pdf_path = CV_ROOT / row["pdf_path"]
        if not pdf_path.exists():
            print(f"skip {cv_id}: missing {pdf_path}")
            continue
        pdf = pdf_path.read_bytes()

        uid = ensure_candidate(client, email_to_id, cv_id, row["candidate_name"])
        resume_id = resume_id_for(cv_id)
        storage_path = f"{uid}/resumes/{resume_id}/{pdf_path.name}"

        client.table("resumes").upsert(
            {
                "id": resume_id,
                "user_id": uid,
                "bucket_id": "resumes",
                "storage_path": storage_path,
                "original_filename": pdf_path.name,
                "title": row["target_role"],
                "mime_type": "application/pdf",
                "size_bytes": len(pdf),
                "is_default": True,
            }
        ).execute()
        client.storage.from_("resumes").upload(
            storage_path, pdf, {"content-type": "application/pdf", "upsert": "true"}
        )

        if args.ingest:
            _ingest(
                client,
                resume_id,
                pdf,
                {
                    "cv_id": cv_id,
                    "seniority": row["seniority"],
                    "group_name": row["group_name"],
                    "source": row["source"],
                },
            )

        seeded += 1
        print(f"{cv_id} -> {storage_path}")

    print(f"seeded {seeded}/{len(rows)} resumes")


if __name__ == "__main__":
    main()
