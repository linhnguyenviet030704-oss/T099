-- Recruiters manage only jobs they created; admins manage all.
-- Must run after harden_rls (app_private helpers).

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
        or (
          j.created_by_user_id = auth.uid()
          and app_private.is_active_company_member(j.company_id)
        )
      )
  );
end;
$$;
