-- =============================================================================
-- Migration: Reputation Core
-- Purpose: Thêm reputation system với audit trail và protection
-- =============================================================================

-- Thêm cột reputation cho profiles (tách theo role)
alter table public.profiles
add column if not exists recruiter_reputation_score integer not null default 100,
add column if not exists candidate_reputation_score integer not null default 100;

-- CHECK constraints: score phải trong khoảng 0-100
alter table public.profiles
drop constraint if exists profiles_recruiter_reputation_check;

alter table public.profiles
add constraint profiles_recruiter_reputation_check
  check (recruiter_reputation_score between 0 and 100);

alter table public.profiles
drop constraint if exists profiles_candidate_reputation_check;

alter table public.profiles
add constraint profiles_candidate_reputation_check
  check (candidate_reputation_score between 0 and 100);

comment on column public.profiles.recruiter_reputation_score is
  'Điểm uy tín của user với vai trò recruiter (0-100). Bị trừ khi không phản hồi CV đúng hạn.';

comment on column public.profiles.candidate_reputation_score is
  'Điểm uy tín của user với vai trò candidate (0-100). Bị trừ khi vi phạm cam kết phỏng vấn.';

-- Index cho sorting theo reputation
create index if not exists profiles_recruiter_reputation_idx
  on public.profiles (recruiter_reputation_score desc);

create index if not exists profiles_candidate_reputation_idx
  on public.profiles (candidate_reputation_score desc);

-- Bảng reputation_events: Audit log cho mọi thay đổi điểm
create table if not exists public.reputation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('recruiter', 'candidate')),
  points_delta integer not null,
  reason text not null,
  application_id uuid,
  job_post_id uuid,
  interview_invitation_id uuid,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create index if not exists reputation_events_user_role_idx
  on public.reputation_events (user_id, role, created_at desc);

create index if not exists reputation_events_idempotency_idx
  on public.reputation_events (idempotency_key) where idempotency_key is not null;

comment on table public.reputation_events is
  'Audit log cho mọi thay đổi điểm uy tín. Không được xóa.';

-- RLS cho reputation_events (read-only cho user)
alter table public.reputation_events enable row level security;

drop policy if exists "reputation_events_select_own" on public.reputation_events;
create policy "reputation_events_select_own"
  on public.reputation_events for select
  to authenticated
  using (user_id = auth.uid());

grant select on public.reputation_events to authenticated;
grant all on public.reputation_events to service_role;

-- Function: Điều chỉnh reputation (atomic + idempotent)
create or replace function public.adjust_reputation(
  p_user_id uuid,
  p_role text,
  p_points_delta integer,
  p_reason text,
  p_application_id uuid default null,
  p_job_post_id uuid default null,
  p_interview_invitation_id uuid default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_score integer;
  v_new_score integer;
  v_event_id uuid;
begin
  -- Validate role
  if p_role not in ('recruiter', 'candidate') then
    raise exception 'p_role must be recruiter or candidate';
  end if;

  -- Idempotency: nếu có key, check xem đã xử lý chưa
  if p_idempotency_key is not null then
    select id into v_event_id
    from public.reputation_events
    where idempotency_key = p_idempotency_key;

    if v_event_id is not null then
      -- Đã xử lý rồi, return kết quả cũ
      select
        case when p_role = 'recruiter' then recruiter_reputation_score
             else candidate_reputation_score
        end
      into v_new_score
      from public.profiles
      where id = p_user_id;

      return jsonb_build_object(
        'success', true,
        'idempotent', true,
        'old_score', v_new_score,
        'new_score', v_new_score,
        'event_id', v_event_id
      );
    end if;
  end if;

  -- Lấy điểm hiện tại
  if p_role = 'recruiter' then
    select recruiter_reputation_score into v_old_score
    from public.profiles
    where id = p_user_id;
  else
    select candidate_reputation_score into v_old_score
    from public.profiles
    where id = p_user_id;
  end if;

  if v_old_score is null then
    raise exception 'User % not found', p_user_id;
  end if;

  -- Tính điểm mới (clamp 0-100)
  v_new_score := greatest(0, least(100, v_old_score + p_points_delta));

  -- Update profiles
  if p_role = 'recruiter' then
    update public.profiles
    set recruiter_reputation_score = v_new_score,
        updated_at = now()
    where id = p_user_id;
  else
    update public.profiles
    set candidate_reputation_score = v_new_score,
        updated_at = now()
    where id = p_user_id;
  end if;

  -- Insert event log
  insert into public.reputation_events (
    user_id,
    role,
    points_delta,
    reason,
    application_id,
    job_post_id,
    interview_invitation_id,
    idempotency_key
  ) values (
    p_user_id,
    p_role,
    p_points_delta,
    p_reason,
    p_application_id,
    p_job_post_id,
    p_interview_invitation_id,
    p_idempotency_key
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'old_score', v_old_score,
    'new_score', v_new_score,
    'event_id', v_event_id
  );
end;
$$;

-- Chỉ service_role được gọi
revoke execute on function public.adjust_reputation(uuid, text, integer, text, uuid, uuid, uuid, text)
  from public, authenticated;

grant execute on function public.adjust_reputation(uuid, text, integer, text, uuid, uuid, uuid, text)
  to service_role;

-- Trigger: Bảo vệ reputation_score khỏi user update trực tiếp
create or replace function public.protect_reputation_scores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nếu là authenticated user và cố sửa reputation
  if auth.role() = 'authenticated' then
    if new.recruiter_reputation_score is distinct from old.recruiter_reputation_score then
      raise exception 'recruiter_reputation_score cannot be modified by user. Use adjust_reputation function.';
    end if;

    if new.candidate_reputation_score is distinct from old.candidate_reputation_score then
      raise exception 'candidate_reputation_score cannot be modified by user. Use adjust_reputation function.';
    end if;
  end if;

  -- Service role và postgres được phép (cho migration, admin)
  return new;
end;
$$;

drop trigger if exists profiles_protect_reputation on public.profiles;
create trigger profiles_protect_reputation
  before update on public.profiles
  for each row execute function public.protect_reputation_scores();

comment on function public.protect_reputation_scores() is
  'Ngăn user tự sửa reputation_score. Chỉ service_role/admin được phép.';
