-- qwen3-embedding:8b is 4096-d. Existing 384-d vectors cannot be recast.

delete from public.match_evidence;
delete from public.match_resume;
delete from public.embedded_resumes;

drop index if exists public.embedded_resumes_hnsw;

alter table public.embedded_resumes drop column if exists embedding;

alter table public.embedded_resumes
  add column embedding extensions.vector(4096) not null;

create index embedded_resumes_hnsw
  on public.embedded_resumes
  using hnsw (embedding vector_cosine_ops);

drop function if exists public.match_resumes_for_job(extensions.vector, uuid, int);
drop function if exists public.match_resumes_for_job(extensions.vector(384), uuid, int);

create or replace function public.match_resumes_for_job (
  query_embedding extensions.vector(4096),
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
    s.id as application_id,
    s.applicant_user_id,
    (e.embedding <=> query_embedding)::float as distance
  from public.embedded_resumes e
  inner join public.job_submits s
    on s.resume_id = e.resume_id
  where s.job_post_id = p_job_id
    and s.withdrawn_at is null
  order by e.embedding <=> query_embedding
  limit least(match_count, 50);
$$;

revoke all on function public.match_resumes_for_job(extensions.vector, uuid, int) from public, anon, authenticated;
grant execute on function public.match_resumes_for_job(extensions.vector, uuid, int) to service_role;
