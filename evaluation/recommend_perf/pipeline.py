"""Run the real Recommend Agent graph (backend/app/agents/recommend/graph.py),
capturing per-node latency via stream_mode="updates".

recommend_graph branches after kg_retrieval: SKILL_GAP_ADVICE/CHITCHAT intents route to
advice -> END (score/rerank/explain never run); everything else routes to
score -> rerank -> explain -> respond. Which nodes appear in timings_ms therefore depends
on the query passed to run_recommend_pipeline -- callers must read timings_ms's own keys,
never assume a fixed node list (see evaluation/matching_perf/pipeline.py's docstring for
why "updates" mode was chosen over ingest's fixed-index "values" approach).
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from backend.app.agents.recommend.graph import build_recommend_graph


async def _run_async(
    *,
    retrieve,
    query: str,
    explain_complete=None,
    rerank_fn=None,
) -> dict[str, Any]:
    graph = build_recommend_graph(retrieve=retrieve, rerank_fn=rerank_fn, explain_complete=explain_complete)

    timings: dict[str, float] = {}
    initial_state = {"query": query, "rerank_mode": "agent"}
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


def run_recommend_pipeline(
    *,
    retrieve,
    query: str,
    explain_complete=None,
    rerank_fn=None,
) -> dict[str, Any]:
    return asyncio.run(
        _run_async(retrieve=retrieve, query=query, explain_complete=explain_complete, rerank_fn=rerank_fn)
    )
