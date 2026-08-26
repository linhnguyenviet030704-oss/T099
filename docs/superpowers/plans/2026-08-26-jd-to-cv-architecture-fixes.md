# JD→CV Architecture Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three confirmed architecture defects in the JD→CV (recruiter matching) branch: dead `router`/`kg_retrieval` graph nodes, a pool-health trace that is computed but discarded before it reaches the DB, and a "lazy ingest" cache that still downloads the full resume file on every request even when nothing changed.

**Architecture:** Three independent tasks, each touching a disjoint set of files (graph wiring / state+persistence+migration / ingest+store+migration). No task depends on another; they can be executed in any order or in parallel.

**Tech Stack:** Python 3.13, FastAPI, LangGraph, Supabase (Postgres + Storage, `supabase-py`/`storage3` client), pytest + pytest-asyncio.

**Spec:** No dedicated spec doc exists for these three fixes — they come directly from an architecture review of `backend/app/agents/matching/graph.py` and `backend/app/services/matching/retrieve.py` performed in this session (verified by tracing every consumer of `intent`/`kg_context`/`pool_size`/`embedding_mismatch_count` across the codebase, and by reading the relevant Supabase migrations). Related prior specs that this plan must stay consistent with: `docs/superpowers/specs/2026-08-19-summarize-bm25-retrieve-design.md` (locks the pool-health trace requirement this plan implements) and `docs/superpowers/specs/2026-08-24-cv-to-jd-recommend-design.md` (defines the `build_recommend_graph` sibling that `build_matching_graph` must stay compatible with, since matching's `rerank`/`explain` nodes are shared).

## Global Constraints

- Never modify `retrieve_for_job`'s existing return payload shape, `score_candidates`, `constraint_status`, or any BM25/skills function signature outside what a task explicitly calls out — those are out of scope for this plan.
- Every task must leave `pytest tests/unit tests/test_agents tests/api tests/test_api -q` fully green before being considered done.
- Every task must leave `ruff check` clean on the files it touches.
- Do not touch the frontend, `ChatResponse`/`RecommendedCandidate` API schemas, or anything under `frontend/` — none of these three fixes require a public API shape change.
- New Supabase migrations follow the existing naming convention: `supabase/migrations/YYYYMMDDHHMMSS_<snake_case_description>.sql`, and use `create or replace function` / `alter table ... add column if not exists` the same way existing migrations in this repo do (see `supabase/migrations/20260817120000_match_resume_trace.sql` for the pattern this repo already uses for `match_resume` trace columns).

---

## Task 1: Remove dead `router`/`kg_retrieval` nodes from the matching graph

**Files:**
- Modify: `backend/app/agents/matching/graph.py`
- Test: `tests/unit/test_matching_graph.py` (existing tests must still pass unmodified — this task adds one new test)

**Interfaces:**
- Consumes: nothing new.
- Produces: `build_matching_graph(...)` compiled graph whose entry point is `"retrieve"` instead of `"router"`. No change to `build_matching_graph`'s own signature or `AgentState`.

**Context:** `router_node` (`backend/app/agents/nodes/router.py`) and `kg_retrieval_node` (`backend/app/agents/nodes/retrieval.py`) run unconditionally before `retrieve` today, writing `intent`, `needs_db_query`, `db_query_params`, `kg_params`, `kg_context` into `AgentState`. Verified by grep across `backend/app/agents/matching/` and `backend/app/services/chat_service.py`: **zero** downstream reads of any of those five keys inside the matching graph or its callers. `respond_node` (matching) ignores `intent` and always returns a candidate-count string regardless. The recommend graph (`build_recommend_graph`) is the one that actually consumes `intent` (for `route_after_kg`) and `kg_context` (in `advice_node`) — that graph is untouched by this task.

- [ ] **Step 1: Write a failing test asserting the dead nodes are gone**

Add to `tests/unit/test_matching_graph.py` (near the other `build_matching_graph` tests):

```python
@pytest.mark.asyncio
async def test_matching_graph_has_no_router_or_kg_retrieval_nodes():
    """router/kg_retrieval write intent+kg_context into AgentState but no
    node in this graph reads either — they were wired for the recommend
    graph and never connected here. This locks in their removal."""
    async def retrieve(_job_id):
        return {"jd_skills": [], "candidates": []}

    graph = build_matching_graph(retrieve=retrieve)
    node_names = set(graph.get_graph().nodes) - {"__start__", "__end__"}
    assert "router" not in node_names
    assert "kg_retrieval" not in node_names
    assert node_names == {"retrieve", "skill", "rrf", "rerank", "explain", "respond"}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `python -m pytest tests/unit/test_matching_graph.py::test_matching_graph_has_no_router_or_kg_retrieval_nodes -v`
Expected: FAIL — `node_names` currently also contains `"router"` and `"kg_retrieval"`.

- [ ] **Step 3: Remove the two nodes and their edges**

In `backend/app/agents/matching/graph.py`, remove these two imports:

```python
from backend.app.agents.nodes.retrieval import kg_retrieval_node
from backend.app.agents.nodes.router import router_node
```

Replace this block:

```python
    graph = StateGraph(AgentState)
    graph.add_node("router", router_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("kg_retrieval", kg_retrieval_node)
    graph.add_node("skill", skill_node)
    graph.add_node("rrf", rrf_node)
    graph.add_node("rerank", make_rerank_node(rerank_fn=rerank_fn))
    graph.add_node(
        "explain",
        make_explain_node(
            complete=explain_complete,
            api_key=explain_api_key,
            base_url=explain_base_url,
            brain=brain,
        ),
    )
    graph.add_node("respond", respond_node)

    graph.set_entry_point("router")
    graph.add_edge("router", "retrieve")
    graph.add_edge("retrieve", "kg_retrieval")
    graph.add_edge("kg_retrieval", "skill")
    graph.add_edge("skill", "rrf")
    graph.add_edge("rrf", "rerank")
    graph.add_edge("rerank", "explain")
    graph.add_edge("explain", "respond")
    graph.add_edge("respond", END)
    return graph.compile()
```

with:

```python
    graph = StateGraph(AgentState)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("skill", skill_node)
    graph.add_node("rrf", rrf_node)
    graph.add_node("rerank", make_rerank_node(rerank_fn=rerank_fn))
    graph.add_node(
        "explain",
        make_explain_node(
            complete=explain_complete,
            api_key=explain_api_key,
            base_url=explain_base_url,
            brain=brain,
        ),
    )
    graph.add_node("respond", respond_node)

    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "skill")
    graph.add_edge("skill", "rrf")
    graph.add_edge("rrf", "rerank")
    graph.add_edge("rerank", "explain")
    graph.add_edge("explain", "respond")
    graph.add_edge("respond", END)
    return graph.compile()
```

- [ ] **Step 4: Run the new test and the full matching graph suite**

Run: `python -m pytest tests/unit/test_matching_graph.py -v`
Expected: all PASS, including the new test.

- [ ] **Step 5: Run the full test suite to confirm no other consumer broke**

Run: `python -m pytest tests/unit tests/test_agents tests/api tests/test_api -q`
Expected: all PASS (this was 343 passed before this task; should still be 343 + 1 new = 344).

- [ ] **Step 6: Lint**

Run: `python -m ruff check backend/app/agents/matching/graph.py tests/unit/test_matching_graph.py`
Expected: `All checks passed!`

- [ ] **Step 7: Commit**

```bash
git add backend/app/agents/matching/graph.py tests/unit/test_matching_graph.py
git commit -m "fix(matching): drop dead router/kg_retrieval nodes from JD->CV graph

Neither node's output (intent, kg_context, db_query_params) is read by
any node in build_matching_graph or by chat_service — they were wired
for build_recommend_graph and copy-pasted here without a consumer."
```

---

## Task 2: Persist pool-health trace (`pool_size`, `embedding_mismatch_count`, etc.) instead of discarding it

**Files:**
- Modify: `backend/app/agents/state.py`
- Modify: `backend/app/agents/matching/graph.py` (the `retrieve_node` closure — safe to combine with Task 1's edit to the same file; if Task 1 already landed, this only touches `retrieve_node`, not the graph wiring)
- Modify: `backend/app/services/matching/retrieve.py` (`persist_match_resume_rows`)
- Modify: `backend/app/dependencies/services.py` (`match_candidates`)
- Add: `supabase/migrations/20260827090000_match_resume_pool_trace.sql`
- Test: `tests/unit/test_matching_rerank.py` (extends `test_persist_match_resume_rows_calls_insert_rpc_once`), `tests/unit/test_matching_graph.py` (new test on `retrieve_node`'s state output)

**Interfaces:**
- Consumes: `retrieve_for_job()`'s existing return dict keys `pool_size: int`, `pool_truncated: bool`, `dropped_count: int`, `pool_latency_warn: bool`, `embedding_mismatch_count: int` — already computed today in `backend/app/services/matching/retrieve.py:331-345`, unchanged by this task.
- Produces: `AgentState` gains 5 new keys (`pool_size`, `pool_truncated`, `dropped_count`, `pool_latency_warn`, `embedding_mismatch_count`) that `persist_match_resume_rows` now requires as keyword args and writes into the `match_resume` row.

**Context:** `retrieve_for_job()` already computes all 5 fields (per the locked spec's "Theo dõi trace: ... pool_*, embedding_mismatch_count"). `retrieve_node` in the matching graph only copies 6 of the ~11 keys from that payload into `AgentState`, silently dropping the 5 trace fields. `AgentState` doesn't even declare them, so there is nowhere for them to flow even if a caller wanted them. `persist_match_resume_rows` → `insert_match_resume_run` RPC → `match_resume` table also has no columns for them. This task closes all three gaps.

- [ ] **Step 1: Add the migration (columns + updated RPC)**

Create `supabase/migrations/20260827090000_match_resume_pool_trace.sql`:

```sql
-- Persist the pool-health trace retrieve_for_job() already computes
-- (pool_size, embedding_mismatch_count, ...) instead of discarding it
-- before it reaches match_resume. See 2026-08-19-summarize-bm25-retrieve-design.md
-- "Theo dõi trace: ... pool_*, embedding_mismatch_count".

alter table public.match_resume
  add column if not exists pool_size integer,
  add column if not exists pool_truncated boolean,
  add column if not exists dropped_count integer,
  add column if not exists pool_latency_warn boolean,
  add column if not exists embedding_mismatch_count integer;

drop function if exists public.insert_match_resume_run(
  uuid, uuid, text, text, text, text, text, text, text, uuid[], jsonb
);

create function public.insert_match_resume_run (
  p_job_post_id uuid,
  p_requested_by uuid,
  p_query_text text,
  p_recruiter_message text,
  p_rerank_mode text,
  p_rerank_status text,
  p_rerank_model text,
  p_rerank_config_version text,
  p_embedding_model text,
  p_matched_resume_ids uuid[],
  p_evidence jsonb,
  p_pool_size integer,
  p_pool_truncated boolean,
  p_dropped_count integer,
  p_pool_latency_warn boolean,
  p_embedding_mismatch_count integer
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  run_id uuid;
  item jsonb;
  idx int := 0;
begin
  insert into public.match_resume (
    job_post_id,
    requested_by,
    query_text,
    recruiter_message,
    rerank_mode,
    rerank_status,
    rerank_model,
    rerank_config_version,
    embedding_model,
    matched_resume_ids,
    pool_size,
    pool_truncated,
    dropped_count,
    pool_latency_warn,
    embedding_mismatch_count
  ) values (
    p_job_post_id,
    p_requested_by,
    p_query_text,
    p_recruiter_message,
    p_rerank_mode,
    p_rerank_status,
    p_rerank_model,
    p_rerank_config_version,
    p_embedding_model,
    coalesce(p_matched_resume_ids, '{}'),
    p_pool_size,
    p_pool_truncated,
    p_dropped_count,
    p_pool_latency_warn,
    p_embedding_mismatch_count
  )
  returning id into run_id;

  for item in
    select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb))
  loop
    idx := idx + 1;
    insert into public.match_evidence (
      match_resume_id,
      resume_id,
      job_post_id,
      rank,
      rrf_rank,
      rrf_score,
      rerank_score,
      skill_score,
      semantic_score,
      matched_skill_names,
      related_skill_names,
      raw_factors
    ) values (
      run_id,
      (item->>'resume_id')::uuid,
      p_job_post_id,
      coalesce((item->>'rank')::int, idx),
      (item->>'rrf_rank')::int,
      (item->>'rrf_score')::numeric,
      case
        when item->'rerank_score' is null or item->'rerank_score' = 'null'::jsonb then null
        else (item->>'rerank_score')::numeric
      end,
      (item->>'skill_score')::numeric,
      (item->>'semantic_score')::numeric,
      coalesce(
        array(select jsonb_array_elements_text(coalesce(item->'matched_skill_names', '[]'::jsonb))),
        '{}'
      ),
      coalesce(
        array(select jsonb_array_elements_text(coalesce(item->'related_skill_names', '[]'::jsonb))),
        '{}'
      ),
      coalesce(item->'raw_factors', '{}'::jsonb)
    );
  end loop;

  return run_id;
