import json
import math
import random
from pathlib import Path

import pytest

from backend.app.services.matching.eval_retrieve import (
    KS,
    SWAP_POOL,
    add_variants,
    allocate_quota,
    config_fingerprint,
    context_precision_at_k,
    cosine,
    decoy_records_equal,
    detect_lang,
    doc_hash,
    emit_queries,
    faithfulness_inferred_rate,
    generate_decoys,
    gold_rank,
    load_real_cvs,
    mirror_text,
    ndcg_at_k,
    nearest_rank_percentile,
    parse_requirements,
    precision_at_k,
    query_hash,
    rank_bm25_ids,
    rank_docs,
    recall_at_k,
    remove_variants,
    skill_swap,
    split_body_lines,
    text_hash,
    worst_queries,
)


def test_config_fingerprint_null_limit_cv():
    fp = config_fingerprint(
        seed=20260819, decoys=270, queries=1000, model="qwen3.7-text-embedding", dim=1536, limit_cv=None
    )
    assert fp["limit_cv"] is None
    assert fp["seed"] == 20260819
    assert set(fp) == {"seed", "decoys", "queries", "model", "dim", "limit_cv"}


def test_hashes_are_sha256_hex_and_order_independent_for_docs():
    a = [{"id": "b", "text": "x"}, {"id": "a", "text": "y"}]
    b = [{"id": "a", "text": "y"}, {"id": "b", "text": "x"}]
    assert doc_hash(a) == doc_hash(b)
    assert len(text_hash("hi")) == 64
    items = [
        {"id": "q_00001", "cv_id": "z", "type": "add", "text": "t2"},
        {"id": "q_00000", "cv_id": "a", "type": "mirror", "text": "t1"},
    ]
    assert query_hash(items) == query_hash(list(reversed(items)))
    assert query_hash(items) != query_hash([{**items[0], "text": "other"}, items[1]])


