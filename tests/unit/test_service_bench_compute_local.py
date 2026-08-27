from __future__ import annotations

import time

from evaluation.service_bench.compute_local_bench import time_callable


def test_time_callable_reports_stable_stats_for_a_known_sleep():
    def sleepy():
        time.sleep(0.001)

    stats = time_callable(sleepy, repeats=10)
    assert set(stats) == {"mean_ms", "median_ms", "stddev_ms", "min_ms", "max_ms"}
    assert stats["mean_ms"] >= 1.0
    assert stats["min_ms"] <= stats["mean_ms"] <= stats["max_ms"]
