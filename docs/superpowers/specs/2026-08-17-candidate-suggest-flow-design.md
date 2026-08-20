# Candidate suggest flow (ingest + retrieve + rerank + trace)

## Goal

Hoàn thiện gợi ý ứng viên cho recruiter: CV vừa lưu thì được parse → clean → LLM summary → embed vào pgvector (`embedded_resumes.resume_id`); recruiter chọn job thì requirements thành query retrieve, RRF shortlist rồi rerank bằng JD; PII không vào embedding; mỗi lần gợi ý ghi atomic và xem lại được trên `/match_candidates`.

Supersedes `2026-08-13-matching-agent-graph-design.md` on recruiter matching: LLM/cross-encoder rerank is now in scope. Candidate `/match_job` stays `mock_recommend`.

## Review changelog (2026-08-17)

P0: atomic trace RPC; tách `rrf_score` / `rerank_score` / `rerank_status`; truncate doc rerank bằng margin an toàn (không coi 12k chars = 4k tokens).
P1: `get_match_run` RPC cho history; UI tách “đã lưu” vs “index thất bại”.
P2: `RETRIEVE_CANDIDATE_K` / `RERANK_CANDIDATE_K` / `FINAL_CANDIDATE_K`; trace `rerank_model` + `rerank_config_version`.

## Decisions (locked)

- Approach: extend existing LangGraphs. No new orchestrator, no ingest queue.
- Pipeline: `retrieve → skill → rrf → top RERANK_CANDIDATE_K → rerank → slice FINAL_CANDIDATE_K → respond → atomic trace`.
- Ingest triggers: save CV (upload + CV builder export), apply, lazy retrieve if still missing. Still **await** ingest so the UI knows the outcome; save/apply success is **not** gated on ingest (see §1).
- Retrieve query and rerank query are the same string: `job_query_text` = `requirements` stripped, else `title + description`.
- Recruiter `message` is stored for trace/history, not used as the embedding/rerank query.
- `POST /chat` body: `{ message, job_id, rerank: "qwen" | "agent" }`. Default `rerank=qwen`. Ignored when `job_id` is null.
- `qwen`: DashScope `qwen3-rerank`. `agent`: mock, keeps RRF order, no rerank HTTP (CV-eval skill not implemented).
- Scores are never mixed across scales. API/trace expose `rrf_score` and `rerank_score` separately. Frontend picks which to show.
- Qwen rerank HTTP error: fallback to RRF order, `rerank_status=fallback`, `rerank_score=null`. Chat is not 502.
- Trace persist is one DB transaction (RPC). If it fails: log, still return candidates, no partial run.
- History: list from `match_resume`; detail via `get_match_run(run_id)`. Click injects a reconstructed user+assistant turn (no second `POST /chat`). No FastAPI history route.
- 1 vector per resume, FK `embedded_resumes.resume_id`. Do not embed JD into pgvector.
- Embedding model unchanged: `qwen3.7-text-embedding` 1536-d.

## Out of scope

- Recommend jobs for candidates (still mock).
- Real agent + CV-evaluation skill (interface + mock only).
- Streaming chat, parse/embed JD into the vector table.
- Ingest worker/queue, webhook/DB trigger ingest.
- FastAPI history REST API.
- Rolling back a stored CV if ingest fails.
- New tokenizer dependency.

---

## 1. Ingest

Existing graph stays: `parse → clean → summarize → extract → embed`.

PII: `parse_resume_bytes` already redacts; `summarize_node` redacts the LLM `body` again before embed. Embed the redacted summary markdown, not raw CV bytes. Tests `test_ingest_does_not_embed_pii_even_if_llm_echoes_it` remain the contract.

Store: upsert `embedded_resumes` keyed by `resume_id`. Skip when `content_hash` matches.

### When

1. **Upload** (`ResumesPage`): after `resumes` insert succeeds, await `POST /resumes/{id}/ingest`.
2. **Export builder** (`CvBuilderContainer` after `exportCv`): same await ingest. `exportCv` stays storage+row only.
3. **Apply** (`JobDetailPage`): after `job_submits` insert, await ingest (usually `exists`).
4. **Retrieve**: keep `try_ingest_resume` per submitted resume.

