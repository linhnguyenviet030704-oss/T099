# evaluation/matching_perf/run_bench.py
"""Benchmark build_matching_graph() per-node latency over several golden JDs.

Usage (from repo root, venv active, requires OPENAI_API_KEY per evaluation/golden/llm_openai.py):
    python -m evaluation.matching_perf.run_bench [--repeats 3]

Writes evaluation/matching_perf/results/report.md.

Note on the explain node's numbers: explain_complete is evaluation.golden.llm_openai's
cached chat_complete wrapper, so only the FIRST repeat per JD pays real LLM latency --
later repeats hit the on-disk cache. This makes retrieve/skill/rrf/rerank/respond
latencies (compute-local, always uncached) statistically meaningful across repeats, but
explain's *median-of-repeats* number understates real LLM latency. For explain/router's
true uncached latency, see evaluation/service_bench/network_call_bench.py (Task 4) --
this report's explain column should be read as "graph overhead when the LLM call is warm",
cross-referenced against Task 4's report for the cold-call number.
"""

from __future__ import annotations

import argparse
import statistics as stats
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from evaluation.golden.llm_openai import CHAT_MODEL, chat_complete  # noqa: E402
from evaluation.matching_perf.fixtures import load_matching_fixture  # noqa: E402
from evaluation.matching_perf.pipeline import run_matching_pipeline  # noqa: E402

RESULTS_PATH = Path(__file__).resolve().parent / "results" / "report.md"
JD_IDS = [f"JD-{i:02d}" for i in range(1, 6)]  # 5 of the 20 golden JDs -- enough spread, low cost
NODE_ORDER = ["retrieve", "skill", "rrf", "rerank", "explain", "respond"]


def _explain_complete(prompt: str, **kwargs) -> str:
    return chat_complete(prompt, json_object=bool(kwargs.get("json_object")), cache_key=f"matching_perf|{prompt[:120]}")


def _git_commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repeats", type=int, default=3)
    args = parser.parse_args()

    per_jd: dict[str, list[dict[str, float]]] = {}
    for jd_id in JD_IDS:
        fixture = load_matching_fixture(jd_id)
        runs = []
        for _ in range(args.repeats):
            result = run_matching_pipeline(
                retrieve=fixture["retrieve"],
                initial_state=fixture["initial_state"],
                explain_complete=_explain_complete,
            )
            runs.append(result["timings_ms"])
        per_jd[jd_id] = runs
        print(f"{jd_id}: {runs[-1]}")

    lines = ["# Matching Agent (JD→CV) — Per-node Latency Benchmark", ""]
    lines.append(f"- Chạy lúc: {datetime.now(timezone.utc).isoformat()}")
    lines.append(f"- Git commit: `{_git_commit()}`")
    lines.append(f"- JD mẫu: {', '.join(JD_IDS)} (5/20 JD trong golden dataset), {args.repeats} lần lặp/JD")
    lines.append(f"- LLM backend: OpenAI `{CHAT_MODEL}` qua cache `evaluation/golden/.cache/` — xem lưu ý ở đầu `run_bench.py` về số đo node `explain`")
    lines.append("")
    lines.append("| Node | Mean (ms) | Median (ms) | Max (ms) | Tỷ trọng |")
    lines.append("|---|---|---|---|---|")
    all_runs = [run for runs in per_jd.values() for run in runs]
    totals = [sum(run.values()) for run in all_runs]
    total_mean = stats.mean(totals)
    for node in NODE_ORDER:
        values = [run[node] for run in all_runs if node in run]
        if not values:
            continue
        mean_v = stats.mean(values)
        med_v = stats.median(values)
        max_v = max(values)
        share = (mean_v / total_mean * 100) if total_mean else 0.0
        lines.append(f"| `{node}` | {mean_v:.1f} | {med_v:.1f} | {max_v:.1f} | ~{share:.1f}% |")
    lines.append("")
    lines.append(f"**Tổng latency trung bình/JD: {total_mean:.1f} ms**")
    lines.append("")

    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"-> {RESULTS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
