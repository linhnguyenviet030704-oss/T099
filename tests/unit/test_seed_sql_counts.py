import json
import re
from pathlib import Path


def test_seed_sql_has_exactly_ten_job_posts_and_150_job_submits():
    sql = Path("supabase/seed.sql").read_text(encoding="utf-8")
    assert len(re.findall(r"insert into public\.job_posts \(", sql)) == 10
    assert len(re.findall(r"insert into public\.job_submits \(", sql)) == 150


def test_seed_assets_manifest_has_150_entries_with_markdown_files():
    manifest_path = Path("supabase/seed_assets/cvs/manifest.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert len(manifest) == 150
    for entry in manifest:
        assert (Path("supabase/seed_assets/cvs") / f"{entry['cv_id']}.md").is_file()


def test_candidate_has_exactly_one_generated_cv_application():
    manifest = json.loads(Path("supabase/seed_assets/cvs/manifest.json").read_text(encoding="utf-8"))
    candidate_rows = [m for m in manifest if m["user_id"] == "11111111-1111-1111-1111-111111111111"]
    assert len(candidate_rows) == 1
