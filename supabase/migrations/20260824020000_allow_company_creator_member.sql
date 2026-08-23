-- Migration: Allow creator of a company to insert themselves into company_members as owner
drop policy if exists "company_members_insert_admin_or_owner" on public.company_members;

create policy "company_members_insert_admin_or_owner"
  on public.company_members for insert
  to authenticated
  with check (
    public.current_profile_role() = 'admin'
    or public.is_active_company_member(company_id)
    or exists (
      select 1 from public.companies c
      where c.id = company_id and c.created_by_user_id = auth.uid()
    )
  );
