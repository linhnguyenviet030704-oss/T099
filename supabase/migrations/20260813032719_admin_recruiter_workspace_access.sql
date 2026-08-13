-- Allow admins to read all profiles (needed for applicant/reviewer lookup in cockpits).
-- Already applied on local; kept for clean migration history / db reset.

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles
  for select
  to authenticated
  using (public.current_profile_role() = 'admin');
