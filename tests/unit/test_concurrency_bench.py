# tests/unit/test_concurrency_bench.py
from __future__ import annotations

import asyncio

from evaluation.concurrency_bench.run_bench import run_concurrent


def test_run_concurrent_runs_all_fixtures_and_reports_wall_time():
    async def fake_pipeline(delay_ms: float) -> dict:
        await asyncio.sleep(delay_ms / 1000)
        return {"total_ms": delay_ms}

    result = run_concurrent(fake_pipeline, [10.0, 10.0, 10.0], concurrency=3)
    assert result["errors"] == []
    # 3 tasks of 10ms run concurrently should take much less than 3*10ms sequential
    assert result["wall_ms"] < result["sequential_sum_ms"]


def test_run_concurrent_collects_errors_without_raising():
    async def flaky_pipeline(should_fail: bool) -> dict:
        if should_fail:
            raise RuntimeError("simulated rate limit")
        return {"total_ms": 1.0}

    result = run_concurrent(flaky_pipeline, [True, False, True], concurrency=3)
    assert len(result["errors"]) == 2
    assert "simulated rate limit" in result["errors"][0]
