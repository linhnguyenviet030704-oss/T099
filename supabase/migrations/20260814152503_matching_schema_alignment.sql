-- Align public schema with matching spec:
-- profiles (user) + default_resume_id, profile_lines(name,value),
-- embedded_resumes, job_submits, match_job / match_resume / match_evidence.
-- Skill graph stays an agent resource file, not a table.

-- ---------------------------------------------------------------------------
-- profile_lines: rename + flatten to name / value
-- ---------------------------------------------------------------------------

alter table public.user_profile_lines rename to profile_lines;

alter table public.profile_lines rename column line_type to name;

alter table public.profile_lines add column value text;

update public.profile_lines
set value = nullif(
  trim(both E'\n' from concat_ws(
    E'\n',
    nullif(trim(title), ''),
    nullif(trim(organization), ''),
    nullif(trim(description), ''),
    case
      when start_date is not null or end_date is not null
        then concat_ws(
          ' – ',
          coalesce(start_date::text, '...'),
          coalesce(end_date::text, 'Hiện tại')
        )
      else null
    end
  )),
  ''
);

update public.profile_lines set value = coalesce(value, title, '');

alter table public.profile_lines alter column value set not null;
alter table public.profile_lines alter column value set default '';

alter table public.profile_lines
  drop column title,
  drop column organization,
  drop column description,
  drop column start_date,
  drop column end_date;

alter index if exists user_profile_lines_user_id_idx
  rename to profile_lines_user_id_idx;

drop policy if exists "user_profile_lines_select_own" on public.profile_lines;
drop policy if exists "user_profile_lines_insert_own" on public.profile_lines;
drop policy if exists "user_profile_lines_update_own" on public.profile_lines;
drop policy if exists "user_profile_lines_delete_own" on public.profile_lines;

create policy "profile_lines_select_own"
  on public.profile_lines for select
  to authenticated
  using (user_id = auth.uid() or app_private.current_profile_role() = 'admin');

create policy "profile_lines_insert_own"
  on public.profile_lines for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "profile_lines_update_own"
  on public.profile_lines for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "profile_lines_delete_own"
  on public.profile_lines for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- job_submits: rename applications
-- ---------------------------------------------------------------------------

alter table public.applications rename to job_submits;

alter table public.job_submits
  rename constraint applications_unique to job_submits_unique;

alter index if exists applications_applicant_user_id_idx
  rename to job_submits_applicant_user_id_idx;
alter index if exists applications_job_post_id_idx
  rename to job_submits_job_post_id_idx;

drop policy if exists "applications_select_own_or_recruiter" on public.job_submits;
drop policy if exists "applications_insert_own" on public.job_submits;

create policy "job_submits_select_own_or_recruiter"
  on public.job_submits for select
  to authenticated
  using (
    applicant_user_id = auth.uid()
    or app_private.can_manage_job_post(job_post_id)
  );

create policy "job_submits_insert_own"
  on public.job_submits for insert
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

drop policy if exists "profiles_select_applicant_for_recruiter" on public.profiles;
create policy "profiles_select_applicant_for_recruiter"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.job_submits s
      where s.applicant_user_id = profiles.id
        and app_private.can_manage_job_post(s.job_post_id)
    )
  );

drop policy if exists "application_stages_insert_applicant_withdraw" on public.application_stages;
create policy "application_stages_insert_applicant_withdraw"
  on public.application_stages for insert
  to authenticated
  with check (
    changed_by_user_id = auth.uid()
    and stage = 'withdrawn'
    and exists (
      select 1 from public.job_submits s
      where s.id = application_id
        and s.applicant_user_id = auth.uid()
    )
  );

drop policy if exists "application_stages_insert_recruiter" on public.application_stages;
create policy "application_stages_insert_recruiter"
  on public.application_stages for insert
  to authenticated
  with check (
    changed_by_user_id = auth.uid()
    and stage in ('screening', 'interview', 'offer', 'accepted', 'rejected')
    and exists (
      select 1 from public.job_submits s
      where s.id = application_id
        and app_private.can_manage_job_post(s.job_post_id)
    )
  );

