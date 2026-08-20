# Candidate Suggest Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recruiter gợi ý ứng viên: ingest CV (parse→clean→summary→embed, PII stripped) khi lưu/nộp; retrieve+RRF rồi rerank (`qwen3-rerank` hoặc agent mock); atomic trace; history replay trên `/match_candidates`.

**Architecture:** Extend existing LangGraphs. Ingest graph unchanged. Matching becomes `retrieve → skill → rrf → rerank → respond`. Trace writes through one Postgres RPC. History reads `match_resume` + `get_match_run`. Frontend awaits ingest but treats save/apply success separately from index failure.

**Tech Stack:** FastAPI, LangGraph, DashScope compatible-api rerank, Supabase pgvector, pytest, React + Vite.

**Spec:** `docs/superpowers/specs/2026-08-17-candidate-suggest-flow-design.md`

## Global Constraints

- No new tokenizer dependency. Truncate rerank docs with `RERANK_DOC_MAX_CHARS = 2000`.
- Never mix RRF and rerank into one `score` on candidates.
- `RecommendedJob.score` stays (job mock path).
- Default API `rerank=qwen`. Graph tests that do not inject a rerank HTTP stub must pass `rerank_mode="agent"`.
- Qwen rerank errors → `rerank_status="fallback"`, `rerank_score=None`, keep RRF order. Chat still 200.
- Trace persist errors → log, chat still 200, no partial run.
- Ingest graph / PII / content_hash skip unchanged.
- Candidate `/match_job` stays `mock_recommend`.
- Tests must not call live DashScope (inject `post` / `rerank_fn`).
- Pytest: `pytest tests/unit/<file>.py::<test> -v` from repo root.
- Do not add FastAPI history routes. No ingest queue.

## Files

- Create: `backend/app/services/matching/rerank.py`
- Create: `backend/app/agents/matching/nodes/rerank.py`
- Create: `supabase/migrations/20260817120000_match_resume_trace.sql`
- Create: `tests/unit/test_matching_rerank.py`
- Create: `frontend/src/lib/ingest.ts`
- Modify: `backend/app/config/models.py`
- Modify: `backend/app/clients/llm.py`
- Modify: `backend/app/services/matching/rrf.py`
- Modify: `backend/app/services/matching/retrieve.py`
- Modify: `backend/app/agents/state.py`
- Modify: `backend/app/agents/matching/graph.py`
- Modify: `backend/app/agents/matching/nodes/__init__.py`
- Modify: `backend/app/api/schemas/chat.py`
- Modify: `backend/app/services/chat_service.py`
- Modify: `backend/app/services/recommend.py`
- Modify: `backend/app/dependencies/services.py`
- Modify: `frontend/src/pages/ResumesPage.tsx`
- Modify: `frontend/src/pages/JobDetailPage.tsx`
- Modify: `frontend/src/components/cv/CvBuilderContainer.tsx`
- Modify: `frontend/src/pages/MatchCandidatesPage.tsx`
- Test: `tests/unit/test_matching_llm.py`, `test_matching_retrieve.py`, `test_matching_graph.py`, `test_chat_service.py`, `test_recommend.py`, `tests/api/test_profiles.py`

---

### Task 1: Candidate score schema (no mixed `score`)

**Files:**
- Modify: `backend/app/api/schemas/chat.py`
- Modify: `backend/app/services/recommend.py`
- Modify: `backend/app/services/chat_service.py`
- Test: `tests/unit/test_recommend.py`, `tests/unit/test_chat_service.py`, `tests/api/test_profiles.py`

**Interfaces:**
- Consumes: existing `RecommendedCandidate` fields except `score`
- Produces: `ChatRequest.rerank: Literal["qwen","agent"] = "qwen"`; `RecommendedCandidate.rrf_score: float`; `rerank_score: float | None = None`; `rerank_status: Literal["success","fallback","not_requested"]`; `chat_response_from_graph` reads those keys (not `score`)

- [ ] **Step 1: Write the failing tests**

In `tests/unit/test_recommend.py` replace `c.score` assertions:

```python
assert [c.rrf_score for c in candidates] == [MOCK_SCORES[0], MOCK_SCORES[1]]
assert candidates[0].rerank_score is None
assert candidates[0].rerank_status == "not_requested"
```

In `tests/unit/test_chat_service.py` add:

```python
def test_chat_request_rerank_defaults_to_qwen():
    req = ChatRequest(message="hello")
    assert req.rerank == "qwen"

def test_chat_request_rejects_unknown_rerank():
    with pytest.raises(ValidationError):
        ChatRequest(message="hello", rerank="cohere")
```

(`from pydantic import ValidationError`)

Change `RecommendedCandidate(..., score=0.81)` in `test_chat_job_id_uses_matching_runner_not_mock` to `rrf_score=0.81, rerank_score=None, rerank_status="not_requested"` and assert `result.candidates[0].rrf_score == 0.81` and `result.candidates[0].rerank_score is None`.

In `tests/api/test_profiles.py` `test_chat_returns_mock_candidates`: replace `body["candidates"][0]["score"]` with `rrf_score == 0.95` and `rerank_status == "not_requested"`. Leave `jobs[0]["score"]` as-is.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_recommend.py::test_mock_recommend_candidates_scores_and_profile tests/unit/test_chat_service.py::test_chat_request_rerank_defaults_to_qwen tests/api/test_profiles.py::test_chat_returns_mock_candidates -v`

Expected: FAIL (`score` still exists / `rerank` missing)

- [ ] **Step 3: Minimal implementation**

`backend/app/api/schemas/chat.py`:

```python
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    job_id: UUID | None = None
    rerank: Literal["qwen", "agent"] = "qwen"


