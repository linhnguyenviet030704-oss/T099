-- Recruitment domain tables expected by the frontend (companies, jobs, applications, …).

create type public.company_member_role as enum ('owner', 'recruiter', 'member');
create type public.company_verification_status as enum ('pending', 'verified', 'rejected');
create type public.job_post_status as enum ('draft', 'published', 'closed', 'archived');
create type public.employment_type as enum (
  'full_time', 'part_time', 'internship', 'contract', 'remote', 'hybrid'
);
create type public.application_status as enum (
  'pending', 'screening', 'interview', 'offer', 'accepted', 'rejected', 'withdrawn'
);
create type public.recruiter_registration_status as enum ('pending', 'approved', 'rejected');
create type public.profile_line_type as enum (
  'summary', 'experience', 'education', 'skill', 'project',
  'certification', 'language', 'link', 'other'
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.current_profile_role()
returns public.profile_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_profile_role() from public;
grant execute on function public.current_profile_role() to authenticated, service_role;

create or replace function public.is_active_company_member(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Deferred table check: company_members is created later in this migration.
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

revoke all on function public.is_active_company_member(uuid) from public;
grant execute on function public.is_active_company_member(uuid) to authenticated, service_role;

create or replace function public.can_manage_job_post(p_job_post_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Deferred table check: job_posts is created later in this migration.
  return exists (
    select 1
    from public.job_posts j
    where j.id = p_job_post_id
      and (
        public.current_profile_role() = 'admin'
        or public.is_active_company_member(j.company_id)
      )
  );
end;
$$;

revoke all on function public.can_manage_job_post(uuid) from public;
grant execute on function public.can_manage_job_post(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  website_url text,
  facebook_url text,
  linkedin_url text,
  twitter_url text,
  logo_storage_path text,
  description text,
  created_by_user_id uuid not null references public.profiles (id) on delete restrict,
  verification_status public.company_verification_status not null default 'pending',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_slug_unique unique (slug)
);

create unique index companies_name_lower_unique on public.companies (lower(name));
create index companies_verification_status_idx on public.companies (verification_status);

create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

alter table public.companies enable row level security;

create policy "companies_select_verified_or_member"
  on public.companies for select
  to anon, authenticated
  using (
    verification_status = 'verified'
    or created_by_user_id = auth.uid()
    or public.is_active_company_member(id)
    or public.current_profile_role() = 'admin'
  );

create policy "companies_insert_authenticated"
  on public.companies for insert
  to authenticated
  with check (created_by_user_id = auth.uid());

create policy "companies_update_member_or_admin"
  on public.companies for update
  to authenticated
  using (
    public.is_active_company_member(id)
    or public.current_profile_role() = 'admin'
  )
  with check (
    public.is_active_company_member(id)
    or public.current_profile_role() = 'admin'
  );

grant select on public.companies to anon, authenticated;
grant insert, update on public.companies to authenticated;
grant all on public.companies to service_role;

-- ---------------------------------------------------------------------------
-- company_members
-- ---------------------------------------------------------------------------

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.company_member_role not null default 'recruiter',
  is_active boolean not null default true,
  invited_by_user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_members_unique unique (company_id, user_id)
);

create index company_members_user_id_idx on public.company_members (user_id);

create trigger company_members_set_updated_at
before update on public.company_members
for each row execute function public.set_updated_at();

alter table public.company_members enable row level security;

create policy "company_members_select_own_or_admin"
  on public.company_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_active_company_member(company_id)
    or public.current_profile_role() = 'admin'
  );

create policy "company_members_insert_admin_or_owner"
  on public.company_members for insert
  to authenticated
  with check (
    public.current_profile_role() = 'admin'
    or public.is_active_company_member(company_id)
  );

create policy "company_members_update_admin_or_owner"
  on public.company_members for update
  to authenticated
  using (
    public.current_profile_role() = 'admin'
    or public.is_active_company_member(company_id)
  )
  with check (
    public.current_profile_role() = 'admin'
    or public.is_active_company_member(company_id)
  );

grant select, insert, update on public.company_members to authenticated;
grant all on public.company_members to service_role;

-- ---------------------------------------------------------------------------
-- user_profile_lines
-- ---------------------------------------------------------------------------

create table public.user_profile_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  line_type public.profile_line_type not null,
  title text not null,
  organization text,
  description text,
  start_date date,
  end_date date,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_profile_lines_user_id_idx on public.user_profile_lines (user_id, display_order);

create trigger user_profile_lines_set_updated_at
before update on public.user_profile_lines
for each row execute function public.set_updated_at();

alter table public.user_profile_lines enable row level security;

create policy "user_profile_lines_select_own"
  on public.user_profile_lines for select
  to authenticated
  using (user_id = auth.uid() or public.current_profile_role() = 'admin');

create policy "user_profile_lines_insert_own"
  on public.user_profile_lines for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "user_profile_lines_update_own"
  on public.user_profile_lines for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_profile_lines_delete_own"
  on public.user_profile_lines for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.user_profile_lines to authenticated;
grant all on public.user_profile_lines to service_role;

-- ---------------------------------------------------------------------------
-- resumes
-- ---------------------------------------------------------------------------

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  bucket_id text not null default 'resumes',
  storage_path text not null,
  original_filename text not null,
  title text,
  mime_type text not null,
  size_bytes bigint not null default 0,
  is_default boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index resumes_one_default_per_user
  on public.resumes (user_id)
  where is_default and deleted_at is null;

create index resumes_user_id_idx on public.resumes (user_id) where deleted_at is null;

create trigger resumes_set_updated_at
before update on public.resumes
for each row execute function public.set_updated_at();

alter table public.resumes enable row level security;

-- Recruiters open CVs via applications.resume_*_snapshot + storage signed URL.
create policy "resumes_select_own_or_admin"
  on public.resumes for select
  to authenticated
  using (user_id = auth.uid() or public.current_profile_role() = 'admin');

create policy "resumes_insert_own"
  on public.resumes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "resumes_update_own"
  on public.resumes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.resumes to authenticated;
grant all on public.resumes to service_role;

-- ---------------------------------------------------------------------------
-- job_posts
-- ---------------------------------------------------------------------------

create table public.job_posts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  created_by_user_id uuid not null references public.profiles (id) on delete restrict,
  title text not null,
  description text not null,
  requirements text,
  benefits text,
  location text,
  employment_type public.employment_type not null default 'full_time',
  salary_min numeric,
  salary_max numeric,
  currency text not null default 'VND',
  status public.job_post_status not null default 'draft',
  published_at timestamptz,
  deadline_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index job_posts_status_published_at_idx
  on public.job_posts (status, published_at desc);

create index job_posts_company_id_idx on public.job_posts (company_id);

create trigger job_posts_set_updated_at
before update on public.job_posts
for each row execute function public.set_updated_at();

alter table public.job_posts enable row level security;

create policy "job_posts_select_published_or_member"
  on public.job_posts for select
  to anon, authenticated
  using (
    status = 'published'
    or public.can_manage_job_post(id)
  );

create policy "job_posts_insert_member"
  on public.job_posts for insert
  to authenticated
  with check (
    created_by_user_id = auth.uid()
    and (
      public.is_active_company_member(company_id)
      or public.current_profile_role() = 'admin'
    )
  );

create policy "job_posts_update_member"
  on public.job_posts for update
  to authenticated
  using (public.can_manage_job_post(id))
  with check (public.can_manage_job_post(id));

grant select on public.job_posts to anon, authenticated;
grant insert, update on public.job_posts to authenticated;
grant all on public.job_posts to service_role;

-- ---------------------------------------------------------------------------
-- saved_jobs
-- ---------------------------------------------------------------------------

create table public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_post_id uuid not null references public.job_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_jobs_unique unique (user_id, job_post_id)
);

