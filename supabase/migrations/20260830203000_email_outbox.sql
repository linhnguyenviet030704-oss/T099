-- =============================================================================
-- Migration: Email Outbox
-- Purpose: Async email sending với retry + idempotency
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'email_status') then
    create type public.email_status as enum ('pending', 'sent', 'failed', 'cancelled');
  end if;
end $$;

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.email_status not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  next_retry_at timestamptz,
  sent_at timestamptz,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_outbox_pending_idx
  on public.email_outbox (next_retry_at)
  where status in ('pending', 'failed') and attempts < max_attempts;

create index if not exists email_outbox_idempotency_idx
  on public.email_outbox (idempotency_key)
  where idempotency_key is not null;

comment on table public.email_outbox is
  'Email queue. Worker async xử lý. Retry exponential backoff.';

-- RLS: Chỉ service_role
alter table public.email_outbox enable row level security;
grant all on public.email_outbox to service_role;

-- Function: Enqueue email
create or replace function public.enqueue_email(
  p_to_user_id uuid,
  p_template text,
  p_payload jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email_id uuid;
begin
  if p_idempotency_key is not null then
    insert into public.email_outbox (
      to_user_id, template, payload, idempotency_key, next_retry_at
    ) values (
      p_to_user_id, p_template, p_payload, p_idempotency_key, now()
    )
    on conflict (idempotency_key) do nothing
    returning id into v_email_id;

    if v_email_id is null then
      select id into v_email_id
      from public.email_outbox
      where idempotency_key = p_idempotency_key;
    end if;

    return v_email_id;
  end if;

  insert into public.email_outbox (
    to_user_id, template, payload, next_retry_at
  ) values (
    p_to_user_id, p_template, p_payload, now()
  )
  returning id into v_email_id;

  return v_email_id;
end;
$$;

revoke execute on function public.enqueue_email(uuid, text, jsonb, text) from public, authenticated;
grant execute on function public.enqueue_email(uuid, text, jsonb, text) to service_role;
