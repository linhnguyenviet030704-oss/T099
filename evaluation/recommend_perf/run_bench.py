"""Benchmark build_recommend_graph() per-node latency over several golden CVs, for both
the score-path (RECOMMEND_GENERAL intent) and the advice-path (SKILL_GAP_ADVICE intent).

Usage (from repo root, venv active, requires OPENAI_API_KEY):
    python -m evaluation.recommend_perf.run_bench [--repeats 3]

Writes evaluation/recommend_perf/results/report.md. See
evaluation/matching_perf/run_bench.py's docstring for the same caveat about the
explain/advice nodes' numbers reflecting a warm LLM cache after the first repeat.
"""

from __future__ import annotations

import argparse
import json
import statistics as stats
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from evaluation.golden.llm_openai import CHAT_MODEL, chat_complete  # noqa: E402
from evaluation.recommend_perf.fixtures import INGEST_RESULTS_PATH, load_recommend_fixture  # noqa: E402
from evaluation.recommend_perf.pipeline import run_recommend_pipeline  # noqa: E402

RESULTS_PATH = Path(__file__).resolve().parent / "results" / "report.md"
SCORE_QUERY = "Gợi ý công việc phù hợp với hồ sơ của tôi"
ADVICE_QUERY = "Tôi cần bổ sung kỹ năng gì để phù hợp hơn?"


def _explain_complete(prompt: str, **kwargs) -> str:
    return chat_complete(prompt, json_object=bool(kwargs.get("json_object")), cache_key=f"recommend_perf|{prompt[:120]}")


def _git_commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


def _bench_path(cv_ids: list[str], query: str, repeats: int) -> tuple[list[dict[str, float]], list[str]]:
    all_runs: list[dict[str, float]] = []
    node_order: list[str] = []
    for cv_id in cv_ids:
        fixture = load_recommend_fixture(cv_id)
        for _ in range(repeats):
            result = run_recommend_pipeline(
                retrieve=fixture["retrieve"], query=query, explain_complete=_explain_complete
            )
            all_runs.append(result["timings_ms"])
            if not node_order:
                node_order = list(result["timings_ms"])
    return all_runs, node_order


def _render_section(title: str, all_runs: list[dict[str, float]], node_order: list[str]) -> list[str]:
    lines = [f"## {title}", ""]
    lines.append("| Node | Mean (ms) | Median (ms) | Max (ms) | Tỷ trọng |")
    lines.append("|---|---|---|---|---|")
    totals = [sum(run.values()) for run in all_runs]
    total_mean = stats.mean(totals) if totals else 0.0
    for node in node_order:
        values = [run[node] for run in all_runs if node in run]
        if not values:
            continue
        mean_v = stats.mean(values)
        share = (mean_v / total_mean * 100) if total_mean else 0.0
        lines.append(f"| `{node}` | {mean_v:.1f} | {stats.median(values):.1f} | {max(values):.1f} | ~{share:.1f}% |")
    lines.append("")
    lines.append(f"**Tổng latency trung bình: {total_mean:.1f} ms**")
    lines.append("")
    return lines


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repeats", type=int, default=3)
    args = parser.parse_args()

    ingest_results = json.loads(INGEST_RESULTS_PATH.read_text(encoding="utf-8"))
    cv_ids = list(ingest_results)[:5]  # 5 of the 40 golden CVs -- enough spread, low cost

    score_runs, score_order = _bench_path(cv_ids, SCORE_QUERY, args.repeats)
    advice_runs, advice_order = _bench_path(cv_ids, ADVICE_QUERY, args.repeats)

    lines = ["# Recommend Agent (CV→JD) — Per-node Latency Benchmark", ""]
    lines.append(f"- Chạy lúc: {datetime.now(timezone.utc).isoformat()}")
    lines.append(f"- Git commit: `{_git_commit()}`")
    lines.append(f"- CV mẫu: {', '.join(cv_ids)} (5/40 CV trong golden dataset), {args.repeats} lần lặp/CV/path")
    lines.append(f"- LLM backend: OpenAI `{CHAT_MODEL}` qua cache `evaluation/golden/.cache/`")
    lines.append("")
    lines.extend(_render_section("Score path (\"Gợi ý công việc...\") — router → retrieve → kg_retrieval → score → rerank → explain → respond", score_runs, score_order))
    lines.extend(_render_section("Advice path (\"Tôi cần bổ sung kỹ năng...\") — router → retrieve → kg_retrieval → advice", advice_runs, advice_order))

    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"-> {RESULTS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
