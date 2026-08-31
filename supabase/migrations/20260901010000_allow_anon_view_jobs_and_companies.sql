-- Migration: Cho phép người dùng chưa đăng nhập (khách / anon) xem danh sách tin tuyển dụng (job_posts) và thông tin công ty (companies)

-- 1. Cấp quyền truy cập schema app_private và thực thi các hàm bảo mật cho vai trò anon
grant usage on schema app_private to anon, authenticated, service_role;

grant execute on function app_private.current_profile_role() to anon, authenticated, service_role;
grant execute on function app_private.is_active_company_member(uuid) to anon, authenticated, service_role;
grant execute on function app_private.can_manage_job_post(uuid) to anon, authenticated, service_role;

grant execute on function public.current_profile_role() to anon, authenticated, service_role;
grant execute on function public.is_active_company_member(uuid) to anon, authenticated, service_role;
grant execute on function public.can_manage_job_post(uuid) to anon, authenticated, service_role;

-- 2. Đảm bảo quyền SELECT trên job_posts và companies cho anon
grant select on public.job_posts to anon, authenticated;
grant select on public.companies to anon, authenticated;

-- 3. Tối ưu RLS Policies cho job_posts:
-- Phân tách policy riêng cho anon (chỉ xem published jobs) và authenticated (xem published jobs hoặc jobs do recruiter quản lý)
drop policy if exists "job_posts_select_published_or_member" on public.job_posts;
drop policy if exists "job_posts_select_anon" on public.job_posts;
drop policy if exists "job_posts_select_authenticated" on public.job_posts;

create policy "job_posts_select_anon"
  on public.job_posts for select
  to anon
  using (status = 'published');

create policy "job_posts_select_authenticated"
  on public.job_posts for select
  to authenticated
  using (
    status = 'published'
    or app_private.can_manage_job_post(id)
  );

-- 4. Tối ưu RLS Policies cho companies:
-- Phân tách policy riêng cho anon (chỉ xem verified companies) và authenticated (xem verified companies hoặc công ty mình tạo/quản lý/admin)
drop policy if exists "companies_select_verified_or_member" on public.companies;
drop policy if exists "companies_select_anon" on public.companies;
drop policy if exists "companies_select_authenticated" on public.companies;

create policy "companies_select_anon"
  on public.companies for select
  to anon
  using (verification_status = 'verified');

create policy "companies_select_authenticated"
  on public.companies for select
  to authenticated
  using (
    verification_status = 'verified'
    or created_by_user_id = auth.uid()
    or app_private.is_active_company_member(id)
    or app_private.current_profile_role() = 'admin'
  );