end;
$$;

revoke all on function public.insert_match_resume_run(
  uuid, uuid, text, text, text, text, text, text, text, uuid[], jsonb,
  integer, boolean, integer, boolean, integer
) from public, anon, authenticated;
grant execute on function public.insert_match_resume_run(
  uuid, uuid, text, text, text, text, text, text, text, uuid[], jsonb,
  integer, boolean, integer, boolean, integer
) to service_role;
```

- [ ] **Step 2: Add the 5 fields to `AgentState`**

In `backend/app/agents/state.py`, inside the `AgentState` class, after the `pool_latency_warn`-adjacent block doesn't exist yet — add these lines after `constraints_confirmed: bool`:

```python
    pool_size: int
    pool_truncated: bool
    dropped_count: int
    pool_latency_warn: bool
    embedding_mismatch_count: int
```

- [ ] **Step 3: Write the failing test for `retrieve_node`'s state output**

Add to `tests/unit/test_matching_graph.py`:

```python
@pytest.mark.asyncio
async def test_matching_graph_retrieve_node_forwards_pool_trace():
    async def retrieve(_job_id):
        return {
            "jd_skills": [],
            "candidates": [],
            "pool_size": 42,
            "pool_truncated": False,
            "dropped_count": 0,
            "pool_latency_warn": True,
            "embedding_mismatch_count": 3,
        }

    graph = build_matching_graph(retrieve=retrieve)
    result = await graph.ainvoke({"job_id": str(uuid4())})
    assert result["pool_size"] == 42
    assert result["pool_latency_warn"] is True
    assert result["embedding_mismatch_count"] == 3