def test_cosine_orthogonal_and_rejects_bad_vectors():
    assert cosine([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)
    assert cosine([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)
    with pytest.raises(ValueError):
        cosine([0.0, 0.0], [1.0, 0.0])
    with pytest.raises(ValueError):
        cosine([float("nan"), 0.0], [1.0, 0.0])


def test_rank_docs_cosine_desc_tie_break_id_asc():
    docs = [("b", [1.0, 0.0]), ("a", [1.0, 0.0]), ("c", [0.0, 1.0])]
    ranked = rank_docs([1.0, 0.0], docs)
    assert [row[0] for row in ranked] == ["a", "b", "c"]
    assert gold_rank(["a", "b", "c"], "c") == 3
    with pytest.raises(ValueError):
        gold_rank(["a"], "missing")


def test_recall_and_context_precision_single_gold():
    assert KS == (1, 5, 10)
    assert recall_at_k(1, 1) == 1.0
    assert recall_at_k(2, 1) == 0.0
    assert context_precision_at_k(4, 5) == 0.25
    assert context_precision_at_k(6, 5) == 0.0


def test_nearest_rank_percentile_and_worst_tie_break():
    ranks = [10, 1, 3]
    assert nearest_rank_percentile(ranks, 0.5) == 3
    assert nearest_rank_percentile(ranks, 0.9) == 10
    assert nearest_rank_percentile([7], 0.9) == 7
    rows = [
        {"id": "q_00002", "cv_id": "a", "type": "mirror", "r": 9, "text": "x" * 300},
        {"id": "q_00001", "cv_id": "b", "type": "add", "r": 9, "text": "short"},
        {"id": "q_00000", "cv_id": "c", "type": "remove", "r": 1, "text": "ok"},
    ]
    worst = worst_queries(rows, n=2)
    assert [w["id"] for w in worst] == ["q_00001", "q_00002"]
    assert len(worst[0]["text"]) <= 200


def test_split_body_lines_strips_and_falls_back_to_sentences():
    body = "alpha\n\n  beta  \ngamma\ndelta\n"
    assert split_body_lines(body) == ["alpha", "beta", "gamma", "delta"]
    short = "One sentence. Two sentence."
    assert split_body_lines(short) == ["One sentence.", "Two sentence."]


def test_skill_swap_literal_case_insensitive_can_hit_substring():
    rng = random.Random(0)
    text = "Redistribute cache with Python and redis"
    swapped = skill_swap(text, rng)
    assert isinstance(swapped, str)
    assert SWAP_POOL[0] == "SAP"


def test_generate_decoys_samples_indices_not_prefix_and_is_seeded():
    bodies = {
        "cv_b": "line1\nline2\nline3\nline4\nPython here",
        "cv_a": "A1\nA2\nA3\nA4\nA5\nA6",
    }
    a = generate_decoys(bodies, n=3, rng=random.Random(20260819))
    b = generate_decoys(bodies, n=3, rng=random.Random(20260819))
    assert a == b
    assert [row["id"] for row in a] == ["decoy_000", "decoy_001", "decoy_002"]
    assert all(row["source_cv_ids"] and len(row["source_cv_ids"]) == 2 for row in a)
    rng = random.Random(20260819)
    generate_decoys(bodies, n=3, rng=rng)
    marker = rng.random()
    rng2 = random.Random(20260819)
    generate_decoys(bodies, n=3, rng=rng2)
    assert rng2.random() == marker


def test_single_real_cv_duplicates_ids_then_swaps():
    bodies = {"only": "Python\nsecond\nthird\nfourth"}
    rows = generate_decoys(bodies, n=1, rng=random.Random(1))
    assert rows[0]["source_cv_ids"] == ["only", "only"]


def test_zero_decoys_and_placeholder_empty_splice():
    assert generate_decoys({"a": "x", "b": "y"}, n=0, rng=random.Random(0)) == []
    empty = generate_decoys({"a": "", "b": ""}, n=1, rng=random.Random(0))
    assert empty[0]["text"] == "decoy_000 placeholder"


def test_decoy_records_equal_compares_id_text_sources():
    a = [{"id": "decoy_000", "text": "t", "source_cv_ids": ["a", "b"]}]
    b = [{"id": "decoy_000", "text": "t", "source_cv_ids": ["a", "b"]}]
    c = [{"id": "decoy_000", "text": "t", "source_cv_ids": ["b", "a"]}]
    assert decoy_records_equal(a, b) is True
    assert decoy_records_equal(a, c) is False


def test_allocate_quota_recompute_and_mirror_inside_quota():
    q = allocate_quota(["b", "a"], queries=5)
    assert list(q) == ["a", "b"] or set(q) == {"a", "b"}
    assert q["a"] == 3 and q["b"] == 2
    tiny = allocate_quota(["a", "b", "c"], queries=2)
    assert tiny["a"] == 1 and tiny["b"] == 1 and tiny["c"] == 0


def test_parse_requirements_list_and_string_bullets():
    assert parse_requirements(["  x", "", "y "]) == ["x", "y"]
    assert parse_requirements("- a\n* b\n• c") == ["a", "b", "c"]
    assert parse_requirements([]) == []
    assert mirror_text(["Python", "web"]) == "- Python\n- web"


def test_remove_variants_unique_by_remaining_tuple_index():
    rng = random.Random(0)
    bullets = ["keep", "drop-me", "keep"]
    rows = remove_variants(bullets, n_remove=20, rng=rng)
    keys = [tuple(r["remaining"]) for r in rows]
    assert len(keys) == len(set(keys))
    assert all(r["text"].startswith("- ") for r in rows)
    few = remove_variants(["only"], n_remove=4, rng=random.Random(0))
    assert few == []


def test_remove_variants_caps_long_bullet_lists():
    bullets = [f"bullet-{i}" for i in range(30)]
    rows = remove_variants(bullets, n_remove=5, rng=random.Random(0))
    assert len(rows) <= 5


def test_add_variants_sorted_key_and_oil_fallback():
    rng = random.Random(0)
    bullets = ["Python intern"]
    body = "Python intern with class projects"
    rows = add_variants(bullets, body, n_add=3, rng=rng)
    assert len(rows) == 3
    for row in rows:
        assert row["added"] == sorted(row["added"])
        for line in row["added"]:
            assert line.casefold() not in body.casefold()


def test_emit_queries_orders_mirror_remove_add_and_ids():
    mirrors = {"b_cv": ["b1", "b2", "b3"], "a_cv": ["a1", "a2", "a3"]}
    bodies = {"a_cv": "body a Python", "b_cv": "body b Java"}
    items = emit_queries(mirrors, bodies, queries=6, rng=random.Random(20260819))
    assert items[0]["id"] == "q_00000"
    assert items[0]["cv_id"] == "a_cv"
    assert items[0]["type"] == "mirror"
    types_a = [row["type"] for row in items if row["cv_id"] == "a_cv"]
    assert types_a[0] == "mirror"
    assert set(types_a) <= {"mirror", "remove", "add"}
    assert types_a == sorted(types_a, key=lambda t: {"mirror": 0, "remove": 1, "add": 2}[t])


def test_load_real_cvs_skips_batch_report_and_applies_limit_after_sort(tmp_path: Path):
    (tmp_path / "_batch_report.json").write_text("[]", encoding="utf-8")
    (tmp_path / "b.json").write_text(json.dumps({"body": "bb"}), encoding="utf-8")
    (tmp_path / "a.json").write_text(json.dumps({"body": "aa"}), encoding="utf-8")
    (tmp_path / "empty.json").write_text(json.dumps({"body": "  "}), encoding="utf-8")
    (tmp_path / "nope.txt").write_text("x", encoding="utf-8")
    rows = load_real_cvs(tmp_path, limit_cv=1)
    assert [r["cv_id"] for r in rows] == ["a"]
    assert rows[0]["body"] == "aa"


def test_ndcg_precision_faithfulness_and_lang():
    assert precision_at_k(1, 5) == 1.0
    assert precision_at_k(6, 5) == 0.0
    assert ndcg_at_k(1, 5) == 1.0
    assert ndcg_at_k(2, 5) == pytest.approx(1 / math.log2(3))
    assert ndcg_at_k(9, 5) == 0.0
    assert faithfulness_inferred_rate(["python"], ["python", "docker"]) == 0.5
    assert detect_lang("Có kinh nghiệm FastAPI") == "vi"
    assert detect_lang("Built REST APIs with FastAPI") == "en"


def test_rank_bm25_ids_drops_zero_and_prefers_clean_hit():
    docs = [
        ("summary", "generic intern profile"),
        ("clean", "Developed REST APIs using FastAPI"),
    ]
    ranked = rank_bm25_ids(docs, "fastapi")
    assert ranked[0] == "clean"
    assert "summary" not in ranked
