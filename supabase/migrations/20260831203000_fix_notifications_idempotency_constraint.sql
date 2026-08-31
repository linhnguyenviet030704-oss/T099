-- =============================================================================
-- Migration: Fix notifications idempotency constraint and status trigger
-- Mục đích: Đảm bảo bảng notifications có unique constraint trên idempotency_key
--          và hàm create_notification hoạt động an toàn tuyệt đối
--          để ứng viên nhận được thông báo ngay lập tức khi trạng thái CV thay đổi.
-- =============================================================================

-- 1. Xóa index partial cũ nếu tồn tại
drop index if exists public.notifications_idempotency_idx;

-- 2. Thêm unique constraint cho cột idempotency_key
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_idempotency_key_key'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_idempotency_key_key unique (idempotency_key);
  end if;
end $$;

-- 3. Tạo lại index hỗ trợ tìm kiếm nhanh theo idempotency_key
create index if not exists notifications_idempotency_idx
  on public.notifications (idempotency_key)
  where idempotency_key is not null;

-- 4. Cập nhật lại hàm create_notification: an toàn, idempotent, chống lỗi xung đột
create or replace function public.create_notification(
  p_user_id uuid,
  p_type public.notification_type,
  p_title text,
  p_message text,
  p_link_url text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  -- Nếu có idempotency key, kiểm tra trùng lặp trước
  if p_idempotency_key is not null then
    select id into v_notification_id
    from public.notifications
    where idempotency_key = p_idempotency_key;

    if v_notification_id is not null then
      return v_notification_id;
    end if;

    begin
      insert into public.notifications (
        user_id, notification_type, title, message, link_url, metadata, idempotency_key
      ) values (
        p_user_id, p_type, p_title, p_message, p_link_url, p_metadata, p_idempotency_key
      )
      returning id into v_notification_id;
    exception when unique_violation then
      select id into v_notification_id
      from public.notifications
      where idempotency_key = p_idempotency_key;
    end;

    return v_notification_id;
  end if;

  -- Không có idempotency key, insert bình thường
  insert into public.notifications (
    user_id, notification_type, title, message, link_url, metadata
  ) values (
    p_user_id, p_type, p_title, p_message, p_link_url, p_metadata
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

revoke execute on function public.create_notification(uuid, public.notification_type, text, text, text, jsonb, text)
  from public, authenticated;

grant execute on function public.create_notification(uuid, public.notification_type, text, text, text, jsonb, text)
  to service_role;

-- 5. Đảm bảo trigger notify_candidate_on_status_change luôn hoạt động khi cập nhật trạng thái
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

  -- Lấy thông tin job title
  select title into v_job
  from public.job_posts
  where id = new.job_post_id;

  -- Map status sang văn bản tiếng Việt
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
    p_message := format('Đơn ứng tuyển "%s" của bạn %s', coalesce(v_job.title, 'công việc'), v_status_text),
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
