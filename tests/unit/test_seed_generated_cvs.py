import json

from scripts.seed_generated_cvs import CANDIDATE_ID, CANDIDATE_OVERRIDE_CV_ID, build_block


def _row(cv_id: str, group_id: int, md_path: str, candidate_name: str = "Nguyen Van A") -> dict:
    return {
        "cv_id": cv_id,
        "group_id": str(group_id),
        "group_name": "Software Development",
        "subgroup": "Backend Developer",
        "target_role": "Backend Engineer",
        "candidate_name": candidate_name,
        "md_path": md_path,
    }


def _write_md(tmp_path, rel_path: str, cv_id: str) -> None:
    full = tmp_path / rel_path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(
        f"---\ncv_id: {cv_id}\ngroup_id: 1\n---\n\n# Candidate\nBackend Python Git\n",
        encoding="utf-8",
    )


def test_build_block_caps_at_fifteen_per_group(tmp_path, monkeypatch):
    import scripts.seed_generated_cvs as mod

    monkeypatch.setattr(mod, "CV_ROOT", tmp_path)
    monkeypatch.setattr(mod, "ASSETS_DIR", tmp_path / "assets")

    rows = []
    for i in range(1, 21):  # 20 rows offered for group 1, only 15 should be kept
        cv_id = mod.CANDIDATE_OVERRIDE_CV_ID if i == 1 else f"G1-XX-{i:02d}"
        rel = f"g1-xx-{i:02d}.md"
        _write_md(tmp_path, rel, cv_id)
        rows.append(_row(cv_id, 1, rel))

    job_ids_by_group = {1: ["11111111-1111-4111-8111-111111111111"]}
    lines, manifest, seeded = build_block(rows, job_ids_by_group)

    assert seeded == 15
    assert len(manifest) == 15
    sql = "\n".join(lines)
    assert sql.count("insert into public.job_submits (") == 15


def test_build_block_skips_groups_with_no_job_posts(tmp_path, monkeypatch):
    import scripts.seed_generated_cvs as mod

    monkeypatch.setattr(mod, "CV_ROOT", tmp_path)
    monkeypatch.setattr(mod, "ASSETS_DIR", tmp_path / "assets")

    _write_md(tmp_path, "g11-cloud-01.md", "G11-CLOUD-01")
    rows = [_row("G11-CLOUD-01", 11, "g11-cloud-01.md")]

    lines, manifest, seeded = build_block(rows, job_ids_by_group={})

    assert seeded == 0
    assert manifest == []


def test_build_block_overrides_candidate_cv_id_to_fixed_candidate_id(tmp_path, monkeypatch):
    import scripts.seed_generated_cvs as mod

    monkeypatch.setattr(mod, "CV_ROOT", tmp_path)
    monkeypatch.setattr(mod, "ASSETS_DIR", tmp_path / "assets")

    _write_md(tmp_path, "override.md", CANDIDATE_OVERRIDE_CV_ID)
    rows = [_row(CANDIDATE_OVERRIDE_CV_ID, 1, "override.md")]
    job_ids_by_group = {1: ["11111111-1111-4111-8111-111111111111"]}

    _lines, manifest, _seeded = build_block(rows, job_ids_by_group)

    assert manifest[0]["user_id"] == str(CANDIDATE_ID)


def test_build_block_writes_markdown_and_manifest_to_assets_dir(tmp_path, monkeypatch):
    import scripts.seed_generated_cvs as mod

    monkeypatch.setattr(mod, "CV_ROOT", tmp_path)
    assets_dir = tmp_path / "assets"
    monkeypatch.setattr(mod, "ASSETS_DIR", assets_dir)

    _write_md(tmp_path, "g1-xx-01.md", "G1-XX-01")
    rows = [_row("G1-XX-01", 1, "g1-xx-01.md")]
    job_ids_by_group = {1: ["11111111-1111-4111-8111-111111111111"]}

    _lines, manifest, _seeded = build_block(rows, job_ids_by_group)

    assert (assets_dir / "G1-XX-01.md").is_file()
    assert manifest[0]["storage_path"] in "\n".join(_lines)
