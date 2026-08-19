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


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _valid_vec_elem(x: Any) -> bool:
    if not isinstance(x, (int, float)) or isinstance(x, bool):
        return False
    try:
        return math.isfinite(float(x))
    except OverflowError:
        return False


def _as_float_vec(vec: list[Any]) -> list[float]:
    return [float(x) for x in vec]


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
        if any(not _valid_vec_elem(x) for x in vec):
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
        if len(emb) != dim:
            return None
        if any(not _valid_vec_elem(x) for x in emb):
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
            n_llm += 1
            try:
                raw = complete_fn(prompt, json_object=True)
                data = json.loads(raw)
                bullets = parse_requirements(data.get("requirements") if isinstance(data, dict) else None)
            except Exception:
                bullets = []
            if bullets:
                mirrors[cv_id] = bullets
        if args.refresh_mirrors:
            _write_json(mirrors_path, mirrors)
        else:
            old: dict[str, Any] = {}
            if mirrors_path.exists():
                try:
                    loaded_old = _read_json(mirrors_path)
                except (OSError, json.JSONDecodeError):
                    loaded_old = {}
                if isinstance(loaded_old, dict):
                    old = loaded_old
            _write_json(mirrors_path, {**old, **mirrors})

    successful = {cv_id: mirrors[cv_id] for cv_id in sorted(mirrors) if cv_id in real_set}
    if not successful:
        raise EvalExit(1, "no successful mirrors")

    queries_path = out / "queries.json"
    items: list[dict[str, Any]] | None = None
    if queries_path.exists() and not args.refresh_queries and not args.refresh_mirrors:
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
        if len(vec) != dim or any(not _valid_vec_elem(x) for x in vec):
            raise EvalExit(1, "bad embedding")
        return _as_float_vec(vec)

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
        doc_vectors = {key: _as_float_vec(vec) for key, vec in doc_payload["vectors"].items()}
        query_vectors = {
            qid: {**rec, "embedding": _as_float_vec(rec["embedding"])}
            for qid, rec in query_payload["vectors"].items()
        }
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
            doc_vectors = {key: _as_float_vec(vec) for key, vec in doc_payload["vectors"].items()}
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
                query_vectors[query["id"]] = {**rec, "embedding": _as_float_vec(rec["embedding"])}
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
