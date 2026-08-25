import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def _load():
    path = ROOT / "scripts" / "eval_requirement_retrieve.py"
    spec = importlib.util.spec_from_file_location("eval_requirement_retrieve", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def _unit(i: int) -> list[float]:
    vec = [0.0] * 1536
    vec[i] = 1.0
    return vec


def test_run_eval_fake_encode_recall_at_one(tmp_path: Path):
    run_eval = _load().run_eval
    parsed = tmp_path / "parsed"
    parsed.mkdir()
    (parsed / "cv_a.json").write_text(json.dumps({"body": "TOKEN_A python intern"}), encoding="utf-8")
    (parsed / "cv_b.json").write_text(json.dumps({"body": "TOKEN_B java intern"}), encoding="utf-8")
    out = tmp_path / "eval"

    def complete(prompt: str, **_kwargs) -> str:
        tag = "TOKEN_A" if "TOKEN_A" in prompt else "TOKEN_B"
        return json.dumps({"requirements": [f"{tag} skill", f"{tag} project", f"{tag} team"]})

    def encode(text: str) -> list[float]:
        if text == "TOKEN_A python intern":
            return _unit(0)
        if text.startswith("- TOKEN_A"):
            return _unit(0)
        if text == "TOKEN_B java intern":
            return _unit(1)
        if text.startswith("- TOKEN_B"):
            return _unit(1)
        return _unit(3)

    code = run_eval(
        argv=[
            "--parsed-dir",
            str(parsed),
            "--out-dir",
            str(out),
            "--decoys",
            "2",
            "--queries",
            "6",
            "--seed",
            "20260819",
        ],
        complete=complete,
        encode=encode,
    )
    assert code == 0
    report = json.loads((out / "report.json").read_text(encoding="utf-8"))
    assert report["n_real"] == 2
    assert report["n_decoy"] == 2
    assert report["n_query"] == 6
    assert report["n_mirror_llm_calls"] == 2
    assert report["metrics"]["overall"]["recall@1"] == pytest.approx(1.0)
    meta = json.loads((out / "run_meta.json").read_text(encoding="utf-8"))
    assert "doc_hash" in meta and "query_hash" in meta
    assert meta["fingerprint"]["limit_cv"] is None


def test_run_eval_reuses_mirrors_zero_llm_and_limit_cv_fingerprint(tmp_path: Path):
    run_eval = _load().run_eval
    parsed = tmp_path / "parsed"
    parsed.mkdir()
    (parsed / "cv_a.json").write_text(json.dumps({"body": "TOKEN_A python intern"}), encoding="utf-8")
    (parsed / "cv_b.json").write_text(json.dumps({"body": "TOKEN_B java intern"}), encoding="utf-8")
    out = tmp_path / "eval"
    calls = {"n": 0}

    def complete(prompt: str, **_kwargs) -> str:
        calls["n"] += 1
        tag = "TOKEN_A" if "TOKEN_A" in prompt else "TOKEN_B"
        return json.dumps({"requirements": [f"{tag} skill", f"{tag} project", f"{tag} team"]})

    def encode(text: str) -> list[float]:
        if text == "TOKEN_A python intern":
            return _unit(0)
        if text.startswith("- TOKEN_A"):
            return _unit(0)
        if text == "TOKEN_B java intern":
            return _unit(1)
        if text.startswith("- TOKEN_B"):
            return _unit(1)
        return _unit(3)

    argv = ["--parsed-dir", str(parsed), "--out-dir", str(out), "--decoys", "0", "--queries", "4"]
    assert run_eval(argv=argv, complete=complete, encode=encode) == 0
    assert calls["n"] == 2
    assert run_eval(argv=argv, complete=complete, encode=encode) == 0
    assert calls["n"] == 2
    assert json.loads((out / "run_meta.json").read_text(encoding="utf-8"))["n_mirror_llm_calls"] == 0
    smoke_out = tmp_path / "eval_smoke"
    assert (
        run_eval(
            argv=[
                "--parsed-dir",
                str(parsed),
                "--out-dir",
                str(smoke_out),
                "--decoys",
                "0",
                "--queries",
                "2",
                "--limit-cv",
                "1",
            ],
            complete=complete,
            encode=encode,
        )
        == 0
    )
    smoke_fp = json.loads((smoke_out / "queries.json").read_text(encoding="utf-8"))["fingerprint"]
    full_fp = json.loads((out / "queries.json").read_text(encoding="utf-8"))["fingerprint"]
    assert smoke_fp["limit_cv"] == 1
    assert full_fp["limit_cv"] is None


def test_skip_embed_malformed_exits_one(tmp_path: Path):
    run_eval = _load().run_eval
    parsed = tmp_path / "parsed"
    parsed.mkdir()
    (parsed / "cv_a.json").write_text(json.dumps({"body": "hello python"}), encoding="utf-8")
    out = tmp_path / "eval"
    out.mkdir()
    (out / "cv_embeddings.json").write_text("{", encoding="utf-8")
    code = run_eval(
        argv=["--parsed-dir", str(parsed), "--out-dir", str(out), "--decoys", "0", "--queries", "1", "--skip-embed"],
        complete=lambda *_a, **_k: json.dumps({"requirements": ["a", "b", "c"]}),
        encode=lambda _t: _unit(0),
    )
    assert code == 1


def test_decoy_cache_mismatch_exits_one(tmp_path: Path):
    run_eval = _load().run_eval
    parsed = tmp_path / "parsed"
    parsed.mkdir()
    (parsed / "cv_a.json").write_text(json.dumps({"body": "A1\nA2\nA3\nA4 python"}), encoding="utf-8")
    (parsed / "cv_b.json").write_text(json.dumps({"body": "B1\nB2\nB3\nB4 java"}), encoding="utf-8")
    out = tmp_path / "eval"
    out.mkdir()
    (out / "decoy_docs.json").write_text(
        json.dumps([{"id": "decoy_000", "text": "stale", "source_cv_ids": ["cv_a", "cv_b"]}]),
        encoding="utf-8",
    )
    code = run_eval(
        argv=["--parsed-dir", str(parsed), "--out-dir", str(out), "--decoys", "1", "--queries", "2"],
        complete=lambda *_a, **_k: json.dumps({"requirements": ["x", "y", "z"]}),
        encode=lambda _t: _unit(0),
    )
    assert code == 1


def test_n_mirror_llm_calls_counts_failed_complete_attempts(tmp_path: Path):
    run_eval = _load().run_eval
    parsed = tmp_path / "parsed"
    parsed.mkdir()
    (parsed / "cv_a.json").write_text(json.dumps({"body": "TOKEN_A python intern"}), encoding="utf-8")
    (parsed / "cv_b.json").write_text(json.dumps({"body": "TOKEN_B java intern"}), encoding="utf-8")
    out = tmp_path / "eval"
    calls = {"n": 0}

    def complete(prompt: str, **_kwargs) -> str:
        calls["n"] += 1
        if "TOKEN_B" in prompt:
            return "{}"
        return json.dumps({"requirements": ["TOKEN_A skill", "TOKEN_A project", "TOKEN_A team"]})

    def encode(text: str) -> list[float]:
        if text == "TOKEN_A python intern" or text.startswith("- TOKEN_A"):
            return _unit(0)
        return _unit(3)

    code = run_eval(
        argv=["--parsed-dir", str(parsed), "--out-dir", str(out), "--decoys", "0", "--queries", "2"],
        complete=complete,
        encode=encode,
    )
    assert code == 0
    assert calls["n"] == 2
    report = json.loads((out / "report.json").read_text(encoding="utf-8"))
    assert report["n_mirror_llm_calls"] == 2
    queries = json.loads((out / "queries.json").read_text(encoding="utf-8"))["items"]
    assert all(q["cv_id"] == "cv_a" for q in queries)


def test_refresh_mirrors_overwrites_without_stale_merge(tmp_path: Path):
    run_eval = _load().run_eval
    parsed = tmp_path / "parsed"
    parsed.mkdir()
    (parsed / "cv_a.json").write_text(json.dumps({"body": "TOKEN_A python intern"}), encoding="utf-8")
    (parsed / "cv_b.json").write_text(json.dumps({"body": "TOKEN_B java intern"}), encoding="utf-8")
    out = tmp_path / "eval"

    def complete_ok(prompt: str, **_kwargs) -> str:
        tag = "TOKEN_A" if "TOKEN_A" in prompt else "TOKEN_B"
        return json.dumps({"requirements": [f"{tag} skill", f"{tag} project", f"{tag} team"]})

    def encode(text: str) -> list[float]:
        if "TOKEN_A" in text:
            return _unit(0)
        if "TOKEN_B" in text:
            return _unit(1)
        return _unit(3)

    argv = ["--parsed-dir", str(parsed), "--out-dir", str(out), "--decoys", "0", "--queries", "4"]
    assert run_eval(argv=argv, complete=complete_ok, encode=encode) == 0
    first = json.loads((out / "mirrors.json").read_text(encoding="utf-8"))
    assert "cv_a" in first and "cv_b" in first

    def complete_refresh(prompt: str, **_kwargs) -> str:
        if "TOKEN_B" in prompt:
            raise RuntimeError("llm failed")
        return json.dumps({"requirements": ["TOKEN_A skill", "TOKEN_A project", "TOKEN_A team"]})

    assert (
        run_eval(
            argv=argv + ["--refresh-mirrors"],
            complete=complete_refresh,
            encode=encode,
        )
        == 0
    )
    refreshed = json.loads((out / "mirrors.json").read_text(encoding="utf-8"))
    assert "cv_a" in refreshed
    assert "cv_b" not in refreshed
    queries = json.loads((out / "queries.json").read_text(encoding="utf-8"))["items"]
    assert all(q["cv_id"] != "cv_b" for q in queries)


def test_skip_embed_numeric_strings_exits_one(tmp_path: Path):
    run_eval = _load().run_eval
    parsed = tmp_path / "parsed"
    parsed.mkdir()
    (parsed / "cv_a.json").write_text(json.dumps({"body": "hello python"}), encoding="utf-8")
    out = tmp_path / "eval"
    argv = ["--parsed-dir", str(parsed), "--out-dir", str(out), "--decoys", "0", "--queries", "1"]

    def complete(*_a, **_k) -> str:
        return json.dumps({"requirements": ["a", "b", "c"]})

    def encode(_t: str) -> list[float]:
        return _unit(0)

    assert run_eval(argv=argv, complete=complete, encode=encode) == 0
    q = json.loads((out / "query_embeddings.json").read_text(encoding="utf-8"))
    for rec in q["vectors"].values():
        rec["embedding"] = ["0.0"] + [str(x) for x in rec["embedding"][1:]]
    (out / "query_embeddings.json").write_text(json.dumps(q), encoding="utf-8")
    code = run_eval(argv=argv + ["--skip-embed"], complete=complete, encode=encode)
    assert code == 1


def test_embed_bool_vector_exits_one(tmp_path: Path):
    run_eval = _load().run_eval
    parsed = tmp_path / "parsed"
    parsed.mkdir()
    (parsed / "cv_a.json").write_text(json.dumps({"body": "hello python"}), encoding="utf-8")
    out = tmp_path / "eval"

    def encode(_text: str) -> list:
        vec = [0.0] * 1536
        vec[0] = True
        return vec

    code = run_eval(
        argv=["--parsed-dir", str(parsed), "--out-dir", str(out), "--decoys", "0", "--queries", "1"],
        complete=lambda *_a, **_k: json.dumps({"requirements": ["a", "b", "c"]}),
        encode=encode,
    )
    assert code == 1


def test_skip_embed_non_numeric_vectors_exits_one(tmp_path: Path):
    run_eval = _load().run_eval
    parsed = tmp_path / "parsed"
    parsed.mkdir()
    (parsed / "cv_a.json").write_text(json.dumps({"body": "hello python"}), encoding="utf-8")
    out = tmp_path / "eval"
    out.mkdir()
    # Same length as DEFAULT_EMBED_DIM so float() is reached; non-numeric → must exit 1, not raise.
    junk = ["nope"] + [0.0] * 1535
    (out / "cv_embeddings.json").write_text(
        json.dumps({"doc_hash": "x", "model": "m", "dim": 1536, "vectors": {"cv_a": junk}}),
        encoding="utf-8",
    )
    code = run_eval(
        argv=["--parsed-dir", str(parsed), "--out-dir", str(out), "--decoys", "0", "--queries", "1", "--skip-embed"],
        complete=lambda *_a, **_k: json.dumps({"requirements": ["a", "b", "c"]}),
        encode=lambda _t: _unit(0),
    )
    assert code == 1
