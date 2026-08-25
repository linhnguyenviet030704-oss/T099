-- Fix strict RBAC policies for resumes and job management.

-- 1. Resumes table SELECT policy: Candidates only access their own resumes.
drop policy if exists "resumes_select_own_or_admin" on public.resumes;
drop policy if exists "resumes_select_own" on public.resumes;

create policy "resumes_select_own"
  on public.resumes for select
  to authenticated
  using (user_id = auth.uid());

-- 2. Ensure recruiters manage only their own posted jobs and active company memberships.
create or replace function app_private.can_manage_job_post(p_job_post_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.job_posts j
    where j.id = p_job_post_id
      and j.created_by_user_id = auth.uid()
      and app_private.is_active_company_member(j.company_id)
  );
end;
$$;