create index saved_jobs_user_id_idx on public.saved_jobs (user_id);

alter table public.saved_jobs enable row level security;

create policy "saved_jobs_select_own"
  on public.saved_jobs for select
  to authenticated
  using (user_id = auth.uid());

create policy "saved_jobs_insert_own"
  on public.saved_jobs for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "saved_jobs_delete_own"
  on public.saved_jobs for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.saved_jobs to authenticated;
grant all on public.saved_jobs to service_role;

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null references public.job_posts (id) on delete cascade,
  applicant_user_id uuid not null references public.profiles (id) on delete cascade,
  resume_id uuid not null references public.resumes (id) on delete restrict,
  cover_letter text,
  current_status public.application_status not null default 'pending',
  applied_at timestamptz not null default now(),
  reviewed_at timestamptz,
  withdrawn_at timestamptz,
  resume_title_snapshot text,
  resume_storage_path_snapshot text,
  resume_original_filename_snapshot text,
  resume_mime_type_snapshot text,
  resume_size_bytes_snapshot bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_unique unique (job_post_id, applicant_user_id)
);

create index applications_applicant_user_id_idx on public.applications (applicant_user_id, applied_at desc);
create index applications_job_post_id_idx on public.applications (job_post_id);

create trigger applications_set_updated_at
before update on public.applications
for each row execute function public.set_updated_at();

-- Snapshot resume + create initial pending stage on apply.
create or replace function public.handle_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.resumes%rowtype;
begin
  select * into r from public.resumes
  where id = new.resume_id and user_id = new.applicant_user_id and deleted_at is null;

  if not found then
    raise exception 'resume not found or not owned by applicant';
  end if;

  new.resume_title_snapshot := coalesce(r.title, r.original_filename);
  new.resume_storage_path_snapshot := r.storage_path;
  new.resume_original_filename_snapshot := r.original_filename;
  new.resume_mime_type_snapshot := r.mime_type;
  new.resume_size_bytes_snapshot := r.size_bytes;
  new.current_status := coalesce(new.current_status, 'pending');
  new.applied_at := coalesce(new.applied_at, now());

  return new;
