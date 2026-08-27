# evaluation/concurrency_bench/run_bench.py
"""Small-scale concurrency check for the Matching and Recommend graphs -- NOT a load
test. Goal (per design doc §2): surface race conditions or rate-limit errors under a
handful of simultaneous requests (5-10), not measure maximum throughput.

Usage (from repo root, venv active, requires OPENAI_API_KEY):
    python -m evaluation.concurrency_bench.run_bench [--concurrency 8]

Writes evaluation/concurrency_bench/results/report.md.
"""

from __future__ import annotations

import argparse
import asyncio
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable

RESULTS_PATH = Path(__file__).resolve().parent / "results" / "report.md"


def run_concurrent(
    pipeline_fn: Callable[..., Awaitable[dict]],
    fixtures: list[Any],
    *,
    concurrency: int,
) -> dict[str, Any]:
    """Run pipeline_fn(fixture) for every fixture, with at most `concurrency` in flight
    at once (bounded via a semaphore, not just relying on len(fixtures) == concurrency
    at call sites) -- so this stays correct even if a future caller passes more fixtures
    than the desired concurrency."""

    async def _run() -> dict[str, Any]:
        semaphore = asyncio.Semaphore(concurrency)

        async def _bounded(fixture: Any) -> dict:
            async with semaphore:
                return await pipeline_fn(fixture)

        t0 = time.perf_counter()
        tasks = [_bounded(fixture) for fixture in fixtures]
        outcomes = await asyncio.gather(*tasks, return_exceptions=True)
        wall_ms = (time.perf_counter() - t0) * 1000

        errors = [str(o) for o in outcomes if isinstance(o, Exception)]
        successes = [o for o in outcomes if not isinstance(o, Exception)]
        sequential_sum_ms = sum(float(o.get("total_ms", 0.0)) for o in successes)
        return {"wall_ms": round(wall_ms, 1), "sequential_sum_ms": round(sequential_sum_ms, 1), "errors": errors}

    return asyncio.run(_run())


def _git_commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


async def _matching_call(jd_id: str) -> dict:
    from evaluation.golden.llm_openai import chat_complete
    from evaluation.matching_perf.fixtures import load_matching_fixture
    from evaluation.matching_perf.pipeline import _run_async

    fixture = load_matching_fixture(jd_id)
    return await _run_async(
        retrieve=fixture["retrieve"],
        initial_state=fixture["initial_state"],
        explain_complete=lambda p, **k: chat_complete(p, json_object=bool(k.get("json_object")), cache_key=f"concurrency|{p[:80]}"),
    )


async def _recommend_call(cv_id: str) -> dict:
    from evaluation.golden.llm_openai import chat_complete
    from evaluation.recommend_perf.fixtures import load_recommend_fixture
    from evaluation.recommend_perf.pipeline import _run_async

    fixture = load_recommend_fixture(cv_id)
    return await _run_async(
        retrieve=fixture["retrieve"],
        query="Gợi ý công việc phù hợp với hồ sơ của tôi",
        explain_complete=lambda p, **k: chat_complete(p, json_object=bool(k.get("json_object")), cache_key=f"concurrency|{p[:80]}"),
    )


def main() -> int:
    import json

    from evaluation.matching_perf.fixtures import JDS_PATH
    from evaluation.recommend_perf.fixtures import INGEST_RESULTS_PATH

    parser = argparse.ArgumentParser()
    parser.add_argument("--concurrency", type=int, default=8)
    args = parser.parse_args()
    n = min(args.concurrency, 10)  # cost-control ceiling per design doc §5

    jd_ids = [row["jd_id"] for row in json.loads(JDS_PATH.read_text(encoding="utf-8"))][:n]
    cv_ids = list(json.loads(INGEST_RESULTS_PATH.read_text(encoding="utf-8")))[:n]

    matching_result = run_concurrent(_matching_call, jd_ids, concurrency=n)
    recommend_result = run_concurrent(_recommend_call, cv_ids, concurrency=n)

    lines = ["# Small-scale Concurrency Check", ""]
    lines.append(f"- Chạy lúc: {datetime.now(timezone.utc).isoformat()}")
    lines.append(f"- Git commit: `{_git_commit()}`")
    lines.append(f"- Concurrency: {n} request song song/graph (giới hạn cost-control, không phải load test)")
    lines.append("")
    for name, result in (("Matching graph", matching_result), ("Recommend graph", recommend_result)):
        lines.append(f"## {name}")
        lines.append(f"- Wall time (song song): {result['wall_ms']:.1f} ms")
        lines.append(f"- Tổng thời gian nếu chạy tuần tự: {result['sequential_sum_ms']:.1f} ms")
        lines.append(f"- Lỗi: {len(result['errors'])}/{n}")
        for err in result["errors"]:
            lines.append(f"  - {err}")
        lines.append("")

    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"-> {RESULTS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
