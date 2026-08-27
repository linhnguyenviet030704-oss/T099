-- Persist the pool-health trace retrieve_for_job() already computes
-- (pool_size, embedding_mismatch_count, ...) instead of discarding it
-- before it reaches match_resume. See 2026-08-19-summarize-bm25-retrieve-design.md
-- "Theo dõi trace: ... pool_*, embedding_mismatch_count".

alter table public.match_resume
  add column if not exists pool_size integer,
  add column if not exists pool_truncated boolean,
  add column if not exists dropped_count integer,
  add column if not exists pool_latency_warn boolean,
  add column if not exists embedding_mismatch_count integer;

drop function if exists public.insert_match_resume_run(
  uuid, uuid, text, text, text, text, text, text, text, uuid[], jsonb
);

create function public.insert_match_resume_run (
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
  p_evidence jsonb,
  p_pool_size integer,
  p_pool_truncated boolean,
  p_dropped_count integer,
  p_pool_latency_warn boolean,
  p_embedding_mismatch_count integer
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
    matched_resume_ids,
    pool_size,
    pool_truncated,
    dropped_count,
    pool_latency_warn,
    embedding_mismatch_count
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
    coalesce(p_matched_resume_ids, '{}'),
    p_pool_size,
    p_pool_truncated,
    p_dropped_count,
    p_pool_latency_warn,
    p_embedding_mismatch_count
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
  uuid, uuid, text, text, text, text, text, text, text, uuid[], jsonb,
  integer, boolean, integer, boolean, integer
) from public, anon, authenticated;
grant execute on function public.insert_match_resume_run(
  uuid, uuid, text, text, text, text, text, text, text, uuid[], jsonb,
  integer, boolean, integer, boolean, integer
) to service_role;
