-- =============================================================================
-- Migration: Candidate Violation Penalty
-- Purpose: Penalize candidate khi withdraw/no-show interview
-- =============================================================================

-- Trigger: Penalty khi candidate withdraw sau khi đã interview/offer
create or replace function public.penalize_candidate_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_job_title text;
begin
  -- Chỉ penalize nếu withdraw từ interview/offer
  if new.current_status = 'withdrawn'
     and old.current_status in ('interview', 'offer') then

    -- Lấy job title
    select title into v_job_title
    from public.job_posts
    where id = new.job_post_id;

    -- Trừ 10 điểm
    v_result := public.adjust_reputation(
      p_user_id := new.applicant_user_id,
      p_role := 'candidate',
      p_points_delta := -10,
      p_reason := 'interview_withdrawal',
      p_application_id := new.id,
      p_job_post_id := new.job_post_id,
      p_idempotency_key := format('candidate_interview_withdrawal:%s', new.id)
    );

    -- Notify candidate
    perform public.create_notification(
      p_user_id := new.applicant_user_id,
      p_type := 'reputation_decreased',
      p_title := 'Điểm uy tín bị giảm',
      p_message := format(
        'Bạn bị trừ 10 điểm uy tín do rút đơn ứng tuyển "%s" sau khi đã được mời phỏng vấn/nhận offer. Điểm hiện tại: %s',
        v_job_title,
        v_result->>'new_score'
      ),
      p_link_url := '/profile/reputation',
      p_metadata := jsonb_build_object(
        'reason', 'interview_withdrawal',
        'points_deducted', 10,
        'application_id', new.id
      ),
      p_idempotency_key := format('reputation_decreased:candidate_withdrawal:%s', new.id)
    );
  end if;

  return new;
end;
$$;

create trigger applications_penalize_candidate_withdrawal
  after update on public.job_submits
  for each row execute function public.penalize_candidate_withdrawal();

-- Function: Auto-penalize candidate no-show (chạy sau interview)
create or replace function public.penalize_interview_no_show(
  p_interview_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation record;
  v_result jsonb;
  v_job_title text;
begin
  -- Lấy invitation info
  select ii.*, a.applicant_user_id, a.job_post_id
  into v_invitation
  from public.interview_invitations ii
  join public.job_submits a on a.id = ii.application_id
  where ii.id = p_interview_invitation_id;

  if not found then
    raise exception 'Interview invitation % not found', p_interview_invitation_id;
  end if;

  -- Chỉ penalize nếu status = no_show
  if v_invitation.status <> 'no_show' then
    return jsonb_build_object('success', false, 'reason', 'not_no_show');
  end if;

  -- Lấy job title
  select title into v_job_title
  from public.job_posts
  where id = v_invitation.job_post_id;

  -- Trừ 15 điểm (nặng hơn withdrawal)
  v_result := public.adjust_reputation(
    p_user_id := v_invitation.applicant_user_id,
    p_role := 'candidate',
    p_points_delta := -15,
    p_reason := 'interview_no_show',
    p_application_id := v_invitation.application_id,
    p_job_post_id := v_invitation.job_post_id,
    p_interview_invitation_id := p_interview_invitation_id,
    p_idempotency_key := format('candidate_no_show:%s', p_interview_invitation_id)
  );

  -- Notify candidate
  perform public.create_notification(
    p_user_id := v_invitation.applicant_user_id,
    p_type := 'reputation_decreased',
    p_title := 'Điểm uy tín bị giảm nghiêm trọng',
    p_message := format(
      'Bạn bị trừ 15 điểm uy tín do không tham gia phỏng vấn cho vị trí "%s". Điểm hiện tại: %s',
      v_job_title,
      v_result->>'new_score'
    ),
    p_link_url := '/profile/reputation',
    p_metadata := jsonb_build_object(
      'reason', 'interview_no_show',
      'points_deducted', 15,
      'interview_invitation_id', p_interview_invitation_id
    ),
    p_idempotency_key := format('reputation_decreased:no_show:%s', p_interview_invitation_id)
  );

  return v_result;
end;
$$;

revoke execute on function public.penalize_interview_no_show(uuid) from public, authenticated;
grant execute on function public.penalize_interview_no_show(uuid) to service_role;
