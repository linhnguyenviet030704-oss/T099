-- Profiles linked to Supabase Auth users.
-- Frontend may read/update own row; role changes only via service_role.

create schema if not exists app_private;

create type public.profile_role as enum ('candidate', 'recruiter', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  phone text,
  avatar_url text,
  role public.profile_role not null default 'candidate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_unique
  on public.profiles (lower(email))
  where email is not null;

create index profiles_role_idx on public.profiles (role);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- Block role escalation from authenticated clients (service_role may change role).
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.role is distinct from old.role
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'profile role cannot be changed';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role
before update on public.profiles
for each row
execute function public.protect_profile_role();

-- Auto-create profile on signup (security definer kept off the exposed public API surface).
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    'candidate'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function app_private.handle_new_user() from public;
grant execute on function app_private.handle_new_user() to postgres, supabase_auth_admin;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function app_private.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant usage on schema public to authenticated, service_role;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
