-- =============================================================================
-- Migration: Fix notifications idempotency constraint
-- Mục đích: Đảm bảo bảng notifications có unique constraint trên idempotency_key
--          để câu lệnh `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING`
--          trong hàm `create_notification` không bị lỗi 42P10
-- =============================================================================

-- Xóa index partial cũ nếu tồn tại
drop index if exists public.notifications_idempotency_idx;

-- Thêm unique constraint cho cột idempotency_key
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

-- Tạo lại index hỗ trợ tìm kiếm nhanh theo idempotency_key nếu cần
create index if not exists notifications_idempotency_idx
  on public.notifications (idempotency_key)
  where idempotency_key is not null;

-- Cập nhật lại hàm create_notification để đảm bảo bảo mật và chạy đúng idempotency
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
  -- Nếu có idempotency key, dùng on conflict
  if p_idempotency_key is not null then
    insert into public.notifications (
      user_id, notification_type, title, message, link_url, metadata, idempotency_key
    ) values (
      p_user_id, p_type, p_title, p_message, p_link_url, p_metadata, p_idempotency_key
    )
    on conflict (idempotency_key) do nothing
    returning id into v_notification_id;

    -- Nếu conflict, lấy id cũ
    if v_notification_id is null then
      select id into v_notification_id
      from public.notifications
      where idempotency_key = p_idempotency_key;
    end if;

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
