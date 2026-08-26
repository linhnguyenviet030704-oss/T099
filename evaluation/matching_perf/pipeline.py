# evaluation/matching_perf/pipeline.py
"""Run the real Matching Agent graph (backend/app/agents/matching/graph.py),
capturing per-node latency.

Uses graph.astream(..., stream_mode="updates") -- which yields {node_name: state_delta}
per step -- instead of evaluation/ingest_eval_v2/pipeline.py's "values" + fixed-index
approach. matching_graph is linear today so fixed indices would work, but
evaluation/recommend_perf/pipeline.py (Task 2) runs the sibling recommend_graph, which
branches conditionally after kg_retrieval -- fixed indices would silently mis-attribute
timings there. "updates" mode is used here too so both packages share one mental model.

This module takes retrieve/explain_complete as plain dependency-injected callables (the
same seams backend/app/dependencies/services.py uses in production) and knows nothing
about the golden dataset -- see fixtures.py for the golden-data-backed fixture builder.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from backend.app.agents.matching.graph import build_matching_graph


async def _run_async(
    *,
    retrieve,
    initial_state: dict[str, Any],
    explain_complete=None,
    rerank_fn=None,
) -> dict[str, Any]:
    graph = build_matching_graph(retrieve=retrieve, rerank_fn=rerank_fn, explain_complete=explain_complete)

    timings: dict[str, float] = {}
    final_state: dict[str, Any] = dict(initial_state)
    t_prev = time.perf_counter()
    async for update in graph.astream(initial_state, stream_mode="updates"):
        t_now = time.perf_counter()
        ((node_name, delta),) = update.items()
        timings[node_name] = round((t_now - t_prev) * 1000, 1)
        final_state.update(delta)
        t_prev = t_now

    return {
        "timings_ms": timings,
        "total_ms": round(sum(timings.values()), 1),
        "final_state": final_state,
    }


def run_matching_pipeline(
    *,
    retrieve,
    initial_state: dict[str, Any],
    explain_complete=None,
    rerank_fn=None,
) -> dict[str, Any]:
    return asyncio.run(
        _run_async(
            retrieve=retrieve,
            initial_state=initial_state,
            explain_complete=explain_complete,
            rerank_fn=rerank_fn,
        )
    )