class RecommendedJob(BaseModel):
    id: UUID
    title: str
    company_name: str | None = None
    location: str | None = None
    employment_type: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    currency: str = "VND"
    score: float


class RecommendedCandidate(BaseModel):
    application_id: UUID
    applicant_user_id: UUID
    full_name: str | None = None
    email: str | None = None
    resume_title: str | None = None
    resume_storage_path: str | None = None
    current_status: str
    rrf_score: float
    rerank_score: float | None = None
    rerank_status: Literal["success", "fallback", "not_requested"] = "not_requested"


class ChatResponse(BaseModel):
    response: str
    analysis: str = ""
    jobs: list[RecommendedJob] = Field(default_factory=list)
    candidates: list[RecommendedCandidate] = Field(default_factory=list)
```

`mock_recommend_candidates`: `rrf_score=MOCK_SCORES[index]`, `rerank_score=None`, `rerank_status="not_requested"`. Do not pass `score`.

`chat_response_from_graph`:

```python
rerank_status = str(row.get("rerank_status") or "not_requested")
rerank_score = row.get("rerank_score")
candidates.append(
    RecommendedCandidate(
        application_id=UUID(str(row["application_id"])),
        applicant_user_id=UUID(str(row["applicant_user_id"])),
        full_name=row.get("full_name"),
        email=row.get("email"),
        resume_title=row.get("resume_title"),
        resume_storage_path=row.get("resume_storage_path"),
        current_status=row.get("current_status") or "pending",
        rrf_score=float(row.get("rrf_score") or 0.0),
        rerank_score=None if rerank_score is None else float(rerank_score),
        rerank_status=rerank_status,  # type: ignore[arg-type]
    )
)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/unit/test_recommend.py tests/unit/test_chat_service.py tests/api/test_profiles.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/schemas/chat.py backend/app/services/recommend.py backend/app/services/chat_service.py tests/unit/test_recommend.py tests/unit/test_chat_service.py tests/api/test_profiles.py
git commit -m "feat: split candidate rrf_score and rerank_score"
```

---

### Task 2: RRF emits `rrf_score` / `rrf_rank`

**Files:**
- Modify: `backend/app/services/matching/rrf.py`
- Test: `tests/unit/test_matching_retrieve.py`

**Interfaces:**
- Consumes: `score_candidates(rows, jd_skills) -> list[dict]`
- Produces: each row has `rrf_score: float`, `rrf_rank: int` (1-based fused order). No `score` key.

- [ ] **Step 1: Write the failing test**

In `tests/unit/test_matching_retrieve.py` `test_score_candidates_rrf_prefers_expanded_and_skill_over_one_semantic_hit` replace the last assert:

```python
assert ranked[0]["rrf_score"] > ranked[1]["rrf_score"]
assert ranked[0]["rrf_rank"] == 1
assert ranked[1]["rrf_rank"] == 2
assert "score" not in ranked[0]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_matching_retrieve.py::test_score_candidates_rrf_prefers_expanded_and_skill_over_one_semantic_hit -v`

Expected: FAIL (`score` still set / `rrf_score` missing)

- [ ] **Step 3: Minimal implementation**

In `score_candidates`, when building `ranked` from `fused`:

```python
for rank, (doc_id, raw) in enumerate(fused, start=1):
    row = by_id.get(doc_id)
    if not row:
        continue
    ranked.append(
        {
            **row,
            "rrf_score": rrf_normalize(raw, n_lists=3),
            "rrf_rank": rank,
        }
    )
return ranked
```

Do not set `score`.

- [ ] **Step 4: Run tests**

Run: `pytest tests/unit/test_matching_retrieve.py tests/unit/test_matching_rrf.py -v`

Expected: PASS. `test_matching_graph.py` may still fail until Task 5 (it asserts `score`). Do not “fix” it by putting `score` back.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/matching/rrf.py tests/unit/test_matching_retrieve.py
git commit -m "fix: store RRF as rrf_score not mixed score"
```

---

### Task 3: Truncate + `apply_rerank`

**Files:**
- Modify: `backend/app/config/models.py`
- Create: `backend/app/services/matching/rerank.py`
- Test: `tests/unit/test_matching_rerank.py`

**Interfaces:**
- Consumes: candidate dicts with `markdown`, `rrf_score`, `rrf_rank`
- Produces:
  - `truncate_rerank_text(text: str, max_chars: int | None = None) -> str`
  - `apply_rerank(rows, *, jd_query: str, mode: str, rerank_fn=None, candidate_k=None, final_k=None) -> list[dict]`
  - Constants: `RETRIEVE_CANDIDATE_K=50`, `RERANK_CANDIDATE_K=10`, `FINAL_CANDIDATE_K=10`, `RERANK_DOC_MAX_CHARS=2000`, `DEFAULT_RERANK_MODEL="qwen3-rerank"`, `DEFAULT_RERANK_BASE_URL="https://dashscope-intl.aliyuncs.com/compatible-api/v1"`, `DEFAULT_RERANK_INSTRUCT="Rank candidate resumes by how well they match this job's requirements."`, `RERANK_CONFIG_VERSION="2026-08-17.1"`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/test_matching_rerank.py`:

```python
from backend.app.config.models import RERANK_DOC_MAX_CHARS
from backend.app.services.matching.rerank import apply_rerank, truncate_rerank_text