@pytest.mark.asyncio
async def test_matching_graph_retrieve_node_pool_trace_defaults_when_absent():
    async def retrieve(_job_id):
        return {"jd_skills": [], "candidates": []}

    graph = build_matching_graph(retrieve=retrieve)
    result = await graph.ainvoke({"job_id": str(uuid4())})
    assert result["pool_size"] == 0
    assert result["pool_truncated"] is False
    assert result["dropped_count"] == 0
    assert result["pool_latency_warn"] is False
    assert result["embedding_mismatch_count"] == 0
```

- [ ] **Step 4: Run to verify both fail**

Run: `python -m pytest tests/unit/test_matching_graph.py -k pool_trace -v`
Expected: FAIL with `KeyError: 'pool_size'` (not in `result`).

- [ ] **Step 5: Make `retrieve_node` forward the 5 fields**

In `backend/app/agents/matching/graph.py`, replace the `retrieve_node` body's `return` statement:

```python
    async def retrieve_node(state: AgentState) -> dict:
        job_id = UUID(str(state["job_id"]))
        payload = await retrieve(job_id)
        return {
            "jd_skills": payload.get("jd_skills") or [],
            "jd_query": payload.get("jd_query") or "",
            "job_description": payload.get("job_description") or "",
            "candidates": payload.get("candidates") or [],
            "skill_constraints": payload.get("skill_constraints") or {},
            "constraints_confirmed": bool(payload.get("constraints_confirmed")),
            "pool_size": int(payload.get("pool_size") or 0),
            "pool_truncated": bool(payload.get("pool_truncated") or False),
            "dropped_count": int(payload.get("dropped_count") or 0),
            "pool_latency_warn": bool(payload.get("pool_latency_warn") or False),
            "embedding_mismatch_count": int(payload.get("embedding_mismatch_count") or 0),
        }
