# Job Match Chat Implementation Plan

> **For agentic workers:** Execute inline in this session (user approved design + “làm”). Do not commit unless the user asks.

**Goal:** Trang `/match` gọi `POST /api/v1/chat`; backend trả job published với score giả qua `mock_recommend`.

**Architecture:** Extend `ChatResponse.jobs`. `ChatService` injects Supabase client, fetches published jobs, maps through `mock_recommend`. Frontend is one protected page + nav link.

**Tech Stack:** FastAPI, Pydantic, pytest, React + Vite + TypeScript, existing `apiJson`.

## Global Constraints

- No new npm/pip dependencies.
- No LangGraph / LLM in this slice.
- Mock ignores chat message text.
- Limit 5 jobs; scores `(0.95, 0.88, 0.81, 0.74, 0.67)`.
- Do not commit unless asked.

## Files

- Create: `backend/app/services/recommend.py`
- Create: `tests/unit/test_recommend.py`
- Create: `tests/unit/test_chat_service.py`
- Create: `frontend/src/pages/MatchPage.tsx`
- Modify: `backend/app/schemas/chat.py`
- Modify: `backend/app/services/chat_service.py`
- Modify: `backend/app/dependencies/services.py`
- Modify: `tests/api/test_profiles.py` (chat jobs API)
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AppShell.tsx`

---

### Task 1: `mock_recommend`

**Files:**
- Create: `tests/unit/test_recommend.py`
- Create: `backend/app/services/recommend.py`
- Modify: `backend/app/schemas/chat.py`

**Produces:** `RecommendedJob`, `MOCK_SCORES`, `mock_recommend(rows: list[dict]) -> list[RecommendedJob]`

- [ ] Write failing unit tests for scores, company join, empty rows
- [ ] Implement schema + `mock_recommend`
- [ ] Verify tests pass

---

### Task 2: `ChatService` + API

**Files:**
- Create: `tests/unit/test_chat_service.py`
- Modify: `backend/app/services/chat_service.py`
- Modify: `backend/app/dependencies/services.py`
- Modify: `backend/app/services/recommend.py` (`list_published_jobs`)
- Modify: `tests/api/test_profiles.py`

**Produces:** `ChatService(client).chat()` returns `ChatResponse` with `jobs`; 502 on fetch failure

- [ ] Failing tests for empty / jobs / 502
- [ ] Implement fetch + ChatService wiring
- [ ] API test with dependency override
- [ ] Verify pytest

---

### Task 3: Frontend `/match`

**Files:**
- Create: `frontend/src/pages/MatchPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AppShell.tsx`

- [ ] Protected route + nav
- [ ] Hybrid chat UI calling `/chat`
- [ ] `npm run lint` in frontend
