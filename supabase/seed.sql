-- Bulk mock seed for local testing. DO NOT run against a production project.
-- Password for ALL users: password123
-- Known logins:
--   candidate@example.com  (candidate)
--   recruiter@example.com  (recruiter)
--   admin@example.com      (admin)
-- Applied by: npx supabase db reset

create extension if not exists pgcrypto;

do $$
declare
  candidate_id uuid := '11111111-1111-1111-1111-111111111111';
  recruiter_id uuid := '22222222-2222-2222-2222-222222222222';
  admin_id     uuid := '33333333-3333-3333-3333-333333333333';

  pw text := crypt('password123', gen_salt('bf'));
  uid uuid;
  rid uuid;
  cid uuid;
  jid uuid;
  aid uuid;
  i int;
  j int;
  n_lines int;
  line_types public.profile_line_type[] := array[
    'summary', 'experience', 'education', 'skill', 'project',
    'certification', 'language', 'link', 'other'
  ]::public.profile_line_type[];
  emp_types public.employment_type[] := array[
    'full_time', 'part_time', 'internship', 'contract', 'remote', 'hybrid'
  ]::public.employment_type[];
  locations text[] := array[
    'Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ',
    'Huế', 'Nha Trang', 'Remote'
  ];
  job_titles text[] := array[
    'Frontend React Developer', 'Backend Python Engineer', 'Fullstack Developer',
    'Product Designer', 'QA Engineer', 'DevOps Engineer', 'Data Analyst',
    'Mobile Flutter Developer', 'Business Analyst', 'Scrum Master',
    'AI/ML Engineer', 'Security Engineer', 'Technical Writer', 'Intern Software',
    'Cloud Engineer', 'ERP Consultant', 'Sales Engineer', 'Customer Success',
    'HR Specialist', 'Marketing Executive'
  ];
  company_names text[] := array[
    'FPT Software', 'VNG Corporation', 'Viettel Solutions', 'Tiki Corporation',
    'Shopee Vietnam', 'MoMo', 'Techcombank Digital', 'Grab Vietnam',
    'Be Group', 'Zalo Group', 'CMC Global', 'NashTech',
    'KMS Technology', 'Axon Active', 'Logivan', 'Base.vn',
    'Holistics', 'Approva', 'Sky Mavis', 'CocCoc'
  ];
  reg_company_names text[] := array[
    'GreenTech Solutions', 'Saigon Cloud Lab', 'Delta Fintech', 'Nova Retail Tech',
    'Horizon AI', 'Mekong Soft', 'Atlas HR Platform', 'Bright Path Edu',
    'Quantum Logistics', 'Lotus Pay', 'Peak Mobility', 'Urban Farm IoT',
    'Cipher Security VN', 'Amber Media', 'Pinecone Analytics', 'Riverbank ERP',
    'Sunrise Healthtech', 'Cobalt Games', 'Nest Workspace', 'Orbit Travel Tech',
    'Karma Commerce', 'Pulse Biotech', 'Anchor LegalTech', 'Summit PropTech',
    'Willow Creative'
  ];
  first_names text[] := array[
    'An', 'Bình', 'Chi', 'Dũng', 'Em', 'Phúc', 'Giang', 'Hà', 'Hùng', 'Khoa',
    'Lan', 'Minh', 'Nam', 'Oanh', 'Phương', 'Quân', 'Sang', 'Trang', 'Uyên', 'Việt'
  ];
  last_names text[] := array[
    'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng'
  ];
  user_ids uuid[] := '{}';
  company_ids uuid[] := '{}';
  job_ids uuid[] := '{}';
  applicant_ids uuid[] := '{}';
  form_user_ids uuid[] := '{}';
  recruiter_pool uuid[] := '{}';
  full_name text;
  email text;
  title text;
  loc text;
  emp public.employment_type;
  lt public.profile_line_type;
  reg_status public.recruiter_registration_status;
  cname text;
