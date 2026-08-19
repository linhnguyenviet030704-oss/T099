-- Dual retrieve v3: store clean CV text; optional recruiter-confirmed skill constraints.
-- Matching still never updates job_submits.current_status.

alter table public.embedded_resumes
  add column if not exists clean_markdown text not null default '';

alter table public.job_posts
  add column if not exists skill_constraints jsonb not null default '{}'::jsonb,
  add column if not exists skill_constraints_confirmed_at timestamptz;
