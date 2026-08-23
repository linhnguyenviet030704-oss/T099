-- pgvector + parsed CV markdown + 1 embedding / resume (HNSW cosine).

create extension if not exists vector with schema extensions;

create table public.parsed_resumes (
  resume_id uuid primary key references public.resumes (id) on delete cascade,
  markdown text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  content_hash text not null,
  parsed_at timestamptz not null default now()
);

alter table public.parsed_resumes enable row level security;
grant all on public.parsed_resumes to service_role;

create table public.resume_embeddings (
  resume_id uuid primary key references public.resumes (id) on delete cascade,
  embedding extensions.vector(384) not null,
  model text not null,
  embedded_at timestamptz not null default now()
);

alter table public.resume_embeddings enable row level security;
grant all on public.resume_embeddings to service_role;

create index resume_embeddings_hnsw
  on public.resume_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_resumes_for_job (
  query_embedding extensions.vector(384),
  p_job_id uuid,
  match_count int default 50
)
returns table (
  resume_id uuid,
  application_id uuid,
  applicant_user_id uuid,
  distance float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    e.resume_id,
    a.id as application_id,
    a.applicant_user_id,
    (e.embedding <=> query_embedding)::float as distance
  from public.resume_embeddings e
  inner join public.applications a
    on a.resume_id = e.resume_id
  where a.job_post_id = p_job_id
    and a.withdrawn_at is null
  order by e.embedding <=> query_embedding
  limit least(match_count, 50);
$$;

revoke all on function public.match_resumes_for_job(extensions.vector, uuid, int) from public, anon, authenticated;
grant execute on function public.match_resumes_for_job(extensions.vector, uuid, int) to service_role;
