-- =============================================================================
-- Migration: Interview Scheduling Flow
-- Purpose: Cập nhật bảng interview_invitations để hỗ trợ luồng chọn lịch phỏng vấn
-- =============================================================================

-- 1. Bổ sung giá trị 'reschedule_requested' vào enum interview_invitation_status nếu chưa có
do $$
begin
  alter type public.interview_invitation_status add value if not exists 'reschedule_requested';
exception
  when duplicate_object then null;
end $$;

-- 2. Cập nhật bảng interview_invitations
alter table public.interview_invitations
  alter column scheduled_at drop not null;

alter table public.interview_invitations
  add column if not exists proposed_time_slots jsonb not null default '[]'::jsonb,
  add column if not exists candidate_proposed_slots jsonb not null default '[]'::jsonb,
  add column if not exists candidate_response_note text;

comment on column public.interview_invitations.proposed_time_slots is
  'Danh sách các mốc thời gian do Nhà tuyển dụng đề xuất (mảng ISO timestamp)';

comment on column public.interview_invitations.candidate_proposed_slots is
  'Danh sách các mốc thời gian do Ứng viên đề xuất lại nếu không chọn được lịch nào';

comment on column public.interview_invitations.candidate_response_note is
  'Ghi chú hoặc lý do của ứng viên khi đề xuất lịch phỏng vấn mới';

-- 3. Cập nhật trigger set_responded_at
create or replace function public.set_interview_responded_at()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status
     and old.status = 'pending'
     and new.status in ('confirmed', 'declined', 'reschedule_requested')
     and new.responded_at is null then
    new.responded_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 4. Bổ sung RLS policies cho Recruiter trên interview_invitations
create policy "interview_invitations_recruiter_select"
  on public.interview_invitations for select
  to authenticated
  using (
    exists (
      select 1
      from public.job_submits js
      join public.job_posts jp on jp.id = js.job_post_id
      join public.company_members cm on cm.company_id = jp.company_id
      where js.id = interview_invitations.application_id
        and cm.user_id = auth.uid()
        and cm.is_active = true
        and cm.role in ('owner', 'recruiter')
    )
  );

create policy "interview_invitations_recruiter_insert"
  on public.interview_invitations for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.job_submits js
      join public.job_posts jp on jp.id = js.job_post_id
      join public.company_members cm on cm.company_id = jp.company_id
      where js.id = interview_invitations.application_id
        and cm.user_id = auth.uid()
        and cm.is_active = true
        and cm.role in ('owner', 'recruiter')
    )
  );

create policy "interview_invitations_recruiter_update"
  on public.interview_invitations for update
  to authenticated
  using (
    exists (
      select 1
      from public.job_submits js
      join public.job_posts jp on jp.id = js.job_post_id
      join public.company_members cm on cm.company_id = jp.company_id
      where js.id = interview_invitations.application_id
        and cm.user_id = auth.uid()
        and cm.is_active = true
        and cm.role in ('owner', 'recruiter')
    )
  );

-- Cập nhật policy candidate update để cho phép cập nhật mốc thời gian và ghi chú
drop policy if exists "interview_invitations_candidate_update" on public.interview_invitations;

create policy "interview_invitations_candidate_update"
  on public.interview_invitations for update
  to authenticated
  using (
    application_id in (
      select id from public.job_submits where applicant_user_id = auth.uid()
    )
  )
  with check (
    status in ('confirmed', 'declined', 'reschedule_requested')
  );

grant all on public.interview_invitations to authenticated;

-- 5. Trigger thông báo cho Recruiter khi Ứng viên phản hồi lịch phỏng vấn
create or replace function public.notify_recruiter_on_interview_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app record;
  v_job record;
  v_applicant record;
  v_recruiter record;
  v_title text;
  v_msg text;
begin
  -- Chỉ trigger khi trạng thái chuyển từ pending sang confirmed hoặc reschedule_requested
  if old.status = 'pending' and new.status in ('confirmed', 'reschedule_requested') then
    -- Lấy thông tin application, job và applicant
    select * into v_app from public.job_submits where id = new.application_id;
    select * into v_job from public.job_posts where id = v_app.job_post_id;
    select * into v_applicant from public.profiles where id = v_app.applicant_user_id;

    if new.status = 'confirmed' then
      v_title := 'Ứng viên đã xác nhận lịch phỏng vấn';
      v_msg := format('%s đã đồng ý và xác nhận lịch phỏng vấn cho vị trí "%s"', v_applicant.full_name, v_job.title);
    else
      v_title := 'Ứng viên đề xuất đổi lịch phỏng vấn';
      v_msg := format('%s không phù hợp với các lịch phỏng vấn và đã gửi đề xuất mốc thời gian mới cho vị trí "%s"', v_applicant.full_name, v_job.title);
    end if;

    -- Gửi thông báo đến các nhà tuyển dụng thuộc công ty sở hữu việc làm
    for v_recruiter in
      select cm.user_id
      from public.company_members cm
      where cm.company_id = v_job.company_id
        and cm.is_active = true
        and cm.role in ('owner', 'recruiter')
    loop
      perform public.create_notification(
        p_user_id := v_recruiter.user_id,
        p_type := 'interview_response',
        p_title := v_title,
        p_message := v_msg,
        p_link_url := format('/dashboard'),
        p_metadata := jsonb_build_object(
          'application_id', new.application_id,
          'interview_id', new.id,
          'status', new.status,
          'scheduled_at', new.scheduled_at
        ),
        p_idempotency_key := format('interview_response:%s:%s:%s', new.id, new.status, v_recruiter.user_id)
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists interview_invitations_notify_recruiter on public.interview_invitations;

create trigger interview_invitations_notify_recruiter
  after update on public.interview_invitations
  for each row execute function public.notify_recruiter_on_interview_response();
