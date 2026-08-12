-- Mock seed for local testing (password for all users: password123)
-- Applied automatically by: npx supabase db reset

create extension if not exists pgcrypto;

-- Fixed UUIDs so seed is idempotent-friendly after reset.
-- candidate: 11111111-1111-1111-1111-111111111111
-- recruiter: 22222222-2222-2222-2222-222222222222
-- admin:     33333333-3333-3333-3333-333333333333

do $$
declare
  candidate_id uuid := '11111111-1111-1111-1111-111111111111';
  recruiter_id uuid := '22222222-2222-2222-2222-222222222222';
  admin_id uuid := '33333333-3333-3333-3333-333333333333';
  company_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  company2_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  job1_id uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  job2_id uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  job3_id uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  resume_id uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  app1_id uuid := '99999999-9999-9999-9999-999999999991';
  app2_id uuid := '99999999-9999-9999-9999-999999999992';
  pw text := crypt('password123', gen_salt('bf'));
begin
  -- Auth users (profiles auto-created by trigger)
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values
    (
      '00000000-0000-0000-0000-000000000000', candidate_id,
      'authenticated', 'authenticated', 'candidate@example.com', pw, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Nguyễn Văn Ứng Viên"}'::jsonb,
      now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', recruiter_id,
      'authenticated', 'authenticated', 'recruiter@example.com', pw, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Trần Thị Tuyển Dụng"}'::jsonb,
      now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', admin_id,
      'authenticated', 'authenticated', 'admin@example.com', pw, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Admin Hệ Thống"}'::jsonb,
      now(), now(), '', '', '', ''
    );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values
    (gen_random_uuid(), candidate_id, format('{"sub":"%s","email":"candidate@example.com"}', candidate_id)::jsonb, 'email', candidate_id::text, now(), now(), now()),
    (gen_random_uuid(), recruiter_id, format('{"sub":"%s","email":"recruiter@example.com"}', recruiter_id)::jsonb, 'email', recruiter_id::text, now(), now(), now()),
    (gen_random_uuid(), admin_id, format('{"sub":"%s","email":"admin@example.com"}', admin_id)::jsonb, 'email', admin_id::text, now(), now(), now());

  -- Role overrides (bypass protect_profile_role during seed)
  alter table public.profiles disable trigger profiles_protect_role;
  update public.profiles set role = 'recruiter', full_name = 'Trần Thị Tuyển Dụng' where id = recruiter_id;
  update public.profiles set role = 'admin', full_name = 'Admin Hệ Thống' where id = admin_id;
  update public.profiles set full_name = 'Nguyễn Văn Ứng Viên', phone = '0901234567' where id = candidate_id;
  alter table public.profiles enable trigger profiles_protect_role;

  insert into public.companies (
    id, name, slug, website_url, description, created_by_user_id,
    verification_status, verified_at, linkedin_url
  ) values
    (
      company_id, 'FPT Software', 'fpt-software', 'https://fptsoftware.com',
      'Tập đoàn công nghệ hàng đầu Việt Nam, chuyên gia công phần mềm và chuyển đổi số.',
      recruiter_id, 'verified', now(), 'https://linkedin.com/company/fpt-software'
    ),
    (
      company2_id, 'VNG Corporation', 'vng-corporation', 'https://vng.com.vn',
      'Công ty công nghệ internet Việt Nam — gaming, fintech, cloud.',
      recruiter_id, 'verified', now(), 'https://linkedin.com/company/vng'
    );

  insert into public.company_members (company_id, user_id, role, is_active, invited_by_user_id)
  values
    (company_id, recruiter_id, 'owner', true, null),
    (company2_id, recruiter_id, 'owner', true, null);

  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements, benefits,
    location, employment_type, salary_min, salary_max, currency, status,
    published_at, deadline_at
  ) values
    (
      job1_id, company_id, recruiter_id,
      'Frontend React Developer',
      'Phát triển giao diện web với React/TypeScript cho sản phẩm nội bộ và khách hàng doanh nghiệp.',
      E'- 1+ năm React\n- TypeScript\n- Biết Tailwind hoặc CSS modules',
      E'- Laptop\n- Bảo hiểm\n- Hybrid 2 ngày/tuần',
      'Hà Nội', 'full_time', 15000000, 25000000, 'VND', 'published',
      now() - interval '2 days', now() + interval '30 days'
    ),
    (
      job2_id, company_id, recruiter_id,
      'Backend Python Intern',
      'Thực tập xây dựng API FastAPI, làm việc với Postgres/Supabase trong team tuyển dụng nội bộ.',
      E'- Biết Python cơ bản\n- Muốn học FastAPI & SQL',
      E'- Mentor 1:1\n- Trợ cấp thực tập',
      'TP. Hồ Chí Minh', 'internship', 4000000, 7000000, 'VND', 'published',
      now() - interval '1 day', now() + interval '45 days'
    ),
    (
      job3_id, company2_id, recruiter_id,
      'Product Designer (Hybrid)',
      'Thiết kế trải nghiệm sản phẩm cho nền tảng việc làm và công cụ nội bộ nhà tuyển dụng.',
      E'- Portfolio Figma\n- Biết design system\n- Cộng tác tốt với engineering',
      E'- Remote linh hoạt\n- MacBook',
      'Đà Nẵng', 'hybrid', 20000000, 35000000, 'VND', 'published',
      now(), now() + interval '20 days'
    );

  insert into public.user_profile_lines (
    user_id, line_type, title, organization, description, start_date, end_date, display_order
  ) values
    (candidate_id, 'summary', 'Sinh viên CNTT đam mê frontend', null,
     'Tìm kiếm vị trí Fresher/Junior React, sẵn sàng học hỏi nhanh.', null, null, 0),
    (candidate_id, 'education', 'Cử nhân Công nghệ thông tin', 'Đại học Bách Khoa',
     'GPA 3.2/4.0', '2021-09-01', '2025-06-30', 1),
    (candidate_id, 'skill', 'React, TypeScript, Tailwind', null, null, null, null, 2);

  insert into public.resumes (
    id, user_id, bucket_id, storage_path, original_filename, title,
    mime_type, size_bytes, is_default
  ) values (
    resume_id, candidate_id, 'resumes',
    candidate_id::text || '/resumes/' || resume_id::text || '/cv-nguyen-van-ung-vien.pdf',
    'cv-nguyen-van-ung-vien.pdf', 'CV Frontend 2026',
    'application/pdf', 245760, true
  );

  -- Disable auto pending-stage trigger noise for seeded apps: insert apps then stages manually.
  -- Actually triggers will fire — that's fine; we'll add extra screening stage after.

  insert into public.applications (
    id, job_post_id, applicant_user_id, resume_id, cover_letter, current_status
  ) values
    (
      app1_id, job1_id, candidate_id, resume_id,
      'Em rất quan tâm vị trí Frontend React tại FPT Software.', 'pending'
    ),
    (
      app2_id, job3_id, candidate_id, resume_id,
      'Em muốn đóng góp vào sản phẩm design hệ thống việc làm.', 'pending'
    );

  -- Move job3 application to screening (trigger updates current_status)
  insert into public.application_stages (
    application_id, changed_by_user_id, stage, note, is_system_generated
  ) values (
    app2_id, recruiter_id, 'screening', 'CV phù hợp — chuyển sàng lọc', false
  );

  insert into public.saved_jobs (user_id, job_post_id)
  values (candidate_id, job2_id);

  insert into public.recruiter_registration_forms (
    user_id, company_name, company_email, company_website_url, status
  ) values (
    candidate_id, 'Startup Demo Co', 'hr@startup-demo.vn', 'https://startup-demo.vn', 'pending'
  );
end $$;
