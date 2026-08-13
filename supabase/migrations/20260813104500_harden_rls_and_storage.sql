-- Harden RLS, move DEFINER helpers off public, lock storage.

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helpers live in app_private (not on the Data API surface).
-- ---------------------------------------------------------------------------

grant usage on schema app_private to authenticated, service_role;

create or replace function app_private.current_profile_role()
returns public.profile_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function app_private.is_active_company_member(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.is_active
      and m.role in ('owner', 'recruiter')
  );
end;
$$;

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
      and (
        app_private.current_profile_role() = 'admin'
        or app_private.is_active_company_member(j.company_id)
      )
  );
end;
$$;

revoke all on function app_private.current_profile_role() from public;
revoke all on function app_private.is_active_company_member(uuid) from public;
revoke all on function app_private.can_manage_job_post(uuid) from public;
grant execute on function app_private.current_profile_role() to authenticated, service_role;
grant execute on function app_private.is_active_company_member(uuid) to authenticated, service_role;
grant execute on function app_private.can_manage_job_post(uuid) to authenticated, service_role;

create or replace function public.current_profile_role()
returns public.profile_role
language sql
stable
security invoker
set search_path = public, app_private
as $$
  select app_private.current_profile_role();
$$;

create or replace function public.is_active_company_member(p_company_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, app_private
as $$
  select app_private.is_active_company_member(p_company_id);
$$;

create or replace function public.can_manage_job_post(p_job_post_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, app_private
as $$
  select app_private.can_manage_job_post(p_job_post_id);
$$;

-- ---------------------------------------------------------------------------
-- profiles: INSERT cannot choose a privileged role
-- ---------------------------------------------------------------------------

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and coalesce(auth.role(), '') <> 'service_role' then
    new.role := 'candidate';
  end if;
  if tg_op = 'UPDATE'
     and new.role is distinct from old.role
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'profile role cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
before insert or update on public.profiles
for each row
execute function public.protect_profile_role();

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id and role = 'candidate');

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles
  for select
  to authenticated
  using (app_private.current_profile_role() = 'admin');

drop policy if exists "profiles_select_applicant_for_recruiter" on public.profiles;
create policy "profiles_select_applicant_for_recruiter"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.applications a
      where a.applicant_user_id = profiles.id
        and app_private.can_manage_job_post(a.job_post_id)
    )
  );

-- ---------------------------------------------------------------------------
-- companies: members cannot self-verify
-- ---------------------------------------------------------------------------

create or replace function public.protect_company_verification()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and (
       new.verification_status is distinct from old.verification_status
       or new.verified_at is distinct from old.verified_at
     )
     and coalesce(auth.role(), '') <> 'service_role'
     and coalesce(app_private.current_profile_role()::text, '') <> 'admin' then
    raise exception 'company verification cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists companies_protect_verification on public.companies;
create trigger companies_protect_verification
before update on public.companies
for each row
execute function public.protect_company_verification();

create or replace function public.protect_published_job_company()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'published'
     and coalesce(auth.role(), '') <> 'service_role'
     and coalesce(app_private.current_profile_role()::text, '') <> 'admin'
     and not exists (
       select 1 from public.companies c
       where c.id = new.company_id
         and c.verification_status = 'verified'
     ) then
    raise exception 'unpublished companies cannot publish jobs';
  end if;
  return new;
end;
$$;

drop trigger if exists job_posts_protect_publish on public.job_posts;
create trigger job_posts_protect_publish
before insert or update on public.job_posts
for each row
execute function public.protect_published_job_company();

-- ---------------------------------------------------------------------------
-- applications: no client UPDATE; apply only to published jobs
-- ---------------------------------------------------------------------------

drop policy if exists "applications_update_own_or_recruiter" on public.applications;
revoke update on public.applications from authenticated;

drop policy if exists "applications_insert_own" on public.applications;
create policy "applications_insert_own"
  on public.applications for insert
  to authenticated
  with check (
    applicant_user_id = auth.uid()
    and exists (
      select 1
      from public.job_posts j
      where j.id = job_post_id
        and j.status = 'published'
        and (j.deadline_at is null or j.deadline_at >= now())
    )
  );

-- ---------------------------------------------------------------------------
-- application_stages: applicant withdraw only; recruiter pipeline stages
-- ---------------------------------------------------------------------------

drop policy if exists "application_stages_insert_related" on public.application_stages;

create policy "application_stages_insert_applicant_withdraw"
  on public.application_stages for insert
  to authenticated
  with check (
    changed_by_user_id = auth.uid()
    and stage = 'withdrawn'
    and exists (
      select 1 from public.applications a
      where a.id = application_id
        and a.applicant_user_id = auth.uid()
    )
  );

create policy "application_stages_insert_recruiter"
  on public.application_stages for insert
  to authenticated
  with check (
    changed_by_user_id = auth.uid()
    and stage in ('screening', 'interview', 'offer', 'accepted', 'rejected')
    and exists (
      select 1 from public.applications a
      where a.id = application_id
        and app_private.can_manage_job_post(a.job_post_id)
    )
  );

-- ---------------------------------------------------------------------------
-- recruiter forms: insert pending only; applicants cannot touch review fields
-- ---------------------------------------------------------------------------

drop policy if exists "recruiter_forms_insert_own" on public.recruiter_registration_forms;
create policy "recruiter_forms_insert_own"
  on public.recruiter_registration_forms for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and reviewed_by_user_id is null
    and reviewed_at is null
  );

create or replace function public.protect_recruiter_form_review()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or coalesce(app_private.current_profile_role()::text, '') = 'admin' then
    return new;
  end if;
  new.status := old.status;
  new.admin_note := old.admin_note;
  new.reviewed_by_user_id := old.reviewed_by_user_id;
  new.reviewed_at := old.reviewed_at;
  return new;
end;
$$;

drop trigger if exists recruiter_forms_protect_review on public.recruiter_registration_forms;
create trigger recruiter_forms_protect_review
before update on public.recruiter_registration_forms
for each row
execute function public.protect_recruiter_form_review();

-- ---------------------------------------------------------------------------
-- Storage: private resumes bucket + path-scoped policies
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes',
  'resumes',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
        from public.applications a
        where a.resume_storage_path_snapshot = name
          and app_private.can_manage_job_post(a.job_post_id)
      )
    )
  );

drop policy if exists "resumes_storage_insert" on storage.objects;
create policy "resumes_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "resumes_storage_update" on storage.objects;
create policy "resumes_storage_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "resumes_storage_delete" on storage.objects;
create policy "resumes_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
