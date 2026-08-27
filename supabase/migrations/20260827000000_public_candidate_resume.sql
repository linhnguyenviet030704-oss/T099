-- Migration: Public candidate resume ("Đang tìm việc") & RLS policies
-- Each candidate can mark at most 1 active resume as public.

alter table public.resumes
  add column if not exists is_public boolean not null default false;

-- Unique partial index: exactly one public resume per user
create unique index if not exists resumes_one_public_per_user
  on public.resumes (user_id)
  where is_public and deleted_at is null;

-- Update RLS on resumes: allow owners, admins, and recruiters (or when is_public = true) to select
drop policy if exists "resumes_select_own_or_admin" on public.resumes;
drop policy if exists "resumes_select_own_public_or_admin" on public.resumes;

create policy "resumes_select_own_public_or_admin"
  on public.resumes for select
  to authenticated
  using (
    user_id = auth.uid()
    or is_public = true
    or app_private.current_profile_role() in ('admin', 'recruiter')
  );

-- Update storage policy for resumes bucket: allow reading files if resume is public
drop policy if exists "resumes_storage_select" on storage.objects;

create policy "resumes_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'resumes'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or app_private.current_profile_role() = 'admin'
      or exists (
        select 1
        from public.job_submits s
        where s.resume_storage_path_snapshot = name
          and app_private.can_manage_job_post(s.job_post_id)
      )
      or exists (
        select 1
        from public.resumes r
        where r.storage_path = name
          and r.is_public = true
          and r.deleted_at is null
      )
    )
  );
