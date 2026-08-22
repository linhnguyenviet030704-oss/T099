# New frontend cutover

## Goal

Run the Figma Make UI in `new_frontend/` against the real Supabase + FastAPI stack that `frontend/` already uses. Old `frontend/` stays on disk until smoke tests pass. Then `dev.ps1` and README point at `new_frontend` on port 3000.

## Non-goals

- Rewriting matching, ingest, RLS, or CV export pipelines.
- Deleting `frontend/` in this change.
- Replacing mock `AppContext` with an adapter over mismatched schemas.

## Approach

Copy working client modules from `frontend/src` into `new_frontend/src` (`lib/`, `auth/`, `profile/`, `types.ts`, CV builder, `ProtectedRoute`, `RoleRoute`). Keep new page shells and Navbar. Pages call Supabase / `POST /api/v1/chat` the same way the old pages do.

`AppContext` mock is removed. Dark mode lives in a small `ThemeProvider`. `LangProvider` stays.

## Routes

Canonical new paths plus aliases so old bookmarks still work:

| Canonical | Alias |
|-----------|--------|
| `/login` | `/auth/sign-in` |
| `/register` | `/auth/sign-up` |
| `/ai-suggestions` | `/match`, `/match_job` |
| `/ai-candidates` | `/match_candidates` |
| `/dashboard` | `/recruiter/jobs` |
| `/cv-vault` | `/profile/resumes` |
| `/applications` | `/my-applications` |
| `/recruiter-register` | `/recruiter/request` |
| `/admin` | `/admin/recruiter-requests` |

Job detail accepts `/jobs/:id` (and `:jobId` via the same param).

## AuthZ

- Unauthenticated protected pages → `/login`.
- Recruiter/admin pages use `RoleRoute` on `profiles.role`.
- Login/register use Supabase Auth (`signInWithPassword` / `signUp`), not in-memory users.
- Demo chips on login fill seed emails (`candidate@example.com`, `recruiter@example.com`, `admin@example.com`) and `password123`.

## Data mapping

Use DB enums, not mock ones: job `published` (not `active`), employment `full_time` (not `full-time`), application `pending`/`screening` (not `submitted`/`reviewing`).

## Verification

Browser: register, login, recruiter post job, candidate job-suggest chat, recruiter candidate-suggest chat.

## Out of scope after cutover

Removing `frontend/`, Figma Make kit plugins, i18n completeness of every string.
