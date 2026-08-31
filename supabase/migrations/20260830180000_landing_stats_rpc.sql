-- Hàm RPC lấy số liệu thống kê thực tế cho Landing Page
-- Cho phép cả người dùng ẩn danh (anon) và đã xác thực (authenticated) truy vấn số liệu tổng hợp an toàn mà không lộ thông tin cá nhân.

create or replace function public.get_landing_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jobs_count bigint := 0;
  v_candidates_count bigint := 0;
  v_companies_count bigint := 0;
  v_success_rate numeric := 0;
  v_total_apps bigint := 0;
  v_successful_apps bigint := 0;
begin
  -- 1. Đếm số lượng tin tuyển dụng đang mở (published)
  select count(*) into v_jobs_count
  from public.job_posts
  where status = 'published';

  -- 2. Đếm số lượng ứng viên đã đăng ký trong hệ thống
  select count(*) into v_candidates_count
  from public.profiles
  where role = 'candidate';

  -- Nếu không có ứng viên theo role, đếm tổng số profiles trừ admin
  if v_candidates_count = 0 then
    select count(*) into v_candidates_count
    from public.profiles
    where role is distinct from 'admin';
  end if;

  -- 3. Đếm số lượng công ty đối tác (đã xác thực hoặc có trong hệ thống)
  select count(*) into v_companies_count
  from public.companies
  where verification_status = 'verified';

  if v_companies_count = 0 then
    select count(*) into v_companies_count
    from public.companies;
  end if;

  -- 4. Tính tỷ lệ tuyển dụng thành công dựa trên các đơn ứng tuyển
  select count(*) into v_total_apps
  from public.job_submits;

  if v_total_apps > 0 then
    select count(*) into v_successful_apps
    from public.job_submits
    where current_status in ('offer', 'accepted');

    v_success_rate := round((v_successful_apps::numeric / v_total_apps::numeric) * 100);
  else
    v_success_rate := 0;
  end if;

  return jsonb_build_object(
    'jobs_count', v_jobs_count,
    'candidates_count', v_candidates_count,
    'companies_count', v_companies_count,
    'success_rate', v_success_rate,
    'total_applications', v_total_apps,
    'successful_applications', v_successful_apps
  );
end;
$$;

-- Cấp quyền thực thi hàm cho mọi vai trò (anon, authenticated, service_role)
revoke all on function public.get_landing_stats() from public;
grant execute on function public.get_landing_stats() to anon, authenticated, service_role;