def _row(i: str, rrf: float, md: str = "cv") -> dict:
    return {
        "application_id": i,
        "resume_id": f"r-{i}",
        "rrf_score": rrf,
        "rrf_rank": int(i),
        "markdown": md,
    }


def test_truncate_rerank_text_cuts_over_budget():
    blob = "á" * (RERANK_DOC_MAX_CHARS + 50)
    out = truncate_rerank_text(blob)
    assert len(out) == RERANK_DOC_MAX_CHARS
    assert len(blob) > RERANK_DOC_MAX_CHARS


def test_truncate_empty_becomes_space():
    assert truncate_rerank_text("") == " "
    assert truncate_rerank_text(None) == " "  # type: ignore[arg-type]


def test_apply_rerank_agent_keeps_rrf_order_and_null_rerank_score():
    rows = [_row("1", 0.9), _row("2", 0.2)]
    out = apply_rerank(rows, jd_query="Python", mode="agent")
    assert [r["application_id"] for r in out] == ["1", "2"]
    assert out[0]["rerank_score"] is None
    assert out[0]["rerank_status"] == "not_requested"
    assert out[0]["rrf_score"] == 0.9


def test_apply_rerank_qwen_reorders_by_relevance_leaves_rrf():
    rows = [_row("1", 0.9, "ada"), _row("2", 0.2, "bob")]

    def rerank_fn(query: str, documents: list[str]):
        assert query == "Python FastAPI"
        assert documents == ["ada", "bob"]
        return [{"index": 1, "relevance_score": 0.99}, {"index": 0, "relevance_score": 0.1}]

    out = apply_rerank(
        rows, jd_query="Python FastAPI", mode="qwen", rerank_fn=rerank_fn
    )
    assert [r["application_id"] for r in out] == ["2", "1"]
    assert out[0]["rerank_score"] == 0.99
    assert out[0]["rerank_status"] == "success"
    assert out[0]["rrf_score"] == 0.2


def test_apply_rerank_qwen_error_falls_back():
    rows = [_row("1", 0.9), _row("2", 0.2)]

    def rerank_fn(query: str, documents: list[str]):
        raise RuntimeError("dashscope down")

    out = apply_rerank(rows, jd_query="Python", mode="qwen", rerank_fn=rerank_fn)
    assert [r["application_id"] for r in out] == ["1", "2"]
    assert out[0]["rerank_score"] is None
    assert out[0]["rerank_status"] == "fallback"


