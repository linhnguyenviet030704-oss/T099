-- =============================================================================
-- Migration: Job Response Timeout
-- Purpose: Thêm timeout cho recruiter phản hồi CV + deadline tracking
-- =============================================================================

-- Thêm cột timeout vào job_posts
alter table public.job_posts
add column time_max_until_response interval not null default interval '3 days';

comment on column public.job_posts.time_max_until_response is
  'Thời gian tối đa recruiter phải phản hồi CV. Sau thời gian này, application tự động rejected và recruiter bị trừ điểm.';

-- Thêm cột deadline vào applications
alter table public.job_submits
add column response_deadline_at timestamptz;

comment on column public.job_submits.response_deadline_at is
  'Deadline recruiter phải phản hồi CV. = applied_at + job.time_max_until_response. NULL khi đã phản hồi hoặc không còn pending.';

-- Index cho query auto-reject
create index applications_pending_deadline_idx
  on public.job_submits (response_deadline_at)
  where current_status = 'pending' and response_deadline_at is not null;

-- Trigger: Set deadline khi application được tạo
create or replace function public.handle_application_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_timeout interval;
begin
  if tg_op = 'INSERT' then
    -- Set applied_at nếu null
    if new.applied_at is null then
      new.applied_at := now();
    end if;

    -- Lấy timeout từ job_posts
    select time_max_until_response into v_timeout
    from public.job_posts
    where id = new.job_post_id;

    -- Set deadline
    new.response_deadline_at := new.applied_at + coalesce(v_timeout, interval '3 days');

  elsif tg_op = 'UPDATE' then
    -- Clear deadline khi recruiter đã phản hồi (status thay đổi khỏi pending)
    if old.current_status = 'pending' and new.current_status <> 'pending' then
      new.response_deadline_at := null;
    end if;

    -- Clear deadline khi reviewed_at được set
    if new.reviewed_at is not null and old.reviewed_at is null then
      new.response_deadline_at := null;
    end if;
  end if;

  return new;
end;
$$;

create trigger applications_handle_deadline
  before insert or update on public.job_submits
  for each row execute function public.handle_application_deadline();

-- Backfill deadline cho applications pending hiện tại (nếu có)
update public.job_submits a
set response_deadline_at = a.applied_at + j.time_max_until_response
from public.job_posts j
where a.job_post_id = j.id
  and a.current_status = 'pending'
  and a.response_deadline_at is null
  and a.applied_at is not null;
