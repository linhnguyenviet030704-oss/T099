"""Run the real Ingest Agent graph (backend/app/agents/ingest/graph.py) on one CV,
capturing the state snapshot after every node plus per-node latency.

Uses graph.astream(..., stream_mode="values") instead of ainvoke() specifically so we can
see `markdown` at each step -- summarize_node overwrites state["markdown"] with the LLM's
rewritten body, so the post-parse/clean markdown (the actual full CV text) would otherwise
be lost by the time extract/embed run on it.
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Any

from backend.app.agents.ingest.graph import build_ingest_graph
from evaluation.ingest_eval.llm_openai import openai_complete, openai_encode

REPO_ROOT = Path(__file__).resolve().parents[2]

NODE_ORDER = ["parse", "clean", "summarize", "extract", "embed"]


def _mime_for(pdf_path: Path) -> str:
    return "application/pdf" if pdf_path.suffix.lower() == ".pdf" else "text/plain"


async def _run_async(pdf_path: Path) -> dict[str, Any]:
    graph = build_ingest_graph(encode=openai_encode, complete=openai_complete, embed=True)
    raw_bytes = pdf_path.read_bytes()
    initial = {"raw_bytes": raw_bytes, "mime_type": _mime_for(pdf_path)}

    snapshots: list[dict] = []
    timings: dict[str, float] = {}
    t_prev = time.perf_counter()
    async for state in graph.astream(initial, stream_mode="values"):
        t_now = time.perf_counter()
        snapshots.append(dict(state))
        if len(snapshots) > 1:
            timings[NODE_ORDER[len(snapshots) - 2]] = round((t_now - t_prev) * 1000, 1)
        t_prev = t_now

    # snapshots[0] = initial input, snapshots[i] = state after node i (1-indexed by NODE_ORDER)
    after_parse = snapshots[1] if len(snapshots) > 1 else {}
    after_clean = snapshots[2] if len(snapshots) > 2 else {}
    after_summarize = snapshots[3] if len(snapshots) > 3 else {}
    after_extract = snapshots[4] if len(snapshots) > 4 else {}
    after_embed = snapshots[5] if len(snapshots) > 5 else {}

    return {
        "raw_parsed_markdown": after_parse.get("markdown", ""),
        "pre_summarize_markdown": after_clean.get("markdown", ""),
        "post_summarize_body": after_summarize.get("markdown", ""),
        "metadata": after_summarize.get("metadata", {}),
        "skills": after_extract.get("skills", []),
        "embedding": after_embed.get("embedding", []),
        "timings_ms": timings,
        "total_ms": round(sum(timings.values()), 1),
    }


def run_ingest_pipeline(pdf_path: Path) -> dict[str, Any]:
    return asyncio.run(_run_async(pdf_path))