```

- [ ] **Step 6: Run to verify both new tests pass**

Run: `python -m pytest tests/unit/test_matching_graph.py -k pool_trace -v`
Expected: both PASS.

- [ ] **Step 7: Write the failing test for `persist_match_resume_rows`**

In `tests/unit/test_matching_rerank.py`, extend `test_persist_match_resume_rows_calls_insert_rpc_once` — add these 5 kwargs to the existing `persist_match_resume_rows(...)` call:

```python
        rerank_status="success",
        pool_size=7,
        pool_truncated=False,
        dropped_count=0,
        pool_latency_warn=False,
        embedding_mismatch_count=1,
    )
    assert len(client.calls) == 1
    assert client.calls[0]["name"] == "insert_match_resume_run"
    params = client.calls[0]["params"]
    assert params["p_job_post_id"] == str(job_id)
    assert params["p_pool_size"] == 7
    assert params["p_embedding_mismatch_count"] == 1
```

(This replaces the trailing `rerank_status="success",\n    )\n    assert len(client.calls) == 1\n    assert client.calls[0]["name"] == "insert_match_resume_run"\n    params = client.calls[0]["params"]\n    assert params["p_job_post_id"] == str(job_id)` block already at the end of the existing test.)

- [ ] **Step 8: Run to verify it fails**

Run: `python -m pytest tests/unit/test_matching_rerank.py::test_persist_match_resume_rows_calls_insert_rpc_once -v`
Expected: FAIL with `TypeError: persist_match_resume_rows() got an unexpected keyword argument 'pool_size'`.

- [ ] **Step 9: Update `persist_match_resume_rows`'s signature and RPC call**

In `backend/app/services/matching/retrieve.py`, change:

```python
async def persist_match_resume_rows(
    client: Client,
    job_id: UUID,
    ranked: list[dict[str, Any]],
    *,
    actor_id: UUID,
    query_text: str,
    recruiter_message: str,
    rerank_mode: str,
    rerank_status: str,
) -> None:
```

to:

```python
async def persist_match_resume_rows(
    client: Client,
    job_id: UUID,
    ranked: list[dict[str, Any]],
    *,
    actor_id: UUID,
    query_text: str,
    recruiter_message: str,
    rerank_mode: str,
    rerank_status: str,
    pool_size: int = 0,
    pool_truncated: bool = False,
    dropped_count: int = 0,
    pool_latency_warn: bool = False,
    embedding_mismatch_count: int = 0,
) -> None:
```

(Defaults keep this backward-compatible for any other test/call site that doesn't pass them — Step 10 updates the real production call site to always pass real values.)

Then add the 5 new keys to the `_insert_run`'s RPC params dict:

```python
    def _insert_run() -> None:
        client.rpc(
            "insert_match_resume_run",
            {
                "p_job_post_id": str(job_id),
                "p_requested_by": str(actor_id),
                "p_query_text": query_text,
                "p_recruiter_message": recruiter_message,
                "p_rerank_mode": rerank_mode,
                "p_rerank_status": rerank_status,
                "p_rerank_model": DEFAULT_RERANK_MODEL if rerank_mode == "qwen" else None,
                "p_rerank_config_version": RERANK_CONFIG_VERSION,
                "p_embedding_model": DEFAULT_EMBED_MODEL,
                "p_matched_resume_ids": resume_ids,
                "p_evidence": evidence,
                "p_pool_size": pool_size,
                "p_pool_truncated": pool_truncated,
                "p_dropped_count": dropped_count,
                "p_pool_latency_warn": pool_latency_warn,
                "p_embedding_mismatch_count": embedding_mismatch_count,
            },
        ).execute()
