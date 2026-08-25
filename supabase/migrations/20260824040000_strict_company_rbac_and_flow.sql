-- Migration: Strict RBAC for companies table (Admin/System only insert) and auto-create company on form approval

-- 1. Restrict companies INSERT policy to admin only (recruiters cannot self-create companies on the fly)
drop policy if exists "companies_insert_authenticated" on public.companies;
drop policy if exists "companies_insert_admin_only" on public.companies;

create policy "companies_insert_admin_only"
  on public.companies for insert
  to authenticated
  with check (app_private.current_profile_role() = 'admin');

-- 2. Restrict company_members insert to admin or active owner
drop policy if exists "company_members_insert_admin_or_owner" on public.company_members;

create policy "company_members_insert_admin_or_owner"
  on public.company_members for insert
  to authenticated
  with check (
    app_private.current_profile_role() = 'admin'
    or app_private.is_active_company_member(company_id)
  );

-- 3. Update SECURITY DEFINER trigger to auto-create company and company_members when recruiter registration form is approved
create or replace function public.on_recruiter_form_approved()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_company_id uuid;
  v_slug text;
  v_comp_name text;
begin
  if new.status = 'approved' and (old is null or old.status <> 'approved') then
    -- Upgrade role
    update public.profiles
    set role = 'recruiter', updated_at = now()
    where id = new.user_id;

    -- Create company if not already existing
    v_comp_name := coalesce(nullif(trim(new.company_name), ''), 'Công ty tuyển dụng');
    v_slug := lower(regexp_replace(v_comp_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substring(new.user_id::text from 1 for 6);

    select id into v_company_id
    from public.companies
    where created_by_user_id = new.user_id
    limit 1;

    if v_company_id is null then
      insert into public.companies (
        name, slug, website_url, created_by_user_id, verification_status
      ) values (
        v_comp_name, v_slug, new.company_website_url, new.user_id, 'verified'
      )
      returning id into v_company_id;
    end if;

    -- Add recruiter as owner of their company
    if v_company_id is not null then
      insert into public.company_members (company_id, user_id, role, is_active)
      values (v_company_id, new.user_id, 'owner', true)
      on conflict (company_id, user_id) do update set is_active = true, role = 'owner';
    end if;
  end if;
  return new;
end;
$$;

-- 4. Backfill any existing recruiters/admins that do not have a company membership yet
do $$
declare
  r record;
  v_company_id uuid;
  v_comp_name text;
  v_slug text;
begin
  for r in
    select p.id as user_id, p.full_name, f.company_name, f.company_website_url
    from public.profiles p
    left join public.recruiter_registration_forms f on f.user_id = p.id and f.status = 'approved'
    where p.role in ('recruiter', 'admin')
      and not exists (
        select 1 from public.company_members cm
        where cm.user_id = p.id and cm.is_active
      )
  loop
    v_comp_name := coalesce(nullif(trim(r.company_name), ''), nullif(trim(r.full_name), ''), 'Doanh nghiệp') || ' — Công ty tuyển dụng';
    v_slug := lower(regexp_replace(v_comp_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substring(r.user_id::text from 1 for 6);

    select id into v_company_id
    from public.companies
    where created_by_user_id = r.user_id
    limit 1;

    if v_company_id is null then
      insert into public.companies (
        name, slug, website_url, created_by_user_id, verification_status
      ) values (
        v_comp_name, v_slug, r.company_website_url, r.user_id, 'verified'
      )
      returning id into v_company_id;
    end if;

    if v_company_id is not null then
      insert into public.company_members (company_id, user_id, role, is_active)
      values (v_company_id, r.user_id, 'owner', true)
      on conflict (company_id, user_id) do update set is_active = true, role = 'owner';
    end if;
  end loop;
end;
$$;