drop policy if exists "application_stages_select_related" on public.application_stages;
create policy "application_stages_select_related"
  on public.application_stages for select
  to authenticated
  using (
    exists (
      select 1 from public.job_submits s
      where s.id = application_id
        and (
          s.applicant_user_id = auth.uid()
          or app_private.can_manage_job_post(s.job_post_id)
        )
    )
  );

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

create or replace function public.handle_application_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.job_submits
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

-- Recruiter who owns the job may read the submitted resume row (not every CV).
drop policy if exists "resumes_select_submitted_to_managed_job" on public.resumes;
create policy "resumes_select_submitted_to_managed_job"
  on public.resumes for select
  to authenticated
  using (
    exists (
      select 1
      from public.job_submits s
      where s.resume_id = resumes.id
        and app_private.can_manage_job_post(s.job_post_id)
    )
  );

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
    )
  );

-- ---------------------------------------------------------------------------
-- profiles.default_resume_id (user → default CV)
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column default_resume_id uuid references public.resumes (id) on delete set null;

create unique index profiles_default_resume_id_unique
  on public.profiles (default_resume_id)
  where default_resume_id is not null;

update public.profiles p
set default_resume_id = r.id
from public.resumes r
where r.user_id = p.id
  and r.is_default
  and r.deleted_at is null;

create or replace function public.sync_default_resume_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.default_resume_id is not null
     and not exists (
       select 1 from public.resumes r
       where r.id = new.default_resume_id
         and r.user_id = new.id
         and r.deleted_at is null
     ) then
    raise exception 'default resume must belong to the same user';
  end if;

  if new.default_resume_id is not distinct from old.default_resume_id then
    return new;
  end if;

  update public.resumes
  set is_default = false
  where user_id = new.id
    and deleted_at is null
    and is_default
    and id is distinct from new.default_resume_id;

  if new.default_resume_id is not null then
    update public.resumes
    set is_default = true
    where id = new.default_resume_id
      and user_id = new.id
      and deleted_at is null
      and not is_default;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sync_default_resume on public.profiles;
create trigger profiles_sync_default_resume
after update of default_resume_id on public.profiles
for each row
execute function public.sync_default_resume_from_profile();

create or replace function public.sync_default_resume_from_resume()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.is_default
     and new.deleted_at is null then
    update public.profiles
    set default_resume_id = new.id
    where id = new.user_id
      and default_resume_id is distinct from new.id;
  elsif tg_op = 'INSERT'
     and new.is_default
     and new.deleted_at is null then
    update public.profiles
    set default_resume_id = new.id
    where id = new.user_id
      and default_resume_id is distinct from new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists resumes_sync_default_resume on public.resumes;
create trigger resumes_sync_default_resume
after insert or update of is_default, deleted_at on public.resumes
for each row
execute function public.sync_default_resume_from_resume();

-- ---------------------------------------------------------------------------
-- embedded_resumes: merge parsed_resumes + resume_embeddings
-- ---------------------------------------------------------------------------

alter table public.resume_embeddings rename to embedded_resumes;

alter table public.embedded_resumes
  add column markdown text not null default '',
  add column metadata jsonb not null default '{}'::jsonb,
  add column content_hash text not null default '';

update public.embedded_resumes e
set
  markdown = p.markdown,
  metadata = p.metadata,
  content_hash = p.content_hash
from public.parsed_resumes p
where p.resume_id = e.resume_id;

insert into public.embedded_resumes (resume_id, embedding, model, markdown, metadata, content_hash)
select
  p.resume_id,
  ('[' || repeat('0,', 383) || '0]')::extensions.vector(384),
  'pending',
  p.markdown,
  p.metadata,
  p.content_hash
from public.parsed_resumes p
where not exists (
  select 1 from public.embedded_resumes e where e.resume_id = p.resume_id
);

drop table public.parsed_resumes;

alter index if exists resume_embeddings_hnsw rename to embedded_resumes_hnsw;

