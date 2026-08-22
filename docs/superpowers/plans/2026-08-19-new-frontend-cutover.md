# New Frontend Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. User approved inline execution in this session. Do not commit unless the user asks.

**Goal:** Wire `new_frontend/` to the existing Supabase/FastAPI client stack and switch local `dev.ps1` to it.

**Architecture:** Copy proven `frontend/src` client modules; keep new UI pages; replace mock `AppContext` with Auth + Profile + Theme.

**Tech Stack:** React 19, Vite, Tailwind 4, Supabase JS, FastAPI `/api/v1`.

## Global Constraints

- Do not delete `frontend/`.
- Do not invent new matching APIs.
- Port 3000, `envPrefix` `VITE_` + `NEXT_PUBLIC_`.
- Protected redirect is `/login`.

---

### Task 1: Shared client + Vite

Copy `types.ts`, `lib/`, `auth/`, `profile/`, CV components, `ProtectedRoute`, `RoleRoute`, `BatchLineForm` from `frontend/src`. Add `@supabase/supabase-js`, `@dnd-kit/*`, `html2canvas`, `jspdf`. Vite: port 3000, envPrefix. `.env.example`. ThemeProvider. App providers + aliases.

### Task 2: Public + auth pages

Login/register → Supabase. Home + job list + job detail → `job_posts` / `saved_jobs` / `job_submits`. JobCard uses `JobPost`.

### Task 3: Candidate pages

Profile (`profiles` + `profile_lines`), CV vault (storage + ingest), CV builder (`CvBuilderContainer`), applications (withdraw stage), `/ai-suggestions` → `POST /chat`.

### Task 4: Recruiter/admin

Dashboard create/status/stages, `/ai-candidates` with `job_id` + rerank, recruiter register forms, admin review API.

### Task 5: Cutover + smoke

`dev.ps1` + README use `new_frontend`. Typecheck. Browser: register, login, post job, both suggestion chats.
