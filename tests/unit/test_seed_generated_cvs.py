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


def test_build_block_writes_into_caller_supplied_assets_dir_without_touching_default(
    tmp_path, monkeypatch
):
    """build_block should write markdown into whatever assets_dir it's given,
    not the module-level ASSETS_DIR -- this is what lets main() build into a
    scratch directory and only promote it over the real ASSETS_DIR after a
    successful (seeded > 0) run."""
    import scripts.seed_generated_cvs as mod

    monkeypatch.setattr(mod, "CV_ROOT", tmp_path)
    default_assets_dir = tmp_path / "default_assets"
    monkeypatch.setattr(mod, "ASSETS_DIR", default_assets_dir)

    scratch_dir = tmp_path / "scratch_assets"
    _write_md(tmp_path, "g1-xx-01.md", "G1-XX-01")
    rows = [_row("G1-XX-01", 1, "g1-xx-01.md")]
    job_ids_by_group = {1: ["11111111-1111-4111-8111-111111111111"]}

    _lines, manifest, seeded = build_block(rows, job_ids_by_group, assets_dir=scratch_dir)

    assert seeded == 1
    assert (scratch_dir / "G1-XX-01.md").is_file()
    assert not default_assets_dir.exists()


def test_failed_run_does_not_delete_pre_existing_tracked_assets(tmp_path, monkeypatch):
    """Regression test for the data-loss footgun: if every row fails
    validation (e.g. a partially-restored local dataset where the CSV exists
    but its .md targets are missing), build_block must not have touched --
    let alone deleted -- any pre-existing, git-tracked ASSETS_DIR content.
    build_block itself never deletes ASSETS_DIR; that's now main()'s job,
    and only after a successful (seeded > 0) run."""
    import scripts.seed_generated_cvs as mod

    monkeypatch.setattr(mod, "CV_ROOT", tmp_path)
    assets_dir = tmp_path / "assets"
    assets_dir.mkdir(parents=True)
    marker = assets_dir / "PRE-EXISTING.md"
    marker.write_text("tracked content that must survive", encoding="utf-8")
    monkeypatch.setattr(mod, "ASSETS_DIR", assets_dir)

    # Rows reference a .md file that does not exist on disk -- every row
    # fails the missing-markdown check and build_block seeds nothing.
    rows = [_row("G1-XX-99", 1, "does-not-exist.md")]
    job_ids_by_group = {1: ["11111111-1111-4111-8111-111111111111"]}

    lines, manifest, seeded = build_block(rows, job_ids_by_group)

    assert seeded == 0
    assert manifest == []
    assert marker.is_file()
    assert marker.read_text(encoding="utf-8") == "tracked content that must survive"
