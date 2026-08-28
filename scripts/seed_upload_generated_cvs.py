"""Upload generated-CV PDF bytes into the Supabase Storage `resumes` bucket.

supabase/seed.sql's GENERATED-CV-SEED block (written by
scripts/seed_generated_cvs.py) inserts DB rows for the seeded CVs, but a
`supabase db reset` never creates the actual Storage objects -- this script
does that, rendering each CV's PDF from the markdown tracked in
supabase/seed_assets/cvs/ (NOT from data_find/, which is gitignored and so
is absent on any machine other than the one that generated it).

Run after every `supabase db reset`:

    python scripts/seed_upload_generated_cvs.py
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from supabase import create_client

from backend.app.config.env import Settings
from backend.app.services.matching.embed import DEFAULT_EMBEDDING_MODEL, embed_text
from backend.app.services.matching.parse import parse_resume_bytes
from backend.app.services.matching.skills import extract_skills
from scripts.cv_markdown import parse_front_matter, render_markdown_to_pdf

ASSETS_DIR = ROOT / "supabase" / "seed_assets" / "cvs"
MANIFEST_PATH = ASSETS_DIR / "manifest.json"


def _ingest(client, resume_id: str, pdf_bytes: bytes) -> None:
    parsed = parse_resume_bytes(pdf_bytes, mime_type="application/pdf")
    markdown = parsed.get("markdown") or ""
    client.table("embedded_resumes").upsert(
        {
            "resume_id": resume_id,
            "markdown": markdown,
            "metadata": {"skills": extract_skills(markdown), "summary": "", "titles": []},
            "content_hash": hashlib.sha256(pdf_bytes).hexdigest(),
            "embedding": embed_text(markdown),
            "model": DEFAULT_EMBEDDING_MODEL,
        }
    ).execute()


def main() -> None:
    if not MANIFEST_PATH.is_file():
        raise SystemExit(f"{MANIFEST_PATH} not found -- run scripts/seed_generated_cvs.py first")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    settings = Settings()
    if not settings.supabase_service_role_key:
        raise SystemExit("SUPABASE_SERVICE_ROLE_KEY is empty")
    client = create_client(settings.supabase_url, settings.supabase_service_role_key)

    uploaded = 0
    failed = 0
    for entry in manifest:
        try:
            md_path = ASSETS_DIR / f"{entry['cv_id']}.md"
            md_text = md_path.read_text(encoding="utf-8")
            _metadata, body = parse_front_matter(md_text)
            pdf_bytes = render_markdown_to_pdf(body)

            client.storage.from_("resumes").upload(
                entry["storage_path"],
                pdf_bytes,
                {"content-type": "application/pdf", "upsert": "true"},
            )
            uploaded += 1
            print(entry["storage_path"])

            if settings.qwen_api_key:
                _ingest(client, entry["resume_id"], pdf_bytes)
                print(f"  ingested {entry['title']}")
            else:
                print("  skip ingest (QWEN_API_KEY empty)")
        except Exception as e:
            failed += 1
            print(f"FAILED {entry['cv_id']}: {e}")
            continue

    print(f"uploaded {uploaded}, failed {failed}")
    if failed > 0:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