def test_apply_rerank_respects_candidate_and_final_k():
    rows = [_row(str(i), 1.0 - i / 10, f"d{i}") for i in range(1, 6)]

    def rerank_fn(query: str, documents: list[str]):
        assert documents == ["d1", "d2", "d3"]
        return [{"index": i, "relevance_score": 0.1 * i} for i in range(3)]

    out = apply_rerank(
        rows,
        jd_query="q",
        mode="qwen",
        rerank_fn=rerank_fn,
        candidate_k=3,
        final_k=2,
    )
    assert len(out) == 2
    assert [r["application_id"] for r in out] == ["3", "2"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_matching_rerank.py -v`

Expected: FAIL import error

- [ ] **Step 3: Minimal implementation**

Append to `backend/app/config/models.py`:

```python
DEFAULT_RERANK_MODEL = "qwen3-rerank"
DEFAULT_RERANK_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-api/v1"
DEFAULT_RERANK_INSTRUCT = (
    "Rank candidate resumes by how well they match this job's requirements."
)
RERANK_CONFIG_VERSION = "2026-08-17.1"
RETRIEVE_CANDIDATE_K = 50
RERANK_CANDIDATE_K = 10
FINAL_CANDIDATE_K = 10
RERANK_DOC_MAX_CHARS = 2000
```

`backend/app/services/matching/rerank.py`:

```python
from __future__ import annotations

from collections.abc import Callable
from typing import Any

from backend.app.config.models import (
    FINAL_CANDIDATE_K,
    RERANK_CANDIDATE_K,
    RERANK_DOC_MAX_CHARS,
)
from backend.app.observability.logger import get_logger

logger = get_logger(__name__)

RerankFn = Callable[[str, list[str]], list[dict[str, Any]]]


def truncate_rerank_text(text: str | None, max_chars: int | None = None) -> str:
    # ponytail: char budget, not tokens. Upgrade: real tokenizer before raising RERANK_DOC_MAX_CHARS.
    limit = RERANK_DOC_MAX_CHARS if max_chars is None else max_chars
    blob = text or " "
    if not blob.strip():
        return " "
    if len(blob) <= limit:
        return blob
    return blob[:limit]


def apply_rerank(
    rows: list[dict[str, Any]],
    *,
    jd_query: str,
    mode: str,
    rerank_fn: RerankFn | None = None,
    candidate_k: int | None = None,
    final_k: int | None = None,
) -> list[dict[str, Any]]:
    window_n = candidate_k if candidate_k is not None else RERANK_CANDIDATE_K
    keep_n = final_k if final_k is not None else FINAL_CANDIDATE_K
    window = list(rows[:window_n])

    if mode != "qwen":
        # ponytail: agent CV-eval skill not implemented; do not copy rrf_score into rerank_score.
        return [
            {**row, "rerank_score": None, "rerank_status": "not_requested"}
            for row in window[:keep_n]
        ]

    documents = [truncate_rerank_text(row.get("markdown")) for row in window]
    query = truncate_rerank_text(jd_query)
    try:
        fn = rerank_fn
        if fn is None:
            from backend.app.clients.llm import rerank_query

            fn = lambda q, docs: rerank_query(q, docs)
        raw = fn(query, documents)
    except Exception:
        logger.exception("qwen rerank failed")
        return [
            {**row, "rerank_score": None, "rerank_status": "fallback"}
            for row in window[:keep_n]
        ]

    by_index: dict[int, float] = {}
    for item in raw or []:
        try:
            by_index[int(item["index"])] = float(item["relevance_score"])
        except (KeyError, TypeError, ValueError):
            continue
    if len(by_index) != len(window):
        return [
            {**row, "rerank_score": None, "rerank_status": "fallback"}
            for row in window[:keep_n]
        ]

    scored = [
        {**row, "rerank_score": by_index[i], "rerank_status": "success"}
        for i, row in enumerate(window)
    ]
    scored.sort(key=lambda row: (-float(row["rerank_score"]), str(row.get("application_id") or "")))
    return scored[:keep_n]
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/unit/test_matching_rerank.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/config/models.py backend/app/services/matching/rerank.py tests/unit/test_matching_rerank.py
git commit -m "feat: add apply_rerank with separate rrf and rerank scores"
```

---

### Task 4: `rerank_query` HTTP client

**Files:**
- Modify: `backend/app/clients/llm.py`
- Test: `tests/unit/test_matching_llm.py`

**Interfaces:**
- Consumes: same `post` injection as `embed_query`
- Produces: `rerank_query(query: str, documents: list[str], *, model=None, base_url=None, api_key=None, instruct=None, post=None) -> list[dict]` with keys `index`, `relevance_score`. POST `{base}/reranks`. Default base `DEFAULT_RERANK_BASE_URL` (compatible-api, not compatible-mode).

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/test_matching_llm.py`:

```python
from backend.app.clients.llm import rerank_query


def test_rerank_query_posts_qwen3_rerank_on_compatible_api():
    calls: list[dict] = []

    def post(url, json, headers, timeout):
        calls.append({"url": url, "json": json, "headers": headers})
        return _FakeResponse(
            {
                "results": [
                    {"index": 1, "relevance_score": 0.9},
                    {"index": 0, "relevance_score": 0.2},
                ]
            }
        )

    out = rerank_query(
        "Python",
        ["ada", "bob"],
        model="qwen3-rerank",
        base_url="https://dashscope-intl.aliyuncs.com/compatible-api/v1",
        api_key="rk",
        post=post,
    )
    assert out == [
        {"index": 1, "relevance_score": 0.9},
        {"index": 0, "relevance_score": 0.2},
    ]
    assert calls[0]["url"] == "https://dashscope-intl.aliyuncs.com/compatible-api/v1/reranks"
    assert calls[0]["json"]["model"] == "qwen3-rerank"
    assert calls[0]["json"]["query"] == "Python"
    assert calls[0]["json"]["documents"] == ["ada", "bob"]
    assert "top_n" not in calls[0]["json"]
    assert calls[0]["headers"]["Authorization"] == "Bearer rk"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_matching_llm.py::test_rerank_query_posts_qwen3_rerank_on_compatible_api -v`

Expected: FAIL import

- [ ] **Step 3: Minimal implementation**

In `backend/app/clients/llm.py` import `DEFAULT_RERANK_BASE_URL`, `DEFAULT_RERANK_INSTRUCT`, `DEFAULT_RERANK_MODEL` from `config.models`. Add:

```python
def rerank_query(
    query: str,
    documents: list[str],
    *,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    instruct: str | None = None,
    post: PostFn | None = None,
) -> list[dict[str, Any]]:
    payload: dict[str, Any] = {
        "model": model or DEFAULT_RERANK_MODEL,
        "query": query,
        "documents": documents,
        "instruct": instruct or DEFAULT_RERANK_INSTRUCT,
    }
    root = (base_url if base_url is not None else DEFAULT_RERANK_BASE_URL).rstrip("/")
    response = _post(post)(
        f"{root}/reranks",
        json=payload,
        headers=_headers(_api_key(api_key)),
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    results = response.json().get("results") or []
    return [
        {"index": int(item["index"]), "relevance_score": float(item["relevance_score"])}
        for item in results
    ]
```

Do not default `base_url` to `settings.qwen_base_url` (that is compatible-mode).

- [ ] **Step 4: Run tests**

Run: `pytest tests/unit/test_matching_llm.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/clients/llm.py tests/unit/test_matching_llm.py
git commit -m "feat: add qwen3-rerank HTTP client"
```

---

### Task 5: Matching graph rerank node + retrieve markdown/`jd_query`

**Files:**
- Create: `backend/app/agents/matching/nodes/rerank.py`
- Modify: `backend/app/agents/matching/nodes/__init__.py`
- Modify: `backend/app/agents/matching/graph.py`
- Modify: `backend/app/agents/state.py`
- Modify: `backend/app/services/matching/retrieve.py`
- Test: `tests/unit/test_matching_graph.py`

**Interfaces:**
- Consumes: `apply_rerank`; `RetrieveFn`; optional `RerankFn`
- Produces: `build_matching_graph(*, retrieve, rerank_fn=None)`; retrieve payload includes `jd_query: str` and candidate `markdown`; graph path `retrieve → skill → rrf → rerank → respond`

- [ ] **Step 1: Write the failing tests**

Update `tests/unit/test_matching_graph.py`:

1. `test_matching_graph_ranks_then_responds`: invoke with `"rerank_mode": "agent"`. Assert `rrf_score` (not `score`). Assert `rerank_status == "not_requested"` and `rerank_score is None`.

2. Add:

```python
@pytest.mark.asyncio
async def test_matching_graph_qwen_rerank_reorders():
    ada = str(uuid4())
    bob = str(uuid4())

    async def retrieve(_job_id):
        return {
            "jd_query": "Python FastAPI",
            "jd_skills": ["Python"],
            "candidates": [
                {
                    "application_id": ada,
                    "applicant_user_id": str(uuid4()),
                    "resume_id": str(uuid4()),
                    "full_name": "Ada",
                    "email": "a@x",
                    "resume_title": "a.pdf",
                    "resume_storage_path": "a",
                    "current_status": "pending",
                    "skills": ["Python"],
                    "markdown": "ada cv",
                    "distance_original": 0.1,
                    "distance_expanded": 0.1,
                },
                {
                    "application_id": bob,
                    "applicant_user_id": str(uuid4()),
                    "resume_id": str(uuid4()),
                    "full_name": "Bob",
                    "email": "b@x",
                    "resume_title": "b.pdf",
                    "resume_storage_path": "b",
                    "current_status": "pending",
                    "skills": ["Python"],
                    "markdown": "bob cv",
                    "distance_original": 0.2,
                    "distance_expanded": 0.2,
                },
            ],
        }

    def rerank_fn(query: str, documents: list[str]):
        assert query == "Python FastAPI"
        assert documents == ["ada cv", "bob cv"]
        return [{"index": 1, "relevance_score": 0.95}, {"index": 0, "relevance_score": 0.1}]

    graph = build_matching_graph(retrieve=retrieve, rerank_fn=rerank_fn)
    result = await graph.ainvoke(
        {"job_id": str(uuid4()), "query": "Gợi ý ứng viên", "rerank_mode": "qwen"}
    )
    assert result["candidates"][0]["application_id"] == bob
    assert result["candidates"][0]["rerank_status"] == "success"
    assert result["candidates"][0]["rerank_score"] == 0.95
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_matching_graph.py -v`

Expected: FAIL (`build_matching_graph` unexpected kwarg / missing `rrf_score`)

- [ ] **Step 3: Minimal implementation**

`AgentState` add: `rerank_mode: str`, `jd_query: str`

`retrieve_node` also copies `jd_query` from payload:

```python
return {
    "jd_skills": payload.get("jd_skills") or [],
    "jd_query": payload.get("jd_query") or "",
    "candidates": payload.get("candidates") or [],
}
```

`backend/app/agents/matching/nodes/rerank.py`:

```python
from backend.app.agents.state import AgentState
from backend.app.services.matching.rerank import RerankFn, apply_rerank


def make_rerank_node(*, rerank_fn: RerankFn | None = None):
    async def rerank_node(state: AgentState) -> dict:
        mode = state.get("rerank_mode") or "agent"
        return {
            "candidates": apply_rerank(
                list(state.get("candidates") or []),
                jd_query=state.get("jd_query") or "",
                mode=mode,
                rerank_fn=rerank_fn,
            )
        }

    return rerank_node
```

`build_matching_graph(*, retrieve, rerank_fn=None)`: add node `rerank` between `rrf` and `respond`.

`retrieve_for_job`:
- import `RETRIEVE_CANDIDATE_K`
- `.limit(RETRIEVE_CANDIDATE_K)` on submits (replace `50`)
- RPC `match_count`: `RETRIEVE_CANDIDATE_K`
- `_embedded` select `"metadata, markdown"`
- candidate dict includes `"markdown": (parsed or {}).get("markdown") or ""`
- return `"jd_query": query_text` alongside `jd_skills` / `candidates`

Export the new node from `nodes/__init__.py`.

- [ ] **Step 4: Run tests**

Run: `pytest tests/unit/test_matching_graph.py tests/unit/test_matching_rerank.py tests/unit/test_matching_retrieve.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/agents/state.py backend/app/agents/matching backend/app/services/matching/retrieve.py tests/unit/test_matching_graph.py
git commit -m "feat: rerank matching graph after RRF"
```

---

### Task 6: Atomic persist RPC (Python) + ChatService wiring

**Files:**
- Modify: `backend/app/services/matching/retrieve.py` (`persist_match_resume_rows`)
- Modify: `backend/app/services/chat_service.py`
- Modify: `backend/app/dependencies/services.py`
- Test: `tests/unit/test_matching_rerank.py` (persist mock) + `tests/unit/test_chat_service.py`

**Interfaces:**
- Consumes: ranked candidate dicts after rerank; `ChatRequest.rerank`
- Produces:
  - `persist_match_resume_rows(client, job_id, ranked, *, actor_id, query_text, recruiter_message, rerank_mode, rerank_status) -> None` calls `client.rpc("insert_match_resume_run", {...})` once
  - `MatchCandidates = Callable[[UUID, UUID, str, str], Awaitable[ChatResponse]]`  # job_id, actor_id, message, rerank
  - `ChatService._recommend_candidates` calls `match_candidates(job_id, actor_id, request.message, request.rerank)`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/test_matching_rerank.py`:

```python
from uuid import uuid4
from backend.app.config.models import DEFAULT_EMBED_MODEL, DEFAULT_RERANK_MODEL, RERANK_CONFIG_VERSION
from backend.app.services.matching.retrieve import persist_match_resume_rows


class _RpcClient:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def rpc(self, name, params):
        self.calls.append({"name": name, "params": params})
        return self

    def execute(self):
        return type("R", (), {"data": [{"id": "run"}]})()


def test_persist_match_resume_rows_calls_insert_rpc_once():
    client = _RpcClient()
    job_id = uuid4()
    actor_id = uuid4()
    resume_id = uuid4()
    persist_match_resume_rows(
        client,  # type: ignore[arg-type]
        job_id,
        [
            {
                "resume_id": str(resume_id),
                "rrf_score": 0.4,
                "rrf_rank": 1,
                "rerank_score": 0.9,
                "skill_score": 0.5,
                "semantic_score": 0.8,
                "skills": ["Python"],
                "distance_original": 0.1,
                "distance_expanded": 0.2,
            }
        ],
        actor_id=actor_id,
        query_text="Python",
        recruiter_message="Gợi ý ứng viên phù hợp",
        rerank_mode="qwen",
        rerank_status="success",
    )
    assert len(client.calls) == 1
    assert client.calls[0]["name"] == "insert_match_resume_run"
    params = client.calls[0]["params"]
    assert params["p_job_post_id"] == str(job_id)
    assert params["p_requested_by"] == str(actor_id)
    assert params["p_query_text"] == "Python"
    assert params["p_rerank_mode"] == "qwen"
    assert params["p_rerank_status"] == "success"
    assert params["p_rerank_model"] == DEFAULT_RERANK_MODEL
    assert params["p_rerank_config_version"] == RERANK_CONFIG_VERSION
    assert params["p_embedding_model"] == DEFAULT_EMBED_MODEL
    assert params["p_matched_resume_ids"] == [str(resume_id)]
    assert params["p_evidence"][0]["resume_id"] == str(resume_id)
    assert params["p_evidence"][0]["rank"] == 1
    assert params["p_evidence"][0]["rrf_score"] == 0.4
    assert params["p_evidence"][0]["rerank_score"] == 0.9
    assert "score" not in params["p_evidence"][0]
```

Update `test_chat_job_id_uses_matching_runner_not_mock`:

```python
async def match(requested, actor, message, rerank):
    assert requested == job_id
    assert actor == actor_id
    assert message == "Gợi ý ứng viên phù hợp"
    assert rerank == "qwen"
    return ChatResponse(...)
```

Pass `actor_id` into `.chat(...)`. Default request rerank is qwen.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/unit/test_matching_rerank.py::test_persist_match_resume_rows_calls_insert_rpc_once tests/unit/test_chat_service.py::test_chat_job_id_uses_matching_runner_not_mock -v`

Expected: FAIL (persist still inserts tables; match arity 1)

- [ ] **Step 3: Minimal implementation**

Replace `persist_match_resume_rows` so it only `rpc("insert_match_resume_run", params).execute()`. Build `p_evidence` like the current evidence loop (related skills, distances) but fields `rank`, `rrf_rank`, `rrf_score`, `rerank_score`, `skill_score`, `semantic_score`, `matched_skill_names`, `related_skill_names`, `raw_factors`. Do not send `score`.

`p_rerank_model`: `DEFAULT_RERANK_MODEL` if `rerank_mode == "qwen"` else `None`.

`p_rerank_config_version`: `RERANK_CONFIG_VERSION`.

`p_embedding_model`: `DEFAULT_EMBED_MODEL` (from `backend.app.config.models` or existing `DEFAULT_EMBEDDING_MODEL` alias in `embed.py` — pick `DEFAULT_EMBED_MODEL` and stop importing the alias if unused).

`ChatService`:

```python
MatchCandidates = Callable[[UUID, UUID, str, str], Awaitable[ChatResponse]]
...
return await self._match_candidates(job_id, actor_id, request.message, request.rerank)
```

`get_chat_service` `match_candidates`:

```python
async def match_candidates(job_id, actor_id, message, rerank):
    result = await graph.ainvoke(
        {"job_id": str(job_id), "query": message, "rerank_mode": rerank}
    )
    ranked = result.get("candidates") or []
    status = str((ranked[0].get("rerank_status") if ranked else None) or "not_requested")
    try:
        await asyncio.to_thread(
            persist_match_resume_rows,
            client,
            job_id,
            ranked,
            actor_id=actor_id,
            query_text=str(result.get("jd_query") or ""),
            recruiter_message=message,
            rerank_mode=rerank,
            rerank_status=status,
        )
    except Exception:
        logger = get_logger(__name__)
        logger.exception("match_resume persist failed")
    return chat_response_from_graph(result)
```

Pass `rerank_fn=None` so production uses `rerank_query`. Import logger in this module (currently missing — `dependencies/services.py` uses bare `except: pass`; replace with `logger.exception`).

- [ ] **Step 4: Run tests**

Run: `pytest tests/unit/test_matching_rerank.py tests/unit/test_chat_service.py tests/unit/test_matching_graph.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/matching/retrieve.py backend/app/services/chat_service.py backend/app/dependencies/services.py tests/unit/test_matching_rerank.py tests/unit/test_chat_service.py
git commit -m "feat: persist match runs via insert_match_resume_run"
```

---

### Task 7: Migration `insert_match_resume_run` + `get_match_run`

**Files:**
- Create: `supabase/migrations/20260817120000_match_resume_trace.sql`

**Interfaces:**
- Consumes: existing `match_resume` / `match_evidence`
- Produces: new columns; `public.insert_match_resume_run(...) returns uuid` (service_role only); `public.get_match_run(p_run_id uuid)` (authenticated, security invoker)

- [ ] **Step 1: Write the migration**

There is no local pytest for SQL. Document the latest-submit rule in comments. File contents:

```sql
-- Trace columns + atomic write RPC + history read RPC.
-- get_match_run: DISTINCT ON (resume_id) prefers withdrawn_at IS NULL, then latest applied_at.

alter table public.match_resume
  add column if not exists requested_by uuid references public.profiles (id) on delete set null,
  add column if not exists query_text text,
  add column if not exists rerank_mode text,
  add column if not exists rerank_status text,
  add column if not exists rerank_model text,
  add column if not exists rerank_config_version text,
  add column if not exists recruiter_message text;

alter table public.match_evidence
  add column if not exists rrf_score numeric,
  add column if not exists rerank_score numeric,
  add column if not exists rrf_rank integer;

create or replace function public.insert_match_resume_run (
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
  p_evidence jsonb
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
    matched_resume_ids
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
    coalesce(p_matched_resume_ids, '{}')
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
  uuid, uuid, text, text, text, text, text, text, text, uuid[], jsonb
) from public, anon, authenticated;
grant execute on function public.insert_match_resume_run(
  uuid, uuid, text, text, text, text, text, text, text, uuid[], jsonb
) to service_role;

create or replace function public.get_match_run (p_run_id uuid)
returns table (
  match_resume_id uuid,
  created_at timestamptz,
  recruiter_message text,
  rerank_mode text,
  rerank_status text,
  rerank_model text,
  rank integer,
  rrf_rank integer,
  rrf_score numeric,
  rerank_score numeric,
  resume_id uuid,
  application_id uuid,
  applicant_user_id uuid,
  full_name text,
  email text,
  resume_title text,
  resume_storage_path text,
  current_status text
)
language sql
stable
security invoker
set search_path = public
as $$
  with run as (
    select * from public.match_resume where id = p_run_id
  ),
  picked as (
    select distinct on (e.resume_id)
      e.match_resume_id,
      e.rank,
      e.rrf_rank,
      e.rrf_score,
      e.rerank_score,
      e.resume_id,
      s.id as application_id,
      s.applicant_user_id,
      s.resume_title_snapshot as resume_title,
      s.resume_storage_path_snapshot as resume_storage_path,
      s.current_status,
      p.full_name,
      p.email
    from public.match_evidence e
    inner join run r on r.id = e.match_resume_id
    inner join public.job_submits s
      on s.resume_id = e.resume_id
     and s.job_post_id = e.job_post_id
    left join public.profiles p on p.id = s.applicant_user_id
    order by
      e.resume_id,
      (s.withdrawn_at is null) desc,
      s.applied_at desc
  )
  select
    pck.match_resume_id,
    r.created_at,
    r.recruiter_message,
    r.rerank_mode,
    r.rerank_status,
    r.rerank_model,
    pck.rank,
    pck.rrf_rank,
    pck.rrf_score,
    pck.rerank_score,
    pck.resume_id,
    pck.application_id,
    pck.applicant_user_id,
    pck.full_name,
    pck.email,
    pck.resume_title,
    pck.resume_storage_path,
    pck.current_status
  from picked pck
  inner join run r on r.id = pck.match_resume_id
  order by pck.rank;
$$;

revoke all on function public.get_match_run(uuid) from public, anon;
grant execute on function public.get_match_run(uuid) to authenticated, service_role;
```

- [ ] **Step 2: Apply locally if CLI is available**

Run: `npx supabase db query --local "select proname from pg_proc where proname in ('insert_match_resume_run','get_match_run');"` after `supabase db reset` or `supabase migration up` as this repo already does.

If the sandbox has no local Supabase, leave the file in `supabase/migrations/` and continue. Do not use MCP `apply_migration` (it writes history on the remote).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260817120000_match_resume_trace.sql
git commit -m "feat: atomic match_resume run RPC and get_match_run"
```

---

### Task 8: Frontend ingest — await + split status

**Files:**
- Create: `frontend/src/lib/ingest.ts`
- Modify: `frontend/src/pages/ResumesPage.tsx`
- Modify: `frontend/src/pages/JobDetailPage.tsx`
- Modify: `frontend/src/components/cv/CvBuilderContainer.tsx`

**Interfaces:**
- Consumes: `apiJson`, `session.access_token`
- Produces: `ingestResume(resumeId, accessToken) -> Promise<void>` throws on HTTP error; `INDEX_FAIL_COPY` constant

- [ ] **Step 1: Add helper**

`frontend/src/lib/ingest.ts`:

```typescript
import { apiJson } from './api';

export const INDEX_FAIL_COPY =
  'Index CV thất bại — hệ thống sẽ thử lại khi matching.';

export async function ingestResume(resumeId: string, accessToken: string): Promise<void> {
  await apiJson(`/resumes/${resumeId}/ingest`, accessToken, { method: 'POST' });
}
```

- [ ] **Step 2: Wire upload / export / apply**

`ResumesPage`: `const { user, session } = useAuth()`. After successful `resumes` insert: `setUploadMessage({ type: 'success', text: 'Tải lên tài liệu và khởi tạo hồ sơ thành công!' })`. Then if `session?.access_token`, `try { await ingestResume(...) } catch { setUploadMessage({ type: 'success', text: 'Tải lên tài liệu và khởi tạo hồ sơ thành công! ' + INDEX_FAIL_COPY }) }`. If insert failed, keep the current error path and do not mention index.

`CvBuilderContainer`: `useAuth()` for `session`. After `exportCv`, try `ingestResume(result.resumeId, session.access_token)`. Always `setSuccessPath(result.storagePath)` and `onCreated?.()`. Add `indexWarning` state; show `INDEX_FAIL_COPY` under the success heading when ingest throws. If no token, set the same warning.

`JobDetailPage` `handleApplySubmit`: after insert succeeds, `try { if (session?.access_token) await ingestResume(selectedResumeId, session.access_token); } catch { /* keep going */ }` then `setSuccess(true)`. Add `indexWarning` state set in that catch. On the existing success UI, if `indexWarning`, render `INDEX_FAIL_COPY` under “Đã nộp đơn”. Remove the fire-and-forget `void apiJson`.

Keep buttons disabled via existing `uploading` / `submitting` until ingest returns.

- [ ] **Step 3: Typecheck**

Run: `npm --prefix frontend run lint`

Expected: PASS (`tsc --noEmit`)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/ingest.ts frontend/src/pages/ResumesPage.tsx frontend/src/pages/JobDetailPage.tsx frontend/src/components/cv/CvBuilderContainer.tsx
git commit -m "feat: await CV ingest and split save vs index status"
```

---

### Task 9: `/match_candidates` toggle + history inject

**Files:**
- Modify: `frontend/src/pages/MatchCandidatesPage.tsx`

**Interfaces:**
- Consumes: `POST /chat` `{ message, job_id, rerank }`; `supabase.from('match_resume')`; `supabase.rpc('get_match_run', { p_run_id })`
- Produces: display score = `rerank_status === 'success' && rerank_score != null ? rerank_score : rrf_score`; history click appends two turns, no second chat POST

- [ ] **Step 1: Update candidate type and display helper** (same file)

```typescript
type RerankStatus = 'success' | 'fallback' | 'not_requested';

type ChatCandidate = {
  application_id: string;
  applicant_user_id: string;
  full_name: string | null;
  email: string | null;
  resume_title: string | null;
  resume_storage_path: string | null;
  current_status: string;
  rrf_score: number;
  rerank_score: number | null;
  rerank_status: RerankStatus;
};

const displayScore = (c: ChatCandidate) =>
  c.rerank_status === 'success' && c.rerank_score != null ? c.rerank_score : c.rrf_score;
```

Badge `{Math.round(displayScore(candidate) * 100)}%`. If `rerank_status === 'fallback'`, small text `fallback` next to the badge.

- [ ] **Step 2: Toggle + send `rerank`**

State: `const [rerank, setRerank] = useState<'qwen' | 'agent'>('qwen')`.

Two buttons next to the existing chip, disabled when `sending || !jobId`. `sendMessage` JSON: `{ message, job_id: jobId, rerank }`.

- [ ] **Step 3: History list + inject**

State: `history: { id: string; created_at: string; rerank_mode: string | null; rerank_status: string | null; recruiter_message: string | null }[]`

When `jobId` changes (inside `handleJobChange` after reset turns): load

```typescript
const { data } = await supabase
  .from('match_resume')
  .select('id, created_at, rerank_mode, rerank_status, recruiter_message')
  .eq('job_post_id', nextId)
  .order('created_at', { ascending: false })
  .limit(20);
```

Render a compact `<ul>` under the job select (empty = nothing). Click handler:

```typescript
const { data, error } = await supabase.rpc('get_match_run', { p_run_id: runId });
```

Map rows to `ChatCandidate` (`rrf_score: Number(row.rrf_score)`, `rerank_score: row.rerank_score == null ? null : Number(row.rerank_score)`, `rerank_status` from the row or run). Do not join `job_submits` in the client.

Append:

1. user turn: `run.recruiter_message || QUICK_PROMPT`
2. assistant turn: text `Lịch sử · ${created_at}\nGợi ý ${n} ứng viên phù hợp.` (or empty copy if `n===0`) + `candidates`

Do not call `apiJson('/chat')` here. Do not dedupe.

- [ ] **Step 4: Typecheck**

Run: `npm --prefix frontend run lint`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/MatchCandidatesPage.tsx
git commit -m "feat: recruiter rerank toggle and match history replay"
```

---

### Task 10: Full verification

- [ ] **Step 1: Backend tests**

Run: `pytest tests/unit/test_matching_rerank.py tests/unit/test_matching_llm.py tests/unit/test_matching_graph.py tests/unit/test_matching_retrieve.py tests/unit/test_matching_ingest.py tests/unit/test_chat_service.py tests/unit/test_recommend.py tests/api/test_profiles.py -v`

Expected: PASS. Confirm ingest PII tests still in the ingest file pass.

- [ ] **Step 2: Broader pytest if green**

Run: `pytest tests/ -v --tb=short`

Expected: PASS (skip only if an unrelated pre-existing failure; do not “fix” unrelated tests)

- [ ] **Step 3: No extra commit unless Step 2 required a spec-related fix**

---

## Spec coverage

| Spec item | Task |
|---|---|
| Split rrf/rerank scores + ChatRequest.rerank | 1 |
| RRF does not write mixed `score` | 2 |
| Truncate 2000 chars; qwen/agent/fallback | 3 |
| qwen3-rerank HTTP compatible-api | 4 |
| Graph retrieve→skill→rrf→rerank; markdown; jd_query; K constants | 3+5 |
| Persist one RPC; ChatService passes actor/message/mode | 6 |
| Columns + insert_match_resume_run + get_match_run | 7 |
| Await ingest; split save vs index copy | 8 |
| Toggle + history inject via RPC | 9 |
| PII ingest unchanged | 10 (regression) |
| `/match_job` mock | untouched |

## Type names (locked)

- `apply_rerank`, `truncate_rerank_text`, `rerank_query`, `persist_match_resume_rows`, `insert_match_resume_run`, `get_match_run`, `ingestResume`, `INDEX_FAIL_COPY`, `displayScore`
- RPC arg prefix `p_`
- Candidate JSON: `rrf_score`, `rerank_score`, `rerank_status` — never `score`
