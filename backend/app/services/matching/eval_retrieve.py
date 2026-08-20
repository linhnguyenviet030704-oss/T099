from __future__ import annotations

import hashlib
import itertools
import json
import math
import random
import re
from collections.abc import Sequence
from math import ceil, floor
from pathlib import Path
from typing import Any

from backend.app.services.matching.skills import extract_skills

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
        spaced = skill.replace("_", " ")
        if spaced != skill:
            out = re.sub(re.escape(spaced), replacement, out, flags=re.IGNORECASE)
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


MIRROR_PROMPT_TEMPLATE = """Rewrite this resume as a job posting Requirements section.

Return ONLY JSON: {"requirements": ["...", "..."]}
- 6 to 10 short bullets
- Facts from the source only. Do not invent skills or years of experience.
- Employer voice ("Required: ...", "Yêu cầu biết ..."), not first person
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
    # ponytail: ceiling is 12 bullets; upgrade path is reservoir-sample combinations if mirrors can be longer.
    bullets = list(bullets[:12])
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


def precision_at_k(rank: int, k: int) -> float:
    return 1.0 if 1 <= rank <= k else 0.0


def ndcg_at_k(rank: int, k: int) -> float:
    if rank < 1 or rank > k:
        return 0.0
    return 1.0 / math.log2(rank + 1)


def faithfulness_inferred_rate(verified: Sequence[str], inferred: Sequence[str]) -> float:
    verified_set = set(verified)
    inferred_set = set(inferred)
    union = verified_set | inferred_set
    if not union:
        return 0.0
    return len(inferred_set - verified_set) / len(union)


_VI_TOKENS = re.compile(r"\b(va|cua|la|khong|kinh|nghiem|yeu|cau)\b")
_VI_MARKS = re.compile(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", re.I)


def detect_lang(text: str) -> str:
    from backend.app.services.matching.skills import _normalize_text

    if _VI_MARKS.search(text) or _VI_TOKENS.search(_normalize_text(text)):
        return "vi"
    return "en"


def rank_bm25_ids(docs: Sequence[tuple[str, str]], query: str) -> list[str]:
    from backend.app.services.matching.bm25 import bm25_ranking_ids, bm25_scores

    ids = [doc_id for doc_id, _text in docs]
    texts = [text for _doc_id, text in docs]
    return bm25_ranking_ids(ids, bm25_scores(texts, query))

