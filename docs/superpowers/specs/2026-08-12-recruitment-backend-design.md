# Recruitment Backend Design

## Goal

Build the first backend API for the recruitment portal so the existing frontend can integrate later. The backend provides local email/password JWT auth, role-based recruitment workflows, resume storage, PostgreSQL schema migrations, SQLite-backed tests, a small PostgreSQL integration test path, and seed data.

## Approved Approach

Use a sync SQLAlchemy 2.x FastAPI monolith. This is the smallest shape that covers the behavior, is easy to test, and avoids speculative layers. PostgreSQL is the default runtime database through `DATABASE_URL`; most pytest tests override the database with SQLite, and a marked integration path runs migrations plus core workflows against PostgreSQL.

Skipped alternatives:
- Async SQLAlchemy: more setup without a current need.
- Repository/service layers everywhere: replaceable on paper, too much boilerplate now.

## Architecture

The API lives under `/api` and is split into focused routers for auth, profiles, resumes, jobs, applications, recruiter requests, recruiter workspace, admin, and health. Shared helpers cover database sessions, settings, password hashing, JWT handling, current-user dependencies, role checks, storage paths, and API errors.

FastAPI dependencies provide the replaceable boundaries:
- `DATABASE_URL` selects PostgreSQL in dev/prod or SQLite in tests.
- `STORAGE_ROOT` selects local filesystem storage.
- JWT settings select signing key and token lifetime.

No Supabase dependency is added.

## Data Model

Tables match the requested fields:
- `profiles`
- `companies`
- `company_members`
- `user_profile_lines`
- `resumes`
- `job_posts`
- `saved_jobs`
- `applications`
- `application_stages`
- `recruiter_registration_forms`

Enums are stored as strings. Database constraints and indexes cover:
- unique normalized profile email;
- unique company slug;
- unique lower-case company name for case-insensitive find-or-create;
- unique company membership per `(company_id, user_id)`;
- unique saved jobs per `(user_id, job_post_id)`;
- unique applications per `(job_post_id, applicant_user_id)`;
- one default active resume per user with a partial unique index where `is_default = true` and `deleted_at IS NULL`;
- one pending recruiter request per user with a partial unique index where `status = 'pending'`.

Application code still handles user-friendly workflow errors before commit, but the database is the final guard for uniqueness and race-prone defaults.

Passwords are stored in a small `auth_accounts` table keyed to `profiles.id`. Keeping auth separate from `profiles` avoids adding password columns to the requested profile shape while staying simple.

## API Behavior

Auth:
- `POST /api/auth/signup` creates a candidate profile and auth account.
- `POST /api/auth/signin` returns a bearer JWT.
- `GET /api/auth/me` returns the current profile.
- `POST /api/auth/signout` is a no-op for frontend compatibility.
- Refresh is skipped for now. The frontend must handle token expiry by redirecting to sign-in.

Profiles:
- Users can read and update their own profile.
- Users can CRUD and batch insert/delete their own profile lines.
- Admins can list profiles and update roles.

Resumes:
- Candidates upload PDF, DOC, or DOCX files up to 10 MB.
- Files are saved at `storage/resumes/{user_id}/resumes/{resume_id}/{safe_filename}`.
- `storage_path` is `{user_id}/resumes/{resume_id}/{safe_filename}`.
- First active upload becomes default.
- Users can list, rename, set default, get a 180-second backend download token, and soft-delete unused active resumes.
- Soft-delete is rejected if the resume is used by any application.
- Resume download access is limited to the candidate owner, admins, or active owner/recruiter members of the company for a job application that contains that resume snapshot.

Jobs and saved jobs:
- Public users can list and view published jobs with company data.
- Search and filters use simple query parameters.
- Similar jobs are basic same-company or same-employment-type published jobs.
- Authenticated users can save, unsave, and list saved job IDs/jobs.

Applications:
- Candidates can apply to open published jobs before deadline using their own active resume.
- Duplicate applications are rejected.
- Recruiters cannot apply to their own company job.
- Resume metadata is copied into application snapshot fields.
- Applying creates an initial system `pending` stage.
- Candidates can list their applications with job, company, and stages.
- Candidates can withdraw unless already accepted, rejected, or withdrawn; withdrawal inserts a system `withdrawn` stage and updates `current_status`.

Recruiter requests:
- Candidates can submit or update one pending recruiter registration form.
- Reviewed forms are locked.
- Admins list all forms with requester/reviewer profile info.
- Admin approval creates or finds a company by case-insensitive name, marks it verified, creates an active owner membership, and promotes the requester to recruiter.
- Admin rejection requires `admin_note`.

Recruiter workspace:
- Active owner/recruiter memberships list their companies.
- Active company owner/recruiter members and admins can list company jobs, create jobs, update job status, update company social links, list applications, add allowed application stages, and create signed CV download URLs.
- Only verified companies can publish jobs.
- Published jobs require a future deadline.
- `published_at` and `closed_at` are set automatically.
- Manual `pending` stages are rejected.
- Same-stage transitions are rejected.
- Terminal applications cannot move further. No route flag bypass is added.

Health endpoints are intentionally outside `/api` so container and platform checks stay stable:
- `GET /health`
- `GET /health/db`

## Error Shape

Errors use:

```json
{ "detail": "Human-readable message", "code": "MACHINE_CODE" }
```

Route helpers raise `HTTPException` with that body. Validation errors stay as FastAPI's default 422 response.

Implementation must add a FastAPI exception handler for `HTTPException` so route helpers that set `detail={"detail": "...", "code": "..."}` return that object directly instead of nesting it. Non-dict HTTP details are normalized to `{"detail": str(detail), "code": "HTTP_ERROR"}`.

## Tests

Pytest uses SQLite and temporary local storage for the regular suite. Required tests cover:
- Auth/register/profile creation.
- Candidate cannot access others' private data.
- Resume upload validation and first-default behavior.
- Apply flow snapshots resume and creates pending stage.
- Duplicate apply rejected.
- Candidate withdraw updates `current_status`.
- Recruiter can add stages for own company applications.
- Admin approval provisions company, membership, and recruiter role.
- Published job requires verified company and future deadline.

PostgreSQL integration tests are marked `postgres` and run only when `TEST_DATABASE_URL` is set. They run Alembic migrations against PostgreSQL and verify signup, resume default uniqueness, recruiter approval provisioning, publishing constraints, and application duplicate constraints.

## Dev Commands

The repository uses the existing `.venv/`.

Install dependencies:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Run dev server:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Seed local data:

```powershell
.\.venv\Scripts\python.exe -m backend.seed
```

Run tests:

```powershell
.\.venv\Scripts\python.exe -m pytest tests -v
```

Run PostgreSQL integration tests:

```powershell
$env:TEST_DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/recruitment_test"
.\.venv\Scripts\python.exe -m pytest tests -m postgres -v
```

## Out Of Scope

- Supabase.
- Email delivery and invitation emails.
- Cloud object storage.
- Full-text search service.
- Refresh-token rotation unless the frontend requires it.