begin
  ---------------------------------------------------------------------------
  -- 100 users (3 known + 97 generated)
  ---------------------------------------------------------------------------
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
    (gen_random_uuid(), candidate_id,
     jsonb_build_object('sub', candidate_id::text, 'email', 'candidate@example.com'),
     'email', candidate_id::text, now(), now(), now()),
    (gen_random_uuid(), recruiter_id,
     jsonb_build_object('sub', recruiter_id::text, 'email', 'recruiter@example.com'),
     'email', recruiter_id::text, now(), now(), now()),
    (gen_random_uuid(), admin_id,
     jsonb_build_object('sub', admin_id::text, 'email', 'admin@example.com'),
     'email', admin_id::text, now(), now(), now());

  user_ids := array[candidate_id, recruiter_id, admin_id];

  for i in 4..100 loop
    uid := ('10000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    full_name := last_names[1 + ((i - 1) % array_length(last_names, 1))]
              || ' '
              || first_names[1 + ((i - 1) % array_length(first_names, 1))]
              || ' '
              || i::text;
    email := 'user' || lpad(i::text, 3, '0') || '@example.com';

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', uid,
      'authenticated', 'authenticated', email, pw, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', full_name),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), uid,
      jsonb_build_object('sub', uid::text, 'email', email),
      'email', uid::text, now(), now(), now()
    );

    user_ids := array_append(user_ids, uid);
  end loop;

  alter table public.profiles disable trigger profiles_protect_role;
  update public.profiles set role = 'recruiter', full_name = 'Trần Thị Tuyển Dụng' where id = recruiter_id;
  update public.profiles set role = 'admin', full_name = 'Admin Hệ Thống' where id = admin_id;
  update public.profiles
    set full_name = 'Nguyễn Văn Ứng Viên', phone = '0901234567'
    where id = candidate_id;
  update public.profiles
    set role = 'recruiter'
    where id in (select unnest(user_ids[4:8]));
  alter table public.profiles enable trigger profiles_protect_role;

  recruiter_pool := array[recruiter_id] || user_ids[4:8];

  ---------------------------------------------------------------------------
  -- 20 companies + 200 published jobs (authorship spread across recruiters)
  ---------------------------------------------------------------------------
  for i in 1..array_length(company_names, 1) loop
    cid := ('a0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into public.companies (
      id, name, slug, website_url, description, created_by_user_id,
      verification_status, verified_at, linkedin_url
    ) values (
      cid,
      company_names[i],
      regexp_replace(lower(company_names[i]), '[^a-z0-9]+', '-', 'g'),
      'https://example.com/' || i::text,
      'Công ty mock #' || i::text || ' — ' || company_names[i],
      recruiter_id,
      'verified',
      now() - ((i % 30) || ' days')::interval,
      'https://linkedin.com/company/mock-' || i::text
    );
    insert into public.company_members (company_id, user_id, role, is_active)
    values (cid, recruiter_id, 'owner', true);
    for j in 2..array_length(recruiter_pool, 1) loop
      insert into public.company_members (company_id, user_id, role, is_active)
      values (cid, recruiter_pool[j], 'recruiter', true)
      on conflict (company_id, user_id) do nothing;
    end loop;
    company_ids := array_append(company_ids, cid);
  end loop;

  for i in 1..200 loop
    jid := ('b0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    cid := company_ids[1 + ((i - 1) % array_length(company_ids, 1))];
    title := job_titles[1 + ((i - 1) % array_length(job_titles, 1))] || ' #' || i::text;
    loc := locations[1 + ((i - 1) % array_length(locations, 1))];
    emp := emp_types[1 + ((i - 1) % array_length(emp_types, 1))];

    insert into public.job_posts (
      id, company_id, created_by_user_id, title, description, requirements, benefits,
      location, employment_type, salary_min, salary_max, currency, status,
      published_at, deadline_at
    ) values (
      jid, cid,
      recruiter_pool[1 + ((i - 1) % array_length(recruiter_pool, 1))],
      title,
      'Mô tả công việc mock cho vị trí ' || title || ' tại công ty đối tác.',
      E'- 1+ năm kinh nghiệm liên quan\n- Làm việc nhóm tốt\n- Tiếng Anh đọc hiểu tài liệu',
      E'- Bảo hiểm\n- Laptop\n- Thưởng dự án',
      loc, emp,
      8000000 + (i % 20) * 1000000,
      15000000 + (i % 20) * 1500000,
      'VND', 'published',
      now() - ((i % 14) || ' days')::interval,
      now() + (((20 + (i % 40))::text) || ' days')::interval
    );
    job_ids := array_append(job_ids, jid);
  end loop;

  ---------------------------------------------------------------------------
  -- 80 users × 15–20 profile lines
  ---------------------------------------------------------------------------
  applicant_ids := array[candidate_id];
  for i in 4..100 loop
    if array_length(applicant_ids, 1) >= 80 then
      exit;
    end if;
    if i between 4 and 8 then
      continue;
    end if;
    applicant_ids := array_append(applicant_ids, user_ids[i]);
  end loop;
  while array_length(applicant_ids, 1) < 80 loop
    i := array_length(applicant_ids, 1) + 1;
    applicant_ids := array_append(applicant_ids, user_ids[i]);
  end loop;

  for i in 1..80 loop
    uid := applicant_ids[i];
    n_lines := 15 + ((i + 3) % 6);
    for j in 1..n_lines loop
      lt := line_types[1 + ((j - 1) % array_length(line_types, 1))];
      insert into public.user_profile_lines (
        user_id, line_type, title, organization, description,
        start_date, end_date, display_order
      ) values (
        uid,
        lt,
        case lt
          when 'summary' then 'Tóm tắt chuyên môn #' || j::text
          when 'experience' then 'Kỹ sư / chuyên viên #' || j::text
          when 'education' then 'Cử nhân / khóa học #' || j::text
          when 'skill' then 'Kỹ năng #' || j::text
          when 'project' then 'Dự án #' || j::text
          when 'certification' then 'Chứng chỉ #' || j::text
          when 'language' then 'Ngôn ngữ #' || j::text
          when 'link' then 'Portfolio / link #' || j::text
          else 'Khác #' || j::text
        end,
        case
          when lt in ('experience', 'education', 'project', 'certification')
            then 'Org mock ' || ((j % 12) + 1)::text
          else null
        end,
        'Nội dung mock line ' || j::text || ' cho user seed #' || i::text,
        case
          when lt in ('experience', 'education', 'project')
            then (date '2018-01-01' + ((j * 97) || ' days')::interval)::date
          else null
        end,
        case
          when lt in ('experience', 'education', 'project') and (j % 3) <> 0
            then (date '2020-01-01' + ((j * 131) || ' days')::interval)::date
          else null
        end,
        j - 1
      );
    end loop;
  end loop;

  ---------------------------------------------------------------------------
  -- Resumes + 20 applications
  ---------------------------------------------------------------------------
  for i in 1..20 loop
    uid := applicant_ids[i];
    rid := ('c0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into public.resumes (
      id, user_id, bucket_id, storage_path, original_filename, title,
      mime_type, size_bytes, is_default
    ) values (
      rid, uid, 'resumes',
      uid::text || '/resumes/' || rid::text || '/cv-mock.pdf',
      'cv-mock-' || i::text || '.pdf',
      'CV mock #' || i::text,
      'application/pdf',
      100000 + i * 1024,
      true
    );
  end loop;

  for i in 1..20 loop
    uid := applicant_ids[i];
    jid := job_ids[i];
    rid := ('c0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    aid := ('d0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;

    insert into public.applications (
      id, job_post_id, applicant_user_id, resume_id, cover_letter
    ) values (
      aid, jid, uid, rid,
      'Cover letter mock #' || i::text || ' — quan tâm vị trí này.'
    );
  end loop;

  insert into public.application_stages (
    application_id, changed_by_user_id, stage, note, is_system_generated
  )
  select
    ('d0000000-0000-4000-8000-' || lpad(gs::text, 12, '0'))::uuid,
    recruiter_id,
    case (gs % 4)
      when 0 then 'screening'::public.application_status
      when 1 then 'interview'::public.application_status
      when 2 then 'offer'::public.application_status
      else 'rejected'::public.application_status
    end,
    'Cập nhật giai đoạn mock #' || gs::text,
    false
  from generate_series(1, 8) as gs;

  insert into public.saved_jobs (user_id, job_post_id)
  select candidate_id, job_ids[gs]
  from generate_series(21, 30) as gs;

  ---------------------------------------------------------------------------
  -- 25 recruiter registration forms (pending / approved / rejected)
  -- one row per user (pending uniqueness constraint)
  ---------------------------------------------------------------------------
  form_user_ids := array[candidate_id];
  for i in 9..32 loop
    form_user_ids := array_append(form_user_ids, user_ids[i]);
  end loop;

  for i in 1..array_length(form_user_ids, 1) loop
    uid := form_user_ids[i];
    cname := reg_company_names[1 + ((i - 1) % array_length(reg_company_names, 1))];
    if i <= 12 then
      reg_status := 'pending';
    elsif i <= 20 then
      reg_status := 'approved';
    else
      reg_status := 'rejected';
    end if;

    insert into public.recruiter_registration_forms (
      user_id, company_name, company_email, company_website_url,
      business_license_storage_path, status, admin_note,
      reviewed_by_user_id, reviewed_at, created_at
    ) values (
      uid,
      cname,
      'hr@' || regexp_replace(lower(cname), '[^a-z0-9]+', '', 'g') || '.vn',
      'https://' || regexp_replace(lower(cname), '[^a-z0-9]+', '-', 'g') || '.vn',
      case when (i % 3) = 0 then uid::text || '/licenses/giay-phep.pdf' else null end,
      reg_status,
      case reg_status
        when 'approved' then 'Đã xác minh giấy tờ — duyệt seed.'
        when 'rejected' then 'Thiếu giấy phép / thông tin không khớp.'
        else null
      end,
      case when reg_status = 'pending' then null else admin_id end,
      case when reg_status = 'pending' then null else now() - ((i % 10) || ' days')::interval end,
      now() - ((i + 2) || ' days')::interval
    );
  end loop;
end $$;
