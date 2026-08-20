-- Trace columns + atomic write RPC + history read RPC.
-- get_match_run: DISTINCT ON (resume_id) prefers withdrawn_at IS NULL, then latest applied_at.

alter table public.match_resume
  add column if not exists requested_by uuid references public.profiles (id) on delete set null,
  add column if not exists query_text text,
  add column if not exists rerank_mode text,
  add column if not exists rerank_status text,
  add column if not exists rerank_model text,
  add column if not exists rerank_config_version text,
  add column if not exists recruiter_message text;

alter table public.match_evidence
  add column if not exists rrf_score numeric,
  add column if not exists rerank_score numeric,
  add column if not exists rrf_rank integer;

create or replace function public.insert_match_resume_run (
  p_job_post_id uuid,
  p_requested_by uuid,
  p_query_text text,
  p_recruiter_message text,
  p_rerank_mode text,
  p_rerank_status text,
  p_rerank_model text,
  p_rerank_config_version text,
  p_embedding_model text,
  p_matched_resume_ids uuid[],
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
  insert into public.match_resume (
    job_post_id,
    requested_by,
    query_text,
    recruiter_message,
    rerank_mode,
    rerank_status,
    rerank_model,
    rerank_config_version,
    embedding_model,
    matched_resume_ids
  ) values (
    p_job_post_id,
    p_requested_by,
    p_query_text,
    p_recruiter_message,
    p_rerank_mode,
    p_rerank_status,
    p_rerank_model,
    p_rerank_config_version,
    p_embedding_model,
    coalesce(p_matched_resume_ids, '{}')
  )
  returning id into run_id;

  for item in
    select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb))
  loop
    idx := idx + 1;
    insert into public.match_evidence (
      match_resume_id,
      resume_id,
      job_post_id,
      rank,
      rrf_rank,
      rrf_score,
      rerank_score,
      skill_score,
      semantic_score,
      matched_skill_names,
      related_skill_names,
      raw_factors
    ) values (
      run_id,
      (item->>'resume_id')::uuid,
      p_job_post_id,
      coalesce((item->>'rank')::int, idx),
      (item->>'rrf_rank')::int,
      (item->>'rrf_score')::numeric,
      case
        when item->'rerank_score' is null or item->'rerank_score' = 'null'::jsonb then null
        else (item->>'rerank_score')::numeric
      end,
      (item->>'skill_score')::numeric,
      (item->>'semantic_score')::numeric,
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

revoke all on function public.insert_match_resume_run(
  uuid, uuid, text, text, text, text, text, text, text, uuid[], jsonb
) from public, anon, authenticated;
grant execute on function public.insert_match_resume_run(
  uuid, uuid, text, text, text, text, text, text, text, uuid[], jsonb
) to service_role;

create or replace function public.get_match_run (p_run_id uuid)
returns table (
  match_resume_id uuid,
  created_at timestamptz,
  recruiter_message text,
  rerank_mode text,
  rerank_status text,
  rerank_model text,
  rank integer,
  rrf_rank integer,
  rrf_score numeric,
  rerank_score numeric,
  resume_id uuid,
  application_id uuid,
  applicant_user_id uuid,
  full_name text,
  email text,
  resume_title text,
  resume_storage_path text,
  current_status text
)
language sql
stable
security invoker
set search_path = public
as $$
  with run as (
    select * from public.match_resume where id = p_run_id
  ),
  picked as (
    select distinct on (e.resume_id)
      e.match_resume_id,
      e.rank,
      e.rrf_rank,
      e.rrf_score,
      e.rerank_score,
      e.resume_id,
      s.id as application_id,
      s.applicant_user_id,
      s.resume_title_snapshot as resume_title,
      s.resume_storage_path_snapshot as resume_storage_path,
      s.current_status,
      p.full_name,
      p.email
    from public.match_evidence e
    inner join run r on r.id = e.match_resume_id
    inner join public.job_submits s
      on s.resume_id = e.resume_id
     and s.job_post_id = e.job_post_id
    left join public.profiles p on p.id = s.applicant_user_id
    order by
      e.resume_id,
      (s.withdrawn_at is null) desc,
      s.applied_at desc
  )
  select
    pck.match_resume_id,
    r.created_at,
    r.recruiter_message,
    r.rerank_mode,
    r.rerank_status,
    r.rerank_model,
    pck.rank,
    pck.rrf_rank,
    pck.rrf_score,
    pck.rerank_score,
    pck.resume_id,
    pck.application_id,
    pck.applicant_user_id,
    pck.full_name,
    pck.email,
    pck.resume_title,
    pck.resume_storage_path,
    pck.current_status
  from picked pck
  inner join run r on r.id = pck.match_resume_id
  order by pck.rank;
$$;

revoke all on function public.get_match_run(uuid) from public, anon;
grant execute on function public.get_match_run(uuid) to authenticated, service_role;