```

- [ ] **Step 10: Run to verify Step 7's test passes**

Run: `python -m pytest tests/unit/test_matching_rerank.py::test_persist_match_resume_rows_calls_insert_rpc_once -v`
Expected: PASS.

- [ ] **Step 11: Pass the real values from `match_candidates`**

In `backend/app/dependencies/services.py`, inside `match_candidates`, change the `persist_match_resume_rows(...)` call from:

```python
            await persist_match_resume_rows(
                client,
                job_id,
                ranked,
                actor_id=actor_id,
                query_text=str(result.get("jd_query") or ""),
                recruiter_message=message,
                rerank_mode=rerank,
                rerank_status=status,
            )
```

to:

```python
            await persist_match_resume_rows(
                client,
                job_id,
                ranked,
                actor_id=actor_id,
                query_text=str(result.get("jd_query") or ""),
                recruiter_message=message,
                rerank_mode=rerank,
                rerank_status=status,
                pool_size=int(result.get("pool_size") or 0),
                pool_truncated=bool(result.get("pool_truncated") or False),
                dropped_count=int(result.get("dropped_count") or 0),
                pool_latency_warn=bool(result.get("pool_latency_warn") or False),
                embedding_mismatch_count=int(result.get("embedding_mismatch_count") or 0),
            )
```

- [ ] **Step 12: Run the full test suite**

Run: `python -m pytest tests/unit tests/test_agents tests/api tests/test_api -q`
Expected: all PASS.

- [ ] **Step 13: Lint**

Run: `python -m ruff check backend/app/agents/state.py backend/app/agents/matching/graph.py backend/app/services/matching/retrieve.py backend/app/dependencies/services.py tests/unit/test_matching_graph.py tests/unit/test_matching_rerank.py`
Expected: `All checks passed!`

- [ ] **Step 14: Commit**

```bash
git add supabase/migrations/20260827090000_match_resume_pool_trace.sql backend/app/agents/state.py backend/app/agents/matching/graph.py backend/app/services/matching/retrieve.py backend/app/dependencies/services.py tests/unit/test_matching_graph.py tests/unit/test_matching_rerank.py
git commit -m "feat(matching): persist pool_size/embedding_mismatch_count trace

retrieve_for_job() already computed these per the locked spec's
'Theo dõi trace' requirement, but retrieve_node dropped them before
they reached AgentState, and match_resume had no columns for them —
so a degraded pool (large N, many unembeddable resumes) was invisible."
```

---

## Task 3: Lazy ingest — skip the file download when the storage object hasn't changed

**Files:**
- Modify: `backend/app/services/matching/store.py`
- Modify: `backend/app/services/matching/ingest.py`
- Add: `supabase/migrations/20260827091500_embedded_resumes_storage_updated_at.sql`
- Test: `tests/unit/test_matching_ingest.py`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `ResumeStore` Protocol gains `get_storage_updated_at(bucket_id, storage_path) -> str | None` and `touch_storage_updated_at(resume_id, storage_updated_at) -> None`; `save()` gains a `storage_updated_at: str | None` parameter. `ingest_resume()`'s external behavior (return values `"exists"`/`"indexed"`, `NotFoundError` on missing resume) is unchanged — only its I/O cost on the "nothing changed" path drops.

**Context:** `ingest_resume()` always downloads the full resume file and SHA-256-hashes it before it can compare against the stored `content_hash` — the download is what the hash-based "skip if unchanged" cache was supposed to avoid, but it can't skip its own prerequisite. This task adds a cheaper freshness signal — the storage object's `updated_at` timestamp, available from Supabase Storage's `list()` API without downloading the object body — as a fast pre-check. **Safety property this task must preserve:** the fast path may only return `"exists"` when it has positively confirmed the timestamp is unchanged; any missing/failed/ambiguous metadata must fall through to the existing full download+hash path unchanged, never assume freshness. This keeps correctness identical to today in every case except the one it's optimizing (repeated requests against an unchanged file).

- [ ] **Step 1: Add the migration**

Create `supabase/migrations/20260827091500_embedded_resumes_storage_updated_at.sql`:

```sql
-- Lets try_ingest_resume() skip downloading+hashing the resume file when
-- the storage object's own updated_at timestamp proves it hasn't changed
-- since the last successful ingest, instead of always downloading first
-- to compute content_hash. Nullable: existing rows fall through to the
-- old (correct, just slower) download+hash path until their next ingest.
alter table public.embedded_resumes
  add column if not exists storage_updated_at timestamptz;
