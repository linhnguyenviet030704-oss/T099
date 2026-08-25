-- Audit table for candidate->job recommendations
-- Mirrors match_resume structure for analytics/observability

create table if not exists public.recommend_job (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  candidate_message text,
  rerank_mode text,
  rerank_status text,
  rerank_model text,
  rerank_config_version text,
  embedding_model text,
  pool_size integer not null default 0,
  matched_job_ids uuid[] not null default '{}',
  cv_id uuid references public.resumes(id) on delete set null
);

-- Evidence table for per-job ranking details
create table if not exists public.recommend_job_evidence (
  id uuid primary key default gen_random_uuid(),
  recommend_job_id uuid not null references public.recommend_job(id) on delete cascade,
  job_post_id uuid not null references public.job_posts(id) on delete cascade,
  rank integer not null,
  rrf_score numeric,
  rerank_score numeric,
  semantic_score numeric,
  bm25_score numeric,
  matched_skill_names text[] not null default '{}',
  related_skill_names text[] not null default '{}',
  raw_factors jsonb not null default '{}'
);

alter table public.recommend_job enable row level security;
grant all on public.recommend_job to service_role;

alter table public.recommend_job_evidence enable row level security;
grant all on public.recommend_job_evidence to service_role;

-- Indexes for efficient queries
create index if not exists idx_recommend_job_user_id on public.recommend_job(user_id);
create index if not exists idx_recommend_job_created_at on public.recommend_job(created_at desc);
create index if not exists idx_recommend_job_evidence_run_id on public.recommend_job_evidence(recommend_job_id);
create index if not exists idx_recommend_job_evidence_job_id on public.recommend_job_evidence(job_post_id);

-- RPC to insert a recommend_job run with evidence
create or replace function public.insert_recommend_job_run (
  p_user_id uuid,
  p_candidate_message text,
  p_rerank_mode text,
  p_rerank_status text,
  p_rerank_model text,
  p_rerank_config_version text,
  p_embedding_model text,
  p_pool_size integer,
  p_matched_job_ids uuid[],
  p_cv_id uuid,
  p_evidence jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  run_id uuid;
  item jsonb;
  idx int := 0;
begin
  insert into public.recommend_job (
    user_id,
    candidate_message,
    rerank_mode,
    rerank_status,
    rerank_model,
    rerank_config_version,
    embedding_model,
    pool_size,
    matched_job_ids,
    cv_id
  ) values (
    p_user_id,
    p_candidate_message,
    p_rerank_mode,
    p_rerank_status,
    p_rerank_model,
    p_rerank_config_version,
    p_embedding_model,
    coalesce(p_pool_size, 0),
    coalesce(p_matched_job_ids, '{}'),
    p_cv_id
  )
  returning id into run_id;

  for item in
    select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb))
  loop
    idx := idx + 1;
    insert into public.recommend_job_evidence (
      recommend_job_id,
      job_post_id,
      rank,
      rrf_score,
      rerank_score,
      semantic_score,
      bm25_score,
      matched_skill_names,
      related_skill_names,
      raw_factors
    ) values (
      run_id,
      (item->>'job_id')::uuid,
      coalesce((item->>'rank')::int, idx),
      (item->>'rrf_score')::numeric,
      case
        when item->'rerank_score' is null or item->'rerank_score' = 'null'::jsonb then null
        else (item->>'rerank_score')::numeric
      end,
      (item->>'semantic_score')::numeric,
      (item->>'bm25_score')::numeric,
      coalesce(
        array(select jsonb_array_elements_text(coalesce(item->'matched_skill_names', '[]'::jsonb))),
        '{}'
      ),
      coalesce(
        array(select jsonb_array_elements_text(coalesce(item->'related_skill_names', '[]'::jsonb))),
        '{}'
      ),
      coalesce(item->'raw_factors', '{}'::jsonb)
    );
  end loop;

  return run_id;
end;
$$;

revoke all on function public.insert_recommend_job_run(
  uuid, text, text, text, text, text, text, integer, uuid[], uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.insert_recommend_job_run(
  uuid, text, text, text, text, text, text, integer, uuid[], uuid, jsonb
) to service_role;

-- Function to get recommend_job run with job details
create or replace function public.get_recommend_job_run (p_run_id uuid)
returns table (
  recommend_job_id uuid,
  created_at timestamptz,
  candidate_message text,
  rerank_mode text,
  rerank_status text,
  pool_size integer,
  job_id uuid,
  job_title text,
  company_name text,
  rank integer,
  rrf_score numeric,
  rerank_score numeric,
  semantic_score numeric,
  bm25_score numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.id as recommend_job_id,
    r.created_at,
    r.candidate_message,
    r.rerank_mode,
    r.rerank_status,
    r.pool_size,
    e.job_post_id as job_id,
    j.title as job_title,
    c.name as company_name,
    e.rank,
    e.rrf_score,
    e.rerank_score,
    e.semantic_score,
    e.bm25_score
  from public.recommend_job r
  inner join public.recommend_job_evidence e on e.recommend_job_id = r.id
  left join public.job_posts j on j.id = e.job_post_id
  left join public.companies c on c.id = j.company_id
  where r.id = p_run_id
  order by e.rank;
$$;

revoke all on function public.get_recommend_job_run(uuid) from public, anon;
grant execute on function public.get_recommend_job_run(uuid) to authenticated, service_role;
