-- =============================================================================
-- Migration: Application Notification Triggers
-- Purpose: Tạo notification khi application events xảy ra
-- NOTE: Sử dụng idempotency key để tránh duplicate
-- =============================================================================

-- Trigger: Notify recruiter khi application mới được submit
create or replace function public.notify_recruiter_on_application_submit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_applicant record;
  v_recruiter record;
begin
  -- Lấy job và company info
  select j.id, j.title, j.company_id, j.created_by_user_id, c.name as company_name
  into v_job
  from public.job_posts j
  join public.companies c on c.id = j.company_id
  where j.id = new.job_post_id;

  -- Lấy applicant info
  select id, full_name, email
  into v_applicant
  from public.profiles
  where id = new.applicant_user_id;

  -- Notify tất cả recruiters/owners của company
  for v_recruiter in
    select cm.user_id
    from public.company_members cm
    where cm.company_id = v_job.company_id
      and cm.is_active = true
      and cm.role in ('owner', 'recruiter')
  loop
    perform public.create_notification(
      p_user_id := v_recruiter.user_id,
      p_type := 'application_submitted',
      p_title := 'CV mới được nộp',
      p_message := format('%s đã nộp CV cho vị trí "%s"', v_applicant.full_name, v_job.title),
      p_link_url := format('/recruiter/applications/%s', new.id),
      p_metadata := jsonb_build_object(
        'application_id', new.id,
        'job_post_id', v_job.id,
        'applicant_name', v_applicant.full_name
      ),
      p_idempotency_key := format('application_submitted:%s:recruiter:%s', new.id, v_recruiter.user_id)
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists applications_notify_recruiter_on_submit on public.job_submits;
create trigger applications_notify_recruiter_on_submit
  after insert on public.job_submits
  for each row execute function public.notify_recruiter_on_application_submit();

-- Trigger: Notify candidate khi application status thay đổi
create or replace function public.notify_candidate_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_status_text text;
begin
  -- Chỉ notify khi status thực sự thay đổi
  if old.current_status = new.current_status then
    return new;
  end if;

  -- Lấy job title
  select title into v_job
  from public.job_posts
  where id = new.job_post_id;

  -- Map status sang text tiếng Việt
  v_status_text := case new.current_status
    when 'pending' then 'đang chờ xét duyệt'
    when 'screening' then 'đang được sàng lọc'
    when 'interview' then 'được mời phỏng vấn'
    when 'offer' then 'được đề xuất công việc'
    when 'accepted' then 'đã được chấp nhận'
    when 'rejected' then 'không được chọn'
    when 'withdrawn' then 'đã rút'
    else new.current_status::text
  end;

  perform public.create_notification(
    p_user_id := new.applicant_user_id,
    p_type := 'application_status_changed',
    p_title := 'Cập nhật trạng thái ứng tuyển',
    p_message := format('Đơn ứng tuyển "%s" của bạn %s', v_job.title, v_status_text),
    p_link_url := format('/applications/%s', new.id),
    p_metadata := jsonb_build_object(
      'application_id', new.id,
      'old_status', old.current_status,
      'new_status', new.current_status
    ),
    p_idempotency_key := format('application_status_changed:%s:%s:%s', new.id, old.current_status, new.current_status)
  );

  return new;
end;
$$;

drop trigger if exists applications_notify_candidate_on_status_change on public.job_submits;
create trigger applications_notify_candidate_on_status_change
  after update on public.job_submits
  for each row execute function public.notify_candidate_on_status_change();
