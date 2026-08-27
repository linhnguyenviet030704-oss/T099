"""Micro-benchmark for the network-call matching services (embed, rerank, LLM chat) --
calls the REAL production Qwen client (backend/app/clients/llm.py), not the OpenAI eval
backend evaluation/golden uses, because the goal here is production latency, not eval
determinism. Sample counts are capped at 10 per node (cost control, per the design doc).

Usage (from repo root, venv active, requires QWEN_API_KEY in .env):
    python -m evaluation.service_bench.network_call_bench [--samples 5]

Writes evaluation/service_bench/results/network_call_report.md.
"""

from __future__ import annotations

import argparse
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from evaluation.service_bench.compute_local_bench import time_callable

RESULTS_PATH = Path(__file__).resolve().parent / "results" / "network_call_report.md"


def bench_network_call(fn: Callable[..., Any], *args: Any, samples: int = 5, **kwargs: Any) -> dict[str, float]:
    if not 1 <= samples <= 10:
        raise ValueError("samples must be between 1 and 10 (cost control -- see design doc §5)")
    return time_callable(fn, *args, repeats=samples, **kwargs)


def _git_commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


def main() -> int:
    from backend.app.clients.llm import chat_complete, embed_query, rerank_query
    from backend.app.config.env import settings

    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=int, default=5)
    args = parser.parse_args()

    kwargs = {"api_key": settings.qwen_api_key, "base_url": settings.qwen_base_url}
    sample_text = "Backend engineer with 5 years of Python, FastAPI, and PostgreSQL experience."
    sample_docs = [
        "Senior Python backend engineer, FastAPI, PostgreSQL.",
        "Frontend React developer, no backend experience.",
        "DevOps engineer, Kubernetes and Terraform.",
    ]

    results = {
        "embed_query (1536-dim)": bench_network_call(embed_query, sample_text, samples=args.samples, **kwargs),
        "chat_complete (short prompt)": bench_network_call(
            chat_complete, "Explain in one sentence why this candidate fits a backend role.", samples=args.samples, **kwargs
        ),
        "rerank_query (3 docs)": bench_network_call(rerank_query, sample_text, sample_docs, samples=args.samples, **kwargs),
    }

    lines = ["# Network-call Service Micro-benchmark (production Qwen client)", ""]
    lines.append(f"- Chạy lúc: {datetime.now(timezone.utc).isoformat()}")
    lines.append(f"- Git commit: `{_git_commit()}`")
    lines.append(f"- Số mẫu/hàm: {args.samples} (giới hạn cost-control, xem design doc §5) — số liệu KHÔNG cache, mỗi lần chạy tốn API thật")
    lines.append("")
    lines.append("| Hàm | Mean (ms) | Median (ms) | Stddev (ms) | Max (ms) |")
    lines.append("|---|---|---|---|---|")
    for label, s in results.items():
        lines.append(f"| `{label}` | {s['mean_ms']:.1f} | {s['median_ms']:.1f} | {s['stddev_ms']:.1f} | {s['max_ms']:.1f} |")
    lines.append("")

    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"-> {RESULTS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
