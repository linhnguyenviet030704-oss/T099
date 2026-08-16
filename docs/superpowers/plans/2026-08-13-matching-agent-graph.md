# Matching Agent Graph Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Recruiter matching via fixed LangGraph `retrieve → skill → respond`; CV PDF from Storage bucket `resumes` parsed to Markdown then embedded in pgvector HNSW.

**Architecture:** Backend owns parse/embed/retrieve/skill. Agent nodes call those functions in a fixed order. Candidate job chat stays `mock_recommend`.

**Tech Stack:** FastAPI, LangGraph, Supabase pgvector HNSW, pypdf, fastembed (384-d), pytest.

## Global Constraints

- Branch: `feat/matching-agent-graph` from `feat/webapp`
- No LLM tool-calling
- 1 vector per resume
- Ingest skip when `resume_id` + matching `content_hash` already stored
- Tests must not download embedding models (inject encode)

## Files

- Create: `supabase/migrations/*_resume_embeddings.sql`
- Create: `backend/app/services/matching/*.py`
- Create: `agent/nodes/retrieve.py`, `skill.py`, `respond.py`
- Modify: `agent/graph.py`, `agent/state.py`, `backend/app/services/chat_service.py`, router, frontend apply
- Test: `tests/unit/test_matching_*.py`, update `test_chat_service.py`, `test_graph.py`

### Task 1: Skill scores (pure)

Coverage/Jaccard on taxonomy. No DB.

### Task 2: Parse bytes → markdown + skill metadata

### Task 3: Ingest skip-if-exists + embed inject

### Task 4: Retrieve ranks by cosine among job applications

### Task 5: Graph retrieve → skill → respond

### Task 6: ChatService job_id uses graph; no job_id mock

### Task 7: Migration pgvector + HNSW + RPC

### Task 8: Ingest API + frontend fire-and-forget after apply
