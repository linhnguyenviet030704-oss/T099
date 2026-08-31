-- =============================================================================
-- Migration: Auto-Reject Expired Applications (SAFE)
-- Purpose: Auto-reject + penalize recruiter với concurrency safety
-- =============================================================================

create or replace function public.auto_reject_expired_applications(
  p_batch_size integer default 100
)
returns table(
  application_id uuid,
  job_post_id uuid,
  recruiter_user_id uuid,
  expired_at timestamptz,
  new_reputation integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app record;
  v_updated_count int;
  v_result jsonb;
begin
  -- Advisory lock để tránh multiple cron chạy song song
  if not pg_try_advisory_xact_lock(hashtext('auto_reject_expired_applications')) then
    raise notice 'Another instance is running, skipping';
    return;
  end if;

  -- Query applications cần reject
  for v_app in
    select
      a.id,
      a.job_post_id,
      a.applicant_user_id,
      a.response_deadline_at,
      j.created_by_user_id as recruiter_user_id,
      j.title as job_title
    from public.job_submits a
    join public.job_posts j on j.id = a.job_post_id
    where a.current_status = 'pending'
      and a.response_deadline_at < now()
    order by a.response_deadline_at
    limit p_batch_size
    for update of a skip locked
  loop
    -- Conditional update (double-check status hasn't changed)
    update public.job_submits
    set
      current_status = 'rejected',
      reviewed_at = now(),
      updated_at = now(),
      response_deadline_at = null
    where id = v_app.id
      and current_status = 'pending'
      and response_deadline_at < now();

    get diagnostics v_updated_count = row_count;

    -- Nếu không update được (status đã thay đổi), skip
    if v_updated_count = 0 then
      continue;
    end if;

    -- Trừ điểm recruiter (idempotent)
    v_result := public.adjust_reputation(
      p_user_id := v_app.recruiter_user_id,
      p_role := 'recruiter',
      p_points_delta := -5,
      p_reason := 'recruiter_timeout',
      p_application_id := v_app.id,
      p_job_post_id := v_app.job_post_id,
      p_idempotency_key := format('recruiter_timeout:%s', v_app.id)
    );

    -- Notify candidate (idempotent)
    perform public.create_notification(
      p_user_id := v_app.applicant_user_id,
      p_type := 'application_auto_rejected',
      p_title := 'Đơn ứng tuyển không được phản hồi',
      p_message := format(
        'Đơn ứng tuyển "%s" của bạn đã được tự động từ chối do nhà tuyển dụng không phản hồi trong thời gian quy định',
        v_app.job_title
      ),
      p_link_url := format('/applications/%s', v_app.id),
      p_metadata := jsonb_build_object('application_id', v_app.id),
      p_idempotency_key := format('application_auto_rejected:%s', v_app.id)
    );

    -- Notify recruiter bị trừ điểm (idempotent)
    perform public.create_notification(
      p_user_id := v_app.recruiter_user_id,
      p_type := 'reputation_decreased',
      p_title := 'Điểm uy tín bị giảm',
      p_message := format(
        'Bạn bị trừ 5 điểm uy tín do không phản hồi CV cho vị trí "%s" trong thời gian quy định. Điểm hiện tại: %s',
        v_app.job_title,
        v_result->>'new_score'
      ),
      p_link_url := '/profile/reputation',
      p_metadata := jsonb_build_object(
        'reason', 'timeout_response',
        'points_deducted', 5,
        'application_id', v_app.id
      ),
      p_idempotency_key := format('reputation_decreased:recruiter_timeout:%s', v_app.id)
    );

    -- Return result
    application_id := v_app.id;
    job_post_id := v_app.job_post_id;
    recruiter_user_id := v_app.recruiter_user_id;
    expired_at := v_app.response_deadline_at;
    new_reputation := (v_result->>'new_score')::integer;
    return next;
  end loop;
end;
$$;

-- Chỉ service_role được gọi
revoke execute on function public.auto_reject_expired_applications(integer) from public, authenticated;
grant execute on function public.auto_reject_expired_applications(integer) to service_role;

comment on function public.auto_reject_expired_applications is
  'Auto-reject applications quá hạn. Chạy bởi cron. Có advisory lock và idempotency.';
