-- CV->JD recommend: cache job-post embeddings the same way embedded_resumes
-- caches resume embeddings, so a candidate's chat request costs exactly one
-- live embedding call (their CV) instead of re-embedding every published job.

create table public.embedded_jobs (
  job_post_id uuid primary key references public.job_posts (id) on delete cascade,
  embedding extensions.vector(1536) not null,
  model text not null,
  skills jsonb not null default '[]'::jsonb,
  content_hash text not null,
  embedded_at timestamptz not null default now()
);

alter table public.embedded_jobs enable row level security;
grant all on public.embedded_jobs to service_role;