create or replace function public.match_resumes_for_job (
  query_embedding extensions.vector(384),
  p_job_id uuid,
  match_count int default 50
)
returns table (
  resume_id uuid,
  application_id uuid,
  applicant_user_id uuid,
  distance float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    e.resume_id,
    s.id as application_id,
    s.applicant_user_id,
    (e.embedding <=> query_embedding)::float as distance
  from public.embedded_resumes e
  inner join public.job_submits s
    on s.resume_id = e.resume_id
  where s.job_post_id = p_job_id
    and s.withdrawn_at is null
  order by e.embedding <=> query_embedding
  limit least(match_count, 50);
$$;

revoke all on function public.match_resumes_for_job(extensions.vector, uuid, int) from public, anon, authenticated;
grant execute on function public.match_resumes_for_job(extensions.vector, uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- match history
-- ---------------------------------------------------------------------------

create table public.match_job (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null references public.resumes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  matched_job_ids uuid[] not null default '{}',
  scoring_config_version text,
  embedding_model text,
  created_at timestamptz not null default now()
);

create index match_job_resume_id_idx on public.match_job (resume_id);
create index match_job_user_id_idx on public.match_job (user_id);
create index match_job_matched_job_ids_gin on public.match_job using gin (matched_job_ids);

alter table public.match_job enable row level security;

create policy "match_job_select_own"
  on public.match_job for select
  to authenticated
  using (user_id = auth.uid() or app_private.current_profile_role() = 'admin');

grant select on public.match_job to authenticated;
grant all on public.match_job to service_role;

create table public.match_resume (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null references public.job_posts (id) on delete cascade,
  matched_resume_ids uuid[] not null default '{}',
  scoring_config_version text,
  embedding_model text,
  created_at timestamptz not null default now()
);

create index match_resume_job_post_id_idx on public.match_resume (job_post_id);
create index match_resume_matched_resume_ids_gin on public.match_resume using gin (matched_resume_ids);

alter table public.match_resume enable row level security;

create policy "match_resume_select_manager"
  on public.match_resume for select
  to authenticated
  using (
    app_private.can_manage_job_post(job_post_id)
    or app_private.current_profile_role() = 'admin'
  );

grant select on public.match_resume to authenticated;
grant all on public.match_resume to service_role;

create table public.match_evidence (
  id uuid primary key default gen_random_uuid(),
  match_job_id uuid references public.match_job (id) on delete cascade,
  match_resume_id uuid references public.match_resume (id) on delete cascade,
  resume_id uuid not null references public.resumes (id) on delete cascade,
  job_post_id uuid not null references public.job_posts (id) on delete cascade,
  rank integer,
  score numeric,
  skill_score numeric,
  experience_score numeric,
  location_score numeric,
  salary_score numeric,
  semantic_score numeric,
  company_score numeric,
  lexical_rank integer,
  semantic_rank integer,
  graph_rank integer,
  matched_skill_names text[],
  related_skill_names text[],
  passed_constraints jsonb,
  failed_constraints jsonb,
  raw_factors jsonb,
  explanation text,
  created_at timestamptz not null default now(),
  constraint match_evidence_one_parent check (
    (match_job_id is not null)::int + (match_resume_id is not null)::int = 1
  )
);

create index match_evidence_match_job_id_idx on public.match_evidence (match_job_id);
create index match_evidence_match_resume_id_idx on public.match_evidence (match_resume_id);
create index match_evidence_pair_idx on public.match_evidence (resume_id, job_post_id);

alter table public.match_evidence enable row level security;

create policy "match_evidence_select_related"
  on public.match_evidence for select
  to authenticated
  using (
    exists (
      select 1 from public.match_job j
      where j.id = match_job_id
        and (j.user_id = auth.uid() or app_private.current_profile_role() = 'admin')
    )
    or exists (
      select 1 from public.match_resume r
      where r.id = match_resume_id
        and (
          app_private.can_manage_job_post(r.job_post_id)
          or app_private.current_profile_role() = 'admin'
        )
    )
  );

grant select on public.match_evidence to authenticated;
grant all on public.match_evidence to service_role;