```

- [ ] **Step 2: Write the failing test for the fast path**

In `tests/unit/test_matching_ingest.py`, extend `_FakeStore` to track the new calls and support the new methods:

```python
class _FakeStore:
    def __init__(self, *, resume, blob: bytes, existing=None, storage_updated_at="2026-08-26T00:00:00Z") -> None:
        self.resume = resume
        self.blob = blob
        self.existing = existing
        self.storage_updated_at = storage_updated_at
        self.saved = None
        self.touched = None
        self.downloads = 0
        self.storage_meta_calls = 0

    async def get_parsed(self, resume_id):
        return self.existing

    async def get_resume(self, resume_id):
        return self.resume

    async def get_storage_updated_at(self, bucket_id, storage_path):
        self.storage_meta_calls += 1
        return self.storage_updated_at

    async def touch_storage_updated_at(self, resume_id, storage_updated_at):
        self.touched = {"resume_id": resume_id, "storage_updated_at": storage_updated_at}

    async def download(self, bucket_id, storage_path):
        self.downloads += 1
        return self.blob

    async def save(self, resume_id, parsed, content_hash, embedding, storage_updated_at):
        self.saved = {
            "resume_id": resume_id,
            "parsed": parsed,
            "content_hash": content_hash,
            "embedding": embedding,
            "storage_updated_at": storage_updated_at,
        }
```

Then add a new test:

```python
@pytest.mark.asyncio
async def test_ingest_skips_download_when_storage_timestamp_unchanged():
    resume_id = uuid4()
    blob = b"same cv"
    digest = sha256(blob).hexdigest()
    store = _FakeStore(
        resume={
            "id": str(resume_id),
            "bucket_id": "resumes",
            "storage_path": "u/cv.txt",
            "mime_type": "text/plain",
        },
        blob=blob,
        existing={
            "content_hash": digest,
            "storage_updated_at": "2026-08-26T00:00:00Z",
            "metadata": {
                "taxonomy_version": taxonomy_version(),
                "summary_prompt_version": SUMMARIZE_PROMPT_VERSION,
            },
        },
        storage_updated_at="2026-08-26T00:00:00Z",
    )
    status = await ingest_resume(store, resume_id, encode=_encode, complete=_complete)
    assert status == "exists"
    assert store.saved is None
    assert store.downloads == 0
    assert store.storage_meta_calls == 1


@pytest.mark.asyncio
async def test_ingest_falls_back_to_download_when_storage_timestamp_changed():
    resume_id = uuid4()
    blob = b"same cv"
    digest = sha256(blob).hexdigest()
    store = _FakeStore(
        resume={
            "id": str(resume_id),
            "bucket_id": "resumes",
            "storage_path": "u/cv.txt",
            "mime_type": "text/plain",
        },
        blob=blob,
        existing={
            "content_hash": digest,
            "storage_updated_at": "2026-08-01T00:00:00Z",
            "metadata": {
                "taxonomy_version": taxonomy_version(),
                "summary_prompt_version": SUMMARIZE_PROMPT_VERSION,
            },
        },
        storage_updated_at="2026-08-26T00:00:00Z",
    )
    status = await ingest_resume(store, resume_id, encode=_encode, complete=_complete)
    assert status == "exists"  # bytes are still the same, just detected the slow way
    assert store.downloads == 1
    assert store.touched == {"resume_id": resume_id, "storage_updated_at": "2026-08-26T00:00:00Z"}


@pytest.mark.asyncio
async def test_ingest_falls_back_to_download_when_storage_metadata_unavailable():
    resume_id = uuid4()
    blob = b"same cv"
    digest = sha256(blob).hexdigest()

    class _NoMeta(_FakeStore):
        async def get_storage_updated_at(self, bucket_id, storage_path):
            self.storage_meta_calls += 1
            return None

    store = _NoMeta(
        resume={
            "id": str(resume_id),
            "bucket_id": "resumes",
            "storage_path": "u/cv.txt",
            "mime_type": "text/plain",
        },
        blob=blob,
        existing={
            "content_hash": digest,
            "storage_updated_at": "2026-08-26T00:00:00Z",
            "metadata": {
                "taxonomy_version": taxonomy_version(),
                "summary_prompt_version": SUMMARIZE_PROMPT_VERSION,
            },
        },
    )
    status = await ingest_resume(store, resume_id, encode=_encode, complete=_complete)
    assert status == "exists"
    assert store.downloads == 1  # missing metadata must never skip the correctness-critical hash check
```

Update the two existing tests that call `save()`/construct `_FakeStore` to match the new `save()` signature and default `storage_updated_at` — `test_ingest_parses_and_saves_first_time` and `test_ingest_reindexes_when_file_changed` don't set `existing`, so `get_storage_updated_at` won't be consulted for the fast path (no `existing` means the fast-path `if` is skipped entirely — see Step 4), but they do call `save()`, so update their assertions to also check `store.saved["storage_updated_at"]`:

```python
    assert store.saved["storage_updated_at"] == "2026-08-26T00:00:00Z"
