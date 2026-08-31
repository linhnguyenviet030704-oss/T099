import json
from unittest.mock import MagicMock

import scripts.seed_upload_generated_cvs as mod


def test_main_uploads_each_manifest_entry(tmp_path, monkeypatch):
    assets_dir = tmp_path / "cvs"
    assets_dir.mkdir()
    (assets_dir / "TEST-01.md").write_text(
        "---\ncv_id: TEST-01\n---\n\n# Candidate\nReact TypeScript Git\n",
        encoding="utf-8",
    )
    manifest = [
        {
            "cv_id": "TEST-01",
            "user_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "resume_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            "job_post_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            "storage_path": (
                "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/resumes/"
                "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/test-01.pdf"
            ),
            "original_filename": "test-01.pdf",
            "title": "Candidate CV",
        }
    ]
    (assets_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    monkeypatch.setattr(mod, "ASSETS_DIR", assets_dir)
    monkeypatch.setattr(mod, "MANIFEST_PATH", assets_dir / "manifest.json")

    fake_settings = MagicMock(supabase_service_role_key="fake-key", supabase_url="http://x", qwen_api_key="")
    monkeypatch.setattr(mod, "Settings", lambda: fake_settings)

    fake_storage = MagicMock()
    fake_client = MagicMock()
    fake_client.storage.from_.return_value = fake_storage
    monkeypatch.setattr(mod, "create_client", lambda url, key: fake_client)

    mod.main()

    fake_client.storage.from_.assert_called_with("resumes")
    args, _kwargs = fake_storage.upload.call_args
    assert args[0] == manifest[0]["storage_path"]
    assert args[1][:4] == b"%PDF"


def test_main_raises_when_manifest_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(mod, "ASSETS_DIR", tmp_path / "cvs")
    monkeypatch.setattr(mod, "MANIFEST_PATH", tmp_path / "cvs" / "manifest.json")
    try:
        mod.main()
        assert False, "expected SystemExit"
    except SystemExit as exc:
        assert "seed_generated_cvs.py" in str(exc)


def test_main_continues_past_one_failing_entry_and_exits_nonzero(tmp_path, monkeypatch):
    """One entry's upload raising must not prevent the remaining entries from
    uploading, but the overall run must still exit non-zero so a CI/automated
    run fails loudly."""
    assets_dir = tmp_path / "cvs"
    assets_dir.mkdir()
    for cv_id in ("GOOD-01", "BAD-01", "GOOD-02"):
        (assets_dir / f"{cv_id}.md").write_text(
            f"---\ncv_id: {cv_id}\n---\n\n# Candidate\nReact TypeScript Git\n",
            encoding="utf-8",
        )

    def _entry(cv_id: str, suffix: str) -> dict:
        return {
            "cv_id": cv_id,
            "user_id": f"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa{suffix}",
            "resume_id": f"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb{suffix}",
            "job_post_id": f"cccccccc-cccc-4ccc-8ccc-ccccccccccc{suffix}",
            "storage_path": f"user-{suffix}/resumes/resume-{suffix}/{cv_id.lower()}.pdf",
            "original_filename": f"{cv_id.lower()}.pdf",
            "title": f"{cv_id} CV",
        }

    manifest = [_entry("GOOD-01", "1"), _entry("BAD-01", "2"), _entry("GOOD-02", "3")]
    (assets_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    monkeypatch.setattr(mod, "ASSETS_DIR", assets_dir)
    monkeypatch.setattr(mod, "MANIFEST_PATH", assets_dir / "manifest.json")

    fake_settings = MagicMock(supabase_service_role_key="fake-key", supabase_url="http://x", qwen_api_key="")
    monkeypatch.setattr(mod, "Settings", lambda: fake_settings)

    def _upload(storage_path, _bytes, _opts):
        if "bad-01" in storage_path:
            raise RuntimeError("simulated upload failure")

    fake_storage = MagicMock()
    fake_storage.upload.side_effect = _upload
    fake_client = MagicMock()
    fake_client.storage.from_.return_value = fake_storage
    monkeypatch.setattr(mod, "create_client", lambda url, key: fake_client)

    try:
        mod.main()
        assert False, "expected SystemExit due to the one failed entry"
    except SystemExit as exc:
        assert exc.code == 1

    uploaded_paths = [call.args[0] for call in fake_storage.upload.call_args_list]
    assert any("good-01" in p for p in uploaded_paths)
    assert any("good-02" in p for p in uploaded_paths)
    assert any("bad-01" in p for p in uploaded_paths)  # attempted, then failed