Buttons stay disabled while ingest is in flight (existing uploading/submitting flags).

### Split UI status (P1)

Await ingest only to learn the outcome. Persistence of the CV/application is already done before that call.

| Outcome | UI |
|---|---|
| Row/file saved, ingest `indexed` or `exists` | Success for save/apply. |
| Row/file saved, ingest HTTP/error | Success for save/apply **plus** warning: “Index CV thất bại — hệ thống sẽ thử lại khi matching.” Apply copy: “Đã nộp đơn.” then the same warning. |
| Row/file insert itself failed | Error; nothing to index. |

Do not delete the resume or application on ingest failure. No dedicated retry button; retrieve retries.

---

## 2. Matching + rerank

### K (P2)

Constants in `backend/app/config/models.py` (not magic numbers in graph/UI):

```text
RETRIEVE_CANDIDATE_K = 50   # RPC match_count / submit cap (already 50)
RERANK_CANDIDATE_K  = 10   # RRF rows sent to the reranker
FINAL_CANDIDATE_K   = 10   # rows in the chat response
```

Invariant: `FINAL_CANDIDATE_K <= RERANK_CANDIDATE_K <= RETRIEVE_CANDIDATE_K`. Today rerank/final are both 10. Later we can try retrieve 50 → RRF 20 → rerank 20 → return 10 without changing the graph shape.

After RRF, take `RERANK_CANDIDATE_K`. After rerank (or fallback), slice `FINAL_CANDIDATE_K`. Rows past those cuts are not returned.

### Retrieve

- Pool: `job_submits` for `job_id`, `withdrawn_at IS NULL`.
- Query text: `job_query_text(job)` → also `state["jd_query"]`.
- Embed original + skill-expanded → RPC `match_resumes_for_job` (`RETRIEVE_CANDIDATE_K`).
- Candidate payload includes `resume_id`, distances, skills, and **`markdown`** (PII-stripped) for rerank. Markdown must not appear on `ChatResponse`. Recruiter `message` stays on `state["query"]` for persist only.

### Graph

```text
retrieve → skill → rrf → rerank → respond
```

RRF still fuses original / expanded / skill (`rrf_score`, `rrf_rank`). It never overwrites a rerank field.

### Rerank node

Documents: candidate `markdown`, empty → `" "`.

**Truncation (P0):** no tokenizer is in the repo; do not add one. Do **not** treat 12_000 characters as 4_000 tokens (Vietnamese/Unicode/CV bullets blow that heuristic). Truncate with a conservative char budget:

```text
RERANK_DOC_MAX_CHARS = 2000
```

`ponytail:` ceiling is “safer than 12k”, not token-accurate. Upgrade: count tokens with a real tokenizer (tiktoken/DashScope) before raising the budget. Query (`jd_query`) uses the same helper.

Instruct (qwen): `Rank candidate resumes by how well they match this job's requirements.`

**qwen:** `rerank_query` → `POST {rerank_base}/reranks`, same `QWEN_API_KEY`. Rerank base is **not** `compatible-mode`:

- Chat/embed: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- Rerank: `https://dashscope-intl.aliyuncs.com/compatible-api/v1`

Model constant: `DEFAULT_RERANK_MODEL = "qwen3-rerank"`. Map `results[].index` + `relevance_score`. Reorder by `relevance_score` desc. Set `rerank_score = relevance_score`, `rerank_status = "success"`. Leave `rrf_score` / `rrf_rank` untouched.

**agent (mock):** keep RRF order. `rerank_score = null`, `rerank_status = "not_requested"`. No HTTP. `ponytail:` replace with CV-eval skill later; that skill must write its own field, never into `rrf_score` or qwen `rerank_score` without a new `score_type`.

**qwen HTTP/bad payload:** log, keep RRF order for the rerank window, `rerank_status = "fallback"`, `rerank_score = null`.

`respond`: `Gợi ý N ứng viên phù hợp.` / `Chưa có CV nộp cho vị trí này.`

