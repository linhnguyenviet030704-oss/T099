-- =============================================================================
-- Migration: Interview Invitations
-- Purpose: Track interview invitations để penalize candidate no-show
-- =============================================================================

-- Enum interview invitation status
do $$
begin
  if not exists (select 1 from pg_type where typname = 'interview_invitation_status') then
    create type public.interview_invitation_status as enum (
      'pending',
      'confirmed',
      'declined',
      'reschedule_requested',
      'no_show',
      'cancelled',
      'completed'
    );
  end if;
end $$;

create table if not exists public.interview_invitations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_submits(id) on delete cascade,
  scheduled_at timestamptz not null,
  location text,
  meeting_link text,
  note text,
  status public.interview_invitation_status not null default 'pending',
  response_deadline_at timestamptz,
  responded_at timestamptz,
  created_by_user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interview_invitations_application_idx
  on public.interview_invitations (application_id, created_at desc);

create index if not exists interview_invitations_pending_deadline_idx
  on public.interview_invitations (response_deadline_at)
  where status = 'pending' and response_deadline_at is not null;

comment on table public.interview_invitations is
  'Lịch hẹn phỏng vấn. Dùng để track candidate no-show và penalize reputation.';

-- RLS
alter table public.interview_invitations enable row level security;

-- Candidate xem invitation của mình
drop policy if exists "interview_invitations_candidate_select" on public.interview_invitations;
create policy "interview_invitations_candidate_select"
  on public.interview_invitations for select
  to authenticated
  using (
    application_id in (
      select id from public.job_submits where applicant_user_id = auth.uid()
    )
  );

-- Candidate update status (confirm/decline)
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
    status in ('confirmed', 'declined')
  );

grant select, update on public.interview_invitations to authenticated;
grant all on public.interview_invitations to service_role;

-- Trigger: Set responded_at khi status thay đổi
create or replace function public.set_interview_responded_at()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status
     and old.status = 'pending'
     and new.status in ('confirmed', 'declined')
     and new.responded_at is null then
    new.responded_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists interview_invitations_set_responded on public.interview_invitations;
create trigger interview_invitations_set_responded
  before update on public.interview_invitations
  for each row execute function public.set_interview_responded_at();