```

(add this line to both `test_ingest_parses_and_saves_first_time` and `test_ingest_reindexes_when_file_changed`, right after their existing `content_hash` assertion).

`test_ingest_skips_when_hash_matches` currently sets `existing={"content_hash": digest, "metadata": {...}}` with no `storage_updated_at` key — leave it as is; `existing.get("storage_updated_at")` will be `None`, so Step 4's fast-path condition (`if existing and versions_current and existing.get("storage_updated_at")`) is falsy and it falls through to the download path, same as today. Its `assert store.downloads == 1` assertion stays correct.

- [ ] **Step 3: Run to verify the new tests fail**

Run: `python -m pytest tests/unit/test_matching_ingest.py -v`
Expected: `test_ingest_skips_download_when_storage_timestamp_unchanged` FAILs (still downloads); the other two new tests fail with `AttributeError`/`TypeError` since `get_storage_updated_at`/`touch_storage_updated_at` don't exist on the real `ingest_resume` code path yet and `save()` doesn't accept a 5th positional arg.

- [ ] **Step 4: Implement the fast path in `ingest_resume()`**

In `backend/app/services/matching/ingest.py`, update the `ResumeStore` Protocol:

```python
class ResumeStore(Protocol):
    async def get_parsed(self, resume_id: UUID) -> dict[str, Any] | None: ...

    async def get_resume(self, resume_id: UUID) -> dict[str, Any] | None: ...

    async def get_storage_updated_at(self, bucket_id: str, storage_path: str) -> str | None: ...

    async def touch_storage_updated_at(self, resume_id: UUID, storage_updated_at: str) -> None: ...

    async def download(self, bucket_id: str, storage_path: str) -> bytes: ...

    async def save(
        self,
        resume_id: UUID,
        parsed: dict[str, Any],
        content_hash: str,
        embedding: list[float],
        storage_updated_at: str | None,
    ) -> None: ...