### Score semantics (P0)

Never assign one `score` from two scales.

| Mode | `rrf_score` | `rerank_score` | `rerank_status` |
|---|---|---|---|
| `qwen` OK | RRF | relevance | `success` |
| `qwen` error | RRF | `null` | `fallback` |
| `agent` mock | RRF | `null` | `not_requested` |

Frontend display: if `rerank_status === "success"` and `rerank_score != null` → show `rerank_score`; else show `rrf_score`. Optional badge when `fallback`.

`RecommendedCandidate` **drops** the mixed `score` field (jobs mock path keeps `RecommendedJob.score`). Fallback `mock_recommend_candidates` sets `rrf_score` from the fake list, `rerank_score=null`, `rerank_status="not_requested"`.

---

## 3. Trace (P0 atomic)

Extend existing tables. One logical run = `match_resume` + its `match_evidence` rows, written in **one transaction**.

### `match_resume` new columns

- `requested_by uuid` → `profiles(id)`
- `query_text text`
- `rerank_mode text` (`qwen` | `agent`)
- `rerank_status text` (`success` | `fallback` | `not_requested`)
- `rerank_model text` (e.g. `qwen3-rerank`; null when `not_requested`)
- `rerank_config_version text` (constant `RERANK_CONFIG_VERSION`, e.g. `2026-08-17.1`)
- `recruiter_message text`

Keep: `job_post_id`, `matched_resume_ids`, `embedding_model`, `scoring_config_version`, `created_at`.

No `pending|complete` status column: a run is invisible until the RPC commits. Partial inserts cannot appear in history.

### `match_evidence` new columns

- `rrf_score numeric`
- `rerank_score numeric` (nullable)
- `rrf_rank integer`

Do **not** write a mixed value into existing `score`. Leave `score` null on new rows (column stays for old data). `rank` is the **final** order after rerank/slice. Put `rerank_error` only if useful in `raw_factors`; `rerank_status` on the parent is the source of truth.

### Write path: `insert_match_resume_run`

Postgres function, same grant pattern as `match_resumes_for_job`: `public`, `REVOKE` from `anon`/`authenticated`, `GRANT EXECUTE` to `service_role`.

Arguments: job, actor, query_text, recruiter_message, rerank_mode/status/model/config_version, embedding_model, matched_resume_ids, `evidence jsonb` (array of per-resume objects).

Body: `INSERT match_resume` → `INSERT match_evidence` (all rows) → `RETURN` run id. Any error rolls back both.

Backend `persist_match_resume_rows` only calls this RPC. `logger.exception` on failure; chat still 200 (no history row beats a truncated run).

### Read path: `get_match_run` (P1)

`public.get_match_run(p_run_id uuid)` `SECURITY INVOKER` so existing RLS on `match_resume` / `match_evidence` / `job_submits` applies. `GRANT EXECUTE` to `authenticated`.

Returns one row per evidence resume, already joined for the card:

- run: `match_resume_id`, `created_at`, `recruiter_message`, `rerank_mode`, `rerank_status`, `rerank_model`
- evidence: `rank`, `rrf_rank`, `rrf_score`, `rerank_score`, `resume_id`
- submit: `application_id`, `applicant_user_id`, `full_name`, `email`, `resume_title`, `resume_storage_path`, `current_status`

**Latest submit (server-side, not frontend):** for each `resume_id`, pick `job_submits` on `(resume_id, job_post_id)` with `withdrawn_at IS NULL` ordered by `applied_at DESC`, else the latest row including withdrawn. If none, omit that card (`INNER` join after the pick).

Frontend must not re-implement that join.

---

## 4. API / UI

### `POST /api/v1/chat`

```json
{ "message": "...", "job_id": "uuid | null", "rerank": "qwen" }
```

`rerank` optional, default `qwen`, enum `qwen | agent`. AuthZ unchanged.

Candidate object:

```json
{
  "application_id": "...",
  "applicant_user_id": "...",
  "full_name": "...",
  "email": "...",
  "resume_title": "...",
  "resume_storage_path": "...",
  "current_status": "pending",
  "rrf_score": 0.12,
  "rerank_score": 0.91,
  "rerank_status": "success"
}
```

