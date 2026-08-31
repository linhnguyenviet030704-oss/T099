-- =============================================================================
-- Migration: Notifications Core
-- Purpose: Hệ thống thông báo với Realtime + idempotency
-- =============================================================================

-- Enum notification type
create type public.notification_type as enum (
  'application_submitted',
  'application_status_changed',
  'interview_scheduled',
  'application_auto_rejected',
  'reputation_decreased',
  'reputation_increased',
  'interview_reminder'
);

-- Bảng notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type public.notification_type not null,
  title text not null,
  message text not null,
  link_url text,
  metadata jsonb default '{}'::jsonb,
  idempotency_key text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Indexes
create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where not is_read;

create unique index notifications_idempotency_idx
  on public.notifications (idempotency_key)
  where idempotency_key is not null;

comment on table public.notifications is
  'In-app notifications. Frontend subscribe qua Supabase Realtime.';

comment on column public.notifications.idempotency_key is
  'Key chống duplicate notification. Format: {type}:{entity_id}:{event_id}';

-- Trigger: Auto-set read_at khi is_read = true
create or replace function public.set_notification_read_at()
returns trigger
language plpgsql
as $$
begin
  if new.is_read and (old.read_at is null or not old.is_read) then
    new.read_at := now();
  elsif not new.is_read then
    new.read_at := null;
  end if;
  return new;
end;
$$;

create trigger notifications_set_read_at
  before update on public.notifications
  for each row execute function public.set_notification_read_at();

-- RLS policies
alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Grant permissions
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- Function: Tạo notification (chỉ service_role)
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

-- CRITICAL: Chỉ service_role được gọi (fix security hole)
revoke execute on function public.create_notification(uuid, public.notification_type, text, text, text, jsonb, text)
  from public, authenticated;

grant execute on function public.create_notification(uuid, public.notification_type, text, text, text, jsonb, text)
  to service_role;

comment on function public.create_notification is
  'Tạo notification. CHỈ service_role được gọi (không cho authenticated để tránh spam).';

-- Enable Realtime publication
alter publication supabase_realtime add table public.notifications;
