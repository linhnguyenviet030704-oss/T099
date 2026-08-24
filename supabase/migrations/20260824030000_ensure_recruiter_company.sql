-- Migration: Guarantee that every recruiter has a company and company membership automatically

create or replace function public.on_recruiter_form_approved()
returns trigger
language plpgsql
security definer
as $$
declare
  v_company_id uuid;
  v_slug text;
  v_comp_name text;
begin
  if new.status = 'approved' and (old is null or old.status <> 'approved') then
    -- 1. Promote role to recruiter
    update public.profiles
    set role = 'recruiter', updated_at = now()
    where id = new.user_id and role = 'candidate';

    -- 2. Ensure company exists
    v_comp_name := coalesce(nullif(trim(new.company_name), ''), 'Công ty của Nhà tuyển dụng');
    v_slug := lower(regexp_replace(v_comp_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substring(new.user_id::text from 1 for 6);

    select id into v_company_id
    from public.companies
    where created_by_user_id = new.user_id
       or lower(name) = lower(v_comp_name)
    limit 1;

    if v_company_id is null then
      insert into public.companies (
        name, slug, website_url, created_by_user_id, verification_status
      ) values (
        v_comp_name, v_slug, new.company_website_url, new.user_id, 'verified'
      )
      returning id into v_company_id;
    end if;

    -- 3. Ensure company_members row exists
    if v_company_id is not null then
      insert into public.company_members (company_id, user_id, role, is_active)
      values (v_company_id, new.user_id, 'owner', true)
      on conflict (company_id, user_id) do update set is_active = true, role = 'owner';
    end if;
  end if;
  return new;
end;
$$;

-- Backfill ALL existing recruiters without an active company membership
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
