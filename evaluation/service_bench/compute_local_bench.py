"""Micro-benchmarks for the compute-local matching services (BM25, RRF fusion, cosine/
semantic scoring, skill coverage) -- no network calls, so these can be repeated many
times to get stable mean/median/stddev numbers, unlike the graph-level and network-call
benchmarks (evaluation/matching_perf, evaluation/recommend_perf, service_bench's own
network_call_bench.py) which are limited to a handful of samples for cost reasons.

Usage: python -m evaluation.service_bench.compute_local_bench
Writes evaluation/service_bench/results/compute_local_report.md.
"""

from __future__ import annotations

import statistics as stats
import time
from typing import Any, Callable


def time_callable(fn: Callable[..., Any], *args: Any, repeats: int = 100, **kwargs: Any) -> dict[str, float]:
    samples_ms: list[float] = []
    for _ in range(repeats):
        t0 = time.perf_counter()
        fn(*args, **kwargs)
        samples_ms.append((time.perf_counter() - t0) * 1000)
    return {
        "mean_ms": round(stats.mean(samples_ms), 4),
        "median_ms": round(stats.median(samples_ms), 4),
        "stddev_ms": round(stats.stdev(samples_ms), 4) if len(samples_ms) > 1 else 0.0,
        "min_ms": round(min(samples_ms), 4),
        "max_ms": round(max(samples_ms), 4),
    }


import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
GOLDEN_DIR = REPO_ROOT / "evaluation" / "golden"
RESULTS_PATH = Path(__file__).resolve().parent / "results" / "compute_local_report.md"


def _git_commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


def _load_golden_candidates() -> tuple[list[dict], list[str]]:
    ingest_results = json.loads((GOLDEN_DIR / "ingest_results.json").read_text(encoding="utf-8"))
    jds = json.loads((GOLDEN_DIR / "jds.json").read_text(encoding="utf-8"))
    jd = jds[0]
    jd_text = (jd.get("requirements_text") or "").strip() or f"{jd['title']} {jd['description']}"
    rows = []
    for cv_id, row in ingest_results.items():
        rows.append(
            {
                "application_id": cv_id,
                "skills": row["extracted_skills"],
                "verified_skills": row["extracted_skills"],
                "clean_markdown": row["original_markdown"],
                "distance_expanded": 0.3,  # fixed dummy distance -- this benchmark measures
                # compute time, not ranking correctness (that's evaluation/golden's job)
                "bm25_score": 0.0,
            }
        )
    return rows, jd["taxonomy_skills"]


def main() -> int:
    from backend.app.services.matching.bm25 import bm25_document, bm25_query, bm25_scores
    from backend.app.services.matching.rrf import score_candidates, semantic_score
    from backend.app.services.matching.skills import coverage_score, load_taxonomy_index

    rows, jd_skills = _load_golden_candidates()
    index = load_taxonomy_index()
    docs = [bm25_document(row["clean_markdown"], row["skills"]) for row in rows]
    query = bm25_query("Backend Engineer", jd_skills)

    results = {
        "bm25_scores (40 docs)": time_callable(bm25_scores, docs, query, repeats=50),
        "score_candidates (40 rows, RRF fusion)": time_callable(
            score_candidates, rows, jd_skills, index, repeats=50
        ),
        "semantic_score (single distance)": time_callable(semantic_score, 0.3, repeats=1000),
        "coverage_score (single CV)": time_callable(
            coverage_score, rows[0]["skills"], jd_skills, index, repeats=1000
        ),
    }

    lines = ["# Compute-local Service Micro-benchmark", ""]
    lines.append(f"- Chạy lúc: {datetime.now(timezone.utc).isoformat()}")
    lines.append(f"- Git commit: `{_git_commit()}`")
    lines.append("- Không gọi API ngoài; input lấy từ 40 CV + JD-01 trong golden dataset để có kích thước thực tế.")
    lines.append("")
    lines.append("| Hàm | Mean (ms) | Median (ms) | Stddev (ms) | Max (ms) |")
    lines.append("|---|---|---|---|---|")
    for label, s in results.items():
        lines.append(f"| `{label}` | {s['mean_ms']:.4f} | {s['median_ms']:.4f} | {s['stddev_ms']:.4f} | {s['max_ms']:.4f} |")
    lines.append("")

    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"-> {RESULTS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
