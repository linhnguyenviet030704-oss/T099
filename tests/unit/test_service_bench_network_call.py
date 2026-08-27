from __future__ import annotations

import pytest

from evaluation.service_bench.network_call_bench import bench_network_call


def test_bench_network_call_rejects_large_sample_counts():
    """Cost-control guard from the design doc: network-call benchmarks must stay in the
    5-10 sample range, never run across the full dataset."""
    with pytest.raises(ValueError, match="samples must be between 1 and 10"):
        bench_network_call(lambda: None, samples=50)


def test_bench_network_call_times_a_stub_call():
    calls = {"n": 0}

    def fake_call():
        calls["n"] += 1
        return "ok"

    stats = bench_network_call(fake_call, samples=3)
    assert calls["n"] == 3
    assert set(stats) == {"mean_ms", "median_ms", "stddev_ms", "min_ms", "max_ms"}