```

Replace `ingest_resume`'s body:

```python
async def ingest_resume(
    store: ResumeStore,
    resume_id: UUID,
    *,
    encode=None,
    complete=None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> str:
    resume = await store.get_resume(resume_id)
    if not resume:
        raise NotFoundError("Resume not found", code="RESUME_NOT_FOUND")
    bucket_id = resume.get("bucket_id") or "resumes"
    storage_path = resume["storage_path"]

    existing = await store.get_parsed(resume_id)
    meta = (existing or {}).get("metadata") or {}
    versions_current = (
        meta.get("taxonomy_version") == taxonomy_version()
        and meta.get("summary_prompt_version") == SUMMARIZE_PROMPT_VERSION
    )

    # Fast path: the storage object's own updated_at proves it hasn't
    # changed since we last hashed it, so skip the download+hash entirely.
    # Never trust a missing/failed metadata lookup as "unchanged" — only a
    # positive, matching timestamp short-circuits here.
    if existing and versions_current and existing.get("storage_updated_at"):
        current_updated_at = await store.get_storage_updated_at(bucket_id, storage_path)
        if current_updated_at is not None and current_updated_at == existing["storage_updated_at"]:
            return "exists"

    blob = await store.download(bucket_id, storage_path)
    digest = hashlib.sha256(blob).hexdigest()
    storage_updated_at = await store.get_storage_updated_at(bucket_id, storage_path)
    if existing and existing.get("content_hash") == digest and versions_current:
        if storage_updated_at is not None and storage_updated_at != existing.get("storage_updated_at"):
            await store.touch_storage_updated_at(resume_id, storage_updated_at)
        return "exists"

    graph = build_ingest_graph(encode=encode, complete=complete, api_key=api_key, base_url=base_url)
    rid = request_id_ctx.get() or "-"
    result = await graph.ainvoke(
        {
            "raw_bytes": blob,
            "mime_type": resume.get("mime_type") or "",
        },
        config={
            "run_name": "ingest_resume_pipeline",
            "tags": ["ingest", "resume"],
            "metadata": {
                "request_id": rid,
                "resume_id": str(resume_id),
            },
        },
    )
    parsed = {
        "markdown": result.get("markdown") or "",
        "clean_markdown": result.get("clean_markdown") or "",
        "metadata": result.get("metadata") or {},
    }
    await store.save(resume_id, parsed, digest, list(result.get("embedding") or []), storage_updated_at)
    return "indexed"
```

- [ ] **Step 5: Update `SupabaseResumeStore` to implement the two new methods and the new `save()` param**

In `backend/app/services/matching/store.py`:

Update `get_parsed`'s select to include the new column:

```python
    async def get_parsed(self, resume_id: UUID) -> dict[str, Any] | None:
        def _query() -> dict[str, Any] | None:
            result = (
                self._client.table("embedded_resumes")
                .select("resume_id, markdown, metadata, content_hash, storage_updated_at")
                .eq("resume_id", str(resume_id))
                .maybe_single()
                .execute()
            )
            return result.data if result else None

        return await asyncio.to_thread(_query)
```

Add the two new methods (place after `get_resume`, before `download`):

```python
    async def get_storage_updated_at(self, bucket_id: str, storage_path: str) -> str | None:
        def _query() -> str | None:
            parts = storage_path.rsplit("/", 1)
            folder, filename = (parts[0], parts[1]) if len(parts) == 2 else ("", parts[0])
            try:
                entries = self._client.storage.from_(bucket_id).list(folder, {"search": filename})
            except Exception:
                return None
            for entry in entries or []:
                if entry.get("name") == filename:
                    updated_at = entry.get("updated_at")
                    return str(updated_at) if updated_at else None
            return None

        return await asyncio.to_thread(_query)

    async def touch_storage_updated_at(self, resume_id: UUID, storage_updated_at: str) -> None:
        rid = str(resume_id)

        def _query() -> None:
            self._client.table("embedded_resumes").update(
                {"storage_updated_at": storage_updated_at}
            ).eq("resume_id", rid).execute()

        await asyncio.to_thread(_query)
```

Update `save()`:

```python
    async def save(
        self,
        resume_id: UUID,
        parsed: dict[str, Any],
        content_hash: str,
        embedding: list[float],
        storage_updated_at: str | None,
    ) -> None:
        rid = str(resume_id)

        def _query() -> None:
            self._client.table("embedded_resumes").upsert(
                {
                    "resume_id": rid,
                    "markdown": parsed["markdown"],
                    "clean_markdown": parsed.get("clean_markdown") or "",
                    "metadata": parsed["metadata"],
                    "content_hash": content_hash,
                    "embedding": embedding,
                    "model": DEFAULT_EMBEDDING_MODEL,
                    "storage_updated_at": storage_updated_at,
                }
            ).execute()

        await asyncio.to_thread(_query)
```

- [ ] **Step 6: Run the ingest test file**

Run: `python -m pytest tests/unit/test_matching_ingest.py -v`
Expected: all PASS, including the 3 new tests.

- [ ] **Step 7: Run the full test suite**

Run: `python -m pytest tests/unit tests/test_agents tests/api tests/test_api -q`
Expected: all PASS. `try_ingest_resume` wraps `ingest_resume` in a retry loop and is exercised elsewhere (e.g. `retrieve_for_job`'s bounded ingest fan-out in `tests/unit/test_matching_retrieve.py`) with its own fakes — check those fakes/mocks for `ResumeStore` also implement `get_storage_updated_at`/`touch_storage_updated_at`/the new `save()` signature; if any fail with `TypeError`/`AttributeError`, add the same two methods (return `None` / no-op) and the new `save()` param to that fake, mirroring `_FakeStore` above.

- [ ] **Step 8: Lint**

Run: `python -m ruff check backend/app/services/matching/ingest.py backend/app/services/matching/store.py tests/unit/test_matching_ingest.py`
Expected: `All checks passed!`

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260827091500_embedded_resumes_storage_updated_at.sql backend/app/services/matching/ingest.py backend/app/services/matching/store.py tests/unit/test_matching_ingest.py
git commit -m "perf(matching): skip resume re-download when storage object is unchanged

ingest_resume() always downloaded+hashed the full file before it could
tell whether re-ingest was needed, so the content-hash cache never
actually saved the expensive I/O on the common unchanged-file case.
Uses the storage object's own updated_at (from Supabase Storage list(),
no download needed) as a fast pre-check; any missing/mismatched
metadata falls through to the old download+hash path unchanged."
```

- [ ] **Step 10: Manual verification note (not automatable from this environment)**

Before this ships to production, confirm against a real Supabase project that `storage.from_(bucket).list(folder, {"search": filename})` returns entries shaped with a top-level `updated_at` string field (this is Supabase's documented Storage `list` response shape, but this environment has no live Supabase credentials to hit it directly). If the field is absent or named differently in the deployed Supabase version, `get_storage_updated_at` already fails closed (returns `None` on any exception or missing field), so the worst case is simply "fast path never activates, behavior identical to before this task" — not a correctness risk, just a missed optimization until confirmed.

---

## Self-review

- **Task 1** removes exactly the two nodes confirmed (by exhaustive grep) to have no consumer in the matching graph; does not touch the recommend graph, which genuinely uses both.
- **Task 2** closes the gap at all three layers where the trace was being dropped (`AgentState` → `retrieve_node` → `persist_match_resume_rows` → RPC → table), matching the locked spec's "Theo dõi trace: ... pool_*, embedding_mismatch_count" line exactly.
- **Task 3** preserves `content_hash` as the correctness source of truth in every branch; the new timestamp check is strictly additive (a fast accept, never a fast reject) — every failure mode (missing entry, exception, mismatched timestamp) falls through to today's exact behavior.
- No task modifies `score_candidates`, `constraint_status`, BM25/skills functions, or any file touched by the BM25 correctness/performance fixes from earlier in this session.
- All three tasks are independently testable and independently revertable (disjoint file sets except Task 1 and Task 2 both touch `graph.py`, in non-overlapping regions — the node-wiring block vs. the `retrieve_node` closure body).