end;
$$;

create trigger applications_before_insert
before insert on public.applications
for each row execute function public.handle_new_application();

create or replace function public.handle_new_application_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.application_stages (
    application_id, changed_by_user_id, stage, note, is_system_generated
  ) values (
    new.id, new.applicant_user_id, 'pending', 'Hồ sơ đã được nộp', true
  );
  return new;
end;
$$;

create trigger applications_after_insert
after insert on public.applications
for each row execute function public.handle_new_application_after();

alter table public.applications enable row level security;

create policy "applications_select_own_or_recruiter"
  on public.applications for select
  to authenticated
  using (
    applicant_user_id = auth.uid()
    or public.can_manage_job_post(job_post_id)
  );

create policy "applications_insert_own"
  on public.applications for insert
  to authenticated
  with check (applicant_user_id = auth.uid());

create policy "applications_update_own_or_recruiter"
  on public.applications for update
  to authenticated
  using (
    applicant_user_id = auth.uid()
    or public.can_manage_job_post(job_post_id)
  )
  with check (
    applicant_user_id = auth.uid()
    or public.can_manage_job_post(job_post_id)
  );

grant select, insert, update on public.applications to authenticated;
grant all on public.applications to service_role;

-- ---------------------------------------------------------------------------
-- application_stages
-- ---------------------------------------------------------------------------

create table public.application_stages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  changed_by_user_id uuid not null references public.profiles (id) on delete restrict,
  stage public.application_status not null,
  note text,
  is_system_generated boolean not null default false,
  created_at timestamptz not null default now()
);

create index application_stages_application_id_idx
  on public.application_stages (application_id, created_at desc);

-- Keep applications.current_status in sync when a stage is added.
create or replace function public.handle_application_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.applications
  set
    current_status = new.stage,
    withdrawn_at = case
      when new.stage = 'withdrawn' then coalesce(withdrawn_at, now())
      else withdrawn_at
    end,
    reviewed_at = case
      when new.stage not in ('pending', 'withdrawn') then coalesce(reviewed_at, now())
      else reviewed_at
    end,
    updated_at = now()
  where id = new.application_id;

  return new;
end;
$$;

create trigger application_stages_after_insert
after insert on public.application_stages
for each row execute function public.handle_application_stage();

alter table public.application_stages enable row level security;

create policy "application_stages_select_related"
  on public.application_stages for select
  to authenticated
  using (
    exists (
      select 1 from public.applications a
      where a.id = application_id
        and (
          a.applicant_user_id = auth.uid()
          or public.can_manage_job_post(a.job_post_id)
        )
    )
  );

create policy "application_stages_insert_related"
  on public.application_stages for insert
  to authenticated
  with check (
    changed_by_user_id = auth.uid()
    and exists (
      select 1 from public.applications a
      where a.id = application_id
        and (
          a.applicant_user_id = auth.uid()
          or public.can_manage_job_post(a.job_post_id)
        )
    )
  );

grant select, insert on public.application_stages to authenticated;
grant all on public.application_stages to service_role;

-- ---------------------------------------------------------------------------
-- recruiter_registration_forms
-- ---------------------------------------------------------------------------

create table public.recruiter_registration_forms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_name text not null,
  company_email text,
  company_website_url text,
  business_license_storage_path text,
  status public.recruiter_registration_status not null default 'pending',
  admin_note text,
  reviewed_by_user_id uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index recruiter_registration_one_pending
  on public.recruiter_registration_forms (user_id)
  where status = 'pending';

create trigger recruiter_registration_forms_set_updated_at
before update on public.recruiter_registration_forms
for each row execute function public.set_updated_at();

alter table public.recruiter_registration_forms enable row level security;

create policy "recruiter_forms_select_own_or_admin"
  on public.recruiter_registration_forms for select
  to authenticated
  using (user_id = auth.uid() or public.current_profile_role() = 'admin');

create policy "recruiter_forms_insert_own"
  on public.recruiter_registration_forms for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "recruiter_forms_update_own_pending_or_admin"
  on public.recruiter_registration_forms for update
  to authenticated
  using (
    (user_id = auth.uid() and status = 'pending')
    or public.current_profile_role() = 'admin'
  )
  with check (
    (user_id = auth.uid() and status = 'pending')
    or public.current_profile_role() = 'admin'
  );

grant select, insert, update on public.recruiter_registration_forms to authenticated;
grant all on public.recruiter_registration_forms to service_role;
