# Factual summarize + dual retrieve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest factual summaries with verified skill evidence; retrieve with independent dense+BM25 over the full applicant pool; rank as recruiter assist (no auto-reject).

**Architecture:** Taxonomy from `skills.json`. Ingest stores `clean_markdown` + `skill_records`. Retrieve cosine in-process on summary embeddings and Okapi BM25 on clean+aliases, fuse with tie-aware RRF, then optional confirmed partition (`pass`/`unknown`/`fail`) without dropping rows. Chat renders top-10; persist keeps the full ranked pool.

**Tech Stack:** Existing FastAPI + LangGraph + Supabase; stdlib BM25; pytest. No new pip deps.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-19-summarize-bm25-retrieve-design.md` (v3.1).
- No new pip packages. No ParadeDB.
- Do not `UPDATE job_submits.current_status`. Do not hide `fail`/`unknown`. Do not treat chat top-10 as a mandatory shortlist.
- `FINAL_CANDIDATE_K=10` is chat display only; persist and graph payload keep the full pool.
- Hard partition only if `skill_constraints_confirmed_at` is set; unconfirmed = soft `0.05 * |verified ∩ extracted_jd_skills|`.
- Partition uses **verified_skills** only. Inferred never satisfies must/excluded.
- BM25 score `== 0` is omitted from the BM25 RRF list.
- Same BM25 score or same dense distance → same competition rank (1,2,2,4).
- RRF `k=60` default (`n_lists=2`). ID is display tie-break after `rrf_raw` only.
- Full pool: no `.limit` on submits; `pool_truncated=false`; `dropped_count=0`; `pool_latency_warn` if N>500.
- PII: parse and clean `redact_pii` before LLM. Prompt: CV is untrusted data.
- `summary_prompt_version = "2026-08-19.v3"`. LLM input cap 24_000 chars.
- Canonical skill ids are snake_case from `skills.json`.
- Do not commit unless the user asks.
- Python tests: `.venv\Scripts\python.exe -m pytest` from repo root.

## File map

| File | Responsibility |
|---|---|
| `backend/app/services/matching/skills.py` | Taxonomy, extract, aliases, quotes, dense expand, version hash |
| `backend/app/services/matching/bm25.py` | Tokenizer, Okapi, tie ranks, query/doc builders |
| `backend/app/services/matching/constraints.py` | Propose schema, status, soft_delta, partition |
| `backend/app/services/matching/summarize.py` + `prompts/system/summarize.txt` | Factual JSON + untrusted clause |
| ingest nodes/graph/state | clean redact, merge skills, drop extract node, embed body+evidence |
| `rrf.py` / `retrieve.py` / `rerank.py` | Dual retrieve, fuse, persist full pool |
| matching graph + `chat_service.py` | Pass constraints; slice 10 on chat render |
| `eval_retrieve.py` + script | Ablation helpers |
| `supabase/migrations/20260819120000_retrieve_v3.sql` | `clean_markdown`, `skill_constraints` |

---

### Task 1: Taxonomy + extract aliases

**Files:**
- Modify: `backend/app/services/matching/skills.py`
- Test: `tests/unit/test_matching_skills.py`

**Produces:**
- `load_taxonomy_index() -> dict[str, str]` maps normalized variant → snake_case id
- `extract_skills(text) -> list[str]`
- `related_skills(canonical, *, depth=2) -> list[str]` siblings same category, cap 8 (ignore depth except 0 → `[]`)
- `expand_query(text) -> str` dense: original + natural labels + max 3 category display names
- `skill_quote(clean: str, skill_id: str, *, max_len=160) -> str`
- `allowlist_token(raw: str) -> str | None`
- `taxonomy_version() -> str` sha256 of skills.json + major_group.json + SPECIAL_ALIASES repr, `[:12]`
- `categories_for(skill_id) -> list[str]`
- `SPECIAL_ALIASES` includes c++/cpp, c#, .net, node.js, spring-boot, postgres

- [ ] **Step 1:** Rewrite `test_matching_skills.py` for snake_case, special aliases, sibling related, dense expand (no sibling dump, no `programming_languages` snake_case).
- [ ] **Step 2:** Run tests — expect FAIL (still PascalCase graph).
- [ ] **Step 3:** Implement `skills.py` from `skills.json` + `major_group.json`. Keep `load_skill_graph` unused by extract/coverage/expand/related.
- [ ] **Step 4:** pytest `tests/unit/test_matching_skills.py` PASS.
- [ ] **Step 5:** Skip commit.

---

### Task 2: BM25 tokenizer + Okapi

**Files:**
- Create: `backend/app/services/matching/bm25.py`
- Test: `tests/unit/test_matching_bm25.py`

**Produces:**
- `matching_tokens(text: str, *, drop_stopwords: bool) -> list[str]`
- `bm25_scores(docs: list[str], query: str) -> list[float]` k1=1.5 b=0.75
- `competition_ranks(keys: list) -> list[int]` same key → same rank (1,2,2,4)
- `bm25_document(clean: str, skill_ids: list[str]) -> str`
- `bm25_query(title: str, skill_ids: list[str]) -> str`

- [ ] **Step 1:** Tests: C++/C#/Node.js/Spring-Boot/Postgres tokens; all-zero scores; zero not in ranking ids; query drops `experience`/`team`.
- [ ] **Step 2:** FAIL (module missing).
- [ ] **Step 3:** Minimal Okapi + tokenizer (protect aliases, NFD, split `[^a-z0-9_+#.]`).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Skip commit.

---

### Task 3: Constraints propose + partition

**Files:**
- Create: `backend/app/services/matching/constraints.py`
- Test: `tests/unit/test_matching_constraints.py`

**Produces:**
- `SkillConstraints` dict shape `{must:[{any_of:[str]}], preferred:[str], mentioned:[str], excluded:[str]}`
- `propose_skill_constraints(text: str) -> dict` rule-based (no LLM). Fixture Java bắt buộc / Kotlin hoặc Go điểm cộng / team Python.
- `constraint_status(row, constraints, *, confirmed: bool) -> str` ungated|pass|fail|unknown
- `soft_delta(verified: list[str], jd_skills: list[str]) -> float` `0.05 * intersection`
- `partition_rows(rows: list[dict]) -> list[dict]` order pass, unknown, fail; preserve relative order

Unknown when confirmed and (no `skill_records` or ingest not ok or empty clean). Fail never dropped.

- [ ] Tests then implement. Skip commit.

---

### Task 4: Summarize factual + verified merge + ingest graph

**Files:**
- Modify: `backend/app/prompts/system/summarize.txt`
- Modify: `backend/app/services/matching/summarize.py`
- Modify: ingest `clean.py`, `summarize.py`, `embed.py`, `graph.py`, `nodes/__init__.py`, `state.py`
- Modify: `ingest.py` reindex on taxonomy/prompt version mismatch
- Modify: `store.py` persist `clean_markdown`
- Delete usage of extract node from graph (file may remain unused)
- Tests: `test_matching_summarize.py`, `test_matching_graph.py` ingest cases, `test_matching_ingest.py`, `test_matching_clean.py` if needed, `tests/test_agents/test_graph.py`

**Produces:**
- `SUMMARIZE_PROMPT_VERSION = "2026-08-19.v3"`
- `merge_skill_records(clean, llm_skills, summary_body) -> tuple[list[dict], list[str], list[str]]`
- metadata: skills, verified_skills, inferred_skills, skill_records, major_field, sub_field, titles=[], versions, ingest_status
- clean node returns `{markdown, clean_markdown}` both redacted
- embed `markdown + evidence quotes` (max 8)
- LLM prompt contains untrusted-data clause, “kinh nghiệm”, not `Required:`; spy `complete` must not see email fixture

- [ ] Tests first (ingest skills from clean∪summary; cooking dropped; FastAPI on clean is verified; summary-only is inferred). Implement. Update ingest tests: skills include python+fastapi snake_case from blob+body. Skip commit.

---

### Task 5: RRF two-list tie-aware + score_candidates

**Files:**
- Modify: `backend/app/services/matching/rrf.py`
- Modify: `backend/app/agents/matching/nodes/rrf.py`
- Tests: `tests/unit/test_matching_rrf.py`, `test_matching_retrieve.py` `score_candidates`

**Produces:**
- `rrf_fuse` unchanged formula but callers pass already-tied ranks by repeating? Better: `rrf_fuse_ranked(rankings: dict[str, list[tuple[str, int]]])` or pre-expand competition ranks into list where tied docs share rank number.

Lock: `rrf_fuse` gains optional precomputed ranks via `list[tuple[str,int]]` **or** keep `list[str]` and add `rrf_fuse_with_ranks`. Prefer:

```python
def rrf_fuse(rankings: dict[str, list[str]], *, ranks: dict[str, list[int]] | None = None, k=60)
```

If `ranks` omitted, enumerate 1..n (old tests). If provided, use those rank numbers (ties).

`score_candidates(rows, jd_skills, *, constraints=None, confirmed=False, rrf_k=60)`:
- dense list: finite embedding/distance, competition on `distance_expanded`
- bm25 list: score>0, competition on `-bm25_score`
- fuse expanded+bm25, n_lists=2
- ungated: sort `(-rrf_raw, -soft_delta, id)`
- confirmed: assign status, partition
- no skill list in RRF
- `semantic_score = 1 - distance_expanded`
- `skill_score` coverage vs jd_skills using verified if present else skills
- raw_factors fields on row: distance_expanded, bm25_score, constraint_status, soft_delta

Dense miss + BM25 hit must appear in fused list.

- [ ] Tests then implement. Skip commit.

---

### Task 6: retrieve_for_job full pool dual queries

**Files:**
- Modify: `backend/app/services/matching/retrieve.py`
- Modify: `backend/app/agents/state.py`
- Modify: matching `graph.py` retrieve_node to pass `constraints_confirmed`, `skill_constraints`, `jd_query`
- Tests: extend `test_matching_retrieve.py` with fake client if practical; unit-test helpers for query builders in bm25/skills

**Produces:**
- Job select includes `skill_constraints`, `skill_constraints_confirmed_at`
- Submits: no `.limit`
- Load embedding, model, markdown, clean_markdown, metadata
- `dense_query = expand_query(job_query_text(job))`
- `bm25_query = bm25_query(title, must/preferred or extract_skills(requirements))`
- One embed of dense_query; in-process cosine; skip bad/mismatch model → not on dense list, count mismatch
- BM25 on `bm25_document(clean or markdown, verified+inferred)`
- Payload: jd_skills, jd_query, dense_query, bm25_query, skill_constraints, constraints_confirmed, pool_size, pool_truncated=False, dropped_count=0, pool_latency_warn, embedding_mismatch_count, candidates with distances/bm25/verified_skills/skill_records/clean_markdown
- Lazy ingest: skip only if content_hash **and** taxonomy_version **and** summary_prompt_version match
- persist evidence: constraint_status, bm25_score, no requirement to keep distance_original; persist **all** ranked rows; never update submits status

- [ ] Tests then implement. Skip commit.

---

### Task 7: Rerank within groups + chat display slice

**Files:**
- Modify: `backend/app/services/matching/rerank.py`
- Modify: `backend/app/agents/matching/nodes/rerank.py`
- Modify: `backend/app/services/chat_service.py` `chat_response_from_graph`
- Modify: `backend/app/config/models.py` rerank instruct (no age/school prestige)
- Tests: `tests/unit/test_matching_rerank.py`, `test_matching_graph.py`

**Produces:**
- `apply_rerank` reranks a window but **returns full list** (window reordered + tail). `final_k` ignored for dropping (chat slices).
- When confirmed: fill window pass→unknown→fail up to `RERANK_CANDIDATE_K`; rerank each group separately; concat pass+unknown+fail; append unwindowed remainder in group order.
- Rerank doc: summary markdown + matching evidence quotes, strip years/emails.
- Fail cannot outrank pass after this node.
- `chat_response_from_graph` slices `FINAL_CANDIDATE_K`. Graph `respond_node` uses full pool length.
- persist happens on full graph candidates (already in `get_chat_service`).

- [ ] Tests then implement. Skip commit.

---

### Task 8: Migration + eval ablation helpers

**Files:**
- Create: `supabase/migrations/20260819120000_retrieve_v3.sql`
- Modify: `backend/app/services/matching/eval_retrieve.py`
- Modify: `scripts/eval_requirement_retrieve.py` (optional flags `--mode`, default still cosine)
- Test: `tests/unit/test_eval_retrieve.py`

**Produces:**
- Columns: `embedded_resumes.clean_markdown text not null default ''`; `job_posts.skill_constraints jsonb not null default '{}'::jsonb`; `job_posts.skill_constraints_confirmed_at timestamptz`
- `precision_at_k`, `ndcg_at_k` binary, `faithfulness_inferred_rate`, `detect_lang` vi/en heuristic (diacritics / `va|cua|la|khong|kinh|nghiem`)
- Ranker helpers wrapping bm25+rrf for corpus docs `{id, summary, clean}`
- `skill_swap` also replaces `skill.replace("_"," ")`

- [ ] Tests then implement. Skip commit.

---

### Task 9: Wire-up regression sweep

Run:

```
.venv\Scripts\python.exe -m pytest tests/unit/test_matching_skills.py tests/unit/test_matching_bm25.py tests/unit/test_matching_constraints.py tests/unit/test_matching_summarize.py tests/unit/test_matching_ingest.py tests/unit/test_matching_graph.py tests/unit/test_matching_rrf.py tests/unit/test_matching_retrieve.py tests/unit/test_matching_rerank.py tests/unit/test_eval_retrieve.py tests/unit/test_eval_requirement_script.py tests/test_agents/test_graph.py tests/unit/test_matching_parse.py tests/unit/test_matching_clean.py -q
```

Fix remaining callers (`related_skills` PascalCase, seed script ok). Ruff on touched py files.

---

## Spec coverage

Rollout no-go, verified/inferred, three states, rerank invariant, dual sources, tokenizer, split queries, tie-aware RRF, no newest cutoff, eval helpers, PII+untrusted, versioning, migration — each has a task. UI confirm out of scope. Graded 0–3 labels optional skip.

## Self-review

No TBD. Signatures consistent: snake_case ids, `constraints_confirmed`, `skill_records`. Chat slice vs persist split in Task 7.
