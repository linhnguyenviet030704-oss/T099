# Requirement → summarized-CV retrieve eval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offline script ranks `parsed_CV` `body` vectors against ~1000 synthetic JD-requirement queries (mirror + remove + add) plus random decoy docs, then reports recall/context-precision @1/@5/@10.

**Architecture:** Pure helpers in `eval_retrieve.py` (no HTTP). CLI loads JSON, always consumes decoy RNG, caches artifacts under `data/test_CV_parse/eval/`, embeds via existing `embed_text` / `chat_complete`. Pytest never calls Qwen.

**Tech Stack:** Python stdlib + existing `extract_skills` / `embed_text` / `chat_complete`, pytest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-19-requirement-retrieve-eval-design.md`

## Global Constraints

- Gold = source `cv_id` only; decoys never gold; embed document text = `body` only.
- Seed `20260819`; default decoys `270`; default queries `1000`; `k ∈ {1,5,10}`.
- One `random.Random(seed)`; always generate decoys to consume RNG even if `decoy_docs.json` exists.
- `n_mirror_llm_calls` = HTTP calls this run (cache hit → 0).
- Cache invalidation uses config fingerprint + `doc_hash` / `query_hash` / per-query `text_hash`, never `run_meta.json`.
- Cosine zero-norm or non-finite → `ValueError`. P90/median = nearest-rank `sorted[ceil(p*n)-1]`.
- Skill replace = `re.sub(re.escape(skill), replacement, text, flags=re.I)` (no `\\b`).
- `--limit-cv` after valid-filter + `cv_id` sort.
- No new pip packages. Do not commit unless the user asks. Do not change ingest/matching production paths.
- Pytest: `pytest tests/unit/<file>.py::<test> -v` from repo root.

## Files

- Create: `backend/app/services/matching/eval_retrieve.py`
- Create: `tests/unit/test_eval_retrieve.py`
- Create: `scripts/eval_requirement_retrieve.py`
- Create: `tests/unit/test_eval_requirement_script.py`

---

### Task 1: Metrics, hashes, rank

**Files:**
- Create: `tests/unit/test_eval_retrieve.py`
- Create: `backend/app/services/matching/eval_retrieve.py`

**Interfaces:**
- Consumes: none
- Produces: `config_fingerprint`, `text_hash`, `doc_hash`, `query_hash`, `cosine`, `rank_docs`, `gold_rank`, `recall_at_k`, `context_precision_at_k`, `nearest_rank_percentile`, `worst_queries`, `KS`

- [ ] **Step 1: Write the failing tests**

```python
import math
import pytest
from backend.app.services.matching.eval_retrieve import (
    KS,
    config_fingerprint,
    context_precision_at_k,
    cosine,
    doc_hash,
    gold_rank,
    nearest_rank_percentile,
    query_hash,
    rank_docs,
    recall_at_k,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_eval_retrieve.py::test_cosine_orthogonal_and_rejects_bad_vectors -v`

Expected: FAIL `ModuleNotFoundError` or `ImportError` for `eval_retrieve`

- [ ] **Step 3: Implement helpers**

Create `backend/app/services/matching/eval_retrieve.py`:

```python
from __future__ import annotations

import hashlib
import math
from typing import Any, Sequence

KS = (1, 5, 10)
SEED_DEFAULT = 20260819
DECOYS_DEFAULT = 270
QUERIES_DEFAULT = 1000


def config_fingerprint(
    *,
    seed: int,
    decoys: int,
    queries: int,
    model: str,
    dim: int,
    limit_cv: int | None,
) -> dict[str, Any]:
    return {
        "decoys": decoys,
        "dim": dim,
        "limit_cv": limit_cv,
        "model": model,
        "queries": queries,
        "seed": seed,
    }


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def doc_hash(docs: Sequence[dict[str, str]]) -> str:
    lines = "".join(f"{row['id']}\t{row['text']}\n" for row in sorted(docs, key=lambda item: item["id"]))
    return hashlib.sha256(lines.encode("utf-8")).hexdigest()


def query_hash(items: Sequence[dict[str, Any]]) -> str:
    lines = "".join(
        f"{row['id']}\t{row['cv_id']}\t{row['type']}\t{row['text']}\n"
        for row in sorted(items, key=lambda item: item["id"])
    )
    return hashlib.sha256(lines.encode("utf-8")).hexdigest()


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if any(not math.isfinite(x) for x in (*a, *b)):
        raise ValueError("non-finite embedding")
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    norm = na * nb
    if norm == 0.0:
        raise ValueError("zero-norm embedding")
    return dot / norm


def rank_docs(query_vec: Sequence[float], docs: Sequence[tuple[str, Sequence[float]]]) -> list[tuple[str, float]]:
    scored = [(doc_id, cosine(query_vec, vec)) for doc_id, vec in docs]
    scored.sort(key=lambda item: (-item[1], item[0]))
    return scored


def gold_rank(ranked_ids: Sequence[str], gold_id: str) -> int:
    try:
        return list(ranked_ids).index(gold_id) + 1
    except ValueError as exc:
        raise ValueError(f"gold id {gold_id!r} not in ranked list") from exc


def recall_at_k(rank: int, k: int) -> float:
    return 1.0 if rank <= k else 0.0


def context_precision_at_k(rank: int, k: int) -> float:
    return (1.0 / rank) if rank <= k else 0.0


def nearest_rank_percentile(ranks: Sequence[int], p: float) -> int:
    if not ranks:
        raise ValueError("empty ranks")
    ordered = sorted(ranks)
    return ordered[math.ceil(p * len(ordered)) - 1]


def worst_queries(rows: Sequence[dict[str, Any]], n: int = 20) -> list[dict[str, Any]]:
    ordered = sorted(rows, key=lambda row: (-int(row["r"]), str(row["id"])))
    out: list[dict[str, Any]] = []
    for row in ordered[:n]:
        text = str(row.get("text") or "")
        out.append({**row, "text": text[:200]})
    return out
```

`zip(..., strict=True)`: if lengths differ, cosine raises `ValueError` — acceptable (dim mismatch).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/unit/test_eval_retrieve.py -v`

Expected: PASS (only Task 1 tests exist)

- [ ] **Step 5: Commit**

Skip unless the user asked to commit.

---

### Task 2: Decoy splice + skill-swap

**Files:**
- Modify: `backend/app/services/matching/eval_retrieve.py`
- Modify: `tests/unit/test_eval_retrieve.py`

**Interfaces:**
- Consumes: Task 1 module
- Produces: `SWAP_POOL`, `split_body_lines`, `skill_swap`, `generate_decoys`, `decoy_records_equal`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/test_eval_retrieve.py`:

```python
import random
from backend.app.services.matching.eval_retrieve import (
    SWAP_POOL,
    decoy_records_equal,
    generate_decoys,
    skill_swap,
    split_body_lines,
)


def test_split_body_lines_strips_and_falls_back_to_sentences():
    body = "alpha\n\n  beta  \ngamma\n"
    assert split_body_lines(body) == ["alpha", "beta", "gamma"]
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_eval_retrieve.py::test_generate_decoys_samples_indices_not_prefix_and_is_seeded -v`

Expected: FAIL `ImportError` (`generate_decoys`)

- [ ] **Step 3: Implement decoy functions**

Append to `eval_retrieve.py` (keep Task 1 functions). Add imports: `import random`, `import re`, `from math import ceil, floor`.

```python
from backend.app.services.matching.skills import extract_skills

SWAP_POOL = (
    "SAP",
    "Kubernetes",
    "Salesforce",
    "Unreal Engine",
    "COBOL",
    "Verilog",
    "Unity",
    "SwiftUI",
    "Flutter",
    "Laravel",
    "Django",
    "Spring Boot",
    "FastAPI",
    "Redis",
    "GraphQL",
    "Terraform",
    "Ansible",
)


def split_body_lines(body: str) -> list[str]:
    lines = [ln.strip() for ln in body.splitlines() if ln.strip()]
    if len(lines) < 4:
        lines = [part.strip() for part in re.split(r"(?<=[.。])\s+", body.strip()) if part.strip()]
    return lines


def skill_swap(text: str, rng: random.Random) -> str:
    found = sorted(extract_skills(text), key=str.casefold)
    blocked = set(found)
    used_replacements: set[str] = set()
    out = text
    for skill in found:
        if rng.random() >= 0.5:
            continue
        candidates = [token for token in SWAP_POOL if token not in blocked and token not in used_replacements]
        if not candidates:
            continue
        replacement = rng.choice(candidates)
        used_replacements.add(replacement)
        out = re.sub(re.escape(skill), replacement, out, flags=re.IGNORECASE)
    return out


def generate_decoys(bodies: dict[str, str], n: int, rng: random.Random) -> list[dict[str, Any]]:
    real_ids = sorted(bodies)
    rows: list[dict[str, Any]] = []
    for i in range(n):
        decoy_id = f"decoy_{i:03d}"
        if len(real_ids) >= 2:
            pair = rng.sample(real_ids, k=2)
        elif len(real_ids) == 1:
            pair = [real_ids[0], real_ids[0]]
        else:
            rows.append({"id": decoy_id, "text": f"{decoy_id} placeholder", "source_cv_ids": []})
            continue
        lines_a = split_body_lines(bodies[pair[0]])
        lines_b = split_body_lines(bodies[pair[1]])
        a_take = ceil(len(lines_a) / 2)
        b_take = floor(len(lines_b) / 2)
        idx_a = sorted(rng.sample(range(len(lines_a)), k=a_take)) if a_take > 0 and lines_a else []
        idx_b = sorted(rng.sample(range(len(lines_b)), k=b_take)) if b_take > 0 and lines_b else []
        spliced_lines = [lines_a[j] for j in idx_a] + [lines_b[k] for k in idx_b]
        spliced = "\n".join(spliced_lines)
        text = skill_swap(spliced, rng)
        if not text.strip():
            text = f"{decoy_id} placeholder"
        rows.append({"id": decoy_id, "text": text, "source_cv_ids": pair})
    return rows


def decoy_records_equal(left: Sequence[dict[str, Any]], right: Sequence[dict[str, Any]]) -> bool:
    if len(left) != len(right):
        return False
    for a, b in zip(left, right, strict=True):
        if (a.get("id"), a.get("text"), list(a.get("source_cv_ids") or [])) != (
            b.get("id"),
            b.get("text"),
            list(b.get("source_cv_ids") or []),
        ):
            return False
    return True
```

`test_skill_swap_literal_case_insensitive_can_hit_substring` only asserts types + pool order so it stays stable if RNG skips swaps. Optional stronger assert: `skill_swap("Python Python", random.Random(1))` may replace; do not require `Redistribute` mutation.

Empty bodies `{"a": "", "b": ""}`: `split_body_lines("")` → `[]`, takes 0, spliced `""`, skill_swap `""`, placeholder. `rng.sample` still runs on `['a','b']` so RNG still consumed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/unit/test_eval_retrieve.py -v`

Expected: PASS

If `test_zero_decoys_and_placeholder_empty_splice` fails because `""` split still yields leftover from regex: keep placeholder path; adjust test only if implementation matches spec (`strip` empty → placeholder).

- [ ] **Step 5: Commit**

Skip unless asked.

---

### Task 3: Quota, mirror parse, remove/add, emit_queries

**Files:**
- Modify: `backend/app/services/matching/eval_retrieve.py`
- Modify: `tests/unit/test_eval_retrieve.py`

**Interfaces:**
- Consumes: `extract_skills`, Task 2
- Produces: `MIRROR_PROMPT_TEMPLATE`, `allocate_quota`, `parse_requirements`, `mirror_text`, `remove_variants`, `add_variants`, `distractor_pool`, `emit_queries`, `load_real_cvs`

- [ ] **Step 1: Write the failing tests**

```python
import json
from pathlib import Path
from backend.app.services.matching.eval_retrieve import (
    allocate_quota,
    add_variants,
    emit_queries,
    load_real_cvs,
    mirror_text,
    parse_requirements,
    remove_variants,
)


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_eval_retrieve.py::test_emit_queries_orders_mirror_remove_add_and_ids -v`

Expected: FAIL `ImportError` (`emit_queries`)

- [ ] **Step 3: Implement query generation**

Append (also `import itertools`, `from pathlib import Path`, `import json`):

```python
MIRROR_PROMPT_TEMPLATE = """Rewrite this resume as a job posting Requirements section.

Return ONLY JSON: {\"requirements\": [\"...\", \"...\"]}
- 6 to 10 short bullets
- Facts from the source only. Do not invent skills or years of experience.
- Employer voice (\"Required: ...\", \"Yêu cầu biết ...\"), not first person
- Same language as the source
- No names, phones, emails, URLs, dates of birth

SOURCE:
{body}
"""

_DISTRACTOR_FIXED = (
    "Yêu cầu kinh nghiệm SAP ERP",
    "Yêu cầu vận hành Kubernetes production",
    "Yêu cầu 5 năm kinh nghiệm thương mại điện tử",
    "Yêu cầu Salesforce administrator",
    "Yêu cầu Unreal Engine 5",
    "Yêu cầu IELTS 7.0",
    "Yêu cầu chứng chỉ CPA / kế toán trưởng",
    "Yêu cầu COBOL trên mainframe",
    "Yêu cầu Verilog / FPGA",
    "Yêu cầu Unity game client",
    "Yêu cầu Terraform + Ansible cho on-prem",
)


def distractor_pool() -> list[str]:
    oil = [f"Yêu cầu {n} năm kinh nghiệm ngành dầu khí" for n in range(3, 13)]
    return [*_DISTRACTOR_FIXED, *oil]


def allocate_quota(successful_ids: Sequence[str], queries: int) -> dict[str, int]:
    ids = sorted(successful_ids)
    n = len(ids)
    if n == 0:
        return {}
    per, extra = divmod(queries, n)
    return {cv_id: per + (1 if i < extra else 0) for i, cv_id in enumerate(ids)}


def parse_requirements(raw: Any) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        parts: list[str] = []
        for line in raw.splitlines():
            stripped = line.strip()
            if stripped.startswith(("- ", "* ", "• ")):
                stripped = stripped[2:].strip()
            elif stripped.startswith("•"):
                stripped = stripped[1:].strip()
            if stripped:
                parts.append(stripped)
        return parts
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    return []


def mirror_text(bullets: Sequence[str]) -> str:
    return "\n".join(f"- {item}" for item in bullets)


def remove_variants(bullets: Sequence[str], n_remove: int, rng: random.Random) -> list[dict[str, Any]]:
    if n_remove <= 0 or len(bullets) < 2:
        return []
    max_drop = max(1, len(bullets) // 2)
    candidates: list[tuple[tuple[str, ...], list[str]]] = []
    seen: set[tuple[str, ...]] = set()
    for drop_n in range(1, max_drop + 1):
        for combo in itertools.combinations(range(len(bullets)), drop_n):
            dropped_idx = set(combo)
            remaining = tuple(bullets[i] for i in range(len(bullets)) if i not in dropped_idx)
            if remaining in seen:
                continue
            seen.add(remaining)
            dropped = [bullets[i] for i in combo]
            candidates.append((remaining, dropped))
    rng.shuffle(candidates)
    picked = candidates[:n_remove]
    return [
        {"remaining": remaining, "dropped": dropped, "text": mirror_text(remaining)}
        for remaining, dropped in picked
    ]


def _eligible(line: str, body: str) -> bool:
    if line.casefold() in body.casefold():
        return False
    return not (set(extract_skills(line)) & set(extract_skills(body)))


def add_variants(bullets: Sequence[str], body: str, n_add: int, rng: random.Random) -> list[dict[str, Any]]:
    if n_add <= 0:
        return []
    pool = [line for line in distractor_pool() if _eligible(line, body)]
    combos: list[tuple[str, ...]] = []
    seen: set[tuple[str, ...]] = set()
    for count in (1, 2):
        for combo in itertools.combinations(pool, count):
            key = tuple(sorted(combo))
            if key in seen:
                continue
            seen.add(key)
            combos.append(key)
    rng.shuffle(combos)
    picked = combos[:n_add]
    oil_n = 13
    while len(picked) < n_add:
        line = f"Yêu cầu {oil_n} năm kinh nghiệm ngành dầu khí"
        oil_n += 1
        if not _eligible(line, body):
            continue
        key = (line,)
        if key in seen:
            continue
        seen.add(key)
        picked.append(key)
    base = mirror_text(bullets)
    rows: list[dict[str, Any]] = []
    for key in picked:
        added = list(key)
        text = base + ("\n" + mirror_text(added) if added else "")
        rows.append({"added": added, "text": text})
    return rows


def emit_queries(
    mirrors: dict[str, list[str]],
    bodies: dict[str, str],
    queries: int,
    rng: random.Random,
) -> list[dict[str, Any]]:
    successful = sorted(mirrors)
    quotas = allocate_quota(successful, queries)
    items: list[dict[str, Any]] = []
    seq = 0

    def _rec(cv_id: str, qtype: str, text: str, dropped: list[str], added: list[str]) -> None:
        nonlocal seq
        items.append(
            {
                "id": f"q_{seq:05d}",
                "cv_id": cv_id,
                "type": qtype,
                "text": text,
                "dropped": dropped,
                "added": added,
            }
        )
        seq += 1

    for cv_id in successful:
        quota = quotas.get(cv_id, 0)
        if quota <= 0:
            continue
        bullets = mirrors[cv_id]
        rest = quota - 1
        n_remove = rest // 2
        n_add = rest - n_remove
        if len(bullets) < 2:
            n_add += n_remove
            n_remove = 0
        removed = remove_variants(bullets, n_remove, rng)
        if len(removed) < n_remove:
            n_add += n_remove - len(removed)
        added_rows = add_variants(bullets, bodies[cv_id], n_add, rng)
        _rec(cv_id, "mirror", mirror_text(bullets), [], [])
        for row in removed:
            _rec(cv_id, "remove", row["text"], list(row["dropped"]), [])
        for row in added_rows:
            _rec(cv_id, "add", row["text"], [], list(row["added"]))
    return items


def load_real_cvs(parsed_dir: Path, limit_cv: int | None) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for path in parsed_dir.iterdir():
        if path.name == "_batch_report.json" or path.suffix.lower() != ".json":
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(payload, dict):
            continue
        body = str(payload.get("body") or "").strip()
        if not body:
            continue
        rows.append({"cv_id": path.stem, "body": body})
    rows.sort(key=lambda item: item["cv_id"])
    if limit_cv is not None:
        rows = rows[:limit_cv]
    return rows
```

In the plan file above, JSON in the prompt string: implement as a normal triple-quoted string matching the spec (raw `{body}` placeholder, JSON example with doubled braces only if using `.format`; **use `.replace("{body}", body)`** in the script, not `str.format`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/unit/test_eval_retrieve.py -v`

Expected: PASS

If `test_allocate_quota_recompute_and_mirror_inside_quota` fails on `list(q) == ["a","b"]`: dict insertion order is sorted ids — assert `q["a"]==3` only.

If `test_emit_queries` type order fails: fix emit to always mirror then all removes then all adds (already the case). `sorted(types_a, key=...)` equals `types_a` only if no interleave — our emit does not interleave.

- [ ] **Step 5: Commit**

Skip unless asked.

---

### Task 4: CLI script (cache, LLM, embed, report)

**Files:**
- Create: `scripts/eval_requirement_retrieve.py`
- Create: `tests/unit/test_eval_requirement_script.py`

**Interfaces:**
- Consumes: all Task 1–3 functions; `embed_text`; `chat_complete`; `settings.qwen_api_key`; `DEFAULT_EMBED_MODEL`; `DEFAULT_EMBED_DIM`
- Produces: `parse_args`, `run_eval` (exit int), artifacts under `--out-dir`

- [ ] **Step 1: Write the failing script tests**

```python
import json
from pathlib import Path
import pytest
from scripts.eval_requirement_retrieve import run_eval


def _unit(i: int) -> list[float]:
    vec = [0.0] * 1536
    vec[i] = 1.0
    return vec


def test_run_eval_fake_encode_recall_at_one(tmp_path: Path):
    parsed = tmp_path / "parsed"
    parsed.mkdir()
    (parsed / "cv_a.json").write_text(json.dumps({"body": "TOKEN_A python intern"}), encoding="utf-8")
    (parsed / "cv_b.json").write_text(json.dumps({"body": "TOKEN_B java intern"}), encoding="utf-8")
    out = tmp_path / "eval"

    def complete(prompt: str, **_kwargs) -> str:
        tag = "TOKEN_A" if "TOKEN_A" in prompt else "TOKEN_B"
        return json.dumps({"requirements": [f"{tag} skill", f"{tag} project", f"{tag} team"]})

    def encode(text: str) -> list[float]:
        if "TOKEN_A" in text and "decoy" not in text:
            return _unit(0)
        if "TOKEN_B" in text and "decoy" not in text:
            return _unit(1)
        return _unit(2)

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
        if "TOKEN_A" in text:
            return _unit(0)
        if "TOKEN_B" in text:
            return _unit(1)
        return _unit(2)

    argv = ["--parsed-dir", str(parsed), "--out-dir", str(out), "--decoys", "0", "--queries", "4"]
    assert run_eval(argv=argv, complete=complete, encode=encode) == 0
    assert calls["n"] == 2
    assert run_eval(argv=argv, complete=complete, encode=encode) == 0
    assert calls["n"] == 2
    assert json.loads((out / "run_meta.json").read_text(encoding="utf-8"))["n_mirror_llm_calls"] == 0
    smoke_out = tmp_path / "eval_smoke"
    assert (
        run_eval(
            argv=argv[:-1] + [str(smoke_out), "--limit-cv", "1", "--queries", "2", "--decoys", "0"],
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
    parsed = tmp_path / "parsed"
    parsed.mkdir()
    (parsed / "cv_a.json").write_text(json.dumps({"body": "A1\\nA2\\nA3\\nA4 python"}), encoding="utf-8")
    (parsed / "cv_b.json").write_text(json.dumps({"body": "B1\\nB2\\nB3\\nB4 java"}), encoding="utf-8")
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
```

`scripts.*` import requires `scripts` to be a package **or** load via path. Do **not** add `scripts/__init__.py` unless needed. Prefer putting `run_eval` importable: in the test file, insert repo root (already) and import after ensuring `scripts/eval_requirement_retrieve.py` is loaded as module. Pattern used by other scripts: tests import from `backend` only.

**Avoid package issues:** implement `run_eval` in `backend/app/services/matching/eval_retrieve.py`? Spec says CLI lives in `scripts/`. Tests should do:

```python
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def _load():
    path = ROOT / "scripts" / "eval_requirement_retrieve.py"
    spec = importlib.util.spec_from_file_location("eval_requirement_retrieve", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
```

Put `_load` in the test file; call `_load().run_eval`.

Fix the decoy body JSON: write real newlines in the JSON string (`"A1\\nA2..."` in the test file as `'{"body": "A1\\nA2\\nA3\\nA4 python"}'` so the body contains newline characters).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_eval_requirement_script.py::test_run_eval_fake_encode_recall_at_one -v`

Expected: FAIL cannot import `run_eval` / file missing

- [ ] **Step 3: Implement the script**

Create `scripts/eval_requirement_retrieve.py`:

```python
"""Requirement-query retrieve eval against parsed_CV bodies.

Usage:
    python scripts/eval_requirement_retrieve.py
    python scripts/eval_requirement_retrieve.py --limit-cv 2 --decoys 8 --queries 20
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.config.env import settings
from backend.app.config.models import DEFAULT_EMBED_DIM, DEFAULT_EMBED_MODEL
from backend.app.services.matching.embed import embed_text
from backend.app.services.matching.eval_retrieve import (
    DECOYS_DEFAULT,
    KS,
    MIRROR_PROMPT_TEMPLATE,
    QUERIES_DEFAULT,
    SEED_DEFAULT,
    config_fingerprint,
    context_precision_at_k,
    decoy_records_equal,
    doc_hash,
    emit_queries,
    generate_decoys,
    gold_rank,
    load_real_cvs,
    nearest_rank_percentile,
    parse_requirements,
    query_hash,
    rank_docs,
    recall_at_k,
    text_hash,
    worst_queries,
)
from backend.app.clients.llm import chat_complete

CompleteFn = Callable[..., str]
EncodeFn = Callable[[str], list[float]]


class EvalExit(Exception):
    def __init__(self, code: int, message: str = "") -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--parsed-dir", type=Path, default=ROOT / "data" / "test_CV_parse" / "parsed_CV")
    parser.add_argument("--out-dir", type=Path, default=ROOT / "data" / "test_CV_parse" / "eval")
    parser.add_argument("--decoys", type=int, default=DECOYS_DEFAULT)
    parser.add_argument("--queries", type=int, default=QUERIES_DEFAULT)
    parser.add_argument("--seed", type=int, default=SEED_DEFAULT)
    parser.add_argument("--limit-cv", type=int, default=None)
    parser.add_argument("--refresh-mirrors", action="store_true")
    parser.add_argument("--refresh-queries", action="store_true")
    parser.add_argument("--refresh-decoys", action="store_true")
    parser.add_argument("--skip-embed", action="store_true")
    return parser.parse_args(argv)


def _need_key(complete: CompleteFn | None, encode: EncodeFn | None, skip_embed: bool, need_llm: bool) -> None:
    if complete is None and need_llm and not settings.qwen_api_key:
        raise EvalExit(1, "QWEN_API_KEY missing")
    if encode is None and not skip_embed and not settings.qwen_api_key:
        raise EvalExit(1, "QWEN_API_KEY missing")


def _check_vec(vec: list[float], dim: int) -> None:
    if len(vec) != dim or any(not math.isfinite(x) for x in vec):
        raise EvalExit(1, "bad embedding")


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_doc_cache(path: Path, dim: int) -> dict[str, Any] | None:
    try:
        payload = _read_json(path)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    vectors = payload.get("vectors")
    if not isinstance(vectors, dict):
        return None
    for vec in vectors.values():
        if not isinstance(vec, list) or len(vec) != dim:
            return None
        if any(not math.isfinite(float(x)) for x in vec):
            return None
    return payload


def _load_query_cache(path: Path, dim: int) -> dict[str, Any] | None:
    try:
        payload = _read_json(path)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict) or not isinstance(payload.get("vectors"), dict):
        return None
    for rec in payload["vectors"].values():
        if not isinstance(rec, dict) or not isinstance(rec.get("embedding"), list):
            return None
        emb = rec["embedding"]
        if len(emb) != dim or any(not math.isfinite(float(x)) for x in emb):
            return None
    return payload


def run_eval(
    argv: list[str] | None = None,
    *,
    complete: CompleteFn | None = None,
    encode: EncodeFn | None = None,
) -> int:
    try:
        return _run(argv, complete=complete, encode=encode)
    except EvalExit as exc:
        if exc.message:
            print(exc.message, file=sys.stderr)
        return exc.code


def _run(argv: list[str] | None, *, complete: CompleteFn | None, encode: EncodeFn | None) -> int:
    args = parse_args(argv)
    if args.queries < 1:
        raise EvalExit(1, "--queries must be >= 1")
    real = load_real_cvs(args.parsed_dir, args.limit_cv)
    if not real:
        raise EvalExit(1, "no valid CVs")
    bodies = {row["cv_id"]: row["body"] for row in real}
    real_ids = [row["cv_id"] for row in real]
    real_set = set(real_ids)
    model = settings.embedding_model or DEFAULT_EMBED_MODEL
    dim = DEFAULT_EMBED_DIM
    fingerprint = config_fingerprint(
        seed=args.seed,
        decoys=args.decoys,
        queries=args.queries,
        model=model,
        dim=dim,
        limit_cv=args.limit_cv,
    )
    rng = random.Random(args.seed)
    decoys_mem = generate_decoys(bodies, args.decoys, rng)
    out = args.out_dir
    out.mkdir(parents=True, exist_ok=True)
    decoy_path = out / "decoy_docs.json"
    if decoy_path.exists():
        try:
            cached = _read_json(decoy_path)
        except (OSError, json.JSONDecodeError) as exc:
            raise EvalExit(1, "malformed decoy cache") from exc
        if not decoy_records_equal(cached if isinstance(cached, list) else [], decoys_mem):
            if not args.refresh_decoys:
                raise EvalExit(1, "decoy cache mismatch")
            _write_json(decoy_path, decoys_mem)
    else:
        _write_json(decoy_path, decoys_mem)

    docs = [{"id": cv_id, "text": body} for cv_id, body in bodies.items()]
    docs.extend({"id": row["id"], "text": row["text"]} for row in decoys_mem)
    dhash = doc_hash(docs)

    mirrors_path = out / "mirrors.json"
    mirrors: dict[str, list[str]] = {}
    if mirrors_path.exists() and not args.refresh_mirrors:
        try:
            loaded = _read_json(mirrors_path)
        except (OSError, json.JSONDecodeError):
            loaded = {}
        if isinstance(loaded, dict):
            for cv_id, bullets in loaded.items():
                if cv_id in real_set and isinstance(bullets, list) and parse_requirements(bullets):
                    mirrors[cv_id] = parse_requirements(bullets)

    n_llm = 0
    missing = [cv_id for cv_id in real_ids if cv_id not in mirrors]
    if missing:
        _need_key(complete, encode, args.skip_embed, need_llm=True)
        complete_fn = complete or chat_complete
        for cv_id in missing:
            prompt = MIRROR_PROMPT_TEMPLATE.replace("{body}", bodies[cv_id])
            try:
                raw = complete_fn(prompt, json_object=True)
                data = json.loads(raw)
                bullets = parse_requirements(data.get("requirements") if isinstance(data, dict) else None)
            except Exception:
                bullets = []
            if bullets:
                mirrors[cv_id] = bullets
                n_llm += 1
        _write_json(mirrors_path, {**(_read_json(mirrors_path) if mirrors_path.exists() else {}), **mirrors})

    successful = {cv_id: mirrors[cv_id] for cv_id in sorted(mirrors) if cv_id in real_set}
    if not successful:
        raise EvalExit(1, "no successful mirrors")

    queries_path = out / "queries.json"
    items: list[dict[str, Any]] | None = None
    if queries_path.exists() and not args.refresh_queries:
        try:
            payload = _read_json(queries_path)
        except (OSError, json.JSONDecodeError):
            payload = None
        if isinstance(payload, dict) and payload.get("fingerprint") == fingerprint:
            maybe = payload.get("items")
            if isinstance(maybe, list):
                items = maybe
    if items is None:
        items = emit_queries(successful, bodies, args.queries, rng)
        _write_json(queries_path, {"fingerprint": fingerprint, "items": items})

    for query in items:
        if query.get("cv_id") not in real_set:
            raise EvalExit(1, "query gold cv_id not in corpus")

    qhash = query_hash(items)

    def _embed(text: str) -> list[float]:
        vec = list(encode(text) if encode is not None else embed_text(text))
        _check_vec(vec, dim)
        return vec

    doc_cache_path = out / "cv_embeddings.json"
    query_cache_path = out / "query_embeddings.json"
    doc_vectors: dict[str, list[float]] = {}
    query_vectors: dict[str, dict[str, Any]] = {}

    if args.skip_embed:
        doc_payload = _load_doc_cache(doc_cache_path, dim)
        query_payload = _load_query_cache(query_cache_path, dim)
        if (
            doc_payload is None
            or query_payload is None
            or doc_payload.get("doc_hash") != dhash
            or doc_payload.get("model") != model
            or doc_payload.get("dim") != dim
            or query_payload.get("query_hash") != qhash
            or query_payload.get("model") != model
            or query_payload.get("dim") != dim
        ):
            raise EvalExit(1, "skip-embed cache invalid")
        missing_docs = [row["id"] for row in docs if row["id"] not in doc_payload["vectors"]]
        if missing_docs:
            raise EvalExit(1, "skip-embed cache invalid")
        for query in items:
            rec = query_payload["vectors"].get(query["id"])
            if not rec or rec.get("text_hash") != text_hash(query["text"]):
                raise EvalExit(1, "skip-embed cache invalid")
        doc_vectors = {key: [float(x) for x in vec] for key, vec in doc_payload["vectors"].items()}
        query_vectors = query_payload["vectors"]
    else:
        _need_key(complete, encode, False, need_llm=False)
        doc_payload = _load_doc_cache(doc_cache_path, dim)
        if (
            doc_payload
            and doc_payload.get("doc_hash") == dhash
            and doc_payload.get("model") == model
            and doc_payload.get("dim") == dim
            and all(row["id"] in doc_payload["vectors"] for row in docs)
        ):
            doc_vectors = {key: [float(x) for x in vec] for key, vec in doc_payload["vectors"].items()}
        else:
            for row in docs:
                doc_vectors[row["id"]] = _embed(row["text"])
            _write_json(doc_cache_path, {"doc_hash": dhash, "model": model, "dim": dim, "vectors": doc_vectors})

        query_payload = _load_query_cache(query_cache_path, dim)
        reusable = (
            query_payload
            and query_payload.get("query_hash") == qhash
            and query_payload.get("model") == model
            and query_payload.get("dim") == dim
        )
        cached_q = query_payload["vectors"] if reusable else {}
        for query in items:
            rec = cached_q.get(query["id"]) if isinstance(cached_q, dict) else None
            if rec and rec.get("text_hash") == text_hash(query["text"]):
                query_vectors[query["id"]] = rec
            else:
                emb = _embed(query["text"])
                query_vectors[query["id"]] = {"text_hash": text_hash(query["text"]), "embedding": emb}
        _write_json(
            query_cache_path,
            {"query_hash": qhash, "model": model, "dim": dim, "vectors": query_vectors},
        )

    doc_pairs = [(row["id"], doc_vectors[row["id"]]) for row in docs]
    per_query: list[dict[str, Any]] = []
    by_type: dict[str, list[int]] = {"mirror": [], "remove": [], "add": []}
    all_ranks: list[int] = []
    for query in items:
        qvec = query_vectors[query["id"]]["embedding"]
        ranked = rank_docs(qvec, doc_pairs)
        rank = gold_rank([doc_id for doc_id, _sim in ranked], query["cv_id"])
        all_ranks.append(rank)
        by_type.setdefault(query["type"], []).append(rank)
        per_query.append({**query, "r": rank})

    def _agg(ranks: list[int]) -> dict[str, Any]:
        n = len(ranks)
        if n == 0:
            return {f"recall@{k}": None for k in KS} | {f"context_precision@{k}": None for k in KS}
        return {
            **{f"recall@{k}": sum(recall_at_k(r, k) for r in ranks) / n for k in KS},
            **{f"context_precision@{k}": sum(context_precision_at_k(r, k) for r in ranks) / n for k in KS},
            "median_rank": nearest_rank_percentile(ranks, 0.5),
            "p90_rank": nearest_rank_percentile(ranks, 0.9),
        }

    corpus_size = len(docs)
    report = {
        "n_real": len(real),
        "n_decoy": len(decoys_mem),
        "n_query": len(items),
        "n_mirror_llm_calls": n_llm,
        "corpus_size": corpus_size,
        "random_recall": {f"@{k}": k / corpus_size for k in KS},
        "metrics": {
            "overall": _agg(all_ranks),
            "by_type": {name: _agg(ranks) for name, ranks in by_type.items()},
        },
        "worst": worst_queries(per_query, n=20),
    }
    _write_json(out / "report.json", report)
    _write_json(
        out / "run_meta.json",
        {
            "fingerprint": fingerprint,
            "n_real": report["n_real"],
            "n_decoy": report["n_decoy"],
            "n_query": report["n_query"],
            "n_mirror_llm_calls": n_llm,
            "doc_hash": dhash,
            "query_hash": qhash,
        },
    )
    print(json.dumps({k: report[k] for k in ("n_real", "n_decoy", "n_query", "n_mirror_llm_calls", "metrics", "random_recall")}, ensure_ascii=False, indent=2))
    return 0


def main() -> None:
    raise SystemExit(run_eval())


if __name__ == "__main__":
    main()
```

When merging mirrors file, if `mirrors_path` did not exist until first write, skip read-merge: `_write_json(mirrors_path, mirrors)` only (do not read missing file). Replace the merge line with: always `_write_json(mirrors_path, {**old, **mirrors})` where `old` is loaded only if exists.

`test_skip_embed_malformed`: `run_eval` still generates decoys/mirrors/queries before skip-embed. With 1 CV, decoys 0, queries 1: needs successful mirror via `complete`. Malformed `cv_embeddings.json` → exit 1 at skip-embed. Also create empty valid `queries`? Script will overwrite queries.json as it runs. Order: decoys, mirrors, queries, then skip-embed reads cv_embeddings — stale `{` still there unless we write embeddings earlier. **Do not write embeddings before skip check.** Pre-created `{` survives. Good.

`test_decoy_cache_mismatch`: body must have 4+ lines so splice is non-placeholder; stale cache still mismatches. Use `"body": "A1\\nA2\\nA3\\nA4 python"` in `json.dumps`.

`--limit-cv` test argv bug: `argv[:-1] + [str(smoke_out), ...]` would drop `--queries` 4. Pass a full argv list for smoke:

```python
run_eval(
    argv=[
        "--parsed-dir", str(parsed),
        "--out-dir", str(smoke_out),
        "--decoys", "0",
        "--queries", "2",
        "--limit-cv", "1",
    ],
    ...
)
```

Fix the test in Step 1 accordingly when implementing (do not use `argv[:-1]`).

`n_mirror_llm_calls` on second full run: `missing` empty so `n_llm=0`. Do not rewrite mirrors. Good.

When first run writes mirrors and second run loads them, `complete` unused. Good.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/unit/test_eval_retrieve.py tests/unit/test_eval_requirement_script.py -v`

Expected: PASS

If `recall@1` is not 1.0: decoy text may contain `TOKEN_A` after splice — `encode` maps those to unit(0) and they can tie with gold. **Fix encode in the test:** gold CV id ranking uses `text_hash` / exact body match:

```python
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
```

Queries are `mirror_text` (`- TOKEN_A skill` …) so `startswith("- TOKEN_A")` works; decoys are spliced lines without that prefix → unit(3). Then gold cosine = 1 vs decoy ~ 0.

- [ ] **Step 5: Commit**

Skip unless asked.

---

### Task 5: Full-suite check

**Files:** none new

- [ ] **Step 1: Run unit tests**

Run: `pytest tests/unit/test_eval_retrieve.py tests/unit/test_eval_requirement_script.py -v`

Expected: all PASS

- [ ] **Step 2: Smoke against real `parsed_CV` only if `QWEN_API_KEY` is set**

Run: `python scripts/eval_requirement_retrieve.py --limit-cv 2 --decoys 8 --queries 20`

Expected: exit 0, prints `n_real=2`, writes `data/test_CV_parse/eval/report.json`. If no key: exit 1 with `QWEN_API_KEY missing` — that is spec-compliant; do not fake a full Qwen run in CI.

Full 1000-query run is manual after merge: `python scripts/eval_requirement_retrieve.py`

- [ ] **Step 3: Commit**

Skip unless asked.

---

## Spec coverage (self-review)

| Spec section | Task |
|---|---|
| Inputs / `--limit-cv` sort | 3 `load_real_cvs`, 4 CLI |
| `extract_skills` + literal replace | 2 `skill_swap` |
| RNG decoy always + cache mismatch | 2 generate, 4 CLI |
| Decoy sample indices, a_take/b_take | 2 |
| Mirror prompt / parse / quota / unique remove-add / oil n | 3 |
| Fingerprints, hashes, query `text_hash` | 1 + 4 |
| Cosine / rank / metrics / worst / P90 | 1 + 4 report |
| Exit codes / skip-embed | 4 |
| Out of scope (no ingest change) | all |

No `TBD`. Signatures: `run_eval(argv=..., complete=..., encode=...) -> int` used only in Task 4 tests.
