-- Migration: Automatically promote profile to recruiter when registration form is approved

-- 1. Update protect_profile_role function to allow candidate -> recruiter promotion when an approved form exists
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' and coalesce(auth.role(), '') <> 'service_role' then
    new.role := 'candidate';
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if coalesce(auth.role(), '') <> 'service_role'
       and coalesce(app_private.current_profile_role()::text, '') <> 'admin' then
      -- Allow upgrading candidate to recruiter if an approved recruiter_registration_form exists for this user
      if old.role = 'candidate' and new.role = 'recruiter' then
        if not exists (
          select 1 from public.recruiter_registration_forms
          where user_id = new.id and status = 'approved'
        ) then
          raise exception 'profile role cannot be changed without approved registration form';
        end if;
      else
        raise exception 'profile role cannot be changed';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- 2. Trigger function to auto-update profile role when a form is approved
create or replace function public.on_recruiter_form_approved()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'approved' and (old is null or old.status <> 'approved') then
    update public.profiles
    set role = 'recruiter', updated_at = now()
    where id = new.user_id and role = 'candidate';
  end if;
  return new;
end;
$$;

drop trigger if exists recruiter_form_approved_trigger on public.recruiter_registration_forms;
create trigger recruiter_form_approved_trigger
after insert or update of status on public.recruiter_registration_forms
for each row
execute function public.on_recruiter_form_approved();

-- 3. Backfill existing profiles that have an approved recruiter registration form
update public.profiles p
set role = 'recruiter', updated_at = now()
from public.recruiter_registration_forms r
where p.id = r.user_id
  and r.status = 'approved'
  and p.role = 'candidate';