### `/match_candidates`

- Toggle `qwen3-rerank` | `Agent (mock)` next to the composer; send as `rerank`.
- Changing job resets the transcript to the welcome turn and reloads history.
- **History list:** `select` `match_resume` for `job_post_id`, `order created_at desc`, limit 20 (header only: time, mode, status, message snippet).
- **Click a run:** `supabase.rpc('get_match_run', { p_run_id })`. Append two turns (no `POST /chat`, no dedupe):
  1. user: `recruiter_message` or `Gợi ý ứng viên phù hợp`
  2. assistant: `Lịch sử · {created_at}` + `Gợi ý N ứng viên phù hợp.` + cards using the same display-score rule as live results.
- Badge `fallback` when `rerank_status === "fallback"`.

---

## 5. Error handling

| Failure | Behavior |
|---|---|
| Ingest error after row/file exists | Save/apply success + index warning; retrieve may retry |
| Missing embedding at retrieve | `try_ingest_resume`; if still missing, distance 1.0 |
| Qwen rerank error | RRF order for the rerank window, `fallback`, `rerank_score=null` |
| Trace RPC error | Log, return chat payload, no `match_resume` row |
| Empty pool | `candidates=[]`, existing empty copy |

---

## 6. Testing

- `rerank_query` posts to `/reranks` with `qwen3-rerank`; maps `index` / `relevance_score`.
- Truncate helper: string longer than `RERANK_DOC_MAX_CHARS` is cut; 12k input does not pass through whole.
- Rerank node `qwen` success: order by mocked relevance; `rrf_score` unchanged; `rerank_status=success`.
- `agent`: same order as input; `rerank_score is None`; `not_requested`.
- Qwen raise: same order; `fallback`; `rerank_score is None`.
- Persist calls `insert_match_resume_run` once with all evidence (unit: mock client).
- `ChatRequest` default `rerank=qwen`; `RecommendedCandidate` has no mixed `score`.
- Existing ingest PII + hash-skip tests still pass.

No live DashScope. No new frontend test framework. SQL for `get_match_run` latest-submit: one small pytest against the helper SQL or a documented example in the migration comments plus a unit test of any Python wrapper if present.

---

## 7. Files

- `supabase/migrations/*_match_resume_trace.sql` — columns + `insert_match_resume_run` + `get_match_run`.
- `backend/app/config/models.py` — rerank model/base, K constants, `RERANK_DOC_MAX_CHARS`, `RERANK_CONFIG_VERSION`.
- `backend/app/clients/llm.py` — `rerank_query`.
- `backend/app/services/matching/rerank.py` — qwen vs agent, truncate helper.
- `backend/app/agents/matching/nodes/rerank.py` + `graph.py` + `state.py`.
- `backend/app/services/matching/retrieve.py` — markdown; persist via RPC.
- `backend/app/api/schemas/chat.py` + `chat_service.py` + `recommend.py` + `dependencies/services.py`.
- `frontend/.../ResumesPage.tsx`, `JobDetailPage.tsx`, `CvBuilderContainer.tsx` — await ingest, split copy.
- `frontend/.../MatchCandidatesPage.tsx` — toggle, display-score rule, history list + `get_match_run` inject.

## 8. Success criteria

1. Upload/export/apply: row exists even when ingest fails; UI says saved/applied and warns about index, never implies the CV was not stored.
2. `POST /chat` + `rerank=qwen` returns ≤ `FINAL_CANDIDATE_K` candidates; each has `rrf_score`; `rerank_score` only when `rerank_status=success`; `resume_id` is that job’s submit.
3. `rerank=agent`: no rerank HTTP; `rerank_status=not_requested`; `rerank_score=null`.
4. Trace RPC either writes the full run or nothing. History never shows a half-inserted run.
5. History click uses `get_match_run` only (no client-side submit join) and injects turns without a new matching call.
6. Embedding is PII-stripped markdown keyed by `resume_id`.
