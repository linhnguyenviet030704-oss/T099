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
  cv_titles text[] := array[
    'Senior React Engineer',
    'Mid React TypeScript',
    'React Next specialist',
    'React JavaScript Git',
    'React TypeScript emailed zips',
    'Junior React JavaScript',
    'React Git intern',
    'React TypeScript contractor',
    'Angular TypeScript frontend',
    'Vanilla JavaScript Git',
    'TypeScript Git libraries',
    'JavaScript only intern',
    'Git only release manager',
    'React plus Python backend',
    'Fullstack React Python',
    'Python FastAPI Git',
    'Python FastAPI data',
    'DevOps Docker Linux Git',
    'Docker Linux operator',
    'PostgreSQL DBA',
    'SQL report analyst',
    'Linux sysadmin',
    'Python scripting',
    'Product designer Figma',
    'Business analyst',
    'Career change accountant',
    'Node JavaScript Git Linux',
    'Staff frontend architect',
    'WordPress JavaScript Git',
    'React bootcamp graduate'
  ];
  cv_names text[] := array[
    'Nguyễn Văn Ứng Viên',
    'Trần Minh Khoa',
    'Lê Thị Hạnh',
    'Phạm Đức Anh',
    'Hoàng Ngọc Lan',
    'Huỳnh Gia Bảo',
    'Phan Thanh Tâm',
    'Vũ Hải Đăng',
    'Võ Thị Mai',
    'Đặng Quốc Huy',
    'Nguyễn Thị Phương',
    'Trần Văn Long',
    'Lê Minh Tú',
    'Phạm Thị Hoa',
    'Hoàng Anh Tuấn',
    'Huỳnh Nhật Nam',
    'Phan Thị Linh',
    'Vũ Đức Thịnh',
    'Võ Thanh Hà',
    'Đặng Gia Hân',
    'Nguyễn Hữu Phước',
    'Trần Khánh Vy',
    'Lê Quốc Bảo',
    'Phạm Minh Châu',
    'Hoàng Nhật Quang',
    'Huỳnh Thị Yến',
    'Phan Văn Sơn',
    'Vũ Ngọc Ánh',
    'Võ Đình Khôi',
    'Đặng Thùy Dương'
  ];
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

  update public.job_posts
  set
    description = 'FPT Software hiring a Frontend React Developer for a product squad. You will ship component libraries, hooks, and dashboard screens with React, TypeScript, and JavaScript, and review Git pull requests daily.',
    requirements = E'React TypeScript JavaScript Git\n- 2+ years building production UIs with React\n- Strong TypeScript and JavaScript\n- Git pull requests and code review'
  where id = job_ids[1];

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
      insert into public.profile_lines (
        user_id, name, value, display_order
      ) values (
        uid,
        lt,
        case lt
          when 'summary' then 'Tóm tắt chuyên môn #' || j::text || E'\n' || 'Nội dung mock line ' || j::text
          when 'experience' then 'Kỹ sư / chuyên viên #' || j::text || E'\nOrg mock ' || ((j % 12) + 1)::text
          when 'education' then 'Tốt nghiệp đại học quốc gia HCM; CPA: 3.2/4.0 #' || j::text
          when 'skill' then 'Kỹ năng #' || j::text
          when 'project' then 'Dự án #' || j::text
          when 'certification' then 'Chứng chỉ #' || j::text
          when 'language' then 'Ngôn ngữ #' || j::text
          when 'link' then 'Portfolio / link #' || j::text
          else 'Khác #' || j::text
        end,
        j - 1
      );
    end loop;
  end loop;

  ---------------------------------------------------------------------------
  -- 30 demo resumes. Job 1 (FPT Frontend React #1) gets all 30 applications.
  -- Storage objects are not created here. After reset run:
  --   python scripts/seed_mock_cvs.py
  ---------------------------------------------------------------------------
  for i in 1..30 loop
    uid := applicant_ids[i];
    rid := ('c0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into public.resumes (
      id, user_id, bucket_id, storage_path, original_filename, title,
      mime_type, size_bytes, is_default
    ) values (
      rid, uid, 'resumes',
      uid::text || '/resumes/' || rid::text || '/cv-mock.pdf',
      'cv-mock-' || i::text || '.pdf',
      cv_titles[i],
      'application/pdf',
      100000 + i * 1024,
      true
    );
    update public.profiles set full_name = cv_names[i] where id = uid;
  end loop;

  for i in 1..20 loop
    uid := applicant_ids[i];
    jid := job_ids[i];
    rid := ('c0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    aid := ('d0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;

    insert into public.job_submits (
      id, job_post_id, applicant_user_id, resume_id, cover_letter
    ) values (
      aid, jid, uid, rid,
      'Cover letter mock #' || i::text || ' — quan tâm vị trí này.'
    );
  end loop;

  for i in 2..30 loop
    uid := applicant_ids[i];
    rid := ('c0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    aid := ('e0000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    insert into public.job_submits (
      id, job_post_id, applicant_user_id, resume_id, cover_letter
    ) values (
      aid, job_ids[1], uid, rid,
      'Cover letter — ' || cv_titles[i]
    );
  end loop;

  insert into public.application_stages (
    application_id, changed_by_user_id, stage, note, is_system_generated
  )
  select
    ('e0000000-0000-4000-8000-' || lpad(gs::text, 12, '0'))::uuid,
    recruiter_id,
    case (gs % 5)
      when 1 then 'screening'::public.application_status
      when 2 then 'interview'::public.application_status
      when 3 then 'offer'::public.application_status
      when 4 then 'rejected'::public.application_status
      else 'screening'::public.application_status
    end,
    'Seed pipeline demo #' || gs::text,
    false
  from generate_series(2, 30) as gs
  where (gs % 5) <> 0;

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

-- === BEGIN VIETJOBS-IT-SEED (generated by scripts/build_vietjobs_it_seed.py) ===
-- Real VietJobs IT job postings mapped to the 15 groups in
-- data_find/data/it-job-categories.md (same taxonomy as
-- data_find/generated_cv/metadata.csv), for CV<->JD matching evaluation.
-- Source: data_find/data/vietjobs/VietJobs_full.csv (VietJobs dataset).
-- Regenerate with: python scripts/build_vietjobs_it_seed.py
-- Do not hand-edit the rows below — the block gets replaced wholesale.
--
-- Uses the recruiter account created earlier in this file as company owner
-- / job author. Creates its own pool of IT companies, separate from the
-- 20 companies above.

do $$
declare
  recruiter_id uuid := '22222222-2222-2222-2222-222222222222';
  cid uuid;
  jid uuid;
  company_ids uuid[] := '{}';
  company_names text[] := array[
    'DataViet Solutions',
    'Bamboo Software',
    'Hanoi Cloud Labs',
    'Saigon Devtech',
    'Indigo Systems',
    'Northstar IT',
    'Fintech Wave',
    'Coral Reef Software',
    'Emerald Data Works',
    'Falcon Security VN',
    'Mekong Digital',
    'Skyline Platform'
  ];
begin
  for i in 1..array_length(company_names, 1) loop
    cid := ('f0000000-0000-4000-9000-' || lpad(i::text, 12, '0'))::uuid;
    insert into public.companies (
      id, name, slug, website_url, description, created_by_user_id,
      verification_status, verified_at
    ) values (
      cid, company_names[i],
      regexp_replace(lower(company_names[i]), '[^a-z0-9]+', '-', 'g') || '-vj',
      'https://example.com/vj-' || i::text,
      'Công ty CNTT (seed VietJobs) #' || i::text || ' — ' || company_names[i],
      recruiter_id, 'verified', now() - ((i % 20) || ' days')::interval
    )
    on conflict (id) do nothing;
    insert into public.company_members (company_id, user_id, role, is_active)
    values (cid, recruiter_id, 'owner', true)
    on conflict (company_id, user_id) do nothing;
    company_ids := array_append(company_ids, cid);
  end loop;

  -- [1/94] group 1 (Software Development): Senior Mobile Developer
  jid := 'b1a71b69-20b5-5ccc-a8bd-087664d77801'::uuid;
  cid := company_ids[1];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Senior Mobile Developer',
    'Xây dựng các tài liệu đặc tả ứng dụng thông qua sự trao đổi với BA/SA, bộ phận nghiệp vụ và các bên liên quan khác. Thực hiện việc phát triển ứng dụng và yêu cầu thay đổi theo quy trình, quy định phát triển ứng dụng CNTT của VPBank, thực hiện unit test trong quá trình phát triển và xây dựng tài liệu release note. Thiết kế hệ thống và mô hình dữ liệu, phân tích cấu trúc dữ liệu hiện hữu và xác định các hạng mục cần được cải thiện để nâng cao hiệu quả hoạt động. Dựa trên các thông tin cung cấp bởi BA/SA, cung cấp các ước lượng nỗ lực cho việc phát triển các yêu cầu, đảm bảo ước lượng nỗ lực chính xác với khả năng và năng lực. Xây dựng các gói cái đặt và hiện triển khai trên các môi trường khác nhau (test, pilot, production) và xây dựng check list các bước thực hiện triển khai. Tham ra vào quá trình triển khai ứng dụng. Xây dựng tài liệu đặt tả kỹ thuật chi tiết, xây dựng tài liệu vận hành và thực hiện bàn giao các tài liệu trên cho đơn vị vận hành. Nâng cấp, thay thế, sửa chữa và phát triển mới các yêu cầu nghiệp vụ. Cung cấp kiến thức, và tư vấn giải pháp kỹ thuật phù hợp với yêu cầu phát triển của nghiệp vụ nhưng vẫn đảm bảo việc vận hành và phát triển của hệ thống. Đào tạo nội bộ, hướng dẫn cho các thành viên khác trong nhóm về khả năng của công nghệ / hệ thống mới và tính tính khả thi cho việc triển khai. Nghiên cứu tìm kiếm nguyên nhân lỗi, sự cố và các vấn đề của ứng dụng, hỗ trợ người sử dụng trong vai trò chuyên gia kỹ thuật. Học tập và nghiên cứu các kỹ thuật lập trình, phát triển, các công nghệ mới và đề xuất áp dụng trong quá trình phát triển và triển khai ứng dụng. Tuân thủ quy trình phát triển phần mềm của Khối CNTT và VPBank ban hành. Thực hiện các công việc vai trò khác được giao bởi lãnh đạo trực tiếp, quản lý và giám đốc. Tham ra vào quá trình nâng cấp hệ thống, khắc phục lỗi ATTT và đảm bảo việc lập trình an toàn.

Yêu cầu chi tiết: Trình độ đào tạo: Tốt nghiệp Đại học trở lên chuyên ngành Công nghệ thông tin hoặc Chuyên môn liên quan. Kiến thức/ Chuyên môn cần có: Có tối thiểu 5 năm kinh nghiệm phát triển ứng dụng mobile application. Có khả năng phân tích và thiết kế hệ thống, hiểu về các design pattern như MVC, MVVC, MVP. Cấu trúc dữ liệu và giải thuật, biết cách tối ưu hóa hiệu năng và bộ nhớ khi xử lý dữ liệu trong ứng dụng mobile. Quy trình phát triển mobile app, Nắm vững lifecycle của ứng dụng Android và iOS, quản lý trạng thái, bộ nhớ, và tương tác với hệ điều hành. Hiểu biết và tích hợp chuyên sâu về hệ thống RESTFul API (Hệ thống backend), khả năng làm việc với backend Developer để phát triển ứng dụng phù hợp với tiêu chuẩn và chất lượng được đề ra. Thành thạo việc phát triển các SDK để tích hợp với bên thứ 3. Nắm vững và phát triển được ứng dụng theo native application cho android và IOS với Java, Swift/Objective-C. Biết viết unit test, UI test. Biết cách xử lý các vấn đề thường gặp khi tích hợp SDK như conflict dependency, lỗi runtime, vấn đề bảo mật/hiệu năng khi SDK chạy nền. Trên 2 năm kinh nghiệm phân tích yêu cầu phát triển cho các doanh nghiệp CNTT cho các doanh nghiệp lớn (Banking, Finance, Telco). Phân tích yêu cầu và tham gia triển khai hệ thống CNTT có số lượng giao dịch, người sử dụng lớn. Đã từng tham gia bảo trì, refactor hoặc mở rộng tính năng cho một ứng dụng mobile hiện có.',
    '- Bằng cấp: Tốt nghiệp Đại học trở lên chuyên ngành Công nghệ thông tin hoặc Chuyên môn liên quan
- Kỹ năng chuyên môn: Phát triển ứng dụng mobile application, Phân tích và thiết kế hệ thống, Design pattern (MVC, MVVC, MVP), Cấu trúc dữ liệu và giải thuật, Quy trình phát triển mobile app, RESTFul API, Phát triển SDK, Native application cho Android và iOS với Java, Swift/Objective-C, Viết unit test, UI test
- Kinh nghiệm: 5 năm',
    '- Thu nhập hấp dẫn, lương thưởng cạnh tranh theo năng lực
- Thưởng các Ngày lễ, Tết, performance
- Chính sách vay ưu đãi của ngân hàng
- Bảo hiểm bắt buộc theo luật lao động + Bảo hiểm VPBank care
- Chế độ ngày phép theo cấp bậc công việc
- Tham gia các khóa đào tạo nghiệp vụ chuyên môn, kỹ năng',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((1 % 21) || ' days')::interval,
    now() + ((20 + (1 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [2/94] group 1 (Software Development): Senior Frontent Developer (Reactjs)
  jid := '6ed7b553-746b-55df-8958-a3fefb9ff56b'::uuid;
  cid := company_ids[2];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Senior Frontent Developer (Reactjs)',
    'Xây dựng các tài liệu đặc tả ứng dụng thông qua sự trao đổi với BA/SA, bộ phận nghiệp vụ và các bên liên quan khác. Thực hiện việc phát triển ứng dụng và yêu cầu thay đổi theo quy trình, quy định phát triển ứng dụng CNTT của VPBank, thực hiện unit test trong quá trình phát triển và xây dựng tài liệu release note. Thiết kế hệ thống và mô hình dữ liệu, phân tích cấu trúc dữ liệu hiện hữ và xác định các hạng mục cần được cải thiện để nâng cao hiệu quả hoạt động. Dựa trên các thông tin cung cấp bởi BA/SA, cung cấp các ước lượng nỗ lực cho việc phát triển các yêu cầu, đảm bảo ước lượng nỗ lực chính xác với khả năng và năng lực. Xây dựng các gói cái đặt và hiện triển khai trên các môi trường khác nhau (test, pilot, production) và xây dựng check list các bước thực hiện triển khai. Tham ra vào quá trình triển khai ứng dụng. Xây dựng tài liệu đặt tả kỹ thuật chi tiết, xây dựng tài liệu vận hành và thực hiện bàn giao các tài liệu trên cho đơn vị vận hành. Nâng cấp, thay thế, sửa chữa và phát triển mới các yêu cầu nghiệp vụ. Cung cấp kiến thức, và tư vấn giải pháp kỹ thuật phù hợp với yêu cầu phát triển của nghiệp vụ nhưng vẫn đảm bảo việc vận hành và phát triển của hệ thống. Đào tạo nội bộ, hướng dẫn cho các thành viên khác trong nhóm về khả năng của công nghệ / hệ thống mới và tính tính khả thi cho việc triển khai. Nghiên cứu tìm kiếm nguyên nhân lỗi, sự cố và các vấn đề của ứng dụng, hỗ trợ người sử dụng trong vai trò chuyên gia kỹ thuật. Học tập và nghiên cứu các kỹ thuật lập trình, phát triển, các công nghệ mới và đề xuất áp dụng trong quá trình phát triển và triển khai ứng dụng. Tuân thủ quy trình phát triển phần mềm của Khối CNTT và VPBank ban hành. Thực hiện các công việc vai trò khác được giao bởi lãnh đạo trực tiếp, quản lý và giám đốc. Tham ra vào quá trình nâng cấp hệ thống, khắc phục lỗi ATTT và đảm bảo việc lập trình an toàn.

Yêu cầu chi tiết: Trình độ đào tạo: Tốt nghiệp Đại học trở lên chuyên ngành Công nghệ thông tin hoặc Chuyên môn liên quan. Kiến thức/ Chuyên môn cần có: Kiến thức và kinh nghiệm về thiết kế giao diện, lập trình như React, vueJs, angularjs. Sử dụng thành thạo Figma. Có hiểu biết cơ bản về CSDL như MS SQL, Oracle. Kiến thức về phân tích và triển khai ứng dụng trên nền tảng web. Kiến thức về mô hình ứng dụng Single Page Application, Micro-Frontend, SSO. Trên 5 năm kinh nghiệm với ngôn ngữ ngôn ngữ lập trình Frontend như React, vueJs, angularjs. Trên 5 năm kinh nghiệm làm việc với các công cụ thiết kế giao diện như Figma. Có kinh nghiệm phân tích yêu cầu và tham ra triển khai hệ thống CNTT, tối ưu hệ thống có số lượng giao dịch, người sử dụng lớn. Có hiểu biết về Single Page Application, Micro-Frontend, SSO. Có hiểu biết về database là 1 lợi thế. Có kinh nghiệm phát triển phần mềm trên AWS là 1 lợi thể. Hiểu biết về nghiệp vụ ngân hàng và có kinh nghiệm phân tích và triển khai hệ thống CNTT cho ngân hàng là lợi thế. Có kinh nghiệm làm việc với các nền tảng như camunda, activity, flowable là một lợi thế.',
    '- Bằng cấp: Tốt nghiệp Đại học trở lên chuyên ngành Công nghệ thông tin hoặc Chuyên môn liên quan
- Kỹ năng chuyên môn: React, vueJs, angularjs, Figma, MS SQL, Oracle
- Kinh nghiệm: 5 năm',
    '- Thu nhập hấp dẫn, lương thưởng cạnh tranh theo năng lực
- Thưởng các Ngày lễ, Tết (theo chính sách ngân hàng từng thời kỳ)
- Chính sách vay ưu đãi CBNV theo từng thời kỳ
- Chế độ ngày phép hấp dẫn theo cấp bậc công việc
- Bảo hiểm bắt buộc theo luật lao động + Bảo hiểm VPBank care cho CBNV tùy theo cấp bậc và thời gian công tác
- Được tham gia các khóa đào tạo tùy thuộc vào Khung đào tạo cho từng vị trí
- Môi trường làm việc năng động, thân thiện, có nhiều cơ hội học đào tạo, học hỏi và phát triển; tham gia nhiều hoạt động văn hóa thú vị',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((2 % 21) || ' days')::interval,
    now() + ((20 + (2 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [3/94] group 1 (Software Development): Nhà phát triển back-end (NodeJS)
  jid := '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd'::uuid;
  cid := company_ids[3];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhà phát triển back-end (NodeJS)',
    'FPT Software, một công ty con của FPT Group, là nhà cung cấp dịch vụ CNTT hàng đầu toàn cầu có trụ sở tại Việt Nam. Với hơn 33.000 nhân viên tại 88 văn phòng trên 30 quốc gia, chúng tôi phục vụ hơn 1.100 khách hàng, bao gồm 96 công ty Fortune 500. Chúng tôi tin rằng sự đổi mới nhiên liệu đa dạng và cố gắng tạo ra một nơi làm việc toàn diện nơi tài năng của tất cả các nền tảng phát triển mạnh. Chúng tôi hoan nghênh những người nước ngoài và các chuyên gia quốc tế để mang lại những quan điểm mới mẻ và giúp định hình tương lai của công nghệ. Tổng quan về công việc: Chúng tôi đang tìm kiếm nhà phát triển back-end cao cấp, người sẽ là một phần quan trọng của bộ phận công nghệ thông tin xây dựng, hỗ trợ và chia tỷ lệ các ứng dụng kinh doanh CNTT. Cá nhân này sẽ đảm bảo các hệ thống nằm trong chất lượng và đáp ứng kỳ vọng về hiệu suất dịch vụ. Trách nhiệm: Liên quan đến thiết kế hệ thống mới và phát triển API RESTful bằng cách sử dụng NestJS. Quản lý trao đổi dữ liệu giữa máy chủ và người dùng. Thực hiện các lược đồ cơ sở dữ liệu và thực hiện di chuyển dữ liệu bằng MySQL, MongoDB. Xây dựng mã và thư viện có thể tái sử dụng để sử dụng trong tương lai. Thực hiện các hệ thống xác thực và ủy quyền an toàn (JWT, OAuth). Tối ưu hóa các ứng dụng cho tốc độ và khả năng mở rộng tối đa. Viết các bài kiểm tra đơn vị và tích hợp để đảm bảo mã chất lượng cao. Làm việc với các nền tảng và dịch vụ đám mây như Azure, Heroku hoặc GCP để triển khai. Khắc phục sự cố, gỡ lỗi và tối ưu hóa ứng dụng phụ trợ cho một hoặc nhiều ứng dụng hệ thống. Chuẩn bị tài liệu kỹ thuật và người dùng.

Yêu cầu chi tiết: Basic Qualifications: Good at English. Proven experience as a Backend Developer with MERN stack applications. Good experience and understanding of Object-Oriented Programming (OOP), Algorithm & Structures. Good working experience developing backend for Web and Mobile applications and integrating enterprise systems. Good working experience with Typescript, NestJS, RESTful APIs, and related technologies. Good working experience with RDBMS Databases (MySQL), as well as NoSQL (like MongoDB). Familiarity with security best practices and securing backend systems (e.g., data encryption, API rate-limiting, OWASP). Proficiency in writing clean, maintainable, and efficient code. Experience with version control (Git, Bitbucket) and continuous integration/delivery pipelines (CI/CD). Process strong analytical skills. Team player with good interpersonal and communication skills. Nice to have: Experience with microservices architecture. Familiarity with Docker and containerized applications. Familiarity with cloud platforms and deployment pipelines (e.g., AWS, GCP, or Azure). Knowledge of Nginx or other reverse proxy servers. Experience with message queues (e.g., Nats, RabbitMQ, Kafka). Experience with Golang. Experience with SQL. Experience with KeyCloak.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Node.js, RESTful APIs, Javascript (es6+), Express.js, Typescript, NestJS, MySQL, MongoDB, Git, Bitbucket
- Kỹ năng mềm: Team player, Good interpersonal skills, Good communication skills, Strong analytical skills
- Kinh nghiệm: 3 năm',
    '- FPT Care insurance plan
- Attractive annual summer vacation allowance
- Sponsored training courses for personal growth
- Up to 100% coverage for certification costs
- Global and inclusive workplace
- Work-life balance benefits
- Annual health check-ups',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((3 % 21) || ' days')::interval,
    now() + ((20 + (3 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [4/94] group 1 (Software Development): Lập Trình Viên Fresher/Middle C#, .Net Kiêm BA
  jid := 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac'::uuid;
  cid := company_ids[4];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Lập Trình Viên Fresher/Middle C#, .Net Kiêm BA',
    'Tham gia nghiên cứu và phát triển các dự án tại các công ty con, công ty thành viên của Tập Đoàn như module HRM, module quản lý công việc, module quản lý khách sạn, website, .... Đọc và phân tích tài liệu yêu cầu chức năng từ khách hàng (là các phòng ban/bộ phận/công ty con/thành viên của Tập Đoàn) để đảm bảo hiểu rõ và đáp ứng chính xác. Viết tài liệu thiết kế chi tiết, thực hiện coding và unit test với các dự án công nghệ. Đã làm việc với: .NET MVC Core, C#, Entity Framework, LINQ, Web API. Đã làm việc với: HTML, CSS, Javascript, JQuery, Bootstrap, ... Đã từng làm với ít nhất một Database: SQL Server, MySQL, Oracle... Biết thiết kế CSDL theo các dạng chuẩn (SQL) hoặc NoSQL. Sử dụng được tool quản lý source code như: Git, ... Đọc hiểu tài liệu tiếng Anh chuyên ngành. Không ngừng nghiên cứu và học hỏi công nghệ mới để nâng cao kỹ năng và năng suất làm việc. Được hỗ trợ và hướng dẫn bởi các thành viên khác trong nhóm phát triển. Tham gia nhiều dự án khác theo yêu cầu của quản lý và Project Manager (PM). Phối hợp với các bộ phận BA, Tester, UI/UX để phân tích yêu cầu và triển khai tính năng mới. Xây dựng, cải tiến các module trong hệ thống ERP như: HRM, CRM, Account, DMS, ... và các module nghiệp vụ khác theo định hướng phát triển của Tập Đoàn; Đã nghiên cứu việc xử lý dữ liệu lớn, tối ưu truy vấn SQL và hiệu năng hệ thống là một lợi thế. Làm việc theo mô hình Agile/Scrum, đảm bảo tiến độ và chất lượng phần mềm. Soạn thảo và cập nhật tài liệu kỹ thuật, bao gồm tài liệu thiết kế và hướng dẫn sử dụng. Phân tích và làm rõ các yêu cầu về phần mềm của đơn vị sử dụng. Phân tích và đưa ra mô hình lược đồ dựa trên yêu cầu đã thu thập được. Viết các tài liệu đặc tả yêu cầu nghiệp vụ phần mềm, tài liệu đặc tả trường hợp sử dụng (usecase); thiết kế giao diện mẫu (prototype), kiểm thử phần mềm (testcase). Tư vấn trên góc độ nghiệp vụ dựa vào các phân tích và nghiên cứu của mình. Truyền đạt thông tin nội dung, kiểm tra, giám sát, kiểm thử nghiệm thu chất lượng, tính năng phần mềm. Tài liệu hóa hướng dẫn hệ thống, quy trình, tác vụ. Tổ chức hướng dẫn, hỗ trợ cho người dùng sử dụng sản phẩm và xử lý sự cố khi vấn đề xảy ra. Quản lý thay đổi theo yêu cầu và đảm bảo rằng yêu cầu được cập nhật theo thay đổi.

Yêu cầu chi tiết: Tốt nghiệp Cao Đẳng/Đại Học chuyên ngành Công Nghệ Thông Tin hoặc liên quan đến công nghệ phần mềm. Có ít nhất 6 tháng - 1 năm kinh nghiệm (hoặc đã từng làm việc khi còn đi học) với C#, ASP.NET MVC core, Jquery, JavaScript, HTML/CSS, SQL (MsSQL/MySQL). Nếu cần sẽ được đào tạo thêm trong quá trình thử việc. Ứng viên phải có kỹ năng giao tiếp tốt với thái độ tích cực. Nhanh nhẹn, ham học hỏi, tinh thần trách nhiệm cao. Yêu cầu khác: Trung thực, có trách nhiệm, và chịu trách nhiệm trong công việc.',
    '- Bằng cấp: Cao Đẳng/Đại Học chuyên ngành Công Nghệ Thông Tin hoặc liên quan đến công nghệ phần mềm
- Kỹ năng chuyên môn: C#, ASP.NET MVC core, Jquery, JavaScript, HTML, CSS, SQL (MsSQL/MySQL)
- Kỹ năng mềm: Kỹ năng giao tiếp tốt, Thái độ tích cực, Nhanh nhẹn, Ham học hỏi, Tinh thần trách nhiệm cao
- Kinh nghiệm: 6 tháng',
    '- BHXH
- BHYT
- BHTN
- du lịch 1 lần/năm
- thưởng lễ tết
- lương Tháng 13
- thưởng theo kết quả KD
- chế độ sinh nhật
- hiếu hỉ
- đồng phục
- xăng xe
- chế độ riêng cho Cấp quản lý',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((4 % 21) || ' days')::interval,
    now() + ((20 + (4 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [5/94] group 1 (Software Development): Frontend Developer (next.js, React, TypeScript)
  jid := '87af7aff-a2b6-534f-a79f-72a337b8273e'::uuid;
  cid := company_ids[5];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Frontend Developer (next.js, React, TypeScript)',
    'Xây dựng các tính năng phía trước có thể truy cập, có thể truy cập bằng cách sử dụng Next.js, React, TypeScript và TailWindcss. Xử lý các tương tác của người dùng với môi trường Web3 và ký/xác minh các giao dịch blockchain trên Frontend. Dịch các thiết kế figma thành các thành phần sạch, có thể duy trì phù hợp với thông số kỹ thuật cao. Hiểu sâu về trang kết xuất các thực tiễn tốt nhất, để đạt được thời gian tải trang tối ưu. Thêm đánh bóng và tương tác: trạng thái di chuột, chuyển tiếp, hiệu ứng cuộn, hình ảnh động. Hỗ trợ SEO và hiệu suất thực hành tốt nhất thông qua các quyết định mặt trước thông minh. Kiểm tra công việc của bạn trên các trình duyệt và thiết bị hiện đại để đảm bảo chất lượng nhất quán. Tích hợp API Blockchain Fallet (ví dụ: Metamask, WalletConnect) để đặt giao dịch thanh toán. Phối hợp chặt chẽ với các nhà thiết kế để tinh chỉnh bố cục và nâng cao trải nghiệm người dùng.

Yêu cầu chi tiết: Bachelor’s degree in Computer Science, Software Engineering, or a related technical field. Experience with Web3 frontend libraries such as ethers.js, web3.js, wagmi, or similar. 3+ years of commercial front-end development experience. Proficient in ReactJS. Strong skills in HTML5, CSS3, and modern CSS libraries/frameworks: Tailwind CSS, Bootstrap, MUI, etc. Solid knowledge of JavaScript (ES6+) and TypeScript. High attention to visual detail and a passion for building polished, high-quality user interfaces. Proven experience translating Figma, Sketch, or similar design files into responsive, production-ready code. Strong understanding of responsive design principles and ability to build interfaces that work seamlessly across various devices (mobile, tablet, desktop) and browsers (Chrome, Firefox, Safari, Edge, etc.). Experience with data-fetching tools like React Query, SWR, or similar. Knowledge of SEO best practices and tools (e.g., Lighthouse, meta tags, structured data, web crawlers). Familiarity with SSR/SSG/Hybrid meta-frameworks such as Next.js. Comfortable with Git-based workflows and version control platforms (GitHub, GitLab, Bitbucket). Experience working in Agile/Scrum teams and collaborating across product, design, and backend functions. Exposure to CI/CD pipelines, Docker, Linux environments, and cloud platforms like AWS, GCP, or Azure. Understanding of frontend performance optimization techniques including lazy loading, code splitting, caching strategies, image optimization, and bundle analysis.',
    '- Bằng cấp: Bachelor’s degree in Computer Science, Software Engineering, or a related technical field
- Kỹ năng chuyên môn: Next.js, React, TypeScript, HTML5, CSS3, Tailwind CSS, Bootstrap, MUI, JavaScript (ES6+), ethers.js, web3.js, wagmi, React Query, SWR, Git, CI/CD pipelines, Docker, Linux environments, AWS, GCP, Azure
- Kỹ năng mềm: High attention to visual detail, Collaboration, Agile/Scrum teamwork
- Kinh nghiệm: 3 năm',
    '- Base salary + 13th-month bonus + Holiday bonuses + Performance-based bonuses
- Opportunities to advance to mid-level management positions after 1–3 years
- Full benefits and discounts on products and services within the corporation''s ecosystem',
    'Hà Nội', 'full_time'::public.employment_type,
    20000000, 30000000, 'VND', 'published',
    now() - ((5 % 21) || ' days')::interval,
    now() + ((20 + (5 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [6/94] group 1 (Software Development): Fullstack Developer - DevOps Middle Level
  jid := '456a83d7-876e-5487-9a36-db85e70c5dc9'::uuid;
  cid := company_ids[6];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Fullstack Developer - DevOps Middle Level',
    'Viết mã nguồn và đảm bảo mã nguồn có hiệu năng tốt, chất lượng tốt và có tính tái sử dụng. Xây dựng, kiểm thử và gỡ lỗi các ứng dụng web. Phát triển các ứng dụng web ổn định, có hiệu năng cao và có khả năng mở rộng dễ dàng, nhanh chóng. Xây dựng và duy trì pipeline CI/CD cho các ứng dụng. Vận hành ứng dụng, tìm lỗi, gỡ lỗi khi gặp sự cố. Đảm bảo SLA của sản phẩm. Giao tiếp khách hàng, phân tích, nhận diện và giải quyết các vấn đề kỹ thuật, đề xuất các phương án xử lý triệt để hoặc phương án tạm thời. Viết tài liệu kỹ thuật, thực hiện review code cho các thành viên trong team. Liên tục trau dồi, cập nhật kiến thức công nghệ để áp dụng vào các sản phẩm, dự án được phân công phụ trách.

Yêu cầu chi tiết: 1. Must have: Tối thiểu 3 năm kinh nghiệm làm việc với ReactJS, NodeJS. Thành thạo trong việc xây dựng và phát triển ứng dụng ở cả frontend và backend. Có kinh nghiệm trong lĩnh vực tổng đài: Freeswitch, FreePBX, FusionPBX… Có kinh nghiệm phát triển các hệ thống phân tán, các kiến trúc nhiều dịch vụ nhỏ và các hàng đợi như Kafka, RabbitMQ để xử lý. Có kinh nghiệm làm việc với các cloud platforms như AWS hoặc GCP. Có kinh nghiệm trong việc triển khai, bàn giao và vận hành ứng dụng. Có khả năng viết code sạch, rõ ràng, có hiệu năng tốt, tái sử dụng và dễ dàng kiểm thử. Có kinh nghiệm làm việc với Git. Có kinh nghiệm làm việc với các cơ sở dữ liệu, ưu tiên ứng viên có kinh nghiệm làm việc với MongoDB. Có hiểu biết tốt về cấu trúc dữ liệu và giải thuật. Có tư duy tốt, có kỹ năng giải quyết vấn đề, thích tìm tòi, học hỏi. Có kỹ năng đọc hiểu tiếng Anh tốt. 2. Nice to have: Ưu tiên ứng viên có kinh nghiệm làm việc trong môi trường product. Có kỹ năng giao tiếp tốt, có kinh nghiệm trong việc hướng dẫn, đào tạo nhân sự. Có kinh nghiệm thiết kế và phát triển ứng dụng RESTful web services. Làm việc với cả ứng dụng phía máy khách và hệ thống bên trong, cung cấp các giải pháp xử lý tối ưu. Có kinh nghiệm tối ưu hiệu năng web, bảo mật và theo dõi hành vi người dùng. Có kinh nghiệm trong việc xây dựng luồng CI/CD, Kubernetes làm một điểm cộng. Có kinh nghiệm làm việc với Agile, Scrum. Có hiểu biết về các nguyên lý cơ bản khi lập trình. Có kinh nghiệm trong việc tối ưu nâng cao hiệu năng hệ thống. Có kinh nghiệm xây dựng các chức năng test tự động.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: ReactJS, NodeJS, Freeswitch, FreePBX, FusionPBX, Kafka, RabbitMQ, AWS, GCP, Git, MongoDB
- Kỹ năng mềm: Tư duy tốt, Kỹ năng giải quyết vấn đề, Kỹ năng đọc hiểu tiếng Anh
- Kinh nghiệm: 3 năm',
    '- Thưởng tháng 13
- Gói phúc lợi 10.500.000 VNĐ/năm
- Đảm bảo đầy đủ các chế độ BHXH, BHYT, BHTN
- Cơ hội thăng tiến
- Môi trường chuyên nghiệp, sáng tạo, cởi mở, trẻ trung',
    'Hà Nội', 'full_time'::public.employment_type,
    28000000, 35000000, 'VND', 'published',
    now() - ((6 % 21) || ' days')::interval,
    now() + ((20 + (6 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [7/94] group 1 (Software Development): Fullstack Developer
  jid := '644919cf-d485-567c-b03e-62ba618e78b1'::uuid;
  cid := company_ids[7];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Fullstack Developer',
    'Cực kỳ háo hức để học/phát triển các kỹ năng mã hóa (cấp độ ninja). Phấn đấu để đẩy các ranh giới của các giải pháp công nghệ với thử nghiệm, tạo mẫu, tư duy sáng tạo và sự tham gia hệ sinh thái công nghệ. Phát triển mã (thiết kế, xây dựng, kiểm tra đơn vị, triển khai, chạy) để chạy trên phụ trợ, frontend web, đám mây, di động. Thực hiện theo các quá trình Agile hiệu quả và liên tục cải thiện. Giao tiếp một cách xây dựng với các thành viên trong nhóm để hợp tác xây dựng một bộ sản phẩm làm cho khách hàng thích thú. Viết mã mở rộng với phạm vi kiểm tra tự động cao. Đóng góp cho các quyết định nhóm về kiến ​​trúc hệ thống và lựa chọn các công cụ kỹ thuật. Khắc phục các vấn đề khi chúng phát sinh và giải quyết các thách thức kỹ thuật. Hiểu các mối quan tâm kinh doanh và đóng góp vào việc động não các lựa chọn thực dụng để giải quyết chúng. Làm việc nhanh chóng trong khi duy trì sự chú ý mạnh mẽ đến chi tiết và độ chính xác. Các nhiệm vụ khác được chỉ định bởi người quản lý kỹ thuật.

Yêu cầu chi tiết: Skills and Experience: Bachelor’s degree in Computer Science or a related field. At least 2 year of experience in software development. Proficiency in Full Stack .NET Development, especially ASP.NET Core, C#, and React JS. Experience building client-side, single-page applications using JavaScript frameworks (preferred React or Angular). Strong understanding of code quality assurance (e.g., SonarQube, StyleCop) and unit testing frameworks (e.g., xUnit, NUnit, MSTest). Experience in developing RESTful APIs, microservices architectures, and cloud-native applications. Familiarity with Entity Framework Core, SQL Server, and NoSQL databases. Nice to have: Experience with Agile/Scrum methodologies in large-scale system development. Knowledge of cloud services (e.g., Azure API Management, AWS API Gateway). Soft Skills: Strong communication skills to work effectively with cross-functional teams. Empathy and patience when collaborating with colleagues. Open-mindedness and adaptability to new technologies and challenges. Critical thinking, creativity, and problem-solving skills to tackle complex issues.',
    '- Bằng cấp: Bachelor’s degree in Computer Science or a related field
- Kỹ năng chuyên môn: .NET, ASP.NET Core, C#, React JS, JavaScript, RESTful APIs, microservices architectures, cloud-native applications, Entity Framework Core, SQL Server, NoSQL databases
- Kỹ năng mềm: Strong communication skills, Empathy, Patience, Open-mindedness, Adaptability, Critical thinking, Creativity, Problem-solving
- Kinh nghiệm: 2 năm',
    '- Attractive salary and benefits package
- Internal events
- Annual leave: 12 days/year
- Performance review once a year
- Annual bonus - 13th month salary
- Development opportunities
- Cover medical, social, unemployment insurance',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    10000000, 15000000, 'VND', 'published',
    now() - ((7 % 21) || ' days')::interval,
    now() + ((20 + (7 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [8/94] group 1 (Software Development): Kỹ Sư Frontend ReactJS Phát Triển Ứng Dụng BPM/CRM
  jid := '116e8b11-78ab-5dbb-85d2-ada26ef3fa78'::uuid;
  cid := company_ids[8];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ Sư Frontend ReactJS Phát Triển Ứng Dụng BPM/CRM',
    'Tham gia phát triển các ứng dụng Web, CRM/BPM/CDP/CXM, xây dựng các chức năng giao diện người dùng (Front-end) bằng React.js, TypeScript, JavaScript, HTML, CSS. Thiết kế và triển khai giao diện responsive, tập trung vào trải nghiệm người dùng (UI/UX). Xây dựng các biểu mẫu động, mô hình hóa quy trình nghiệp vụ với các thư viện phù hợp. Tích hợp secure authentication để bảo vệ quyền truy cập người dùng. Tạo các thành phần UI và biểu đồ trực quan hóa dữ liệu để cung cấp insight cho người dùng. Áp dụng kiến trúc micro frontend để xây dựng giao diện linh hoạt, dễ mở rộng. Tối ưu hóa hiệu suất ứng dụng, khả năng tương thích đa trình duyệt, chuẩn hóa thương hiệu. Tích hợp và xử lý dữ liệu thông qua RESTful APIs. Viết mã sạch, dễ bảo trì, tuân thủ quy chuẩn chất lượng mã (code convention). Thực hiện kiểm tra mã tự động, review code và tuân thủ quy trình CI/CD. Hỗ trợ xử lý lỗi, khắc phục sự cố qua các công cụ debug và phân tích dữ liệu. Tham gia hỗ trợ quá trình chuyển đổi dữ liệu trong các hệ thống CRM/CDP/CXM. Làm việc cùng nhóm Backend để phân tích, thiết kế hệ thống. Hướng dẫn, đào tạo kỹ năng cho thực tập sinh khi cần thiết. Nghiên cứu, áp dụng công nghệ mới để cải tiến sản phẩm.

Yêu cầu chi tiết: Tốt nghiệp Đại học ngành CNTT hoặc tương đương. Tối thiểu 1 năm kinh nghiệm làm việc với ReactJS, TypeScript, JavaScript, HTML5, CSS3. Có kinh nghiệm phát triển các ứng dụng CRM/BPM/CDP/CXM là 1 lợi thế. Thành thạo responsive layout, kỹ năng thiết kế UI/UX tốt. Hiểu rõ kiến trúc UI Kit, RESTful APIs, JWT, state management (Redux, Context, v.v.). Kỹ năng clean code, sử dụng thành thạo Git. Có kinh nghiệm với Ant Design hoặc Material UI. Quen thuộc với các công cụ linting và kiểm tra mã như ESLint, Prettier, husky, lint-staged. Có khả năng test ứng dụng với Jasmine, Karma, Selenium hoặc các công cụ tương đương. Kinh nghiệm triển khai và làm việc với quy trình Agile/Scrum, Azure DevOps hoặc Git. Có kỹ năng tư duy logic, giải quyết vấn đề, đọc hiểu tiếng Anh chuyên ngành tốt. Có kinh nghiệm quản lý nhóm hoặc hỗ trợ kỹ thuật là lợi thế.',
    '- Bằng cấp: Tốt nghiệp Đại học ngành CNTT hoặc tương đương
- Kỹ năng chuyên môn: ReactJS, TypeScript, JavaScript, HTML5, CSS3, RESTful APIs, JWT, state management (Redux, Context)
- Kỹ năng mềm: Kỹ năng tư duy logic, Giải quyết vấn đề, Đọc hiểu tiếng Anh chuyên ngành
- Kinh nghiệm: 1 năm',
    '- Bảo hiểm xã hội
- Team building
- Thưởng tháng 13
- Thưởng hiệu quả làm việc',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((8 % 21) || ' days')::interval,
    now() + ((20 + (8 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [9/94] group 1 (Software Development): Middle Java Backend
  jid := '0206a38a-1c02-518d-9e63-4ee28e9b3df9'::uuid;
  cid := company_ids[9];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Middle Java Backend',
    'Phát triển, tối ưu các chức năng hệ thống backend theo sự phân công và định hướng từ PM hoặc Leader. Tham gia phân tích nghiệp vụ, phân rã chức năng, phân tích hệ thống, kiểm thử logic và trải nghiệm, sửa lỗi, triển khai hệ thống. Chịu trách nhiệm về chất lượng và hiệu quả code của các module được giao. Đảm bảo sản phẩm backend ổn định, hiệu suất tốt và dễ bảo trì. Hợp tác chặt chẽ với các team liên quan (FE, QA, BA, DevOps...) để đảm bảo tiến độ và chất lượng sản phẩm. Tham gia vào quy trình kiểm thử, fix bugs, triển khai và bảo trì hệ thống. Chủ động tìm hiểu nghiệp vụ và tham gia đề xuất cải tiến sản phẩm. Hỗ trợ các thành viên junior khi cần và có thể review code nếu được giao. Báo cáo tiến độ, vấn đề, kết quả công việc đến quản lý trực tiếp. Trải nghiệm sản phẩm định kỳ để hiểu hành vi người dùng, từ đó đưa ra các đề xuất cải tiến.

Yêu cầu chi tiết: 1.Kiến thức bắt buộc: Có tối thiểu 02 năm kinh nghiệm tương đương. Thành thạo ngôn ngữ lập trình Java và lập trình hướng đối tượng (OOP). Có kinh nghiệm làm việc với hệ quản trị cơ sở dữ liệu RDBMS, NoSQL, có khả năng viết, tối ưu truy vấn, phân tích dữ liệu. Có hiểu biết về các Framework Spring Boot, Vert.x, Microservice. Hiểu rõ mô hình backend MVC và các khái niệm RESTful API. Có kinh nghiệm triển khai hệ thống trên môi trường production, biết cách vận hành và giám sát hệ thống. Có khả năng sử dụng AI trong lập trình. Kiến thức nâng cao (lợi thế): Biết sử dụng các ngôn ngữ lập trình khác: PHP, Python, Shell-script, Jenkin, HAProxy, Go lang. Kỹ năng làm việc theo quy trình JIRA, Agile, SCRUM. Có hiểu biết về UI/UX, hành vi người dùng là một điểm cộng. Có kinh nghiệm lập trình frontend với React js, Vue, Angular, Next js. 2. Kỹ năng: Problem solving: Có khả năng phân tích vấn đề, tìm giải pháp kỹ thuật phù hợp. Design thinking: Có tư duy xây dựng giải pháp tối ưu, hướng đến trải nghiệm người dùng. Giao tiếp, làm việc nhóm, lắng nghe và truyền đạt thông tin. Học hỏi và tự học tốt; Tổ chức và quản lý thời gian. 3. Tố chất: Tư duy logic, Tư duy hệ thống, Tỉ mỉ, cẩn thận.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Java, Spring Boot, Vert.x, Microservice, RDBMS, NoSQL, RESTful API
- Kỹ năng mềm: Problem solving, Design thinking, Giao tiếp, Làm việc nhóm, Học hỏi, Tổ chức, Quản lý thời gian
- Kinh nghiệm: 2 năm',
    '- Trợ cấp ăn trưa
- Hưởng đầy đủ các chế độ BHXH, BHYT, BHTN
- Khám sức khỏe định kỳ hàng năm
- Trà chiều, hoa quả, sữa bánh
- Tham gia các hoạt động vui chơi thể thao hàng ngày tại công ty
- Thử việc 02 tháng hưởng 100% mức lương chính thức
- Review lương 2 lần/năm',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((9 % 21) || ' days')::interval,
    now() + ((20 + (9 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [10/94] group 1 (Software Development): Lập Trình Viên Full Stack (Web)
  jid := '1700d323-d774-5b20-935e-6f040b44b90a'::uuid;
  cid := company_ids[10];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Lập Trình Viên Full Stack (Web)',
    'Tham gia vào quá trình phân tích yêu cầu, thiết kế và triển khai các tính năng mới cho ứng dụng. Viết code chất lượng cao, có cấu trúc tốt, dễ đọc, dễ bảo trì và có khả năng mở rộng. Xây dựng và tích hợp APIs (RESTful, GraphQL, etc.) để kết nối các hệ thống và dịch vụ khác nhau. Triển khai và quản lý cơ sở dữ liệu (SQL, NoSQL) phù hợp với yêu cầu dự án. Tối ưu hóa hiệu suất ứng dụng, đảm bảo tốc độ và khả năng đáp ứng. Viết unit test và integration test để đảm bảo chất lượng code và chức năng của ứng dụng. Thực hiện kiểm thử chức năng và hiệu năng của ứng dụng. Tham gia vào quá trình sửa lỗi (debugging) và giải quyết các vấn đề kỹ thuật. Tuân thủ các quy trình phát triển phần mềm, tiêu chuẩn lập trình và coding conventions của công ty. Làm việc chặt chẽ với các thành viên khác trong nhóm (Product Owner, BA, Tester, Designer) để hiểu rõ yêu cầu và mục tiêu dự án. Giao tiếp hiệu quả với các bên liên quan (stakeholders) về tiến độ, vấn đề và giải pháp. Tham gia vào các cuộc họp nhóm, brainstorming và planning để đóng góp ý kiến và giải pháp. Chủ động chia sẻ thông tin và cập nhật tiến độ công việc cho quản lý và đồng nghiệp.

Yêu cầu chi tiết: Tối thiểu 2 năm kinh nghiệm làm việc trong lĩnh vực phát triển phần mềm, trong đó có kinh nghiệm làm việc với cả frontend và backend. Ứng viên liệt kê một số dự án/ sản phẩm tiêu biểu, trong đó mô tả thông tin vai trò và một số nhiệm vụ thực hiện trong dự án/ sản phẩm tiêu biểu đó. Thành thạo một hoặc nhiều ngôn ngữ lập trình backend phổ biến. Thành thạo một hoặc nhiều framework frontend hiện đại. Hiểu biết sâu sắc về HTML, CSS, JavaScript và các công nghệ web tiêu chuẩn. Kinh nghiệm làm việc với cơ sở dữ liệu: SQL và/hoặc NoSQL. Kinh nghiệm xây dựng và sử dụng APIs: RESTful. Kinh nghiệm làm việc với các công cụ quản lý phiên bản: Git. Kinh nghiệm với quy trình phát triển phần mềm Agile/Scrum. Kỹ năng giải quyết vấn đề và tư duy logic tốt. Kỹ năng giao tiếp và làm việc nhóm hiệu quả. Khả năng tự học và cập nhật công nghệ mới nhanh chóng. Tiếng Anh đọc hiểu tài liệu kỹ thuật tốt.',
    '- Bằng cấp: Cao Đẳng trở lên
- Kỹ năng chuyên môn: Java (Spring boot, Kotlin), .Net core, Python, Angular, Vue.js, React, HTML, CSS, JavaScript, SQL (MySQL, PostgreSQL, SQL Server), NoSQL (MongoDB, Redis, Cassandra), RESTful APIs, Git
- Kỹ năng mềm: Giải quyết vấn đề, Tư duy logic, Giao tiếp, Làm việc nhóm, Khả năng tự học
- Kinh nghiệm: 2 năm',
    '- Tháng lương thứ 13
- Thưởng doanh số kinh doanh
- Khám sức khỏe miễn phí 1 năm 1 lần
- Giảm giá 50% cho sản phẩm dược của Vietlife
- Chế độ BHXH theo quy định
- Nghỉ phép năm',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((10 % 21) || ' days')::interval,
    now() + ((20 + (10 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [11/94] group 1 (Software Development): Fullstack Web Developer
  jid := 'e89ced3d-425b-53ce-9b13-fa2eab5b2c82'::uuid;
  cid := company_ids[11];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Fullstack Web Developer',
    'Là một phần của bộ phận phát triển phần mềm VN. Thiết kế và phát triển các ứng dụng Web-Base chất lượng cao cho Quản lý Hạm đội Kho hàng & Robot. Nó sẽ cho phép cả người dùng nội bộ hoặc khách hàng bên ngoài sử dụng tốt hơn giải pháp tự động hóa kho Robotics của chúng tôi. Phát triển và tích hợp các giải pháp trên các mô-đun khác nhau, bao gồm bảng điều khiển dựa trên web, cơ sở dữ liệu và mô phỏng robot. Tạo, thực hiện và duy trì các kế hoạch kiểm tra toàn diện; Xác định và sửa lỗi trong khi đảm bảo tính toàn vẹn của cơ sở mã hiện có. Đóng góp cho thiết kế phần mềm cấp hệ thống, đảm bảo khả năng mở rộng, độ tin cậy và hiệu suất. Công thức, tài liệu và duy trì các thông số kỹ thuật yêu cầu chi tiết. Phân tích, động não và đánh giá các ứng dụng của các công cụ và công nghệ mới xuất hiện. Và thực hiện các nhiệm vụ tương tự khi anh ta thấy phù hợp với việc thực hiện đúng nghĩa vụ và nhiệm vụ của mình như được ủy quyền bởi người quản lý trực tiếp hoặc người sử dụng lao động.

Yêu cầu chi tiết: At least 5 years of experience in both front-end and back-end platforms (NodeJS & ReactJS preferred). Familiar with development and deployment in Google Cloud and Amazon Web Services. Experience in database development using Kafka and Snowflake. Experience in messaging systems such as RabbitMQ and/or ZeroMQ. (Plus) Hand-on experience with 3D web (threejs) or other 3D simulation engine (Unity, Omniverse). (Plus) Hand-on experience with ROS, Docker & Linux environment. Maintain a good coding standard, familiar with Test Driven development. Experience with writing unit tests for NodeJS, ReactJS application. Exposure to agile development practices and CI/CD pipelines, experience with project management and collaboration tools like JIRA, Confluence. Good teamwork, communication, time management and problem solving skills. Working proficiency and communication skills in verbal and written English, be able to effectively represent the derived results and technical concepts to the leadership team.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: NodeJS, ReactJS, Google Cloud, Amazon Web Services, Kafka, Snowflake, RabbitMQ, ZeroMQ, threejs, Unity, ROS, Docker, Linux
- Kỹ năng mềm: Good teamwork, Communication, Time management, Problem solving
- Kinh nghiệm: 5 năm',
    '- Social insurance
- Health/life/disability insurance
- Annual health check
- 13th month salary
- Yearly bonus up to 2 month pay depending on performance review
- Hybrid working option: 1 work-from-home day per week
- 14 days of paid vacation
- Work laptop
- Company trip and other team benefits',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    50000000, 90000000, 'VND', 'published',
    now() - ((11 % 21) || ' days')::interval,
    now() + ((20 + (11 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [12/94] group 1 (Software Development): Mobile Developer (Android Or IOS)
  jid := 'ece60f9d-afd3-5bda-b3a8-ac1f5a2b84fe'::uuid;
  cid := company_ids[12];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Mobile Developer (Android Or IOS)',
    'Chúng tôi đang tìm kiếm các nhà phát triển di động lành nghề (Android/iOS) để tham gia nhóm của chúng tôi tại Trung tâm xây dựng LG CNS Việt Nam. Các ứng cử viên lý tưởng sẽ có kinh nghiệm mạnh mẽ trong việc phát triển ứng dụng di động bằng cách sử dụng Kotlin (cho Android) hoặc Swift (cho iOS) và nên có khả năng phát triển và tích hợp các API REST. Bạn sẽ hợp tác với các nhóm chức năng chéo để thiết kế, phát triển và duy trì các ứng dụng di động chất lượng cao. Phát triển, kiểm tra và duy trì các ứng dụng di động hiệu suất cao cho Android (Kotlin) hoặc iOS (SWIFT). Thiết kế và tích hợp API REST để đảm bảo giao tiếp liền mạch giữa ứng dụng di động và các dịch vụ phụ trợ. Làm việc chặt chẽ với các nhà thiết kế, nhà phát triển phụ trợ và quản lý sản phẩm để cung cấp các ứng dụng di động chất lượng cao. Đảm bảo các ứng dụng đáp ứng các tiêu chuẩn bảo mật, hiệu suất và trải nghiệm người dùng. Gỡ lỗi và giải quyết các vấn đề, tối ưu hóa mã và đảm bảo khả năng mở rộng của các ứng dụng. Hãy cập nhật các xu hướng phát triển di động mới nhất và thực tiễn tốt nhất. Tham gia vào các quá trình phát triển Agile/Scrum.

Yêu cầu chi tiết: [Required] Education: Bachelor''s degree in computer science, Software Engineering, or a related field. Experience: At least 4 years of experience in mobile development. Technical Skills: Strong proficiency in Kotlin (for Android) or Swift (for iOS). Experience with developing and integrating RESTful APIs. Familiarity with mobile UI/UX design principles and best practices. Experience with Git version control. Strong problem-solving skills and ability to work in a fast-paced environment. [Nice to have] Knowledge of MS-SQL/IIS Server. Experience with Firebase Cloud Messaging (FCM) / Apple Push Notification Service (APNS). Familiarity with CI/CD tools (Jenkins) for automated deployment. Experience with Android Management API for enterprise applications. Knowledge of Microsoft 365 Graph API for enterprise solutions.',
    '- Bằng cấp: Bachelor''s degree in computer science, Software Engineering, or a related field
- Kỹ năng chuyên môn: Kotlin, Swift, RESTful APIs, Git
- Kỹ năng mềm: Strong problem-solving skills, Ability to work in a fast-paced environment
- Kinh nghiệm: 4 năm',
    '- Attractive salary and bonus
- Topik allowance
- Annual salary review
- Premium health insurance
- Annual health check-up
- Young working environment
- Career development opportunities
- Training courses
- Gifts on holidays
- Outdoor activities',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((12 % 21) || ' days')::interval,
    now() + ((20 + (12 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [13/94] group 2 (DevOps/Infrastructure): DevOps Engineer Middle Level
  jid := 'a5e8221d-d1b4-5bc2-9b84-4e9c1403c5e0'::uuid;
  cid := company_ids[1];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'DevOps Engineer Middle Level',
    'Thiết kế, thực hiện và duy trì các đường ống tích hợp liên tục và triển khai liên tục (CI/CD) để tự động hóa các quy trình phân phối phần mềm. Quản lý và tối ưu hóa cơ sở hạ tầng đám mây trên các nền tảng như AWS, Azure hoặc Google Cloud để đảm bảo khả năng mở rộng, độ tin cậy và hiệu quả chi phí. Thực hiện và duy trì các công cụ quan sát (ví dụ: Datadog, Elk, Grafana, Prometheus, Sentry). Xác định và giám sát các chỉ số cấp độ dịch vụ (SLI), mục tiêu cấp độ dịch vụ (SLO) và đảm bảo tuân thủ các thỏa thuận cấp độ dịch vụ (SLA) để duy trì độ tin cậy của hệ thống cao. Tự động hóa các quy trình triển khai, thử nghiệm và giám sát để tăng cường hiệu quả và giảm thiểu can thiệp thủ công. Phối hợp với các nhóm phát triển để thiết kế và thực hiện các giải pháp có thể mở rộng, có thể bảo trì và an toàn. Giám sát hiệu suất hệ thống, khắc phục sự cố và thực hiện các giải pháp để đảm bảo tính khả dụng cao và thời gian chết tối thiểu. Tham gia đánh giá mã, cung cấp phản hồi cho các nhà phát triển về các nguyên tắc thực tiễn và DevOps tốt nhất. Luôn cập nhật các công cụ, công nghệ và phương pháp mới nhất của DevOps để thúc đẩy cải tiến liên tục trong các quy trình. Đảm bảo các tiêu chuẩn bảo mật và tuân thủ được tích hợp vào tất cả các thực tiễn của DevOps.

Yêu cầu chi tiết: 1. Must Have: 2 - 4 years of experience in a DevOps or related role, such as systems administration or software engineering with a focus on automation. Proven experience in designing and managing CI/CD pipelines and cloud-based infrastructure. Proficiency in scripting languages such as Bash, Python, or Go. Strong knowledge of containerization technologies, including Docker and Kubernetes. Familiarity with version control systems, particularly Git. Experience with cloud platforms like AWS, Azure, or Google Cloud. Experience with infrastructure as code tools like Terraform. Proficiency in monitoring and logging tools such as Datadog, ELK Stack, Grafana, Prometheus, Sentry, New Relic… Strong understanding of SLA, SLI, and SLO concepts and their application in ensuring system reliability and performance. Experience in on-call rotations and incident response. Strong problem-solving and analytical skills to address complex technical challenges. 2. Nice to have: Certifications in cloud platforms (AWS, Azure, GCP). Experience working in agile development environments and familiarity with agile methodologies, especially Scrum. Document infrastructure, deployment processes, and incident resolutions to support team knowledge and operational consistency. Good command of English (Listening, Reading, Writing).',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: CI/CD pipelines, AWS, Azure, Google Cloud, Bash, Python, Go, Docker, Kubernetes, Git, Terraform, Datadog, ELK Stack, Grafana, Prometheus, Sentry, New Relic
- Kỹ năng mềm: Problem-solving, Analytical skills, Collaboration
- Kinh nghiệm: 2 năm',
    '- End-of-year bonus
- Welfare package of 10,500,000 VND/year
- Social Insurance
- Training courses
- Performance bonuses
- Team building
- Annual travel',
    'Hà Nội', 'full_time'::public.employment_type,
    25000000, 30000000, 'VND', 'published',
    now() - ((13 % 21) || ' days')::interval,
    now() + ((20 + (13 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [14/94] group 2 (DevOps/Infrastructure): Nhân Viên Vận Hành Ứng Dụng (Devops Engineer)
  jid := 'caf803d2-e782-57ce-b3d6-0a3814774255'::uuid;
  cid := company_ids[2];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhân Viên Vận Hành Ứng Dụng (Devops Engineer)',
    'Được cung cấp tài liệu mô tả, tài liệu triển khai, tài liệu vận hành hệ thống ứng dụng, đào tạo chuyển giao vận hành. Quản trị và vận hành các hệ thống ứng dụng. Nắm bắt các quy trình nghiệp vụ và các chức năng của ứng dụng. Kiểm tra và đảm bảo chất lượng, hiệu quả và an toàn của các ứng dụng. Theo dõi và báo cáo về tình hình hoạt động, hiệu suất và lưu lượng truy cập của các ứng dụng. Phối hợp với đối phát triển ứng dụng/đội triển khai giám sát ứng dụng để xây dựng các dashboard/cảnh báo về ứng dụng. Tiếp nhận các thông báo cảnh báo 24/7 từ nhóm giám sát ứng dụng, sau đó xác minh xử lý. Hỗ trợ thực hiện phân tích và gửi lỗi cho đội phát triển/nhà cung cấp, phối hợp với đội phát triển/nhà cung cấp kiểm tra xử lý sự cố theo phân công. Phối hợp với các bộ phận liên quan Quản trị hệ thống/DBA/ANTT/Bên thứ 3 kiểm tra xử lý sự cố theo phân công. Thực hiện cài đặt triển khai, cập nhật ứng dụng theo tài liệu của đội phát triển/nhà cung cấp. Thực hiện các cấu hình hệ thống theo yêu cầu được phê duyệt từ quản lý.

Yêu cầu chi tiết: Tốt nghiệp Đại học trở lên ngành Công nghệ thông tin, Phần mềm, Kỹ thuật máy tính, Điện tử viễn thông. Có từ 2 năm kinh nghiệm trở lên tại vị trí tương đương. Đọc hiểu tiếng Anh cơ bản, có thể nghiên cứu tài liệu bằng ngoại ngữ là một lợi thế. Hiểu biết tốt về các quy trình phát triển phần mềm. Hiểu biết tốt về mô hình ứng dụng Microservices và Monolithic Services. Hiểu biết và có kinh nghiệm quản trị hệ điều hành Linux. Có kinh nghiệm lập trình ứng dụng các ngôn ngữ Java, .NET, C#, Golang, JS. Có kinh nghiệm quản trị ứng dụng trên nền tảng Docker, Container là một lợi thế. Có kinh nghiệm làm phân tích nghiệp vụ là một lợi thế. Có kinh nghiệm trong triển khai và quản lý hệ thống CI/CD (Continuous Integration/Continuous Deployment), bao gồm việc sử dụng các công cụ như Jenkins, GitLab CI/CD, hoặc các công cụ tương tự khác. Sử dụng thành thạo Git, nắm bắt tốt Git Flow. Sử dụng thành thạo các phần mềm như Ansible, Terraform, Jenkins, ArgoCD … Kỹ năng về viết script và automation để tạo ra các quy trình tự động cho việc triển khai, cấu hình và quản lý hệ thống. Có kỹ năng về quản lý và áp dụng các phương pháp và công cụ giám sát hệ thống để đảm bảo hiệu suất và sẵn sàng của ứng dụng. Có khả năng làm việc cộng tác và giao tiếp tốt với các thành viên khác trong nhóm phát triển, quản lý dự án và quản lý hệ thống. Có kỹ năng tư duy phân tích, giải quyết, khoanh vùng sư cố cố để giải quyết vấn đề trong thời gian ngắn. Có khả năng ứng dụng AI và công nghệ mới vào công việc.',
    '- Bằng cấp: Đại học trở lên ngành Công nghệ thông tin, Phần mềm, Kỹ thuật máy tính, Điện tử viễn thông
- Kỹ năng chuyên môn: Quản trị hệ điều hành Linux, Lập trình ứng dụng Java, .NET, C#, Golang, JS, Docker, CI/CD, Ansible, Terraform, Jenkins, ArgoCD
- Kỹ năng mềm: Kỹ năng tư duy phân tích, Giải quyết vấn đề, Giao tiếp tốt, Làm việc nhóm
- Kinh nghiệm: 2 năm',
    '- Chế độ thưởng phong phú
- Hỗ trợ ăn sáng miễn phí
- Hỗ trợ ăn trưa
- Bảo hiểm sức khỏe cao cấp
- Khám sức khỏe định kỳ hàng năm
- Môi trường làm việc hiện đại',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((14 % 21) || ' days')::interval,
    now() + ((20 + (14 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [15/94] group 2 (DevOps/Infrastructure): Kỹ sư hoạt động/ DevOps cao cấp
  jid := '73f55624-d962-5957-9e38-66b69f5551c2'::uuid;
  cid := company_ids[3];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ sư hoạt động/ DevOps cao cấp',
    'Chịu trách nhiệm vận hành end-to-end cho mảng nghiệp vụ Phê Duyệt Tín Dụng, bao gồm nhưng không giới hạn trong hệ thống Phê duyệt tín dụng cho KHCN, Phê Duyệt Tín Dụng cho KHDN, hệ thống Truy vấn Lịch Sử Tín Dụng, và các hệ thống liên quan. Hỗ trợ thiết kế, phát triển và triển khai các giải pháp để hiện thực hóa các kết quả phân tích yêu cầu để xây dựng các ứng dụng đáp ứng nhu cầu của đơn vị nghiệp vụ vể mảng nghiệp vụ này. Nghiên cứu và thực hiện nâng cấp phiên bản mới định kỳ theo khuyến cáo của nhà sản xuất cho các ứng dụng liên quan đến mảng nghiệp vụ này. Quản lý môi trường và dữ liệu kiểm thử, và các công cụ kiểm thử đi kèm liên quan đến hệ thống, mảng nghiệp vụ này. Thực hiện (hoặc phối hợp với các nhà cung cấp) kiểm thử về tải và hiệu năng của các giải pháp liên quan đến mảng nghiệp vụ này. Cài đặt, quản trị và vận hành các hệ thống ứng dụng liên quan đến mảng nghiệp vụ này. Quản lý nhà cung cấp, giám sát chất lượng dịch vụ của các đối tác/ nhà cung cấp mảng nghiệp vụ này và chịu trách nhiệm đối với các dịch vụ được cung cấp đó. Hỗ trợ mức độ 2 cho các hệ thống liên quan đến mảng nghiệp vụ này nhằm đáp ứng các yêu cầu vận hành của nghiệp vụ theo như SLA mà IT đã cam kết với các đơn vị khác. Chịu trách nhiệm xử lý và/hoặc phối hợp với các mảng liên quan để xử lý sự cố, vấn đề liên quan đến Khách hàng trong mảng nghiệp vụ này trong thời gian phù hợp, giảm thiểu tối đa ảnh hưởng đến các hoạt động kinh doanh. Thu thập và báo cáo thống kê về tình hình và hiệu quả thực hiện các cam kết mức độ vận hành (SLA/OLA) trong phạm vi trách nhiệm. Đảm bảo sự ổn định, khả năng sẵn sàng và chất lượng dịch vụ của mảng nghiệp vụ này. Thực hiện bảo trì định kỳ theo yêu cầu các phần mềm hệ thống trong phạm vi quản lý. Chủ động đề xuất cải tiến, thay đổi về hệ thống, quy trình nghiệp vụ liên quan đến mảng nghiệp vụ này.

Yêu cầu chi tiết: Trình độ Học vấn: Specialized in IT, Computer Science. Các Kinh nghiệm liên quan: Graduated as a Bachelor of IT, 7+ years’ experience IT Support Experience, IT Developer Experience, 5+ years’ experience with database software/web applications, 3+ years’ experience with MS SQL Server, Oracle, Java, PL/SQL, T-SQL, High Availability Experience, Understanding of the operation, the nature and scale of the VPBank''s business.',
    '- Bằng cấp: Bachelor of IT
- Kỹ năng chuyên môn: MS SQL Server, Oracle, Java, PL/SQL, T-SQL, AIX, JBOSS
- Kinh nghiệm: 4 năm',
    '- Thưởng tháng 13
- Bảo hiểm sức khỏe
- Thưởng hiệu quả làm việc
- Chế độ ngày phép hấp dẫn
- Được vay ưu đãi theo chính sách ngân hàng
- Môi trường làm việc năng động',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((15 % 21) || ' days')::interval,
    now() + ((20 + (15 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [16/94] group 2 (DevOps/Infrastructure): DevOps Engineer
  jid := '729d6d9a-d9b0-5190-a3ae-0332c77ab915'::uuid;
  cid := company_ids[4];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'DevOps Engineer',
    '● Thiết kế và duy trì pipeline CI/CD tự động với GitLab CI / Jenkins / ArgoCD để đảm bảo việc build, test, deploy luôn nhanh và ổn định. ● Quản trị và vận hành Kubernetes Cluster (AKS, EKS, GKE hoặc on-premise), tối ưu resource, xử lý autoscaling, network policy, ingress controller,... ● Xây dựng, quản lý và tối ưu hệ thống infrastructure as code (IaC) với Terraform / Ansible, deploy hạ tầng On-Premise, cloud (AWS, GCP, Azure). ● Container hóa ứng dụng với Docker, tối ưu Dockerfile, tổ chức image registry (Harbor, GitHub Container Registry...). ● Giám sát hệ thống với Prometheus + Grafana, cấu hình alert bằng Alertmanager, tích hợp với Telegram/Slack/Zabbix. ● Triển khai các công cụ log tập trung như ELK, Loki, Fluentd/Fluent Bit, Graylog phục vụ điều tra sự cố và phân tích hiệu năng. ● Tối ưu chi phí cloud (cost optimization), phân tích tài nguyên sử dụng, scale hệ thống linh hoạt. ● Phối hợp chặt chẽ với Dev và QA để nâng cao chất lượng release, giảm lỗi production, tự động hóa kiểm thử tích hợp. ● Tham gia xử lý sự cố, post-mortem analysis và xây dựng playbook vận hành.

Yêu cầu chi tiết: ● Tối thiểu 2–3 năm kinh nghiệm làm DevOps/System Admin/Cloud Engineer. ● Vững kiến thức hệ thống Linux (Ubuntu/CentOS), bash scripting thành thạo. ● Thành thạo thiết lập pipeline CI/CD với GitLab CI, Jenkins, hoặc tương đương. ● Có kinh nghiệm thực tế với Kubernetes, biết troubleshooting pod, service, ingress, configMap, secret,... ● Hiểu biết về các hệ thống message broker (Kafka, RabbitMQ) và database cluster (MongoDB, PostgreSQL, Redis) là lợi thế. ● Có kinh nghiệm làm việc với ít nhất một nhà cung cấp Cloud (AWS, GCP, Azure). ● Thành thạo công cụ IaC như Terraform, Ansible, hoặc Pulumi. ● Biết phân tích log, tracing, hiểu về observability và các công cụ như Jaeger, OpenTelemetry. ● Có mindset tự động hóa, tối ưu luồng công việc, không thích “lặp đi lặp lại bằng tay”. ● Có chứng chỉ như CKA, AWS Certified DevOps Engineer, Terraform Associate là điểm cộng lớn.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Git, Docker, Kubernetes, CI/CD, Linux/Unix
- Kỹ năng mềm: Tự động hóa, Phân tích, Giải quyết vấn đề
- Kinh nghiệm: 2 năm',
    '- Xét tăng lương định kỳ hàng năm
- Thưởng vào các dịp lễ đặc biệt
- Tham gia các chương trình nội bộ
- Được trang bị đầy đủ thiết bị làm việc
- Tham gia đầy đủ các chế độ bảo hiểm theo quy định của pháp luật
- Chế độ nghỉ phép: 12 ngày phép/ năm',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    20000000, 20000000, 'VND', 'published',
    now() - ((16 % 21) || ' days')::interval,
    now() + ((20 + (16 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [17/94] group 2 (DevOps/Infrastructure): Senior DevOps Engineer
  jid := 'de97934c-e974-5684-9984-fa4a33b0d90b'::uuid;
  cid := company_ids[5];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Senior DevOps Engineer',
    'Thiết kế, triển khai và vận hành hạ tầng cloud-native (AWS/GCP). Xây dựng và duy trì hệ thống CI/CD tối ưu, đảm bảo chất lượng và tốc độ release sản phẩm. Thiết lập các cơ chế giám sát, cảnh báo (Prometheus, Grafana, Loki, Sentry...) đảm bảo độ tin cậy hệ thống (SLA/SLO). Chủ trì triển khai và quản lý container orchestration (Docker, Kubernetes, Helm) với khả năng autoscaling, self-healing. Phối hợp chặt chẽ với các team Backend, QA, Security để chuẩn hóa quy trình release, rollback, versioning. Đề xuất và triển khai các chính sách bảo mật hệ thống, quản lý secrets, phân quyền truy cập (IAM, Vault, SSO...). Tối ưu chi phí vận hành (cost monitoring, resource usage), đảm bảo hệ thống luôn ở trạng thái hiệu quả – an toàn – ổn định.

Yêu cầu chi tiết: Tối thiểu 03 năm kinh nghiệm làm việc trong vai trò DevOps Engineer hoặc SRE, ưu tiên ứng viên có kinh nghiệm tại công ty SaaS hoặc kiến trúc microservices. Thành thạo sử dụng các dịch vụ AWS: EKS, EC2, S3, IAM, VPC, ALB/NLB, CloudWatch, và công cụ IaC như Terraform (bắt buộc). Có kinh nghiệm thiết kế CI/CD với Jenkins: xây dựng shared libraries, sử dụng JCasC, tích hợp với các công cụ kiểm thử tự động. Hiểu biết sâu sắc về vận hành Kubernetes ở quy mô lớn, triển khai ứng dụng với Helm, có kinh nghiệm với mô hình multi-tenant architecture. Nắm vững khái niệm và công cụ Infrastructure as Code, GitOps workflow, automation pipelines. Kinh nghiệm triển khai và vận hành hệ thống monitoring, logging, tracing theo chuẩn observability. Hiểu rõ về bảo mật hệ thống: CI/CD hardening, secret management, IAM/RBAC, security automation, least privilege principles. Ưu tiên ứng viên từng làm việc với hệ thống lớn, phân tán, trên nền multi-cloud hoặc hybrid cloud environments. Tư duy hệ thống tốt, chủ động trong cải tiến và tối ưu, có khả năng giao tiếp hiệu quả và làm việc đa chức năng với các team khác nhau.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: AWS, GCP, Terraform, Jenkins, Docker, Kubernetes, Prometheus, Grafana, Loki, Sentry
- Kỹ năng mềm: Tư duy hệ thống, Giao tiếp hiệu quả, Làm việc đa chức năng
- Kinh nghiệm: 3 năm',
    '- Chế độ bảo hiểm
- Nghỉ phép theo quy định
- Khám sức khỏe định kỳ hàng năm
- Tăng lương hàng năm
- Thưởng tháng lương 13
- Thưởng Tết dương lịch
- Chính sách thăm hỏi toàn diện',
    'Hà Nội', 'full_time'::public.employment_type,
    30000000, 60000000, 'VND', 'published',
    now() - ((17 % 21) || ' days')::interval,
    now() + ((20 + (17 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [18/94] group 2 (DevOps/Infrastructure): DevOps Engineer - Vận Hành ERP Odoo, FastApi
  jid := '280f2207-262f-50f2-839d-794932adca8c'::uuid;
  cid := company_ids[6];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'DevOps Engineer - Vận Hành ERP Odoo, FastApi',
    'Triển khai, cấu hình, vận hành và giám sát hệ thống ERP Odoo, Python FastApi. Quản lý cơ sở dữ liệu PostgreSQL cho Odoo và Data Warehouse. Thiết lập và duy trì quy trình CDC giữa database Odoo và kho dữ liệu. Phối hợp với team Data Engineering để xây dựng pipeline dữ liệu tự động. Triển khai CI/CD, GitOps, tối ưu hóa hiệu suất và độ tin cậy hệ thống. Quản lý, vận hành hệ thống trên K8S. Vận hành cụm PostgreSQL với Patroni để đảm bảo High Availability. Backup/Restore dữ liệu sử dụng pgBackRest và pg_dump, đảm bảo tính sẵn sàng và an toàn dữ liệu. Hỗ trợ vận hành hệ thống Data Warehouse và team Data Engineering bao gồm: ClickHouse, PostgreSQL, Superset và Kafka Stream. Quản trị và vận hành hệ thống VPN (Pritunl), GitLab và LLDAP (Lightweight LDAP).

Yêu cầu chi tiết: Tốt nghiệp các chuyên ngành Công nghệ thông tin, Khoa học máy tính hoặc các ngành liên quan. Sinh năm 1996 - 2002. Ứng viên vui lòng gửi CV bằng Tiếng Anh. Kinh nghiệm vận hành ERP Odoo, hiểu biết về Odoo backend (Python, XML, PostgreSQL), FastApi. Hiểu biết PostgreSQL, các mệnh lệnh SQL nâng cao, tuning performance. Kinh nghiệm thiết lập và vận hành giải pháp CDC như Debezium, Apache Kafka, hoặc logical replication. Quen thuộc CI/CD pipelines (GitLab CI, Jenkins, etc.) và GitOps. Kinh nghiệm làm việc với Kubernetes, ưu tiên đã dùng RKE2, FPT Kubernetes Engine. Kinh nghiệm vận hành cụm PostgreSQL sử dụng Patroni, hiểu biết về các mô hình High Availability. Kinh nghiệm sử dụng pgBackRest và pg_dump cho backup và restore PostgreSQL. Kinh nghiệm vận hành hoặc hỗ trợ các hệ thống ClickHouse, Superset, Kafka Stream là một lợi thế lớn. Kinh nghiệm vận hành hệ thống VPN (Pritunl), GitLab self-hosted và LLDAP (Lightweight LDAP). Sử dụng thành thạo Linux, Docker, và OS server. Kỹ năng giải quyết vấn đề, làm việc nhóm.',
    '- Bằng cấp: Tốt nghiệp các chuyên ngành Công nghệ thông tin, Khoa học máy tính hoặc các ngành liên quan
- Kỹ năng chuyên môn: ERP Odoo, Python, FastApi, PostgreSQL, CI/CD, GitOps, Kubernetes, Linux, Docker
- Kỹ năng mềm: Kỹ năng giải quyết vấn đề, Làm việc nhóm
- Kinh nghiệm: 2 năm',
    '- Cung cấp thiết bị làm việc
- Hỗ trợ miễn phí gửi xe
- Bảo hiểm xã hội
- Bảo hiểm sức khỏe
- Khám sức khỏe định kỳ',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((18 % 21) || ' days')::interval,
    now() + ((20 + (18 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [19/94] group 2 (DevOps/Infrastructure): AI Middle DevOps Engineer
  jid := '4f040fd3-8ee5-57ef-a223-e3ccda57829a'::uuid;
  cid := company_ids[7];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'AI Middle DevOps Engineer',
    'Mô tả Công việc

1. Quản lý cơ sở hạ tầng:
- Thiết Kế, Triển Khai Và Quản Lý Hạ Tầng Đám mây (AWS, Azure, GCP)
- Quản Lý vào
- Giám sát hệ thống Và Xử Lý Sự Cố 24/7
- Kế hoạch khắc phục thảm họa Và dự phòng Và

2. CI/CD & tự động hóa:
- Xây dựng Và Duy trì đường ống CI/CD (Jenkins, Gitlab CI, GitHub Action)
- Tự Động Hót
- Cơ sở hạ tầng như mã (Terraform, CloudFormation, Ansible)
- Container VớI Docker Và Dàn nhạc VớI Kubernetes

3. Bảo mật & Tuân thủ:
- Thực hiện các thực tiễn bảo mật tốt nhất Và Yêu cầu tuân thủ
- Quản Lý kiểm soát truy cập Và Quản lý nhận dạng
- Khả năng quét lỗ hổng Và Giám sát bảo mật
- Quản lý chứng chỉ SSL/TLS

4. Hợp tác & Hỗ trợ:
- Hỗ TRợ Đội phát triển Trong VIệC Triển khai
- Khắc phục sự cố hiệu suất Và
- Tài liệu chia sẻ kiến ​​thức Và
- Xoay hỗ trợ trực tiếp

Yêu cầu chi tiết: YÊU CẦU ỨNG VIÊN
1. Kinh nghiệm:
- 2-4 năm kinh nghiệm làm việc trong lĩnh vực DevOps/Infrastructure
- Kinh nghiệm với cloud platforms (AWS/Azure/GCP)
- Thành thạo Linux/Unix system administration
2. Kỹ năng kỹ thuật:
- Containerization: Docker, Kubernetes, Docker Compose
- CI/CD Tools: Jenkins, GitLab CI, GitHub Actions, Azure DevOps
- Infrastructure as Code: Terraform, Ansible, CloudFormation
- Monitoring: Prometheus, Grafana, ELK Stack, CloudWatch
- Scripting: Bash, Python, PowerShell
- Version Control: Git, GitFlow
- Databases: MySQL, PostgreSQL, MongoDB, Redis
3. Cloud Services:
- AWS: EC2, S3, RDS, Lambda, CloudFront, Route53
- Azure: VM, Storage, SQL Database, App Service
- GCP: Compute Engine, Cloud Storage, Cloud SQL
4. Kỹ năng mềm:
- Tư duy logic, khả năng phân tích và giải quyết vấn đề
- Khả năng làm việc độc lập và theo nhóm
- Giao tiếp tốt, có khả năng trình bày và thuyết phục
- Chủ động học hỏi công nghệ mới
- Tiếng Anh đọc hiểu tài liệu kỹ thuật',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Docker, Kubernetes, Jenkins, GitLab CI, GitHub Actions, Terraform, Ansible, CloudFormation, Prometheus, Grafana, ELK Stack, CloudWatch, Bash, Python, PowerShell, Git, MySQL, PostgreSQL, MongoDB, Redis
- Kỹ năng mềm: Tư duy logic, Khả năng phân tích và giải quyết vấn đề, Khả năng làm việc độc lập và theo nhóm, Giao tiếp tốt, Khả năng trình bày và thuyết phục, Chủ động học hỏi công nghệ mới
- Kinh nghiệm: 2 năm',
    '- Mức lương cạnh tranh
- Cung cấp thiết bị công nghệ cao
- Đào tạo kỹ thuật nội bộ, hướng dẫn và tài trợ chứng chỉ (ví dụ: AWS, GCP)
- Cơ hội làm việc với sản phẩm AI
- Lộ trình phát triển nghề nghiệp rõ ràng
- Văn hóa đội nhóm tích cực',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((19 % 21) || ' days')::interval,
    now() + ((20 + (19 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [20/94] group 2 (DevOps/Infrastructure): Devops Senior Engineer (Linux/Cloud)
  jid := '733f2db9-0d9e-5669-8b98-9594d806e1dc'::uuid;
  cid := company_ids[8];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Devops Senior Engineer (Linux/Cloud)',
    'Triển khai mô hình DevOps, Container / Kubernetes với các dịch vụ phần mềm. Liên tục nghiên cứu các giải pháp, công nghệ mới để cải tiến mô hình DevOps tại công ty. Tham gia xây dựng các hệ thống monitor chủ động cho toàn bộ hệ thống phần cứng và phần mềm của công ty. Thực hiện cập nhật hệ thống thường xuyên, vá lỗi, và cấu hình bảo mật. Quản lý sao lưu, phục hồi, và kế hoạch khắc phục thảm họa. Phối hợp cùng đội phát triển và đội vận hành để đảm bảo tính sẵn sàng của hệ thống, xử lý các sự cố phát sinh.

Yêu cầu chi tiết: Tốt nghiệp Cao đẳng, Đại học chuyên ngành Công nghệ thông tin hoặc các chuyên ngành khác có liên quan. Có 3 - 5 năm kinh nghiệm vận hành môi trường điện toán đám mây: AWS, Azure, Private cloud và microservice: Docker, Kubernetes. Hiểu biết đầy đủ về quy trình phát triển dự án Agile, kiến thức chuyên môn về quy trình phát triển phần mềm & công cụ phát triển/xây dựng và triển khai (CI/CD), mạng cơ sở và Linux và Windows, Python, Bash hoặc PowerShell... Có kinh nghiệm với hệ thống giám sát tập trung (Grafana, Prometheus...), hệ thống thu thập log tập trung (Splunk, Graylog, ELK...), hoặc các giải pháp / sản phẩm tương đương. Có chứng chỉ liên quan như AWS, CKA, CKS... là 1 lợi thế. Sử dụng, đọc hiểu tốt các tài liệu kỹ thuật tiếng Anh. Có khả năng tư duy và phân tích công việc tốt, học hỏi nhanh. Có khả năng làm việc độc lập và theo nhóm. Có tinh thần trách nhiệm, chịu được áp lực cao trong công việc. Chăm chỉ, nhiệt tình, tận tâm với công việc. Ưu tiên ứng viên có kinh nghiệm làm việc tại các hệ thống thuộc domain Tài chính, Chứng khoán, Ngân hàng. Ưu tiên ứng viên am hiểu về ATTT, các tiêu chuẩn bảo mật như PCI-DSS, ISO 27000:27001.',
    '- Bằng cấp: Cao đẳng, Đại học chuyên ngành Công nghệ thông tin hoặc các chuyên ngành khác có liên quan
- Kỹ năng chuyên môn: AWS, Azure, Private cloud, Docker, Kubernetes, CI/CD, Linux, Windows, Python, Bash, PowerShell, Grafana, Prometheus, Splunk, Graylog, ELK
- Kỹ năng mềm: Tư duy và phân tích công việc tốt, Học hỏi nhanh, Làm việc độc lập và theo nhóm, Tinh thần trách nhiệm, Chịu được áp lực cao trong công việc, Chăm chỉ, Nhiệt tình, Tận tâm với công việc
- Kinh nghiệm: 3 năm',
    '- Môi trường làm việc thân thiện, năng động
- Cơ hội phát triển bản thân và thăng tiến
- Ghi nhận thành tích, tăng lương và thưởng kịp thời
- Chế độ bảo hiểm đầy đủ, nghỉ phép theo quy định
- Thưởng Lễ Tết, sinh nhật, ốm đau, sinh con, ma chay, hiếu hỉ
- Teambuilding, nghỉ mát
- Tham gia các khóa đào tạo do công ty tổ chức',
    'Hà Nội', 'full_time'::public.employment_type,
    50000000, 50000000, 'VND', 'published',
    now() - ((20 % 21) || ' days')::interval,
    now() + ((20 + (20 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [21/94] group 3 (System Administration): Chuyên Viên IT Helpdesk
  jid := 'b3a30b66-0e2c-5ac2-a23d-94abebbaca52'::uuid;
  cid := company_ids[9];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Chuyên Viên IT Helpdesk',
    'Cung cấp hỗ trợ kỹ thuật kịp thời cho người dùng cuối, giải quyết các vấn đề phần cứng và phần mềm tại văn phòng HA NOI City, theo yêu cầu của bộ phận CNTT khu vực. Hỗ trợ người dùng cuối với các ứng dụng CNTT dựa trên đám mây và góp phần mở rộng và tích hợp các công nghệ trong công ty. Chẩn đoán và khắc phục sự cố phần cứng khi chúng phát sinh; Thực hiện bảo trì thường xuyên trên thiết bị CNTT. Phối hợp trong việc quản lý cấu hình hệ thống và các tác vụ quản lý cơ sở hạ tầng CNTT. Hỗ trợ và quản lý phần cứng và phần mềm của Apple, bao gồm MacBook và IMAC. Vận hành và quản lý các thiết bị phòng họp và hệ thống hội nghị video. Phối hợp giữa hai địa điểm văn phòng cho các sự kiện video, hội nghị và các cuộc họp cấp điều hành/quản lý. Phối hợp với các nhóm CNTT cấp 2 của khu vực và các nhà cung cấp/đối tác bên ngoài để giải quyết các yêu cầu liên quan đến CNTT. Khắc phục sự cố phần cứng/phần mềm (phối hợp với các bên thứ ba và các nhóm nội bộ). Xử lý việc mua sắm, thiết lập và phân phối thiết bị CNTT; Quản lý nó hàng tồn kho tài sản. Các sự cố đăng nhập và hợp tác chặt chẽ với các nhà cung cấp để giải quyết các sự cố liên quan đến thiết bị và thay thế các thành phần cho thiết bị CNTT được liệt kê (ví dụ: Logitech, Google Chrome-Box, v.v.). Gửi báo cáo hàng tuần và hàng tháng cho các giám sát viên. Thực hiện các nhiệm vụ khác theo sự phân công của người đứng đầu bộ phận. Thể hiện sự đồng cảm và cung cấp các tương tác và trải nghiệm được cá nhân hóa cho người dùng/khách hàng trên tất cả các điểm tiếp xúc (cả trực tuyến và ngoại tuyến).

Yêu cầu chi tiết: Male or female, preferably under 35 years old, with 1–2 years of experience in a similar role. College degree or higher in Information Technology, Network Administration, Telecommunications, or related fields. Strong knowledge of operating systems and hardware, especially MacBook and iMac. Proficient and experienced with Apple products and the macOS operating system. Understanding of video conferencing systems, especially Google Meet and Logitech equipment. Good knowledge of document management systems and workflow support services. Ability to work independently as well as collaboratively in a fast-paced and agile environment. International certifications such as CCNA, CCNP, MCSA, or MCSE are a plus. Proficient in English communication. Experience with Mobile Device Management (MDM) tools such as Jamf is an advantage. Customer-centric mindset with strong service orientation.',
    '- Bằng cấp: College degree or higher in Information Technology, Network Administration, Telecommunications, or related fields
- Kỹ năng chuyên môn: Strong knowledge of operating systems and hardware, especially MacBook and iMac, Proficient and experienced with Apple products and the macOS operating system, Understanding of video conferencing systems, especially Google Meet and Logitech equipment, Good knowledge of document management systems and workflow support services, Experience with Mobile Device Management (MDM) tools such as Jamf
- Kỹ năng mềm: Ability to work independently as well as collaboratively in a fast-paced and agile environment, Customer-centric mindset with strong service orientation
- Kinh nghiệm: 1 năm',
    '- Friendly, professional, dynamic working environment
- Opportunities for training, development and advancement of your career path
- 13th month salary and bonus based on business profits
- 12 days annual leave
- Company trip, team building and other activities
- TIN Care (24/7 insurance), Health insurance, social insurance, unemployment insurance and health check-up each year',
    'Hà Nội', 'full_time'::public.employment_type,
    20000000, 23000000, 'VND', 'published',
    now() - ((21 % 21) || ' days')::interval,
    now() + ((20 + (21 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [22/94] group 3 (System Administration): Nhân Viên IT
  jid := '8efec928-dba3-5d98-8365-ebe8c7ebaf7e'::uuid;
  cid := company_ids[10];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhân Viên IT',
    'Quản trị hệ thống CNTT, cài đặt, cấu hình và bảo trì các thiết bị: máy tính, máy in, máy chấm công, thiết bị mạng nội bộ (router, switch, wifi), camera… Đảm bảo hệ thống mạng tại văn phòng, kho và cửa hàng hoạt động ổn định. Khắc phục sự cố phần cứng, mạng, hệ điều hành Windows và phần mềm văn phòng. Hỗ trợ phần mềm kế toán MISA / FAST, cài đặt và cấu hình phần mềm kế toán MISA, FAST cho bộ phận kế toán. Hỗ trợ xử lý các lỗi phát sinh trong quá trình sử dụng phần mềm. Phối hợp với nhà cung cấp để nâng cấp, sao lưu, phục hồi dữ liệu định kỳ hoặc khi cần thiết. Đảm bảo tính bảo mật và phân quyền người dùng đúng chức năng trên phần mềm kế toán. Hỗ trợ người dùng nội bộ, hướng dẫn và hỗ trợ kỹ thuật cho nhân viên các phòng ban về phần mềm, email, kết nối mạng, in ấn, truy cập hệ thống. Quản lý tài khoản, phân quyền và khắc phục sự cố người dùng trên các hệ thống dùng chung. Thực hiện backup dữ liệu định kỳ, đặc biệt là dữ liệu kế toán trên MISA/FAST và các hệ thống liên quan. Kiểm tra, cài đặt phần mềm diệt virus, tường lửa để bảo vệ dữ liệu và hệ thống mạng. Kiểm soát truy cập và bảo mật thiết bị, dữ liệu khách hàng, dữ liệu nội bộ. Tham gia khảo sát, đề xuất các giải pháp phần mềm phục vụ vận hành (bán hàng, CSKH, ERP…). Triển khai hệ thống IT cho chi nhánh/cửa hàng mới nếu công ty mở rộng. Hỗ trợ kết nối phần mềm kế toán với các hệ thống nội bộ khác khi cần (bán hàng, kho, CRM…).

Yêu cầu chi tiết: Trình độ: Cao đẳng/Đại học chuyên ngành CNTT, Mạng máy tính, Hệ thống thông tin… Kinh nghiệm: Tối thiểu 1–2 năm ở vị trí IT helpdesk hoặc kỹ thuật IT. Có kinh nghiệm trực tiếp cài đặt, hỗ trợ hoặc sử dụng phần mềm kế toán MISA/FAST. Ưu tiên ứng viên từng làm việc tại doanh nghiệp thương mại – dịch vụ. Kỹ năng chuyên môn: Am hiểu hệ điều hành Windows, phần mềm văn phòng, mạng LAN/WAN/Wifi. Kỹ năng xử lý sự cố kỹ thuật nhanh chóng, giao tiếp hỗ trợ người dùng tốt. Biết về sao lưu, bảo mật dữ liệu và bảo trì hệ thống mạng.',
    '- Bằng cấp: Cao đẳng/Đại học chuyên ngành CNTT, Mạng máy tính, Hệ thống thông tin
- Kỹ năng chuyên môn: Hệ điều hành Windows, Phần mềm văn phòng, Mạng LAN/WAN/Wifi, Phần mềm kế toán MISA/FAST
- Kỹ năng mềm: Kỹ năng xử lý sự cố kỹ thuật nhanh chóng, Giao tiếp hỗ trợ người dùng tốt
- Kinh nghiệm: 1 năm',
    '- Lương tháng 13
- Thưởng cuối năm
- Thưởng lễ tết
- Nghỉ phép, nghỉ mát, nghỉ chế độ, nghỉ bảo hiểm đầy đủ
- Khám sức khỏe hằng năm
- Được đào tạo kỹ năng chuyên môn
- Được cấp đồng phục miễn phí
- Môi trường làm việc năng động, chuyên nghiệp, trẻ trung',
    'Quảng Ngãi', 'full_time'::public.employment_type,
    7000000, 9000000, 'VND', 'published',
    now() - ((22 % 21) || ' days')::interval,
    now() + ((20 + (22 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [23/94] group 3 (System Administration): System Administrator
  jid := '23fbaf7d-3c68-5abf-8b45-b0f92169a19c'::uuid;
  cid := company_ids[11];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'System Administrator',
    'Quản trị, vận hành hệ thống Linux (Ubuntu/CentOS) trong môi trường production, đảm bảo uptime cao, backup định kỳ và bảo mật hệ thống ở mức tối đa. Triển khai, giám sát và tối ưu hóa Kubernetes Cluster (K8s) chạy các ứng dụng microservices theo mô hình cloud-native. Quản lý môi trường container hóa bằng Docker, xây dựng các Dockerfile, image private registry, CI/CD pipeline. Triển khai và vận hành các hệ thống Mongodb (replica set, sharding), Kafka (multi-broker, HA), Redis Cluster, ElasticSearch phục vụ hệ thống có lưu lượng lớn. Quản lý hạ tầng ảo hóa VMware vSphere/ESXi, tạo và tối ưu tài nguyên VM theo nhu cầu từng team/dev. Triển khai, tích hợp và duy trì hệ thống OpenStack cho private cloud, thực hiện scale-out, snapshot, volume management,... Thiết lập giám sát hệ thống bằng Prometheus + Grafana, alerting qua Alertmanager + Telegram/Slack. Xây dựng các công cụ tự động hóa (Ansible, Bash script, Python) cho việc scale hệ thống, tạo môi trường dev/test. Xử lý sự cố cấp độ production, điều phối cùng DevOps/SRE và các team liên quan để giảm downtime và tối ưu performance.

Yêu cầu chi tiết: Có từ 2 năm kinh nghiệm trở lên làm việc với Linux systems (Ubuntu/Debian là lợi thế). Hiểu sâu về kiến trúc Kubernetes, đã từng build hoặc maintain cluster nhiều node trên môi trường cloud hoặc bare metal. Thành thạo Docker, có kinh nghiệm troubleshooting container runtime, volume, networking,... Hiểu về kiến trúc và cấu hình Kafka, Mongodb, đã từng làm việc trong các hệ thống có dữ liệu lớn, throughput cao. Có kinh nghiệm quản trị VMware (vCenter, vSphere). Biết triển khai hoặc sử dụng hệ thống OpenStack, hiểu về Nova, Cinder, Neutron là lợi thế lớn. Kỹ năng scripting tốt với Bash, Python, ưu tiên đã làm automation với Ansible/Terraform. Có chứng chỉ như: CKA, RHCE, VMware VCP, OpenStack COA là điểm cộng lớn. Tư duy hệ thống tốt, kỹ năng phân tích log và xử lý sự cố thần tốc. Kỹ năng làm việc độc lập và teamwork tốt.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Linux systems (Ubuntu/Debian), Kubernetes, Docker, Kafka, Mongodb, VMware, OpenStack, Prometheus, Grafana, Ansible, Python
- Kỹ năng mềm: Tư duy hệ thống, Kỹ năng phân tích log, Kỹ năng làm việc độc lập, Teamwork
- Kinh nghiệm: 2 năm',
    '- Xét tăng lương định kỳ hàng năm
- Thưởng vào các dịp lễ đặc biệt
- Tham gia các chương trình nội bộ
- Được trang bị đầy đủ thiết bị làm việc
- Tham gia đầy đủ các chế độ bảo hiểm theo quy định
- Chế độ nghỉ phép: 12 ngày phép/năm',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    20000000, 20000000, 'VND', 'published',
    now() - ((23 % 21) || ' days')::interval,
    now() + ((20 + (23 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [24/94] group 3 (System Administration): Nhân Viên IT SUPPORT
  jid := '419336e3-f4e4-5c2a-8c62-e2a3b59de16a'::uuid;
  cid := company_ids[12];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhân Viên IT SUPPORT',
    'Phối hợp với Phụ trách phòng: lập kế hoạch, thực hiện theo dõi, giám sát, xây dựng hệ thống hạ tầng mạng, máy chủ nhằm đảm bảo tình trạng hoạt động cũng như an ninh mạng, internet luôn ở tình trạng tốt và an toàn. Sửa chữa, khắc phục và vận hành hệ thống server, hệ thống mạng. Hỗ trợ người dùng xử lý sự cố, các vấn đề về công nghệ thông tin theo SLA. Cung cấp hỗ trợ cài đặt, cấu hình cho người dùng cuối các phần cứng máy tính để bàn, phần mềm và thiết bị ngoại vi. Giúp cài đặt mạng nội bộ, hệ thống cáp và các thiết bị như camera, hub và switch. Quản lý thiết bị IT, phối hợp với các đơn vị cung cấp thiết bị khi có phát sinh mua sắm, bảo hành, kiểm tra thiết bị IT. Các công việc khác theo phân công của cấp trên.

Yêu cầu chi tiết: Tốt nghiệp chuyên ngành Công nghệ thông tin, Mạng máy tính, Khoa học máy tính hoặc các ngành có chứng chỉ liên quan. Kinh nghiệm làm việc từ 2 năm trong việc helpdesk và quản lý hệ thống mạng. Am hiểu về hệ thống mạng (LAN, WAN, VPN) và các giao thức mạng như TCP/IP, DNS, DHCP. Kỹ năng quản trị hệ thống và máy chủ (Windows Server, Linux). Có hiểu biết và kinh nghiệm triển khai các hệ thống quản lý IT (Helpdesk, quản lý tài sản, theo dõi hệ thống,…). Kiến thức về bảo mật hệ thống (Firewall, Antivirus, IDS/IPS). Thành thạo việc giám sát, bảo trì và tối ưu hiệu suất hệ thống. Có kinh nghiệm về quản lý các dịch vụ của Microsoft 365. Ưu tiên ứng viên có kinh nghiệm xây dựng ứng dụng trong Power Apps của Microsoft. Không ngừng học hỏi, nâng cao kiến thức để có những chiến lược nâng cấp hệ thống tối ưu và hiệu quả. Năng động, hòa đồng, làm việc nhóm hiệu quả. Kỹ năng giao tiếp tốt để phối hợp với các bộ phận khác. Có tính kỷ luật và bảo mật trong công việc. Tư duy logic và khả năng giải quyết vấn đề nhanh chóng. Tính tỉ mỉ, chú ý đến chi tiết trong việc quản lý hệ thống, có trách nhiệm cao và cẩn thận trong công việc được giao.',
    '- Bằng cấp: Tốt nghiệp chuyên ngành Công nghệ thông tin, Mạng máy tính, Khoa học máy tính hoặc các ngành có chứng chỉ liên quan
- Kỹ năng chuyên môn: Hệ thống mạng (LAN, WAN, VPN), Giao thức mạng (TCP/IP, DNS, DHCP), Quản trị hệ thống và máy chủ (Windows Server, Linux), Hệ thống quản lý IT (Helpdesk, quản lý tài sản), Bảo mật hệ thống (Firewall, Antivirus, IDS/IPS), Microsoft 365
- Kỹ năng mềm: Năng động, Hòa đồng, Làm việc nhóm hiệu quả, Kỹ năng giao tiếp tốt, Tính kỷ luật, Tư duy logic, Khả năng giải quyết vấn đề nhanh chóng, Tính tỉ mỉ, Chú ý đến chi tiết
- Kinh nghiệm: 2 năm',
    '- Thử việc 85-100% lương
- Thưởng lương tháng thứ 13-18 theo kết quả kinh doanh
- Phụ cấp tiền gửi xe 100%
- Nghỉ thứ 7 và chủ nhật hằng tuần
- Nghỉ 12 ngày phép 1 năm
- Nghỉ ngày sinh nhật: nhận 100% lương HOẶC 200% lương khi đi làm ngày sinh nhật
- Cơ chế thăng tiến rõ ràng
- Học piano miễn phí trọn đời
- Có HĐLĐ; Được đóng BHXH và đầy đủ BHYT/BHTN theo Luật Lao động quy định
- Chế độ ốm đau/thai sản/hôn hỉ/tang chế',
    'Quận 1', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((24 % 21) || ' days')::interval,
    now() + ((20 + (24 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [25/94] group 3 (System Administration): Phối hợp và quản trị hệ thống mạng
  jid := '338ebfae-bc02-5e80-90a7-87444c8b237e'::uuid;
  cid := company_ids[1];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Phối hợp và quản trị hệ thống mạng',
    'Cấu hình hệ thống nội bộ. Chẩn đoán và khắc phục các vấn đề kỹ thuật. Duy trì tính toàn vẹn của hệ thống. Giám sát hiệu suất hệ thống, hoạt động hệ thống CNTT và sử dụng lưu trữ. Cung cấp hỗ trợ với các yêu cầu trợ giúp leo thang hoặc cấp 1. Các kế hoạch trước cho nâng cấp phần cứng hoặc phần mềm cần thiết để hỗ trợ tăng trưởng hệ thống. Cài đặt máy chủ, thiết bị và tường lửa. Nâng cấp cơ sở hạ tầng mạng. Tiến hành sao lưu dữ liệu. Đảm bảo triển khai trơn tru các ứng dụng mới. Cung cấp lời khuyên và thực tiễn tốt nhất cho bảo mật CNTT. Viết, chỉnh sửa và sửa đổi các thủ tục bảo mật. Theo dõi hướng dẫn của người quản lý về chiến lược, phát triển và tăng trưởng trong tương lai của công ty trong nhóm hệ thống CNTT. Đảm bảo tất cả các nhiệm vụ CNTT được giao được thực hiện một cách chuyên nghiệp và hệ thống CNTT vẫn ở trong tình trạng tốt và chạy hoàn hảo. Sensibilized cho tất cả các khía cạnh kỹ thuật CNTT của công ty. Quản lý các sự cố quan trọng, liên quan đến giao tiếp người dùng, các hoạt động và bất kỳ sự leo thang thích hợp. Xây dựng mối quan hệ dịch vụ với các nhóm trung tâm người dùng và hiểu các nguyên tắc và thực hành chăm sóc khách hàng. Xem xét báo cáo hiệu suất, cải tiến dịch vụ, chất lượng dịch vụ và quy trình. Xây dựng khả năng nhóm để cung cấp lời khuyên chuyên môn. Quản lý và các thành viên trong nhóm huấn luyện. Đảm bảo rằng nhóm KPI của nhóm được theo dõi, các hành động được thực hiện, đánh giá phù hợp và được ủy quyền đúng cách.

Yêu cầu chi tiết: 5+ years working experience on related job. Strong background on System/Network/Security. 3+ years working experience in Microsoft System solution. Good knowledge or experience on system security techniques. Experience in Cyber Security. Advanced French and fluent in English.',
    '- Bằng cấp: Cao Đẳng trở lên
- Kỹ năng chuyên môn: System, Network, Security, Microsoft System solution, Cyber Security, Exchange Online, DR, load balancing, clustering, Hyper-V, Nutanix, Citrix, SCCM/SCOM, MS SQL database server, Backup and storage solutions
- Kỹ năng mềm: Teamwork, Communication, Problem-solving
- Kinh nghiệm: 5 năm',
    '- Bảo hiểm xã hội
- Bảo hiểm sức khỏe
- Bảo hiểm sức khỏe ngưởi thân
- Khám sức khỏe định kỳ
- Bảo hiểm full lương
- Du lịch hàng năm
- Team building
- Thưởng hiệu quả làm việc',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    38000000, 45000000, 'VND', 'published',
    now() - ((25 % 21) || ' days')::interval,
    now() + ((20 + (25 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [26/94] group 3 (System Administration): Kỹ Sư Quản Trị Hệ Thống
  jid := '380871a5-8f1b-591c-8b7e-94e495b3c55e'::uuid;
  cid := company_ids[2];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ Sư Quản Trị Hệ Thống',
    'Weldcom Tuyển dụng 02 Chuyên viên Quản trị hệ thống làm việc tại 285A Ngô Gia Tự, Long Biên, Hà Nội. Công việc bạn cần thực hiện như sau: - Cài đặt và cấu hình: Thiết lập và cấu hình phần mềm, phần cứng, máy chủ và các công cụ công nghệ. - Bảo trì và giám sát: Đảm bảo hệ thống hoạt động ổn định, liên tục và an toàn. Giám sát hiệu suất và bảo trì hệ thống theo yêu cầu. - Khắc phục sự cố: Chẩn đoán và giải quyết các vấn đề kỹ thuật liên quan đến mạng và máy chủ. Đảm bảo an ninh mạng thông qua kiểm soát truy cập, sao lưu và tường lửa. - Nâng cấp hệ thống: Cập nhật hệ thống với các phiên bản và mô hình mới để đảm bảo hiệu suất và bảo mật. - Hỗ trợ kỹ thuật: Cung cấp hỗ trợ kỹ thuật cho các dự án và đào tạo nhân viên về cách sử dụng các tài nguyên IT một cách đúng đắn.

Yêu cầu chi tiết: - Tốt nghiệp từ Cao đẳng hoặc chứng chỉ chuyên ngành: Công nghệ thông tin, Quản trị hệ thống, Network & Bảo mật
- Có ít nhất 03 năm kinh nghiệm làm việc liên quan tới quản trị hệ thống hoặc quản trị mạng.
- Có kinh nghiệm làm việc trên các môi trường: Windows Server/Linux/Hyper-V/VMware vSphere.
- Có kinh nghiệm quản trị các dịch vụ AD, DNS, Exchange server Hybrid, Microsoft 365, Web Server, Nginx/HAProxy, hệ thống giám sát (PRTG,Zabbix,…)
- Có hiểu biết về các hệ thống Server HPE/DELL, hệ thống lưu trữ SAN và Backup (HPE MSA/3PAR, HPE StoreOnce, Veeam Backup,… hoặc các giải pháp/sản phẩm tương đương)
- Kiến thức cơ bản về hệ thống CSDL: MySQL/MariaDB, MS SQL Server.
- Có khả năng chịu áp lực công việc, có tinh thần học hỏi và chia sẻ, khả năng cộng tác phối hợp làm việc theo nhóm.
- Sử dụng, đọc hiểu tốt các tài liệu kỹ thuật tiếng Anh.
- Ưu tiên ứng viên có chứng chỉ: MSCA, MCSE, Linux+, LPI, Security+, VCP, Azure Admin.',
    '- Bằng cấp: Cao đẳng trở lên, Chứng chỉ chuyên ngành: Công nghệ thông tin, Quản trị hệ thống, Network & Bảo mật
- Kỹ năng chuyên môn: Windows Server, Linux, Hyper-V, VMware vSphere, AD, DNS, Exchange server Hybrid, Microsoft 365, Web Server, Nginx, HAProxy, PRTG, Zabbix, MySQL, MariaDB, MS SQL Server
- Kỹ năng mềm: Chịu áp lực công việc, Tinh thần học hỏi và chia sẻ, Khả năng cộng tác phối hợp làm việc theo nhóm
- Kinh nghiệm: 3 năm',
    '- Bảo hiểm xã hội đóng trên 100% lương cơ bản
- Chế độ phép năm, lễ tết theo quy định của pháp luật lao động
- Môi trường coi trọng người lao động
- Các chế độ phúc lợi đầy đủ
- Ăn trưa, Xăng xe, Cước điện thoại
- Bảo hiểm sức khỏe
- Khám sức khỏe định kỳ
- Team building
- Du lịch hàng năm
- Phụ cấp thâm niên
- Signing bonus
- Thưởng cổ phần
- Thưởng tháng 13
- Thưởng hiệu quả làm việc',
    'Hà Nội', 'full_time'::public.employment_type,
    15000000, 20000000, 'VND', 'published',
    now() - ((26 % 21) || ' days')::interval,
    now() + ((20 + (26 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [27/94] group 3 (System Administration): Quản Trị Hệ Thống
  jid := '78d35376-d563-555b-a483-b643d4ec87c7'::uuid;
  cid := company_ids[3];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Quản Trị Hệ Thống',
    'Triển khai, điều chỉnh hạ tầng, server cho các hệ thống, dịch vụ. Pentest, kiểm thử và đánh giá server, các thiết bị phần cứng. Cài đặt, quản trị vận hành các hệ thống máy chủ sử dụng các hệ điều hành: Linux, Windows, vmware esxi,.. Nghiên cứu, thử nghiệm và đề xuất các giải pháp nhằm nâng cao hiệu quả hoạt động và tính sẵn sàng của các hệ thống máy chủ. Theo dõi, giám sát hoạt động, hiệu năng, tài nguyên sử dụng của hệ thống. Phát triển các tool, bộ công cụ quản trị, giám sát hệ thống. Phối hợp xử lý sự cố liên quan tới máy chủ. Đánh giá & tối ưu tài nguyên server sử dụng hợp lý cho các dịch vụ. Viết các tài liệu hướng dẫn thực hiện. Báo cáo định kỳ hoặc theo sự vụ tình trạng hoạt động của các hệ thống cho phụ trách.

Yêu cầu chi tiết: LPIC-1, ít nhất 1 năm kinh nghiệm làm việc với infrastructure, quản trị hệ thống, monitor giám sát. Ưu tiên có các chứng chỉ nghề nghiệp trong lĩnh vực quản trị hệ thống như MCSA, MCSE, MCITP trên các nền tảng Windows 2012/2016, chứng chỉ Linux LPI, chứng chỉ quản trị hệ điều hành Unix của các hãng IBM, HP… là một lợi thế. Có kinh nghiệm triển khai, quản trị hạ tầng và ứng dụng. Am hiểu và yêu thích về phần cứng, các thiết bị phần cứng. Có kiến thức tốt và giàu kinh nghiệm triển khai, quản trị, vận hành các hệ thống máy chủ sử dụng hệ điều hành Unix, Windows, Vmware. Có kinh nghiệm triển khai đa dạng các ứng dụng phổ biến, phức tạp. Có kinh nghiệm lập trình các ngôn ngữ kịch bản như Shell, Python, Perl, php là một lợi thế. Có kinh nghiệm về virtualization như Vmware, Hyper-V, Docker, .. là một lợi thế. Có kinh nghiệm về triển khai các giải pháp giám sát hiệu năng của hệ thống như Nagios, centreon, zabbix, check MK là một lợi thế.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Linux, Windows, vmware esxi, Shell, Python, Perl, php, Vmware, Hyper-V, Docker, Nagios, centreon, zabbix, check MK
- Kỹ năng mềm: Giải quyết sự cố, Quản trị hệ điều hành, Quản trị mạng
- Kinh nghiệm: 1 năm',
    '- Thưởng đạt, vượt chỉ tiêu KPI
- Thưởng tháng lương 13
- Thưởng thâm niên
- Thưởng Nóng, thưởng thành tích vượt trội
- Thưởng vinh danh, tôn vinh
- Thưởng Tự Khoe cấp Bộ Phận
- Điều chỉnh lương khi cần thiết
- Môi trường làm việc hiện đại
- Khóa đào tạo trực tiếp
- Chăm sóc sức khỏe định kỳ
- Chế độ nghỉ phép (12 ngày/năm)',
    'Hà Nội', 'full_time'::public.employment_type,
    11000000, 30000000, 'VND', 'published',
    now() - ((27 % 21) || ' days')::interval,
    now() + ((20 + (27 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [28/94] group 4 (Cybersecurity): Senior Pentest
  jid := '520b1ed6-b0e8-5bbe-9922-0ddfce65ab2c'::uuid;
  cid := company_ids[4];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Senior Pentest',
    'Xây dựng các quy trình và quy trình đào tạo hiệu quả để điều tra các sự kiện cho phù hợp. Thực hiện phân tích chuyên sâu trên các máy chủ để xác định các nguồn xâm nhập và lỗ hổng. Triển khai các giải pháp để quét mạng doanh nghiệp trên các mạng để phát hiện và tuân thủ lỗ hổng bảo mật. Đánh giá tính bảo mật của thông tin nằm trong cơ sở dữ liệu công ty, máy trạm, máy chủ và các hệ thống khác. Hỗ trợ chuyển các yêu cầu chức năng thành yêu cầu kỹ thuật bảo mật để làm rõ thỏa thuận của khách hàng. Báo cáo và tư vấn về các phương pháp khắc phục hoặc giảm thiểu rủi ro bảo mật cho hệ thống. Lập kế hoạch và tham gia triển khai đánh giá bảo mật, kiểm thử xâm nhập đối với ứng dụng Web, Web service, Mobile; thiết bị mạng, máy chủ, thiết bị IP khác, …) Thực hiện đánh giá black box, grey box, white box đối với ứng dụng, hạ tầng CNTT. Thực hiện đánh giá, kiểm thử an toàn bảo mật trên mã nguồn ứng dụng. Kiểm chứng các lỗ hổng bảo mật trên ứng dụng, đưa ra được các minh chứng khi khai thác thành công các lỗ hổng. Tham gia nghiên cứu các framework mã nguồn mở, viết mã khai thác dựa trên các CVE đã công bố. Tham gia nghiên cứu các phương pháp mới trong khai thác lỗ hổng phần mềm. Tìm kiếm lỗ hổng trên các framework mã nguồn mở.

Yêu cầu chi tiết: Có từ 3 năm kinh nghiệm trở lên ở vị trí tương đương. Kiến thức cơ bản về Hệ điều hành. Kiến thức về network: mô hình OSI, TCP/IP, các giao thức IP. Khả năng lập trình 1 trong các ngôn ngữ: C, C#, python, php, java. Có hiểu biết về các lỗ hổng bảo mật trong Owasp top 10 web application security, mobile application security. Kiến thức vững về các kỹ thuật tìm kiếm, phân tích, khai thác điểm yếu và các biện pháp phòng chống, khắc phục lỗi. Sử dụng thành thạo các công cụ kiểm thử: burpsuite, acunetix, ZAP, Kali linux, metasploit. Ưu tiên ứng viên có các chứng chỉ: OSCP, OSWE, OSEP… là lợi thế.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: C, C#, Python, PHP, Java, Burpsuite, Acunetix, ZAP, Kali Linux, Metasploit
- Kỹ năng mềm: Phân tích, Giải quyết vấn đề
- Kinh nghiệm: 3 năm',
    '- Thử việc hưởng 100% lương
- Review lương 2 lần/năm
- Thưởng tất cả các ngày Lễ, Tết
- Thưởng giới thiệu ứng viên nội bộ
- Thưởng thâm niên làm việc
- Thưởng ESOP
- Khóa học đào tạo định kỳ
- Chi phí cho việc học và thi các chứng chỉ quốc tế
- 12 ngày phép năm + 1 ngày nghỉ vào ngày sinh nhật
- Đầy đủ các chế độ bảo hiểm và ngày nghỉ theo quy định
- Các hoạt động văn hóa tập thể',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((28 % 21) || ' days')::interval,
    now() + ((20 + (28 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [29/94] group 4 (Cybersecurity): Kỹ Sư Giải Pháp Công Nghệ Thông Tin - Bảo Mật
  jid := '7c8fa9db-036c-5129-9dd5-17cb1446be44'::uuid;
  cid := company_ids[5];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ Sư Giải Pháp Công Nghệ Thông Tin - Bảo Mật',
    'Chịu trách nhiệm thực hiện các dịch vụ IT, theo yêu cầu của khách hàng và yêu cầu của các dự án IT (bao gồm cả phần Presales, Postsales và Afterales Service), phối hợp cùng các phòng/nhóm trong Công ty. Nghiên cứu và triển khai các giải pháp An toàn thông tin, các giải pháp lưu trữ, sao lưu và phục hồi dữ liệu. Tự học/ nghiên cứu hoặc tham gia các khóa đào tạo của hãng để nắm vững được các giải pháp, công nghệ và sản phẩm của các đối tác của Công ty. Có kỹ năng chuyên sâu về hệ thống hạ tầng IT qua thông tin đối tác, trên Internet hay các dự án được tham gia.

Yêu cầu chi tiết: Tốt nghiệp ĐH/CĐ chuyên ngành CNTT, Điện tử, Hệ thống mạng/Bảo mật. Có kinh nghiệm về bảo mật hệ thống CNTT. Sử dụng thành thạo các phần mềm tin học văn phòng (MS Word, MS Excel, MS Power Point, Visio, MS Outlook, MS Project, ...). Có kinh nghiệm làm việc trên các hệ điều hành Linux, UNIX (AIX, Redhat, CentOS ...), Windows Server. Có kinh nghiệm làm việc tại vị trí triển khai giải pháp hạ tầng CNTT, đã làm việc với các hệ thống máy chủ, tủ đĩa, Thiết bị mạng của các hãng lớn như HPE, IBM, DELL/EMC, ORACLE, Cisco ... Có các chứng chỉ về chuyên môn. Có kinh nghiệm triển khai hệ thống ảo hóa (Vmware/ HyperV/ KVM/ IBM Hypervisor...). Có hiểu biết về các giải pháp IAM, SIEM, DLP, MFA là một lợi thế. Tiếng Anh: Làm việc trực tiếp với đối tác nước ngoài, đọc viết dịch tiếng Anh khi làm việc. Ưu tiên ứng viên có các chứng chỉ tiếng Anh quốc tế. Yêu cầu tối thiểu: Đọc viết: 8/10, Nghe nói 7/10. Có thể làm thêm giờ/đi công tác khi cần. Cần cù và chủ động khi làm việc và khi học hỏi nâng cao trình độ chuyên môn; có các kỹ năng mềm là điểm cộng.',
    '- Bằng cấp: ĐH/CĐ chuyên ngành CNTT, Điện tử, Hệ thống mạng/Bảo mật
- Kỹ năng chuyên môn: VMware, Linux, UNIX, Windows Server, VPN, Firewall
- Kỹ năng mềm: Kỹ năng trình bày, Kỹ năng làm hồ sơ giải pháp, Kỹ năng làm việc nhóm
- Kinh nghiệm: 2 năm',
    '- Bảo hiểm xã hội
- Team building',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((29 % 21) || ' days')::interval,
    now() + ((20 + (29 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [30/94] group 4 (Cybersecurity): CNTT hỗ trợ HN - Bảo mật đám mây (Tiếng Anh Fluent - Nightshift cố định)
  jid := 'afd0e736-bde7-5571-88dd-1c6bd0372289'::uuid;
  cid := company_ids[6];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'CNTT hỗ trợ HN - Bảo mật đám mây (Tiếng Anh Fluent - Nightshift cố định)',
    'Đánh giá các vấn đề và liên hệ với khách hàng để hiểu các vấn đề. Đảm bảo khách hàng được thông báo về tình trạng/giải pháp cho vấn đề của họ. Sử dụng các công cụ khắc phục sự cố (ví dụ: nhật ký sự kiện và dấu vết hiệu suất) để giúp giải quyết các vấn đề của khách hàng. Giải quyết hoặc leo thang nhiều vấn đề khách hàng và đa dạng. Tài liệu công việc kỹ thuật và nghiên cứu. Phân tích các vấn đề và phát triển các giải pháp cho nhu cầu của khách hàng bằng cách sử dụng phân tích nhật ký và các công cụ độc quyền khác. Hợp tác về các vấn đề kỹ thuật giữa các nhóm và sản phẩm chéo bằng cách làm việc với các tài nguyên từ các nhóm khác khi cần thiết để giải quyết các vấn đề khách hàng phức tạp vừa phải. Sử dụng các công cụ tự động để cung cấp các giải pháp cho một loạt các vấn đề. Cung cấp phản hồi về cách cải thiện các công cụ tự động. Tham dự các cuộc họp xử lý trường hợp hoặc các cuộc thảo luận trường hợp để hợp tác và chia sẻ ý tưởng để giải quyết các vấn đề.

Yêu cầu chi tiết: WORKING HOURS: FIXED NIGHT SHIFT ON-SITE (10PM-7AM). Strong proficiency in English (equivalent to IELTS 6.5 or TOEIC 800 or higher). Having 1 year of working experience in global customer service roles with a customer-focused mindset and exceptional service skills. Having a background or working experience in IT /Technical/Engineering/Networking & IT/Cybersecurity & Cloud Security/Automation. Open to fresher.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Networking (tcp Ip, Dns, Routing), Troubleshooting And Problem Solving Skills, Operating Systems (windows, Linux), Cloud Security Fundamentals (aws, Azure, Gcp), Security Best Practices (iam, Access Control)
- Kỹ năng mềm: customer-focused mindset, exceptional service skills
- Kinh nghiệm: 1 năm',
    '- Salary at 100% during the probationary period
- 90% contribution of the gross salary to social insurance
- 30% additional salary for night shifts
- PVI insurance
- 500,000 VND food allowance
- 20 days leave (12 days of annual leave and 8 days of sick leave)
- Training will be offered
- Full working equipment will be provided
- Annual Health Checkup
- Activities: Birthday party, Employee engagement activities',
    'Hà Nội', 'full_time'::public.employment_type,
    18000000, 24000000, 'VND', 'published',
    now() - ((30 % 21) || ' days')::interval,
    now() + ((20 + (30 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [31/94] group 4 (Cybersecurity): Chuyên Viên Đánh Giá An Toàn Bảo Mật
  jid := '2b7821f2-565a-5425-9015-a1b1d83b1faa'::uuid;
  cid := company_ids[7];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Chuyên Viên Đánh Giá An Toàn Bảo Mật',
    'Dò quét, đánh giá, kiểm thử xâm nhập (pentest) nhằm phát hiện kịp thời các điểm yếu, lỗ hổng bảo mật trong hệ thống CNTT. Dò quét và quản lý các lỗ hổng, điểm yếu bảo mật trong hệ thống CNTT. Thực hiện đánh giá bảo mật cho ứng dụng, dịch vụ CNTT mới hoặc khi thay đổi. Phối hợp với đối tác đánh giá bảo mật đối với các hệ thống CNTT kết nối trực tiếp Internet (Online Banking, Digital Banking, Website...), hệ thống CNTT kết nối bên thứ 3... quy định của NHNN và của Eximbank. Định kỳ rà soát an toàn bảo mật các hệ thống CNTT trọng yếu. Quản lý, triển khai các dự án và dịch vụ thuê ngoài mảng CNTT theo phân công. Quản lý và triển khai các dự án và dịch vụ thuê ngoài mảng CNTT thuộc Phòng theo phân công của Trưởng phòng. Tham gia hỗ trợ các dự án khác và dịch vụ thuê ngoài mảng CNTT theo yêu cầu/phân công của Trưởng phòng. Các nhiệm vụ khác theo sự phân công của quản lý trực tiếp/ lãnh đạo Phòng.

Yêu cầu chi tiết: Trình độ học vấn: Tốt nghiệp Đại học trở lên chuyên ngành CNTT hoặc chuyên ngành có liên quan. Bằng cấp/chứng chỉ chuyên môn: Ưu tiên chứng chỉ quốc tế về kiểm thử bảo mật như OSCP, OSWP, OSEP, OSWE... Ưu tiên có chứng chỉ bảo mật Security+, CEH hoặc tương đương. Kinh nghiệm chuyên môn: có tối thiểu 03 năm kinh nghiệm trong lĩnh vực đánh giá an toàn bảo mật trong đó có tối thiểu 01 năm kinh nghiệm về kiểm thử bảo mật (pentest), ứng dụng CNTT, lỗi bảo mật hệ thống/ứng dụng.',
    '- Bằng cấp: Tốt nghiệp Đại học trở lên chuyên ngành CNTT hoặc chuyên ngành có liên quan
- Kỹ năng chuyên môn: Kiểm thử bảo mật, Đánh giá bảo mật, Quản lý lỗ hổng bảo mật
- Kinh nghiệm: 3 năm',
    '- Thu nhập cạnh tranh
- Tham gia các khóa học kỹ năng nâng cao nghiệp vụ
- Hưởng chế độ bảo hiểm chất lượng cao
- Lương tháng 13
- Thưởng Lễ-Tết, doanh số',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((31 % 21) || ' days')::interval,
    now() + ((20 + (31 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [32/94] group 4 (Cybersecurity): Kỹ sư mạng & bảo mật
  jid := '5bce46f7-6654-5c5c-8f85-43faab279bc7'::uuid;
  cid := company_ids[8];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ sư mạng & bảo mật',
    '- Tư vấn, thiết kế, triển khai và tích hợp các giải pháp về CNTT (như network, security, endpoint…) phù hợp với hiện trạng và nhu cầu hoạt động của khách hàng
- Xây dựng tài liệu, đào tạo, giới thiệu và demo các sản phẩm và giải pháp với khách hàng.
- Nghiên cứu tìm hiểu về thiết bị, giải pháp, sản phẩm mạng, bảo mật hệ thống CNTT của các hãng công nghệ như Cisco, Fortinet, Palo Alto, Check Point, Aruba, CyberArk, Symantec, McAfee, Citrix, F5…
- Tham gia các chương trình đào tạo sản phẩm/giải pháp được tổ chức bởi hãng/nhà phân phối. Nghiên cứu tính năng sản phẩm, cập nhật công nghệ mới nhất về các sản phẩm và giải pháp.
- Làm việc với hãng/nhà cung cấp để tư vấn, triển khai các giải pháp mới và xử lý các sự cố liên quan đến sản phẩm/giải pháp.
- Thi các chứng chỉ phục vụ cho công việc.

Yêu cầu chi tiết: - Tốt nghiệp đại học trở lên, chuyên ngành Công nghệ thông tin; An toàn thông tin; Điện tử viễn thông hoặc chuyên ngành liên quan
- Trên 3 năm kinh nghiệm về các lĩnh vực liên quan, ưu tiên có kinh nghiệm và hiểu biết về các giải pháp của các hãng CyberArk, Citrix, F5…
- Có kinh nghiệm và hiểu biết về các giải pháp Network và Security (như Switching, Routing, Firewall, IPS… của các hãng như Cisco, Fortinet, Check Point, Aruba, Symantec, McAfee, Trend Micro…)
- Trình độ tiếng Anh: Có khả năng đọc hiểu tốt tài liệu chuyên ngành, giao tiếp, trao đổi qua email…',
    '- Bằng cấp: Tốt nghiệp đại học trở lên, chuyên ngành Công nghệ thông tin; An toàn thông tin; Điện tử viễn thông hoặc chuyên ngành liên quan
- Kỹ năng chuyên môn: Network, Security, Switching, Routing, Firewall, IPS
- Kỹ năng mềm: Giao tiếp, Đọc hiểu tài liệu chuyên ngành
- Kinh nghiệm: 3 năm',
    '- Mức thu nhập hấp dẫn
- Thưởng hiệu quả dựa vào doanh số hoạt động
- Cơ hội được đào tạo chuyên môn trong và ngoài nước
- Các chương trình hoạt động của công ty như nghỉ mát, văn hóa, teambuilding
- Môi trường làm việc thân thiện, gắn kết, chia sẻ
- BHYT, BHXH, khám sức khỏe định kỳ hàng năm',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((32 % 21) || ' days')::interval,
    now() + ((20 + (32 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [33/94] group 4 (Cybersecurity): Kỹ sư bảo mật mạng
  jid := '345f4dcf-45f6-52f7-8f79-4c53b3ff238c'::uuid;
  cid := company_ids[9];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ sư bảo mật mạng',
    '- Quản lý vận hành các hệ thống an toàn thông tin của công ty: Firewall, Anti virus, SIEM, DLP, NAC,..  
- Thiết lập, quản trị và giám sát các hệ thống VPN  
- Nghiên cứu sản phẩm và giải pháp của các đối tác: McAfee, Forescout, BeyondTrust, Cisco,Dell, Extreme, Juniper... nắm bắt các công nghệ, sản phẩm mới  
- Khảo sát, đánh giá hiện trạng của khách hàng và tìm hiểu, làm rõ nhu cầu từ khách hàng.  
- Thiết kế giải pháp và phát triển sản phẩm về hệ thống như: Network/ Security.   
- Giám sát hệ thống, nhận cảnh báo xử lý sự cố hệ thống.  
- Báo cáo tình hình an toàn thông tin định kỳ hoặc theo sự vụ cho cán bộ quản lý

Yêu cầu chi tiết: - Kiến thức nền tảng tốt về công nghệ thông tin, An toàn thông tin, các mảng: Network, Security.  
- Kinh nghiệm từ 2 năm triển khai hệ thống mạng IP, IP Security, System...  
- Kinh nghiệm triển khai, quản trị các hệ thống SIEM, DLP, NAC...  
- Kinh nghiệm triển khai, quản trị các hệ thống Firewall/NG-Firewall, IPS, VPN, Log Server, PAM, TenableSC, RSA, Tuafin...  
- Chủ động, khả năng học hỏi, sẵn sàng chịu trách nhiệm và thử thách.  
- Có kỹ năng tự tìm hiểu, nắm bắt nhanh về các sản phẩm và giải pháp mới.  
- Tiếng Anh giao tiếp, phục vụ công việc.  
- Tuyệt đối tuân thủ chính sách bảo mật công nghệ thông tin của công ty',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Firewall, Anti virus, SIEM, DLP, NAC, VPN, IP Security, System, Firewall/NG-Firewall, IPS, Log Server, PAM, TenableSC, RSA, Tuafin
- Kỹ năng mềm: Chủ động, Khả năng học hỏi, Sẵn sàng chịu trách nhiệm, Kỹ năng tự tìm hiểu
- Kinh nghiệm: 2 năm',
    '- Lương tháng 13
- Thưởng kinh doanh
- Gói thu nhập trung bình từ 14 tháng lương
- Thưởng lễ Tết
- Khám sức khỏe định kỳ hàng năm
- Nghỉ mát 1 lần/năm
- Team building ít nhất 1 lần/năm
- Thăm hỏi ốm đau, hiếu hỉ, thai sản
- Xem xét tăng lương 2 lần/năm',
    'Hà Nội', 'full_time'::public.employment_type,
    18000000, 35000000, 'VND', 'published',
    now() - ((33 % 21) || ' days')::interval,
    now() + ((20 + (33 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [34/94] group 4 (Cybersecurity): Quản Trị Hệ Thống An Toàn Thông Tin
  jid := '39a9690b-5a9d-576e-80f2-007734fb8eb8'::uuid;
  cid := company_ids[10];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Quản Trị Hệ Thống An Toàn Thông Tin',
    'Quản trị hệ thống, ứng dụng an toàn thông tin. Vận hành, bảo đảm hệ thống hoạt động ổn định, liên tục và an toàn. Ứng cứu, xử lý sự cố. Báo cáo định kỳ/đột xuất về hệ thống. Thực hiện công tác giám sát an toàn mạng, ứng dụng. Nghiên cứu điểm yếu ATTT của các hệ thống & cơ chế của các loại hình tấn công. Nghiên cứu, quy hoạch, thiết kế, triển khai & nâng cấp, tối ưu các hệ thống, ứng dụng, giải pháp an toàn thông tin. Quản lý chất lượng, báo cáo, quy trình, hồ sơ tài liệu, tài sản hệ thống.

Yêu cầu chi tiết: Tốt nghiệp Đại học chuyên ngành CNTT, ĐTVT, ATTT. Đọc hiểu tài liệu chuyên ngành bằng tiếng Anh. Có kiến thức, kinh nghiệm về network/system security, quản trị vận hành SOC; Unix/Linux, Network, chính sách, nền tảng ATTT. Có kinh nghiệm về thiết kế và mở rộng các mô hình và mạng bảo mật; phân tích log trên các hệ thống: Firewall, IPS, Endpoint Protection, Unix/Linux, Windows, Ứng dụng; triển khai, quản trị các ứng dụng, hệ thống an toàn an ninh mạng. Có kinh nghiệm làm việc với các công cụ và tiến trình an toàn thông tin. Làm việc độc lập/làm việc nhóm. Ưu tiên có các chứng chỉ: CCNA, CCNP, LPI, CompTIA Security+, CEH, CISSP, CCSP...',
    '- Bằng cấp: Tốt nghiệp Đại học chuyên ngành CNTT, ĐTVT, ATTT
- Kỹ năng chuyên môn: network/system security, quản trị vận hành SOC, Unix/Linux, Network, chính sách, nền tảng ATTT
- Kỹ năng mềm: Làm việc độc lập, Làm việc nhóm
- Kinh nghiệm: Không yêu cầu',
    '- Môi trường làm việc năng động, sáng tạo, thách thức
- Thu nhập hấp dẫn, thưởng theo năng lực
- Cơ hội phát triển cá nhân
- Cơ hội tiếp cận với các công nghệ mới
- Cơ hội tham gia đào tạo chuyên sâu trong nước, quốc tế
- Được hưởng các chế độ phúc lợi của Trung tâm: tham quan, nghỉ mát, bảo hiểm sức khỏe',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((34 % 21) || ' days')::interval,
    now() + ((20 + (34 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [35/94] group 4 (Cybersecurity): Người kiểm tra bảo mật (Pentest)
  jid := '02b6b071-60e2-5876-9407-70f9619b3260'::uuid;
  cid := company_ids[11];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Người kiểm tra bảo mật (Pentest)',
    'Thiết lập chiến lược kiểm tra an ninh và kế hoạch. Phát triển các chính sách và chiến lược an ninh. Giáo dục các nhà phát triển về bảo mật thông tin. Phát hiện các lỗ hổng bảo mật trước khi phát hành phần mềm. Tiến hành kiểm tra thâm nhập ứng dụng. Tiến hành bảo mật mã nguồn và xác minh bảo mật OSS. Tiến hành xác minh cấu trúc infra. Quản lý lịch sử kết quả kiểm tra an ninh. Xác định và xác định các yêu cầu bảo mật hệ thống. Hướng dẫn bảo mật và mã hóa bảo mật. Thiết kế kiến ​​trúc bảo mật. Kiểm tra thâm nhập ứng dụng (chương trình Web/Android/IOS/Window, v.v.). Kiểm tra điểm yếu bảo mật của mã nguồn được phát triển bằng các ngôn ngữ khác nhau. Xác minh bảo mật nguồn mở. Cấu trúc infra/xác minh bảo mật đám mây. Báo cáo các vấn đề bảo mật.

Yêu cầu chi tiết: At least 4 years of experience as a Security Tester. Bachelors'' Degree in IT-related majors. Knowledge of Web/Mobile/Desktop application''s vulnerabilities. Knowledge of Security Standard (OWASP, TOP10, ...). Technical knowledge of operating system and database. Basic coding skills, such as Java, HTML and other languages. Problem solving skills and communication skills.',
    '- Bằng cấp: Bachelors'' Degree in IT-related majors
- Kỹ năng chuyên môn: Knowledge of Web/Mobile/Desktop application''s vulnerabilities, Knowledge of Security Standard (OWASP, TOP10, ...), Technical knowledge of operating system and database, Basic coding skills, such as Java, HTML and other languages
- Kỹ năng mềm: Problem solving skills, Communication skills
- Kinh nghiệm: 4 năm',
    '- 100% salary during 2-month probation
- Full-salary insurance starting right from probation period
- 3 times bonus per year
- Health check once per year
- Health care insurance package
- Attractive training budget for each employee per year for personal training & Premium Udemy
- Online Learning Account
- Oversea training opportunities
- Numerous internal activities: team bonding, team training,...
- Gifts for each employee on 30/4,1/5; 2/9....(in cash)',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((35 % 21) || ' days')::interval,
    now() + ((20 + (35 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [36/94] group 5 (Data): Data Analyst
  jid := '97c7debf-d51e-56e2-84c2-0d025e2f238e'::uuid;
  cid := company_ids[12];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Data Analyst',
    'A. Phân tích yêu cầu nghiệp vụ
  * Tiếp nhận và phân tích yêu cầu từ các bộ phận liên quan (Kinh doanh, Marketing, Vận hành...)
  * Tư vấn giải pháp phân tích phù hợp với mục tiêu đề ra
  * Xây dựng KPI, OKR và xác định nguồn dữ liệu phục vụ báo cáo hoặc chiến dịch

B. Thu thập và xử lý dữ liệu
  * Phối hợp với team Data Engineering để thu thập, làm sạch và chuẩn hóa dữ liệu
  * Phối hợp thiết kế luồng dữ liệu (ETL), xây dựng mô hình dữ liệu dùng chung, đảm bảo tính linh hoạt và tái sử dụng
  * Phối hợp quản lý từ điển dữ liệu, hỗ trợ thống nhất ngôn ngữ dữ liệu trong toàn doanh nghiệp

C. Phân tích hiệu suất kinh doanh và hỗ trợ chương trình thi đua
  * Xây dựng hệ thống chỉ số đánh giá hiệu quả phục vụ tính thưởng và ghi nhận thành tích
  * Phối hợp với các bộ phận liên quan để thiết kế cơ chế thưởng minh bạch, công bằng, gắn với kết quả kinh doanh thực tế
  * Hỗ trợ triển khai và đo lường hiệu quả các chương trình thi đua nội bộ (contest, incentive campaigns...)
  * Cung cấp báo cáo định kỳ và phân tích chuyên sâu nhằm tối ưu hóa chính sách thưởng và thi đua

D. Phân tích dữ liệu và xây dựng báo cáo
  * Phân tích các chỉ số vận hành và tài chính để đưa ra bức tranh toàn cảnh về hoạt động kinh doanh
  * Trực quan hóa dữ liệu bằng các công cụ BI (Power BI, Tableau...), kết hợp với giải thích rõ ràng giúp ra quyết định dễ dàng hơn
  * Phát triển dashboard tự động, cập nhật thời gian thực phục vụ quản trị và vận hành

E. Phân tích khách hàng & triển khai Customer Value Management (CVM)
  * Phân tích hành vi, phân khúc khách hàng để xác định nhóm mục tiêu phù hợp
  * Hỗ trợ xây dựng và đo lường hiệu quả các chiến dịch tiếp cận khách hàng (A/B Testing, Uplift, Conversion rate...)
  * Theo dõi biến động và xu hướng của khách hàng theo thời gian để tư vấn chiến lược dài hạn

Yêu cầu chi tiết: Tối thiểu 03 năm trong lĩnh vực phân tích dữ liệu, báo cáo, insight khách hàng
Ưu tiên ứng viên có kinh nghiệm tại doanh nghiệp tài chính, ngân hàng, viễn thông hoặc công nghệ
Sử dụng thành thạo SQL và ít nhất một ngôn ngữ phân tích như Python/R
Có kinh nghiệm xây dựng pipeline dữ liệu, mô hình dữ liệu và báo cáo tự động
Thành thạo các công cụ BI như Power BI, Tableau, Qlik...
Nắm vững các kỹ thuật phân tích định lượng, phân khúc khách hàng, thống kê mô tả & suy diễn
Có khả năng truyền đạt thông tin phức tạp theo cách đơn giản, dễ hiểu và thuyết phục
Tư duy Agile, chủ động phối hợp đa phòng ban, từng làm việc trong môi trường Scrum là một lợi thế',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: SQL, Python, R, Power BI, Tableau, Qlik
- Kỹ năng mềm: Truyền đạt thông tin, Tư duy Agile, Phối hợp đa phòng ban
- Kinh nghiệm: 3 năm',
    '- Lương thưởng cạnh tranh
- Thưởng cuối năm
- Thưởng Lễ/Tết
- Thưởng sinh nhật
- Thưởng đột xuất
- 12 ngày phép năm
- BHXH
- Chế độ bảo hiểm đặc biệt',
    'Hà Nội', 'full_time'::public.employment_type,
    20000000, 55000000, 'VND', 'published',
    now() - ((36 % 21) || ' days')::interval,
    now() + ((20 + (36 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [37/94] group 5 (Data): Database Administrator
  jid := '18eda8b3-d4a1-5bd9-91fb-5e904b51d091'::uuid;
  cid := company_ids[1];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Database Administrator',
    'Tổng Công ty Dịch vụ số Viettel - Viettel Digital mang sứ mệnh sáng tạo những sản phẩm công nghệ đi đầu lĩnh vực Fintech và Big Data, với mong muốn digital hoá những hình thức kinh doanh truyền thống. Sản phẩm mới nhất ra mắt của chúng tôi có tên Viettel Money – Hệ sinh thái tài chính số của người Việt. Hiện nay Viettel Digital đang mở rộng hoạt động với nhiều dự án lớn trong các lĩnh vực Fintech, Big Data, AI, Blockchain,... và mong muốn chiêu mộ nhân tài hơn bao giờ hết. Viettel Digital đang tuyển dụng vị trí Kỹ sư quản trị cơ sở dữ liệu như sau: Mô tả công việc: Thiết kế, cung cấp và đảm bảo hệ thống cơ sở dữ liệu đáng tin cậy, nhằm hỗ trợ các mục tiêu kinh doanh của Tổng công ty. Cài đặt, tư vấn thiết kế, triển khai CSDL Oracle, MySQL/MariaDB, NoSQL (Kafka, Redis, Aerospike, Mongo…) cho các dự án của Tổng Công ty. Tham gia vào quá trình chuyển dịch từ Oracle sang MariaDB/MySQL. Hỗ trợ vận hành, giám sát, bảo trì hệ thống cơ sở dữ liệu ở mức tin cậy cao, đảm bảo tính liên tục, độ ổn định và hiệu năng của hệ thống CSDL. Hỗ trợ chuyên môn công nghệ thường xuyên. Khắc phục và giải quyết các sự cố về cơ sở dữ liệu trong quá trình sử dụng.

Yêu cầu chi tiết: Yêu cầu công việc: Tốt nghiệp Đại học loại Khá trở lên các ngành Khoa học Máy tính, Công nghệ thông tin, Kỹ thuật phần mềm hoặc các ngành liên quan. Đặc biệt ưu tiên các trường Đại học Bách khoa Hà Nội, Đại học FPT, Học viện Công nghệ Bưu chính Viễn thông,... Tiếng Anh tương đương TOEIC 550 +. Có ít nhất 02 năm kinh nghiệm làm việc trong lĩnh vực quản trị cơ sở dữ liệu, đặc biệt trong việc xây dựng và chạy các thiết lập cơ sở dữ liệu quan trọng. Nắm chắc kiến thức và có kinh nghiệm cài đặt, vận hành Oracle, MariaDB, MySQL và NoSQL. Có hiểu biết về kiến trúc CSDL có độ tin cậy cao và có khả năng mở rộng tập; triển khai các hoạt động sao chép, DR, backup & restore và các pattern khác liên quan đến cơ sở dữ liệu. Có kiến thức về CSDL không quan hệ như Aerospike, Cassandra là lợi thế. Có kinh nghiệm sử dụng Cloud providers: AWS & GCP, Linux là một lợi thế. Có các chứng chỉ quản trị CSDL (VD: Oracle) là lợi thế. Thái độ tích cực, ham học hỏi, sẵn sàng nhận nhiệm vụ. Có kỹ năng giao tiếp và làm việc nhóm tốt.',
    '- Bằng cấp: Đại học loại Khá trở lên các ngành Khoa học Máy tính, Công nghệ thông tin, Kỹ thuật phần mềm hoặc các ngành liên quan
- Kỹ năng chuyên môn: Oracle, MySQL, MariaDB, NoSQL, Kafka, Redis, Aerospike, MongoDB
- Kỹ năng mềm: Kỹ năng giao tiếp, Làm việc nhóm, Thái độ tích cực, Ham học hỏi
- Kinh nghiệm: 2 năm',
    '- Mức lương thu hút nhân tài, ứng viên tự thỏa thuận khi tham gia phỏng vấn
- Cơ hội làm việc trong một tập đoàn lớn nhưng môi trường không khác gì StartUp
- Cơ hội thăng tiến với nhiều cấp bậc
- Nghỉ dưỡng 3 ngày nguyên lương trong năm, tự đăng ký riêng, hỗ trợ nghỉ dưỡng lên đến 9 triệu/ người
- Được công ty đóng BHXH, BHYT, BHTN theo quy định Nhà nước; được khám sức khỏe định kỳ hàng năm
- Chính sách thưởng hấp dẫn: thưởng theo tháng, thưởng quý, thưởng năm, ngày lễ Tết',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((37 % 21) || ' days')::interval,
    now() + ((20 + (37 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [38/94] group 5 (Data): Nhà phân tích dữ liệu trò chơi (Junior/ Middle)
  jid := '8effc327-f713-523e-984e-ea183038e3af'::uuid;
  cid := company_ids[2];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhà phân tích dữ liệu trò chơi (Junior/ Middle)',
    '- Phân tích, cân bằng và tối ưu hệ thống kinh tế trong game (game economy system), đảm bảo dòng tiền ảo và động lực chơi game hợp lý.
- Hiệu chỉnh tiến trình người chơi (progression), hệ thống phần thưởng, độ khó để tăng tỷ lệ giữ chân (retention).
- Thu thập và xử lý dữ liệu từ log game, backend, event,... từ nhiều nguồn có cấu trúc và phi cấu trúc.
- Thực hiện phân tích thống kê, mô hình hóa dữ liệu để tìm insight từ hành vi người chơi.
- Thiết kế, triển khai và phân tích các A/B test về tính năng, UI/UX, hệ thống monetization, event in-game...
- Phân khúc người chơi theo hành vi (segmentation), xây dựng chiến lược cá nhân hóa, giữ chân, tái tương tác.
- Xây dựng và duy trì dashboard trực quan, cập nhật theo thời gian thực cho Product, Design, Marketing...
- Đảm bảo tính chính xác, đáng tin cậy của dữ liệu thông qua các bước xử lý, kiểm tra định kỳ.
- Hợp tác chặt chẽ với các team liên quan để đạt mục tiêu chung về tăng trưởng và chất lượng sản phẩm.

Yêu cầu chi tiết: 1. Kỹ năng chuyên môn: - Có tối thiểu 2 năm kinh nghiệm ở vị trí Game Data Analysis, hoặc Game Designer/ Game Operation (có tư duy về số liệu) - Thành thạo các công cụ phân tích dữ liệu như: SQL, Python, hoặc tương đương. - Có kinh nghiệm với các công cụ trực quan hóa dữ liệu. - Có hiểu biết hoặc kinh nghiệm áp dụng các kỹ thuật thống kê và mô hình hóa dữ liệu. - Kiến thức nền tảng tốt về thiết kế game, đặc biệt là các chỉ số: retention, progression, monetization, churn, engagement funnel. - Đã từng triển khai A/B Testing và phân tích hiệu quả tính năng/game event. - Có tư duy hệ thống tốt về game balancing và game economy design: cách tạo dòng tiền ảo hợp lý, định giá vật phẩm, kiểm soát lạm phát... là một điểm cộng - Kỹ năng Tiếng Anh thành thạo (đọc, viết) 2. Phẩm chất cá nhân: - Tư duy logic, có khả năng giải quyết vấn đề nhanh và sáng tạo. - Trình bày tốt insight qua số liệu, biểu đồ, slide hoặc nói trực tiếp. - Yêu thích chơi game, tò mò về cách game vận hành. - Tinh thần chủ động, chi tiết, ham học hỏi và phối hợp tốt với nhiều phòng ban. - Ưu tiên tốt nghiệp đại học chuyên ngành Kinh tế, Dữ liệu, Thống kê, Toán, CNTT hoặc liên quan.',
    '- Bằng cấp: Đại học chuyên ngành Kinh tế, Dữ liệu, Thống kê, Toán, CNTT hoặc liên quan
- Kỹ năng chuyên môn: SQL, Python, các công cụ phân tích dữ liệu, các công cụ trực quan hóa dữ liệu, kỹ thuật thống kê, mô hình hóa dữ liệu
- Kỹ năng mềm: Tư duy logic, khả năng giải quyết vấn đề, trình bày tốt insight qua số liệu, tinh thần chủ động, chi tiết, ham học hỏi, phối hợp tốt với nhiều phòng ban
- Kinh nghiệm: 2 năm',
    '- Thưởng hiệu suất
- Thưởng các dịp lễ lớn
- Bảo hiểm toàn diện
- Xét duyệt tăng lương 2 lần/năm
- Nghỉ phép năm có lương
- Ngân sách đào tạo cá nhân
- Du lịch công ty hàng năm
- Quà tặng vào các dịp lễ',
    'Hà Nội', 'full_time'::public.employment_type,
    28000000, 28000000, 'VND', 'published',
    now() - ((38 % 21) || ' days')::interval,
    now() + ((20 + (38 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [39/94] group 5 (Data): Nhà phân tích dữ liệu cao cấp
  jid := '49a1b8d9-f068-5532-a5e7-e6410d90a7cf'::uuid;
  cid := company_ids[3];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhà phân tích dữ liệu cao cấp',
    'Chịu trách nhiệm chính trong việc xây dựng và quản lý các hệ thống báo cáo và dữ liệu cho các nhóm kinh doanh (BD, FA); Phối hợp với các nhóm kỹ thuật (BE, AI) để đảm bảo thu thập, lưu trữ và xử lý dữ liệu liên tục cho các ứng dụng phân tích và AI. Tham gia nghiên cứu và thực hiện các chiến lược dữ liệu cho các hệ thống khuyến nghị được cá nhân hóa, tối ưu hóa dựa trên các giai đoạn dự án và sản phẩm. Phân tích, trực quan hóa và cung cấp thông tin chi tiết dữ liệu. Hiểu logic dữ liệu, dữ liệu xử lý, thực hiện phân tích và tạo trực quan hóa để hỗ trợ các hệ thống báo cáo của dự án. Thu thập dữ liệu cho kho dữ liệu, dữ liệu mart và lưu trữ tính năng. Hợp tác với các nhóm DE, BE và AI để cập nhật dữ liệu vào kho dữ liệu, dữ liệu mart và cửa hàng tính năng. Làm việc với nhóm FE để thiết kế các hệ thống ghi nhật ký dữ liệu người dùng, hỗ trợ nền tảng khuyến nghị. Nghiên cứu hệ thống khuyến nghị thực phẩm. Khám phá các thuật toán đề xuất và độ phức tạp dữ liệu tương ứng của chúng. Đề xuất các hệ thống khuyến nghị phù hợp dựa trên dữ liệu có sẵn.

Yêu cầu chi tiết: Education: Bachelor''s degree in Economics, Logistics, Business Administration, or equivalent. A background in Data Science, IT, or Computer Science is a plus. Experience: Minimum of 3 years in a Data Analyst role with strong experience in data exploration and analysis. Proficient in Python, SQL, and data visualization tools (Metabase, PowerBI, Looker Studio, etc.). Capable of working with large/complex datasets, strong in data storytelling and visualization. Understanding and practical experience in applying basic machine learning models to solve business problems. Experience with Spark, dbt, and building data models for ML/DL applications is a plus. Skills: Strong analytical thinking, able to summarize key points and provide feasible solutions. Ability to present problems and solutions through documentation and diagrams. Fast learner, adaptable to new technologies. Good communication skills in both verbal and written formats, especially in explaining analytical results. Effective teamwork across cross-functional roles and departments.',
    '- Bằng cấp: Bachelor''s degree in Economics, Logistics, Business Administration, Data Science, IT, Computer Science
- Kỹ năng chuyên môn: Python, SQL, Metabase, PowerBI, Looker Studio, Spark, dbt
- Kỹ năng mềm: Strong analytical thinking, Good communication skills, Effective teamwork, Fast learner, Adaptable to new technologies
- Kinh nghiệm: 3 năm',
    '- Grab/Be for work: 1M/month
- Laptop & PVI insurance
- Working 5 days/week (Mon-Fri)
- Competitive salaries and benefits according to experience and education level',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((39 % 21) || ' days')::interval,
    now() + ((20 + (39 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [40/94] group 5 (Data): Chuyên Viên Phân Tích Dữ Liệu
  jid := '832300c7-59ce-5f3d-82f5-db490cc04ac3'::uuid;
  cid := company_ids[4];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Chuyên Viên Phân Tích Dữ Liệu',
    '1. Thu thập & chuẩn hóa dữ liệu từ các hệ thống: Phối hợp với Data Engineer để kiểm tra, đối soát và xác nhận dữ liệu từ các nguồn như CRM, POS, Loyalty, Web/App... Phát hiện và báo cáo các lỗi dữ liệu (data quality issues), đề xuất phương án xử lý.

2. Phân khúc khách hàng (Segmentation): Phân tích hành vi, nhân khẩu học và lịch sử tương tác của khách hàng. Thiết lập và duy trì các điều kiện phân khúc (segment rules) trong nền tảng CDP phục vụ các chiến dịch marketing hoặc cá nhân hóa trải nghiệm khách hàng.

3. Đo lường hiệu quả chiến dịch: Kết nối, trích xuất dữ liệu từ nền tảng CDP để phục vụ phân tích. Thiết lập và cập nhật các báo cáo, dashboard đo lường hiệu suất chiến dịch (open rate, conversion, retention...). Xuất báo cáo định kỳ và ad-hoc theo yêu cầu của các phòng ban.

4. Phân tích hành trình khách hàng và đề xuất cải tiến: Phối hợp với các bộ phận CDP Ops, BI, CRM để phân tích hiệu quả trước – sau chiến dịch. Đưa ra khuyến nghị nhằm tối ưu hóa hành trình khách hàng, tăng hiệu quả cá nhân hóa và chuyển đổi.

5. Hỗ trợ phân tích & tư vấn điều kiện logic: Làm việc cùng các bộ phận Marketing, E-commerce, CSKH, CRM để xuất data và tư vấn logic phân tích phù hợp với mục tiêu chiến dịch.

Yêu cầu chi tiết: 1/ Học vấn: Tốt nghiệp Đại học các ngành Thương mại, Kinh tế, Marketing, Khoa học Dữ liệu,…
2/ Kinh nghiệm: Tối thiểu 3-5 năm kinh nghiệm ở vị trí tương đương, ưu tiên trong các công ty Bán lẻ – Thương mại Điện tử lớn. Có kinh nghiệm lập kế hoạch, triển khai và báo cáo. Am hiểu dữ liệu CDP/CRM và các chỉ số hành vi khách hàng.
3/ Kiến thức – Kỹ năng: Am hiểu dữ liệu, thành thạo đọc và phân tích dữ liệu. Nắm vững hành vi người dùng, công nghệ, kinh tế. Có kiến thức về AI. Thành thạo tin học văn phòng (Excel, PowerPoint, …). Giao tiếp tiếng Anh cơ bản.
4/ Phẩm chất cá nhân: Tư duy logic, cẩn trọng, chủ động giải quyết công việc. Linh hoạt, nhanh nhạy, có tinh thần phục vụ nội bộ. Thân thiện, hòa đồng, cởi mở trong giao tiếp. Tinh thần trách nhiệm cao, chịu được áp lực công việc.',
    '- Bằng cấp: Tốt nghiệp Đại học các ngành Thương mại, Kinh tế, Marketing, Khoa học Dữ liệu
- Kỹ năng chuyên môn: Am hiểu dữ liệu, Thành thạo đọc và phân tích dữ liệu, Có kiến thức về AI, Thành thạo tin học văn phòng (Excel, PowerPoint)
- Kỹ năng mềm: Tư duy logic, Cẩn trọng, Chủ động giải quyết công việc, Linh hoạt, Nhanh nhạy, Có tinh thần phục vụ nội bộ, Thân thiện, Hòa đồng, Cởi mở trong giao tiếp, Tinh thần trách nhiệm cao, Chịu được áp lực công việc
- Kinh nghiệm: 3 năm',
    '- Được đào tạo theo chính sách công ty
- Hỗ trợ các khoá đào tạo chuyên sâu - Coursera, Udemy
- Môi trường làm việc trẻ, năng động và thân thiện
- Tham gia đầy đủ các chế độ BHYT, BHXH, BHTN, Lương tháng 13
- Khám sức khỏe định kỳ hàng năm
- Thường xuyên tổ chức các chương trình hội thao, hội diễn văn nghệ, tân niên/tất niên, các hoạt động phong trào văn hóa đoàn thể',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((40 % 21) || ' days')::interval,
    now() + ((20 + (40 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [41/94] group 5 (Data): (Mid/sen) Nhà phân tích dữ liệu - trò chơi/ứng dụng di động
  jid := 'ab521655-2141-5721-aeb3-8e7a42b8683f'::uuid;
  cid := company_ids[5];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, '(Mid/sen) Nhà phân tích dữ liệu - trò chơi/ứng dụng di động',
    'Làm việc với các bên liên quan để xác định nhu cầu dữ liệu mới và tạo các mô hình dữ liệu để hỗ trợ họ. Hỗ trợ kho dữ liệu trong việc xác định và sửa đổi các yêu cầu báo cáo. Tiến hành phân tích dữ liệu khám phá để xác định xu hướng và mẫu trong hành vi của người dùng, sử dụng ứng dụng và phản hồi của khách hàng. Thiết kế và duy trì các mô hình dữ liệu, bảng điều khiển và báo cáo để theo dõi các chỉ số hiệu suất chính (KPI) cho sản phẩm ứng dụng của chúng tôi. Phát triển các mô hình dự đoán để dự báo hành vi của người dùng và hiệu suất ứng dụng. Giao tiếp để cung cấp những hiểu biết dữ liệu và phát hiện cho các bên liên quan thông qua trực quan hóa dữ liệu và kể chuyện. Phân tích dữ liệu để xác định các cơ hội để cải thiện và tăng trưởng sản phẩm. Cung cấp các khuyến nghị dựa trên dữ liệu cho nhóm sản phẩm để tối ưu hóa các số liệu kinh doanh. Phối hợp với các nhóm chức năng chéo để phát triển và tinh chỉnh các lộ trình và chiến lược sản phẩm dựa trên những hiểu biết dữ liệu. Luôn cập nhật các công nghệ phân tích dữ liệu mới nhất và thực tiễn tốt nhất.

Yêu cầu chi tiết: Bachelor''s degree in Data Science, Statistics, Computer Science, or a related field. Strong proficiency in SQL and Python is required, and experience working with large datasets is a bonus. Experience with data visualization tools such as Tableau, Power BI, or Google Data Studio. Knowledge of data mining techniques and algorithms. Attention to detail, a commitment to quality work, and the ability to multitask. Have mathematical background: knowledge of probability theory and applied statistics at a college-degree level. 3+ years of experience in data analysis, preferably in a product or marketing analytics role. Strong analytical and problem-solving skills with the ability to communicate complex data insights to non-technical stakeholders. Experience with cross-functional interaction and the ability to communicate comfortably in business terms.',
    '- Bằng cấp: Bachelor''s degree in Data Science, Statistics, Computer Science, or a related field
- Kỹ năng chuyên môn: SQL, Python, Tableau, Power BI, Google Data Studio
- Kỹ năng mềm: Attention to detail, Commitment to quality work, Ability to multitask, Strong analytical and problem-solving skills, Ability to communicate complex data insights to non-technical stakeholders
- Kinh nghiệm: 3 năm',
    '- Lunch allowance 1,000,000 VND/month
- 13th month salary
- Performance bonuses TWICE per year
- Social insurance
- Health insurance
- Health insurance for family members
- Full salary insurance
- Periodic health check
- Team building
- Annual travel
- Seniority allowance
- Signing bonus',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((41 % 21) || ' days')::interval,
    now() + ((20 + (41 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [42/94] group 5 (Data): Kỹ Sư Dữ Liệu Cấp Cao
  jid := 'a1d3def3-095e-5b7f-b4b5-3468f0cf058b'::uuid;
  cid := company_ids[6];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ Sư Dữ Liệu Cấp Cao',
    'Xây dựng, duy trì và tối ưu hệ thống hạ tầng dữ liệu nội bộ bao gồm: cơ sở dữ liệu, kho dữ liệu (data warehouse), hệ thống điều phối (orchestration), các pipeline xử lý dữ liệu dạng streaming và batching. Làm việc với nhiều nền tảng Cloud như GCP, AWS, Databricks. Làm việc với các bộ dữ liệu lớn và phức tạp, phục vụ nhiều phòng ban khác nhau. Thiết lập các tiêu chuẩn đánh giá hiệu năng, cảnh báo và nhật ký kiểm tra cho hệ thống dữ liệu. Giao tiếp và phối hợp với các bên liên quan như Product, Software Engineers, Business Users, Data Analysts và Data Scientists để xử lý các yêu cầu liên quan đến dữ liệu.

Yêu cầu chi tiết: Tốt nghiệp đại học chuyên ngành Khoa học Máy tính, Kỹ thuật Phần mềm hoặc Hệ thống Thông tin. Có chuyên môn về khoa học dữ liệu hoặc bằng cấp cao hơn là một lợi thế lớn. Tối thiểu 4 năm kinh nghiệm trong vai trò kỹ sư dữ liệu, xây dựng nền tảng và pipeline phục vụ phân tích. Thành thạo Python và ít nhất một ngôn ngữ lập trình khác như Java, Scala, Go, Javascript, Typescript, R là một điểm cộng lớn. Thành thạo SQL trên các hệ quản trị cơ sở dữ liệu (DBMS). Có kinh nghiệm với các dịch vụ đám mây như GCP, AWS. Có kinh nghiệm làm việc với nhiều hệ cơ sở dữ liệu OLTP và OLAP như MongoDB, PostgreSQL, BigQuery, ClickHouse,... Có kinh nghiệm với các nền tảng và khái niệm xử lý dữ liệu streaming như Redpanda, Kafka, RabbitMQ, CDC hoặc mã nguồn mở khác. Có kinh nghiệm với các công cụ quản lý pipeline và workflow như Airflow, dbt, Airbyte,... Hiểu biết về các công cụ trực quan hóa dữ liệu như Metabase, PowerBI, Looker Studio,... Được tiếp cận và sử dụng các công nghệ mã nguồn mở mới nổi. Có kinh nghiệm xây dựng và phát triển API bằng Python, Go hoặc Javascript/Typescript. Thành thạo sử dụng hệ thống quản lý phiên bản mã nguồn như GitLab, GitHub. Có kinh nghiệm với Hadoop, Spark, Databricks là một lợi thế. Có kinh nghiệm làm việc với Kubernetes là một lợi thế.',
    '- Bằng cấp: Tốt nghiệp đại học chuyên ngành Khoa học Máy tính, Kỹ thuật Phần mềm, Hệ thống Thông tin
- Kỹ năng chuyên môn: Python, Java, Scala, Go, Javascript, Typescript, R, SQL, GCP, AWS, MongoDB, PostgreSQL, BigQuery, ClickHouse, Redpanda, Kafka, RabbitMQ, Airflow, dbt, Airbyte, Metabase, PowerBI, Looker Studio, GitLab, GitHub, Hadoop, Spark, Databricks, Kubernetes
- Kinh nghiệm: 4 năm',
    '- Hỗ trợ đi lại bằng Grab/Be: 1 triệu/tháng
- Cung cấp laptop & bảo hiểm PVI
- Làm việc 5 ngày/tuần
- Mức lương & chế độ đãi ngộ cạnh tranh theo kinh nghiệm và trình độ học vấn',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((42 % 21) || ' days')::interval,
    now() + ((20 + (42 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [43/94] group 6 (AI/ML): Kỹ Sư Trí Tuệ Nhân Tạo - AI/ Deep Learing/ Computer Vision
  jid := 'ea9bc9c1-29fd-53a9-82aa-165521649172'::uuid;
  cid := company_ids[7];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ Sư Trí Tuệ Nhân Tạo - AI/ Deep Learing/ Computer Vision',
    '- Nghiên cứu xây dựng các bài toán áp dụng công nghệ ML, DL trên các dữ liệu về ảnh, text, audio, video, ....
- Nghiên cứu xây dựng các luồng xử lý theo chuẩn AI/ML OPs.
- Thực hiện quy trình huấn luyện cho mô hình AI đang có.
- Đảm bảo chất lượng dữ liệu, kết quả mô hình, báo cáo định kỳ tự động
- Chịu trách nhiệm bảo trì, cải thiện, làm sạch và thao tác dữ liệu, khắc phục các sự cố tồn tại
- Tối ưu hóa CSDL và duy trì nâng cấp các chuẩn kiến trúc của dữ liệu
- Xây dựng các tài liệu Thiết kế tổng thể, giải pháp, Thiết kế chi tiết, tài liệu Giám sát, theo quy trình DS/AI
- Nghiên cứu, thiết kế, cài đặt các thuật toán, mô hình học máy.
- Thiết kế, triển khai các thuật toán, mô hình học máy để giải quyết các bài toán, yêu cầu đề ra.
- Giám sát và nâng cao hiệu năng của hệ thống thông minh hiện có.
- Hợp tác với kỹ sư khoa học dữ liệu, kỹ sư phần mềm, và quản lý sản phẩm để định nghĩa yêu cầu và đầu ra của dự án.
- Cập nhật các công nghệ mới, xu thế công nghệ và các best practices trong lĩnh vực AI/ML để ứng dụng trong phát triển sản phẩm.
- Thực hiện các nghiên cứu và thử nghiệm để xây dựng các ứng dụng và kỹ thuật AI mới.

Yêu cầu chi tiết: 1. Yêu cầu kiến thức:
- Kiến thức về lập trình, cấu trúc dữ liệu và giải thuật, lý thuyết đồ thị.
- Kiến thức về xác suất thống kê, đại số tuyến tính, giải tích.
- Kiến thức về phân tích khám phá dữ liệu (Exploratory Data Analysis), học máy (Có kinh nghiệm với các thư viện và framework machine learning / deep learning như TensorFlow, PyTorch, Scikit-learn hoặc Keras), trực quan hóa dữ liệu.
- Kiến thức về phát triển phần mềm: quản lý phiên bản, cơ sở dữ liệu, APIs, các nguyên lý lập trình, thiết kế và phát triển phần mềm.
- Kiến thức về luồng xử lý trong quy trình ML/AI OPs

2. Yêu cầu kỹ năng:
- Kỹ năng chuyên môn
+ Kỹ năng lập trình thành thạo Python, Java, SQL.
+ Kỹ năng đọc bài báo khoa học và lập trình lại các thuật toán, giải pháp đề xuất trong bài báo khoa học.
+ Kỹ năng trực quan hóa dữ liệu; xử lý với các loại CSDL (RDBMS, Graph Databases, NoSQL).
+ Kỹ năng phân tích và đánh giá thuật toán, mô hình học máy.
+ Kỹ năng triển khai với các nền tảng containerization (Docker, Kubernetes) là một điểm cộng.
+ Có kinh nghiệm làm việc với các thư viện python: numpy, matplotlib/seaborn, pandas, scikit learn, Jupyter notebook, v.v.
+ Có kinh nghiệm trong xây dựng kiến trúc, phát triển, triển khai các giải pháp phân tích dữ liệu là một lợi thế.

- Kỹ năng con người (Personal Skills)
+ Kỹ năng giải quyết vấn đề.
+ Tư duy dựa trên dữ liệu và tập trung vào phát triển sản phẩm.
+ Kỹ năng trình bày (viết, nói) vấn đề, ý tưởng, giải pháp.

3. Kinh nghiệm:
- Kinh nghiệm 1-2 năm trong nghiên cứu, phát triển và triển khai thuật toán, mô hình học máy.
- Kinh nghiệm thiết kế, phát triển, triển khai phần mềm trong thực tế.
- Có kinh nghiệm trong xây dựng kiến trúc, phát triển, triển khai các giải pháp phân tích dữ liệu là một điểm cộng.

4. Trình độ học vấn/Chuyên môn có Liên quan:
- Tốt nghiệp từ loại Khá đại học chuyên ngành Công nghệ thông tin, khoa học máy tính hoặc các ngành STEM khác (Toán-Tin, Toán,...).
- Tiếng Anh theo chuẩn TOEIC 550 hoặc tương đương.
- Có chứng chỉ về Data Science là một điểm cộng (IBM Data Science Professional, Tableau Certified, Google Certified,... ).',
    '- Bằng cấp: Tốt nghiệp từ loại Khá đại học chuyên ngành Công nghệ thông tin, khoa học máy tính hoặc các ngành STEM khác (Toán-Tin, Toán,...)
- Kỹ năng chuyên môn: Python, Java, SQL, TensorFlow, PyTorch, Scikit-learn, Keras, Docker, Kubernetes, numpy, matplotlib, pandas, Jupyter notebook
- Kỹ năng mềm: Kỹ năng giải quyết vấn đề, Tư duy dựa trên dữ liệu, Kỹ năng trình bày
- Kinh nghiệm: 2 năm',
    '- Phụ cấp ăn trưa: 1.000.000 VNĐ/tháng
- Phụ cấp điện thoại: 200.000 VNĐ/tháng
- Cơ chế lương thưởng theo 6 tháng, năm
- Tiền quà các ngày Lễ, Tết
- Hỗ trợ chi phí nghỉ dưỡng hằng năm (38.000.000/năm)
- Hưởng Bảo hiểm Xã hội, Bảo hiểm Y tế theo quy định của Luật Lao động và của Tập đoàn
- Bảo hiểm sức khỏe dành riêng cho CBNV và hỗ trợ chính sách mua bảo hiểm sức khỏe cho người thân',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((43 % 21) || ' days')::interval,
    now() + ((20 + (43 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [44/94] group 6 (AI/ML): Kỹ Sư AI, Xử Lý NLP Và Dữ Liệu Tiếng Việt
  jid := '4dc2bb0d-bac0-5660-9697-5cb867c5ba99'::uuid;
  cid := company_ids[8];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ Sư AI, Xử Lý NLP Và Dữ Liệu Tiếng Việt',
    'THƯ VIỆN PHÁP LUẬT đang phát triển các ứng dụng AI trong Ngành Luật. Mời Bạn tham gia đội kỹ sư AI pháp luật, phát triển các tiện ích giúp 8 triệu người dùng tra cứu, hiểu và áp dụng pháp luật dễ dàng hơn. Tuỳ theo năng lực chuyên sâu (NLP hoặc Dữ liệu), bạn sẽ cùng đội kỹ sư đảm nhiệm những việc sau: 1. Xây dựng hệ thống tìm kiếm pháp luật thông minh: Hiểu ngôn ngữ tự nhiên của người dùng (câu hỏi pháp lý) và liên kết đến điều khoản phù hợp. Áp dụng mô hình NLP tiếng Việt: embedding, transformers, RAG... Đảm bảo hệ thống hoạt động hiệu quả với số lượng người dùng lớn lên đến hàng chục ngàn người sử dụng cùng lúc. 2. Xây dựng AI tóm tắt, diễn giải, so sánh văn bản pháp luật: Tự động rút gọn, chuyển ngữ chính xác nội dung luật sang ngôn ngữ phổ thông, thân thiện. So sánh với các văn bản luật khác tương đương. 3. Phát triển hệ thống gợi ý nội dung pháp luật: Phân tích lịch sử hành vi người dùng Phát triển hệ thống gợi ý bài viết, điều luật, công cụ phù hợp với cá nhân người dùng. Nâng cao trải nghiệm người dùng, tăng tỉ lệ click và giảm tỉ lệ thoát trang. 4. Xây dựng hệ thống sinh văn bản mẫu pháp lý: Xây dựng LLM sinh văn bản hợp đồng, công văn, đơn từ, theo logic pháp lý đã chuẩn hoá tại Thư Viện Pháp Luật. 5. Xử lý dữ liệu pháp luật phục vụ AI: Làm sạch, phân đoạn, chuẩn hoá và tổ chức dữ liệu (văn bản luật, bài viết, Q&A, log hành vi, ...) Xây dựng hệ thống từ điển Thuật ngữ pháp lý Thiết kế & phát triển ETL pipelines cho dữ liệu Xây dựng & tối ưu kho dữ liệu (Data Warehouse) Tạo pipeline dữ liệu để phục vụ truy xuất chính xác, nhanh chóng. 6. Kết nối với đội lập trình web nội bộ để tích hợp AI vào sản phẩm thực tế.

Yêu cầu chi tiết: Bạn cần có năng lực tối thiểu 2/3 nhóm công việc sau: Nhóm A – NLP & AI tiếng Việt: 1. Có tối thiểu 2 năm kinh nghiệm làm việc trong mảng NLP như Q-A system, text classification, NER, recommend system .. 2. Xây dựng được hệ thống semantic search / QA / tóm tắt tiếng Việt. 3. Biết cách dùng, huấn luyện, tinh chỉnh, tích hợp các mô hình như transformer-based models (BERT, GPT), sequence-to-sequence models, LLM (GPT, Gemini, . . .) 4. Thành thạo Python, HuggingFace Transformers, LangChain hoặc tương tự. Nhóm B – Xử lý dữ liệu pháp luật: 1. Thành thạo xử lý dữ liệu văn bản (text cleaning, segmentation, metadata tagging); 2. Có kinh nghiệm tạo pipeline dữ liệu bằng Python (Pandas, Pydantic, FastAPI...); 3. Từng làm việc với dữ liệu dạng quy định, luật, tiêu chuẩn, hoặc có tư duy hệ thống hóa văn bản hành chính; Nhóm C – Triển khai & tối ưu hệ thống: Có kinh nghiệm: 1. Thiết kế pipeline CI/CD cho hệ thống AI 2. Container hóa và orchestration on-premise (Docker, Kubernetes, Docker Swarm) 3. Triển khai mô hình AI dưới dạng API (FastAPI/Flask, TorchServe, Uvicorn) trên hạ tầng nội bộ 4. Giám sát hệ thống với Prometheus/Grafana, ELK Stack hoặc tương đương 5. Thiết lập autoscaling & high-availability (load-balancer, VPN, firewall) 6. Có kinh nghiệm container hoá và quản lý orchestration on-premise (Docker, Kubernetes, Docker Swarm).',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Python, HuggingFace Transformers, LangChain, NLP, semantic search, text classification, NER, recommend system
- Kỹ năng mềm: Làm việc nhóm, Tiếng Anh (đọc Hiểu Tài Liệu Chuyên Ngành)
- Kinh nghiệm: 2 năm',
    '- Bảo hiểm xã hội
- Bảo hiểm sức khỏe
- Khám sức khỏe định kỳ
- Du lịch hàng năm
- Phụ cấp thâm niên
- Thưởng tháng 13
- Thưởng hiệu quả làm việc',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    20000000, 40000000, 'VND', 'published',
    now() - ((44 % 21) || ' days')::interval,
    now() + ((20 + (44 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [45/94] group 6 (AI/ML): AI/NLP Engineer
  jid := '9967a123-fd6d-5ad5-aaa8-7fac1dd12d50'::uuid;
  cid := company_ids[9];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'AI/NLP Engineer',
    '1. Phát triển mô hình học máy và học sâu (ML/DL)
- Thiết kế và xây dựng mô hình NLP.
- Lựa chọn kiến trúc mô hình phù hợp với các bài toán cụ thể theo yêu cầu.
- Xây dựng pipeline xử lý dữ liệu đầu vào
- Huấn luyện mô hình, đánh giá và tối ưu hóa các hyperparameter, xử lý các vấn đề overfitting.
- Fine-tune các mô hình pre-trained trên dữ liệu nội bộ
2. Phân tích và xử lý dữ liệu
- Tiền xử lý dữ liệu
- Trích xuất đặc trưng
- Đánh giá hiệu năng hệ thống, kiểm tra tính ổn định mô hinh và phân tích lỗi để cải thiện mô hình.
3. Tối ưu hóa và triển khai mô hình
- Tối ưu hóa mô hình như: Giảm kích thước mô hình, tối ưu hóa tốc độ suy luận để phục vụ hệ thống real-time
- Triển khai mô hình thông qua Docker, sử dụng RESTR API.
- Giám sát hiệu năng mô hình sau khi triển khai.

Yêu cầu chi tiết: Tốt nghiệp ĐH chuyên ngành: Khoa học dữ liệu, Khoa học máy tính, CNTT, Toán học ứng dụng, hoặc chuyên ngành khác liên quan
Kiến thức về lập trình, cấu trúc dữ liệu và giải thuật, lý thuyết đồ thị.
Kiến thức về các loại CSDL (RDBMS, Graph Databases, NoSQL Products, ...).
Kiến thức về học máy (Machine Learning), học sâu (Deep Learning).
Sử dụng thành thạo một trong các thư viện học máy: Scikit-learn, TensorFlow, Keras, PyTorch;
Kỹ năng lập trình thành thạo Python, SQL.
Kỹ năng đọc bài báo khoa học và lập trình lại các thuật toán, giải pháp đề xuất trong bài báo khoa học.
Kỹ năng trực quan hóa dữ liệu.
Kỹ năng với các nhiệm vụ trong NLP: conversational AI, information extraction, text summarization, text completion, sentiment analysis,...
Kỹ năng với các nhiệm vụ trong LLM: LangChain, vector embeddings, NLTK, GPT-3, GPT-4, ChatGPT, Claude, Mistral, LLaMA, spaCy, Stanford CoreNLP, word2vec, Alpaca , FastText, BERT, VectorDB, BERT, LLM/Prompt, LangGraph
Có kinh nghiệm làm việc với các thư viện python: numpy, matplotlib/seaborn, pandas, scikit learn, Jupyter notebook, v.v.
Có kinh nghiệm trong xây dựng kiến trúc, phát triển, triển khai các giải pháp phân tích dữ liệu là một điểm cộng',
    '- Bằng cấp: Tốt nghiệp ĐH chuyên ngành: Khoa học dữ liệu, Khoa học máy tính, CNTT, Toán học ứng dụng, hoặc chuyên ngành khác liên quan
- Kỹ năng chuyên môn: Machine Learning, Deep Learning, Python, SQL, Scikit-learn, TensorFlow, Keras, PyTorch, numpy, matplotlib, pandas, Jupyter notebook
- Kỹ năng mềm: Kỹ năng đọc bài báo khoa học, Kỹ năng trực quan hóa dữ liệu
- Kinh nghiệm: 1 năm',
    '- Bảo hiểm xã hội
- Team building
- Du lịch hàng năm
- Thưởng hiệu quả làm việc
- Ăn trưa',
    'Hà Nội', 'full_time'::public.employment_type,
    15000000, 40000000, 'VND', 'published',
    now() - ((45 % 21) || ' days')::interval,
    now() + ((20 + (45 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [46/94] group 6 (AI/ML): Kỹ Sư Trí Tuệ Nhân Tạo
  jid := 'd3cd6446-93e5-559d-9cd8-d16fe79d1644'::uuid;
  cid := company_ids[10];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ Sư Trí Tuệ Nhân Tạo',
    'Tham gia phát triển các sản phẩm nội bộ. Đảm bảo chất lượng dữ liệu, kết quả mô hình, báo cáo định kỳ tự động. Chịu trách nhiệm bảo trì, cải thiện, làm sạch và thao tác dữ liệu, khắc phục các sự cố tồn tại. Thiết kế API giao tiếp với các hệ thống nội bộ, hợp tác với các nhóm khác để tích hợp giải pháp xây dựng sản phẩm hoàn thiện. Đóng gói và triển khai trên môi trường Product với docker và docker-compose. Xây dựng các tài liệu Thiết kế tổng thể, giải pháp, Thiết kế chi tiết, tài liệu Giám sát.

Yêu cầu chi tiết: Có kinh nghiệm từ 3 năm trở lên với vị trí Ai Engineer. Tốt nghiệp ĐH chuyên ngành: Khoa học dữ liệu, Khoa học máy tính, Toán học ứng dụng, Điện tử viễn thông hoặc chuyên ngành khác liên quan. Kiến thức về lập trình, cấu trúc dữ liệu và giải thuật, lý thuyết đồ thị. Kiến thức về xác suất thống kê, đại số tuyến tính, giải tích. Kiến thức về các loại CSDL (RDBMS, Graph Databases, NoSQL Products, ...). Kiến thức về học máy (Machine Learning), học sâu (Deep Learning), về xử lý ngôn ngữ tự nhiên (NLP), xử lý hình ảnh; Sử dụng thành thạo một trong các thư viện học máy: Scikit-learn, TensorFlow, Keras, PyTorch; Kỹ năng lập trình thành thạo Python, SQL. Kỹ năng đọc bài báo khoa học và lập trình lại các thuật toán, giải pháp đề xuất trong bài báo khoa học. Kỹ năng trực quan hóa dữ liệu. Kỹ năng triển khai với các nền tảng containerization (Docker, Kubernetes) là một điểm cộng. Kỹ năng với các nhiệm vụ trong NLP: conversational AI, information extraction, text summarization, text completion, sentiment analysis,... Kỹ năng với các nhiệm vụ trong LLM: LangChain, vector embeddings, NLTK, GPT-3, GPT-4, ChatGPT, Claude, Mistral, LLaMA, spaCy, Stanford CoreNLP, word2vec, Alpaca , FastText, BERT, VectorDB, BERT, LLM/Prompt, LangGraph. Có kinh nghiệm làm việc với các thư viện python: numpy, matplotlib/seaborn, pandas, scikit learn, Jupyter notebook, v.v. Có kinh nghiệm trong xây dựng kiến trúc, phát triển, triển khai các giải pháp phân tích dữ liệu là một điểm cộng.',
    '- Bằng cấp: Tốt nghiệp ĐH chuyên ngành: Khoa học dữ liệu, Khoa học máy tính, Toán học ứng dụng, Điện tử viễn thông hoặc chuyên ngành khác liên quan.
- Kỹ năng chuyên môn: Lập trình, Cấu trúc dữ liệu, Giải thuật, Lý thuyết đồ thị, Xác suất thống kê, Đại số tuyến tính, Giải tích, CSDL (RDBMS, Graph Databases, NoSQL Products), Machine Learning, Deep Learning, Xử lý ngôn ngữ tự nhiên (NLP), Xử lý hình ảnh, Thư viện học máy (Scikit-learn, TensorFlow, Keras, PyTorch), Python, SQL
- Kỹ năng mềm: Kỹ năng đọc bài báo khoa học, Kỹ năng lập trình lại các thuật toán, Kỹ năng trực quan hóa dữ liệu
- Kinh nghiệm: 3 năm',
    '- Lương tháng 13
- Thưởng quý
- Thưởng dự án
- Thưởng năng suất
- Nghỉ mát
- Bảo hiểm sức khỏe Pijico
- Bảo hiểm sức khỏe cho người thân
- Bảo hiểm nhân thọ
- 16 ngày nghỉ phép/năm hưởng nguyên lương',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((46 % 21) || ' days')::interval,
    now() + ((20 + (46 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [47/94] group 6 (AI/ML): Kỹ sư AI (thông thạo tiếng Anh)
  jid := '2f936d81-39b8-5594-b75a-38663b502b2f'::uuid;
  cid := company_ids[11];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ sư AI (thông thạo tiếng Anh)',
    'Thiết kế và phát triển các tác nhân AI trò chuyện bằng các mô hình Openai GPT và khung rag. Thực hiện các mô hình hợp tác đơn và đa tác nhân với phân tách và điều phối nhiệm vụ rõ ràng. Tích hợp các cơ sở kiến ​​thức bên ngoài, API và hệ thống doanh nghiệp vào quy trình làm việc của chatbot. Phát triển và quản lý các đường ống tìm kiếm sâu để cải thiện việc truy xuất thông tin. Tạo và duy trì các đầu nối văn bản-to-SQL và MCP để dịch ngôn ngữ tự nhiên sang các truy vấn cơ sở dữ liệu hoặc dịch vụ. Xây dựng các dịch vụ phụ trợ có thể mở rộng để hỗ trợ tương tác chatbot thời gian thực. Phối hợp với các nhà thiết kế UX/UI, chủ sở hữu sản phẩm và các nhóm QA để cung cấp các giải pháp từ đầu đến cuối. Liên tục đánh giá các công cụ AI, khung và thực tiễn tốt nhất mới để cải thiện khả năng chatbot của chúng tôi.

Yêu cầu chi tiết: Fluent in English, both written and spoken. 2+ year of experience building AI chatbots or agent-based applications (must have live or portfolio projects). Strong experience with OpenAI API, LangChain, LlamaIndex, or similar LLM frameworks. Experience implementing RAG (Retrieval-Augmented Generation) pipelines. Hands-on knowledge of Agent / Multi-Agent frameworks (LangGraph, CrewAI, AutoGen, etc.). Proficiency with Python (preferred) or Node.js, including API development. Experience integrating with external systems via Text-to-SQL, REST APIs, or custom protocols (MCP). Knowledge of Vector DBs (e.g., Pinecone, Weaviate, FAISS, ChromaDB). Understanding of prompt engineering and context window optimization. Familiarity with MLOps or LLMOps is a plus. Excellent problem-solving, debugging, and collaboration skills.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: OpenAI API, LangChain, LlamaIndex, Python, Node.js, Text-to-SQL, REST APIs, Vector DBs
- Kỹ năng mềm: Excellent problem-solving, Debugging, Collaboration
- Kinh nghiệm: 2 năm',
    '- Negotiable salary
- Premium Health Insurance TECHVIFY Care
- 13 months’ salary per year
- Annual salary evaluation
- Tuition fee coverage for courses',
    'Hà Nội', 'full_time'::public.employment_type,
    15000000, 40000000, 'VND', 'published',
    now() - ((47 % 21) || ' days')::interval,
    now() + ((20 + (47 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [48/94] group 6 (AI/ML): Kỹ sư MLOPS
  jid := '06c0d8d0-d509-59f9-b783-d54ba941d4c8'::uuid;
  cid := company_ids[12];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ sư MLOPS',
    'Dẫn dắt và thiết kế kiến ​​trúc để triển khai và duy trì các mô hình ML trong sản xuất. Thực hiện các đường ống và quy trình công việc mạnh mẽ, có thể mở rộng và bảo mật. Làm việc chặt chẽ với các nhóm phát triển để triển khai và tích hợp các mô hình. Đảm bảo hệ thống được tối ưu hóa cho tính khả dụng cao, độ tin cậy và hiệu suất. Tự động hóa các quy trình triển khai mô hình đầu cuối và đường ống CI/CD. Thực hiện giám sát và cảnh báo cho các mô hình sản xuất, đảm bảo thời gian hoạt động và hiệu suất. Tiến hành điều chỉnh hiệu suất và cập nhật mô hình dựa trên dữ liệu và phản hồi thời gian thực. Quản lý cơ sở hạ tầng trên các dịch vụ đám mây và các hệ thống điều phối container như Kubernetes. Mentor Junior MLOPS Kỹ sư và Thực tập sinh, cung cấp hướng dẫn và đánh giá kỹ thuật.

Yêu cầu chi tiết: Proficiency in English, with exceptional listening, speaking, reading skills. Deep knowledge of MLOps lifecycle and operational challenges. Strong proficiency in programming (Python, Shell scripting). Expertise in cloud platforms, containerization, and orchestration (Kubernetes). Experience with cloud platforms like Azure, AWS, or Google Cloud, especially their AI/ML offerings. Experience in setting up and managing ML pipelines using tools like Kubeflow, MLflow, or Airflow. Strong troubleshooting and performance optimization skills. Experience with versioning, testing, and deployment strategies in ML workflows. Familiarity with security and compliance best practices in ML deployment. Excellent problem-solving, mentoring, and communication skills.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Python, Shell scripting, Kubernetes, Azure, AWS, Google Cloud, Kubeflow, MLflow, Airflow
- Kỹ năng mềm: Problem-solving, Mentoring, Communication
- Kinh nghiệm: 3 năm',
    '- 5-day workweek
- Young & vibrant working environment
- Social insurance
- Medical insurance
- Unemployment insurance
- Yearly performance bonus (up to 2 months’ salary)
- Regular team building events & internal activities',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((48 % 21) || ' days')::interval,
    now() + ((20 + (48 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [49/94] group 6 (AI/ML): AI Leader ( Domain Edtech)
  jid := '46de8521-1f61-57c5-aad7-1e956523fa78'::uuid;
  cid := company_ids[1];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'AI Leader ( Domain Edtech)',
    'Lãnh đạo và phát triển đội ngũ AI: Xây dựng, quản lý và phát triển đội ngũ kỹ sư AI, đảm bảo đội ngũ luôn có năng lực kỹ thuật cao và tinh thần làm việc hiệu quả. Định hướng chiến lược AI: Xây dựng và triển khai chiến lược AI cho sản phẩm AEH, đảm bảo các giải pháp AI phù hợp với mục tiêu kinh doanh của công ty. Nghiên cứu và phát triển các giải pháp AI: Nghiên cứu và áp dụng các công nghệ AI mới nhất như LLM, NLP, ComputerVision để giải quyết các bài toán thực tế của sản phẩm AEH. Phát triển sản phẩm: Làm việc chặt chẽ với các đội ngũ khác để tích hợp các giải pháp AI vào sản phẩm AEH, đảm bảo chất lượng và hiệu quả của sản phẩm. Quản lý dự án: Lập kế hoạch, theo dõi và đánh giá tiến độ các dự án AI. Cộng tác với các đối tác: Làm việc với các đối tác, nhà cung cấp để tìm kiếm các giải pháp AI mới và hợp tác phát triển sản phẩm.

Yêu cầu chi tiết: Trình độ: Tốt nghiệp đại học chuyên ngành Công nghệ thông tin, Toán, hoặc các lĩnh vực liên quan. Kinh nghiệm: Ít nhất 5 năm kinh nghiệm làm việc trong lĩnh vực AI, có kinh nghiệm quản lý đội ngũ. Kỹ năng chuyên môn: Thành thạo các mô hình học sâu (Deep Learning), đặc biệt là LLM, NLP, Computer Vision. Kinh nghiệm làm việc với các framework phổ biến như TensorFlow, PyTorch. Hiểu biết sâu về các thuật toán học máy (Machine Learning). Kinh nghiệm triển khai các hệ thống AI vào sản phẩm thực tế. Khả năng lập trình tốt bằng Python. Kỹ năng mềm: Khả năng lãnh đạo, quản lý đội ngũ. Khả năng giao tiếp tốt, làm việc độc lập và theo nhóm. Khả năng tư duy logic, phân tích và giải quyết vấn đề.',
    '- Bằng cấp: Tốt nghiệp đại học chuyên ngành Công nghệ thông tin, Toán, hoặc các lĩnh vực liên quan
- Kỹ năng chuyên môn: Deep Learning, LLM, NLP, Computer Vision, TensorFlow, PyTorch, Python
- Kỹ năng mềm: Khả năng lãnh đạo, quản lý đội ngũ, giao tiếp tốt, làm việc độc lập, theo nhóm, tư duy logic, phân tích, giải quyết vấn đề
- Kinh nghiệm: 5 năm',
    '- Mức lương thỏa thuận, cạnh tranh theo năng lực
- Thưởng thành tích xuất sắc theo năm
- Đánh giá hiệu suất công việc 2 lần/năm
- Chế độ tham gia BHXH, BHYT, BHTN theo quy định của Nhà nước
- Khám sức khỏe định kỳ hàng năm
- Tham gia các hoạt động Sinh nhật, liên hoan hàng tháng, Year End Party
- Quà tặng, thưởng trong các dịp lễ lớn',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((49 % 21) || ' days')::interval,
    now() + ((20 + (49 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [50/94] group 7 (QA/Testing): Chuyên Viên Kiểm Thử
  jid := 'b7966bee-c231-5972-8066-61db5075b80c'::uuid;
  cid := company_ids[2];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Chuyên Viên Kiểm Thử',
    'Xây dựng, thực hiện test plan, test case và test report cho các sản phẩm thuộc lĩnh vực IoT, phần mềm doanh nghiệp, ứng dụng web và mobile. Thực hiện kiểm thử chức năng, kiểm thử tích hợp và kiểm thử hồi quy cho ứng dụng và hệ thống. Kiểm thử tự động (automation) sử dụng các phần mềm hỗ trợ AI như Cursor, AI Code Reviewer… tùy theo giai đoạn và yêu cầu dự án. Viết kịch bản kiểm thử tự động sử dụng các công cụ như Selenium, Katalon, hoặc tương đương… Thực hiện kiểm thử API bằng Postman hoặc các công cụ tương đương. Phân tích, theo dõi và phản hồi các lỗi phát sinh trong quá trình kiểm thử. Phối hợp với đội phát triển và các bên liên quan để đảm bảo chất lượng sản phẩm. Tham gia vào quy trình Agile/Scrum, tham dự các cuộc họp sprint planning, review, retrospective... Ứng dụng các công cụ AI để tự động hóa việc tạo test report, dashboard theo thời gian thực (ví dụ: ReportPortal, Allure + AI Insight plugin...). Nghiên cứu và triển khai các công cụ kiểm thử tự động dựa trên AI như TestRigor, mabl, Functionize… để tăng tốc và tối ưu hóa quy trình kiểm thử.

Yêu cầu chi tiết: Tốt nghiệp Đại học chuyên ngành Công nghệ thông tin hoặc liên quan. Tối thiểu 3 năm kinh nghiệm ở vị trí tương đương, từng làm cả manual và automation testing. Am hiểu quy trình phát triển phần mềm và các phương pháp kiểm thử phần mềm hiện đại. Thành thạo xây dựng test case, test scenario, test data và test report. Có kinh nghiệm test sản phẩm trên nhiều nền tảng: Web, App, thiết bị IoT. Biết cài đặt và sử dụng môi trường test (test env, staging, production). Kỹ năng phân tích, đánh giá và xác định lỗi tốt. Kinh nghiệm làm việc với API test (Postman) và database (MySQL, PostgreSQL). Ưu tiên ứng viên có kinh nghiệm sử dụng công cụ tự động hóa như: Appium, Selenium, Katalon Studio, JMeter,... Có hiểu biết hoặc kinh nghiệm sử dụng các công cụ kiểm thử tự động sử dụng AI (AI-powered testing tools). Có khả năng tích hợp AI hoặc plugin AI vào quá trình kiểm thử hoặc báo cáo kết quả test.',
    '- Bằng cấp: Đại học chuyên ngành Công nghệ thông tin hoặc liên quan
- Kỹ năng chuyên môn: API test (Postman), database (MySQL, PostgreSQL), Selenium, Katalon Studio, Appium, JMeter
- Kỹ năng mềm: Kỹ năng phân tích, Kỹ năng đánh giá, Kỹ năng xác định lỗi
- Kinh nghiệm: 3 năm',
    '- Thử việc hưởng 100% lương
- Thời gian làm việc linh hoạt từ T2-T6
- Môi trường làm việc trẻ trung, năng động
- Review tăng lương 2 lần/năm
- Thưởng ngày Lễ/Tết, hiệu suất công việc, thưởng dự án theo tháng
- Ăn chơi du lịch theo tháng + các hoạt động team building
- Cơ hội được đào tạo phát triển và thăng tiến',
    'Hà Nội', 'full_time'::public.employment_type,
    15000000, 25000000, 'VND', 'published',
    now() - ((50 % 21) || ' days')::interval,
    now() + ((20 + (50 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [51/94] group 7 (QA/Testing): QC Engineer / Tester
  jid := 'e9b9db43-191b-5606-bfac-fc7c738a0e7d'::uuid;
  cid := company_ids[3];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'QC Engineer / Tester',
    'Về ONETECH ASIA
ONETECH ASIA là công ty công nghệ hàng đầu, chuyên phát triển các ứng dụng VR/AR/MR và giải pháp phần mềm cho khách hàng quốc tế từ Nhật Bản, Mỹ và châu Âu. Chúng tôi tự hào mang đến những sản phẩm công nghệ cao với chất lượng vượt trội, đặc biệt trong các lĩnh vực: VR/AR/MR: Hololens, Oculus Quest, HTC Vive... Ứng dụng Web/Apps trên nền tảng Cloud (AWS) AI, IoT, Blockchain, Metaverse

Trách nhiệm của bạn:
Phân tích & Thiết kế Kiểm thử: 
- Thực hiện kiểm thử phần mềm trên các nền tảng như Web, Mobile App, và cả thiết bị VR/MR hiện đại.
- Xây dựng và thực hiện Test Case, Test Scenario dựa trên tài liệu yêu cầu và thiết kế giao diện.
- Kiểm thử các khía cạnh: chức năng, hiệu suất, khả năng tương thích của phần mềm/hệ thống.
- Phát hiện và báo cáo lỗi (Bug), phối hợp với các kỹ sư phát triển để xử lý và cải thiện chất lượng sản phẩm.
- Viết các kịch bản kiểm thử nghiệp vụ, tạo dữ liệu test bám sát theo quy trình và workflow của khách hàng.
- Hỗ trợ phân tích nghiệp vụ, đồng hành cùng team BA khi cần.

Thực hiện Kiểm thử:
- Kiểm thử đa nền tảng: Web, Mobile, Windows, API, thiết bị VR/MR.
- Thực hiện Functional, Non-functional, Regression, Performance, Security, Automation Testing.

Yêu cầu chi tiết: Yêu cầu ứng viên
- Tốt nghiệp ĐH chuyên ngành CNTT hoặc liên quan.
- Có từ 3+ năm kinh nghiệm làm QC/QA trong các dự án Web, App.
- Thành thạo ít nhất một trong các công cụ: Selenium, JMeter, JIRA.
- Nắm rõ quy trình phát triển phần mềm (SDLC), mô hình Agile/Scrum.
- Có chứng chỉ ISTQB là lợi thế.

Ưu Tiên:
- Ưu tiên ứng viên ứng biết Automation.
- Ưu tiên ứng viên có kiến thức hoặc kinh nghiệm về: Python, PHP, C#.
- Ưu tiên ứng viên biết tiếng Nhật (đọc hiểu, giao tiếp).',
    '- Bằng cấp: Tốt nghiệp ĐH chuyên ngành CNTT hoặc liên quan
- Kỹ năng chuyên môn: Selenium, JMeter, JIRA, Python, PHP, C#
- Kinh nghiệm: 3 năm',
    '- Thưởng dự án
- Thưởng tháng 13
- BHXH
- BHYT
- BHTN
- Tăng lương theo năng lực
- Khám sức khỏe định kỳ
- Hỗ trợ thi chứng chỉ (ISTQB,...), phụ cấp khi đạt được',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((51 % 21) || ' days')::interval,
    now() + ((20 + (51 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [52/94] group 7 (QA/Testing): Cộng Tác Viên Kiểm Thử Chất Lượng
  jid := '995a2fcf-e6fe-5047-b456-18f3a306b9bb'::uuid;
  cid := company_ids[4];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Cộng Tác Viên Kiểm Thử Chất Lượng',
    'Chuẩn bị, cập nhật và duy trì tài liệu kiểm thử liên quan, bao gồm các kịch bản, sơ đồ, mẫu kiểm thử, đảm bảo tuân thủ quy trình thử nghiệm và tiêu chuẩn chất lượng. Thực hiện đánh giá phần mềm, hoàn thiện kịch bản kiểm thử và ghi lại bằng chứng kiểm thử để đảm bảo phần mềm đáp ứng thông số kỹ thuật. Nghiên cứu & tìm hiểu yêu cầu nghiệp vụ, yêu cầu hệ thống từ BA hoặc các bên liên quan. Dựa vào kinh nghiệm và hiểu biết, góp ý & hỗ trợ BA hoàn thiện yêu cầu chi tiết. Thiết kế luồng hội thoại tương tác giữa khách hàng và bot trong nhiều ngữ cảnh khác nhau. Thực hiện kiểm thử tự động để kiểm tra hệ thống và phần mềm, đồng thời ghi lại kết quả kiểm tra trong các báo cáo và tài liệu liên quan. Phối hợp với các thành viên khác để thực hiện các công việc liên quan đến kiểm thử. Phối hợp với khách hàng để cập nhật tài liệu liên quan.

Yêu cầu chi tiết: Học vấn: Sinh viên hoặc người mới tốt nghiệp đại học chuyên ngành Công nghệ Thông tin hoặc các ngành liên quan. Kiến thức và Kinh nghiệm: Nắm được quy trình kiểm thử phần mềm, các kỹ thuật và chiến lược kiểm thử cơ bản. Nhanh nhẹn, chăm chỉ, ham học hỏi và có tinh thần trách nhiệm cao trong công việc. Hòa đồng, thân thiện, có khả năng làm việc nhóm và chủ động trong công việc. Kỹ năng: Kỹ năng mềm: Quản lý thời gian hiệu quả, giao tiếp tốt, phối hợp nhóm linh hoạt. Sẵn sàng hỗ trợ các mảng công việc khác khi cần thiết. Kỹ năng chuyên môn: Có hiểu biết cơ bản về Backend, Frontend, Database, ứng dụng di động và vòng đời phát triển phần mềm. Kỹ năng máy tính: Biết lập trình, có khả năng xây dựng framework kiểm thử tự động là một lợi thế. Ngoại ngữ: Có khả năng đọc hiểu tài liệu kỹ thuật tiếng Anh.',
    '- Bằng cấp: Sinh viên hoặc người mới tốt nghiệp đại học chuyên ngành Công nghệ Thông tin hoặc các ngành liên quan
- Kỹ năng chuyên môn: Kiểm thử phần mềm, Backend, Frontend, Database, Ứng dụng di động
- Kỹ năng mềm: Quản lý thời gian hiệu quả, Giao tiếp tốt, Phối hợp nhóm linh hoạt, Chăm chỉ, Ham học hỏi, Tinh thần trách nhiệm cao
- Kinh nghiệm: Không yêu cầu',
    '- Mức lương hấp dẫn
- Cơ hội làm việc trong môi trường chuyên nghiệp
- Được xây dựng kế hoạch phát triển cá nhân
- Tham gia đào tạo kỹ năng, chuyên môn',
    'Hà Nội', 'full_time'::public.employment_type,
    6000000, 12000000, 'VND', 'published',
    now() - ((52 % 21) || ' days')::interval,
    now() + ((20 + (52 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [53/94] group 7 (QA/Testing): Chuyên Viên Kiểm Thử Phần Mềm
  jid := '2ae67b27-e25e-50d8-af63-2ca162466936'::uuid;
  cid := company_ids[5];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Chuyên Viên Kiểm Thử Phần Mềm',
    'Tham gia rà soát và phân tích các yêu cầu nghiệp vụ để hiểu về mục tiêu của dự án, cung cấp các thông tin đầu vào làm cơ sở để kiểm thử và dự kiến về các hoạt động kiểm thử cần có. Xây dựng kế hoạch kiểm thử, và báo cáo tổng hợp kết quả kiểm thử. Hỗ trợ về việc lên kế hoạch, xây dựng và kiểm soát các môi trường kiểm thử. Xây dựng các kịch bản kiểm thử và ưu tiên các hoạt động kiểm thử. Triển khai các kịch bản kiểm thử, kiểm thử về hiệu năng vận hành và báo cáo về các lỗi phát sinh, định nghĩa mức độ ưu tiên của mỗi lỗi. Chuẩn bị báo cáo liên quan đến việc kiểm thử phần mềm. Đảm bảo việc kiểm thử được thực hiện tuân thủ theo các chuẩn và thủ tục kiểm thử. Nghiên cứu tài liệu dự án cùng project team leader và thành viên dự án. Hỗ trợ các thành viên dự án để hiểu đúng yêu cầu nghiệp vụ, yêu cầu người sử dụng và thống nhất giao diện sử dụng. Viết các tài liệu dự án theo yêu cầu. Thực hiện các công việc do trưởng bộ phận, quản trị dự án giao trong phạm vi công việc.

Yêu cầu chi tiết: Nam/Nữ. Tốt nghiệp Đại học chuyên ngành CNTT/ liên quan. Có kinh nghiệm trong việc phát triển phần mềm theo phương pháp Agile, hoặc Scrum. Có ít nhất 3 năm kinh nghiệm làm việc tại vị trí tương đương. Sử dụng thành thạo các công cụ test và quản lý lỗi. Hiểu biết về quy trình Test, chiến lược và kỹ thuật test phần mềm, lập tài liệu test liên quan. Cẩn thận, tỉ mỉ, cần cù, nhanh nhẹn có khả năng làm việc độc lập hoặc nhóm với cường độ cao. Chủ động, sáng tạo, nhiệt tình, trách nhiệm trong công việc. Có khả năng phân tích, tư duy logic và giải quyết vấn đề. Có khả năng quản lý thời gian. Sẵn sàng làm thêm giờ hoặc onsite khi có yêu cầu.',
    '- Bằng cấp: Đại học chuyên ngành CNTT/ liên quan
- Kỹ năng chuyên môn: Công cụ test, Quản lý lỗi, Phương pháp Agile, Scrum
- Kỹ năng mềm: Cẩn thận, Tỉ mỉ, Chủ động, Sáng tạo, Nhiệt tình, Trách nhiệm, Phân tích, Tư duy logic, Giải quyết vấn đề, Quản lý thời gian
- Kinh nghiệm: 3 năm',
    '- Mức lương cạnh tranh
- Môi trường làm việc thân thiện
- Ghi nhận thành tích
- Thưởng định kỳ
- Nghỉ thứ 7, chủ nhật và các ngày Lễ
- Hỗ trợ tiền làm thêm giờ
- Tham gia các khóa đào tạo
- Cơ hội thăng tiến
- Được đào tạo, làm việc cùng các chuyên gia nước ngoài
- Cơ hội công tác nước ngoài
- Được hưởng đầy đủ các chế độ bảo hiểm theo luật Việt Nam',
    'Hà Nội, TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    15000000, 30000000, 'VND', 'published',
    now() - ((53 % 21) || ' days')::interval,
    now() + ((20 + (53 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [54/94] group 7 (QA/Testing): Manual Tester
  jid := '30d3e2ff-c7b4-5ec6-be51-7b0ac001aabb'::uuid;
  cid := company_ids[6];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Manual Tester',
    'Thiết kế và thực hiện kế hoạch kiểm thử, các trường hợp, kịch bản và quy trình kiểm thử trên các ứng dụng phần mềm dựa trên yêu cầu nghiệp vụ và đặc tính kỹ thuật. Xác định các lỗi phần mềm để gắn cờ và chẩn đoán các lỗi và duy trì cơ sở dữ liệu về các lỗi phần mềm. Sử dụng phân tích lịch sử các kết quả kiểm tra để xác định các vấn đề và các lĩnh vực cải tiến. Tiến hành Kiểm tra Chức năng trên các ứng dụng mới và các cải tiến phần mềm hiện có để đảm bảo chúng đáp ứng các yêu cầu kinh doanh thông qua việc thực hiện các bài kiểm tra kịch bản kinh doanh từ đầu đến cuối. Tiến hành Kiểm tra hồi quy trên các ứng dụng mới và các cải tiến phần mềm hiện có để xác định bất kỳ tác động nào có thể xảy ra do các thay đổi gây ra. Hỗ trợ chuẩn bị và cung cấp các báo cáo về tiến độ của dịch vụ thử nghiệm cho các trưởng nhóm.

Yêu cầu chi tiết: Có kinh nghiệm từ 3 năm về lĩnh vực kiểm thử Mobile App/Web/API. Có từ 1 năm kinh nghiệm ở vị trí kiểm thử các dự án banking/fintech; Có kinh nghiệm và thành thạo về truy vấn cơ sở dữ liệu SQL; Có kiến thức về quy trình kiểm thử phần mềm và các phương pháp, công cụ test, kỹ thuật test; log bug. Có kinh nghiệm lên chiến lược và kiểm soát kế hoạch kiểm thử. Có kinh nghiệm xây dựng kịch bản kiểm thử. Có kinh nghiệm hỗ trợ kiển khai nghiệm thu sản phẩm: viết tài liệu HDSD, demo hệ thống, hỗ trợ UAT, hỗ trợ vận hành. Ưu tiên Nhân sự đã từng tham gia triển khai các dự án theo mô hình Agile/Scrum. Ưu tiên ứng viên có chứng chỉ kiểm thử ISTQB. Ưu tiên ứng viên có kinh nghiệm làm ETL, phân tích xử lý dữ liệu. Ưu tiên ứng viên có hiểu biết về các công cụ kiểm thử tự động / kiểm thử hiệu năng.',
    '- Bằng cấp: Trung cấp trở lên
- Kỹ năng chuyên môn: SQL, Kiểm thử Mobile App, Kiểm thử Web, Kiểm thử API
- Kỹ năng mềm: Kỹ năng giao tiếp, Kỹ năng làm việc nhóm, Kỹ năng phân tích
- Kinh nghiệm: 1 năm',
    '- Thưởng lễ
- Thưởng Tết
- Lương tháng 13
- Khám sức khỏe hàng năm
- Nghỉ phép theo luật lao động
- Review lương 2 lần/năm
- Bảo hiểm xã hội, bảo hiểm y tế, bảo hiểm thất nghiệp',
    'Hà Nội', 'full_time'::public.employment_type,
    18000000, 30000000, 'VND', 'published',
    now() - ((54 % 21) || ' days')::interval,
    now() + ((20 + (54 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [55/94] group 7 (QA/Testing): Nhân Viên Kiểm Thử Phần Mềm
  jid := '10f34eaf-9aa7-560a-99bb-110563ad57c2'::uuid;
  cid := company_ids[7];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhân Viên Kiểm Thử Phần Mềm',
    '• Lập kế hoạch kiểm thử
• Nghiên cứu, phân tích và review các tài liệu yêu cầu, thiết kế
• Thiết kế Test case, checklist
• Thực hiện kiểm thử (chức năng, hiệu năng, bảo mật)
• Log lỗi và quản lý lỗi trên hệ thống Quản lý lỗi
• Giám sát, đo lường, quản lý và báo cáo về quá trình kiểm thử, chất lượng phần mềm, kết quả kiểm thử.
• Phối hợp với dự án để thực hiện kiểm thử nghiệm thu cùng khách hàng.
• Tham gia đánh giá và cải tiến quy trình, hệ thống đảm bảo chất lượng
• Tổ chức phân tích, đánh giá, tự lên phương án nâng cao hiệu quả, hiệu suất các quy trình triển khai testing của bộ phận.
(Thông tin dự án sẽ chi tiết trong buổi phỏng vấn)

Yêu cầu chi tiết: • Tốt nghiệp Đại học trở lên chuyên ngành CNTT
• Có kinh nghiệm 2 năm trở lên với vị trí tương đương
• Nắm vững các quy trình và kỹ thuật test.
• Có kỹ năng lập kế hoạch, kỹ năng phân tích nghiệp vụ.
• Có kỹ năng xây dựng test case và thực hiện test.
• Có kỹ năng phân tích kết quả kiểm thử và báo cáo.
• Có kinh nghiệm làm việc với các dự án theo quy trình CMMI, Agile/Scrum.
• Thành thạo SQL.
• Có kỹ năng làm việc nhóm.
• Có khả năng đọc hiểu tài liệu tiếng Anh tốt.
• Yêu thích các sản phẩm mà mình làm ra, đưa ra các đóng góp cải tiến để sản phẩm tốt hơn.
Ưu tiên:
• Đã từng làm các dự án về Logistics, Hệ thống Tài chính, Thương mại điện tử, Phần mềm quản lý bán hàng, Phần mềm SAP.
• Có kinh nghiệm sử dụng các phần mềm về Test hiệu năng (Jmeter), automation test.
• Có chứng chỉ ISTQB',
    '- Bằng cấp: Đại học trở lên chuyên ngành CNTT
- Kỹ năng chuyên môn: SQL, Kỹ thuật test, Test case, CMMI, Agile/Scrum
- Kỹ năng mềm: Kỹ năng lập kế hoạch, Kỹ năng phân tích nghiệp vụ, Kỹ năng làm việc nhóm
- Kinh nghiệm: 2 năm',
    '- Chế độ bảo hiểm xã hội
- Bảo hiểm y tế
- Bảo hiểm thất nghiệp
- Khám sức khỏe định kỳ
- Hỗ trợ tiền điện thoại và ăn trưa
- Thưởng vào các dịp lễ lớn',
    'Hà Nội', 'full_time'::public.employment_type,
    15000000, 35000000, 'VND', 'published',
    now() - ((55 % 21) || ' days')::interval,
    now() + ((20 + (55 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [56/94] group 8 (Project/Product Management): Chuyên Viên Cao Cấp Phân Tích Nghiệp Vụ (Thẻ & Hóa Đơn Điện Tử)
  jid := '6eca4c10-476d-53e0-8208-abd74b1a35a8'::uuid;
  cid := company_ids[8];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Chuyên Viên Cao Cấp Phân Tích Nghiệp Vụ (Thẻ & Hóa Đơn Điện Tử)',
    '1. Phát triển ứng dụng:
- Tiếp nhận các yêu cầu phát triển, cải tiến sản phẩm, quy trình, tính năng từ các đơn vị nghiệp vụ. Phân tích và tư vấn cho các đơn vị nghiệp vụ phương án hiệu quả để thực hiện yêu cầu.
- Trao đổi với bộ phận phát triển để thiết kế giải pháp cho các yêu cầu. Phối hợp cùng đội phát triển xây dựng đặc tả về yêu cầu, đảm bảo yêu cầu phát triển rõ ràng, khả thi.
- Tham gia phối hợp với đơn vị nghiệp vụ kiểm tra kết quả phát triển, đảm bảo ứng dụng đáp ứng yêu cầu đã thống nhất với đơn vị nghiệp vụ.
- Phối hợp cùng đội phát triển xây dựng kế hoạch chi tiết để triển khai dự án, hỗ trợ theo dõi, cập nhật tiến độ dự án
- Soạn thảo và ban hành tài liệu hướng dẫn sử dụng sản phẩm công nghệ cho người dùng cuối.
- Tham gia đào tạo trực tiếp về sản phẩm, tính năng công nghệ cho bộ phận hỗ trợ IT và cán bộ nghiệp vụ nếu cần thiết.
- Xây dựng, cải tiến các mẫu tài liệu phục vụ phân tích, kiểm thử, quy trình phát triển ứng dụng.
- Tham gia giám sát quá trình kiểm thử nhằm đảm bảo chất lượng của hệ thống đáp ứng đúng và đủ yêu cầu đã đặt ra.
2. Trách nhiệm trong hỗ trợ người dùng:
- Hỗ trợ mức L2, L3 với các yêu cầu được phân công.
3. Các trách nhiệm khác
- Thực hiện các công việc khác theo yêu cầu của các cấp quản lý.
- Hỗ trợ báo cáo tiến độ dự án, các vấn đề phát sinh cho các cấp quản lý.

Yêu cầu chi tiết: Yêu cầu ứng viên
- Tốt nghiệp Tốt nghiệp Đại học, chuyên ngành đào tạo: Công nghệ thông tin, Toán tin, Điện tử Viễn thông, Tài chính, Ngân hàng, Ngoại thương.
- Có ít nhất 04 năm kinh nghiệm tại các Ngân hàng, Tổ chức Tài chính, Tập đoàn & Công ty về CNTT hoặc có tối thiểu 2 năm triển khai hệ thống, giải pháp hệ thống ngân hàng.
- Có kiến thức tổng quan về ngân hàng và am hiểu ít nhất 1 trong các nghiệp vụ, quy trình vận hành của Ngân hàng như: cho vay và tài trợ thương mại, tín dụng, tài khoản GL, luồng vận hành sản phẩm nguồn vốn bao gồm sản phẩm ngoại hối, sản phẩm phái sinh và sản phẩm thị trường liên ngân hàng, luồng nghiệp vụ vận hành giao dịch thẻ, sản phẩm thanh toán trên đa kênh như CITAD, NAPAS, VCB, chuyển tiền quốc tế, các dịch vụ ngân hàng bán lẻ, các dịch vụ ngân hàng bán buôn, ...
- Vận dụng thành thạo các kỹ thuật thu thập yêu cầu người dùng, phân tích yêu cầu, số liệu, tài liệu, đưa ra các điểm mạnh/ yếu của các giải pháp và tư vấn lựa chọn giải pháp tối ưu nhất.
- Khả năng viết tài liệu diễn giải với các yêu cầu khó và phức tạp, trực tiếp tham gia vào các dự án lớn.
- Sử dụng thành thạo một trong các công cụ mô hình hóa (visio, visual paradigm ...) để truyền tải yêu cầu thành các mô hình phân tích: mô hình BPM, Activity diagram, Use case
Ưu tiên:
- Có chứng chỉ phân tích nghiệp vụ, kiểm thử như: ISTBQ, PMI-PBA, CCBA, CBAP.
- Đã từng làm việc với một trong các các hệ thống Core T24, Thẻ, Mobile Banking ... là một lợi thế
- Am hiểu về các quy trình, nghiệp vụ ngân hàng và có kinh nghiệm trong đề xuất ứng dụng CNTT vào nghiệp vụ. Ưu tiên ứng viên đã triển khai các giải pháp ứng dụng phần mềm cho ngân hàng',
    '- Bằng cấp: Tốt nghiệp Đại học, chuyên ngành Công nghệ thông tin, Toán tin, Điện tử Viễn thông, Tài chính, Ngân hàng, Ngoại thương
- Kỹ năng chuyên môn: Kiến thức tổng quan về ngân hàng, Kỹ thuật thu thập yêu cầu người dùng, Phân tích yêu cầu, số liệu, tài liệu, Sử dụng công cụ mô hình hóa (visio, visual paradigm)
- Kỹ năng mềm: Khả năng viết tài liệu diễn giải, Tư vấn lựa chọn giải pháp tối ưu
- Kinh nghiệm: 4 năm',
    '- Mức lương và đãi ngộ cạnh tranh
- Môi trường làm việc chuyên nghiệp và hiện đại
- Nhiều cơ hội thăng tiến
- Cơ hội đào tạo và phát triển bản thân
- Các chế độ theo luật lao động hiện hành và theo quy định Ngân hàng',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((56 % 21) || ' days')::interval,
    now() + ((20 + (56 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [57/94] group 8 (Project/Product Management): [Model App] - CVC Phân Tích Nghiệp Vụ
  jid := '459cc139-e3ac-57d5-a7c9-470ba94c8fdb'::uuid;
  cid := company_ids[9];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, '[Model App] - CVC Phân Tích Nghiệp Vụ',
    '1. Xây dựng và nâng cấp cơ sở dữ liệu, công cụ và hệ thống phục vụ đo lường rủi ro Tín dụng (VD: Hệ thống xếp hạng tín dụng; Hệ thống cảnh báo sớm; ...):  - Thực hiện/ phối hợp thực hiện xây dựng cơ sở dữ liệu phục vụ mục đích đo lường rủi ro; bao gồm: xác định các yêu cầu về dữ liệu, thực hiện kiểm tra dữ liệu, văn bản hóa và lưu trữ toàn bộ các tài liệu liên quan đến việc xây dựng cơ sở dữ liệu;  - Thực hiện/ phối hợp thực hiện xây dựng, nâng cấp các công cụ và hệ thống đo lường rủi ro:  + Xây dựng yêu cầu người dùng (URD), xây dựng test case, thực hiện kiểm tra hệ thống (UAT), xây dựng/điều chỉnh hướng dẫn sử dụng công cụ / hệ thống;  + Thực hiện truyền thông và đào tạo việc sử dụng các công cụ, hệ thống đo lường rủi ro;  + Văn bản hóa và lưu trữ các tài liệu liên quan đến việc xây dựng, nâng cấp công cụ / hệ thống, hướng dẫn sử dụng công cụ / hệ thống, đào tạo người dùng. 2. Giám sát và báo cáo việc vận hành các công cụ, hệ thống đo lường rủi ro Tín dụng: Tham gia quản trị/ giám sát và báo cáo việc vận hành các công cụ, hệ thống đo lường rủi ro:  - Thực hiện hỗ trợ Đơn vị kinh doanh và giải đáp thắc mắc cho người dùng (trong phạm vi công việc của bộ phận) trên cơ sở hiểu biết về chức năng của công cụ/ hệ thống và các tài liệu, văn bản có liên quan;  - Phát hiện, tiếp nhận, tổng hợp và hỗ trợ giải quyết những phát sinh, bất cập trong quá trình áp dụng mô hình, công cụ, hệ thống đo lường rủi ro;  - Thực hiện giám sát và báo cáo rủi ro hoạt động tiềm tàng liên quan đến công cụ / hệ thống (hành vi người dùng, các lỗi phát sinh của hệ thống....)  - Thực hiện /phối hợp thực hiện điều chỉnh các tham số của công cụ / hệ thống (theo phân quyền), chỉnh sửa / đưa ra yêu cầu chỉnh sửa công cụ và hệ thống; Kiểm thử công cụ / hệ thống sau khi điều chỉnh / chỉnh sửa; Văn bản hóa và lưu trữ toàn bộ các tài liệu liên quan; 3. Đào tạo nội bộ và kèm cặp thực tập viên:  - Tham gia, thực hiện đào tạo nội bộ theo phân công của lãnh đạo;  - Kèm cặp thực tập viên / cộng tác viên theo phân công của lãnh đạo.

Yêu cầu chi tiết: - Yêu cầu trình độ: Tài chính, kinh tế, ngân hàng, toán. Ưu tiên ứng viên tốt nghiệp ngành: toán tài chính, toán kinh tế, kinh tế lượng, toán tin; Ưu tiên các ứng viên tốt nghiệp tại nước ngoài hoặc có bằng Thạc sỹ;  - Có hiểu biết về tin học văn phòng (MS Word, MS Excel, Outlook, Power Point ...), ưu tiên ứng viên có khả năng sử dụng SQL,VBA, Python, R, SAS,...);  - Kinh nghiệm: Xây dựng và triển khai vận hành mô hình/hệ thống rủi ro tín dụng/ kiểm định mô hình rủi ro tín dụng / phân tích rủi ro, phân tích và thống kê số liệu, hoặc Tài chính/ Ngân hàng  - Ưu tiên ứng viên có kinh nghiệm triển khai và vận hành các công cụ, hệ thống đo lường rủi ro Tín dụng  - Ưu tiên ứng viên có kinh nghiệm làm việc trong lĩnh vực Tài chính/ Ngân hàng, quản lý rủi ro Ngân hàng',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: SQL, VBA, Python, R, SAS
- Kinh nghiệm: 1 năm',
    '- Bảo hiểm xã hội
- Bảo hiểm sức khỏe
- Khám sức khỏe định kỳ
- Team building
- Du lịch hàng năm
- Phụ cấp thâm niên
- Thưởng cổ phần
- Thưởng hiệu quả làm việc',
    'Hà Nội', 'full_time'::public.employment_type,
    20000000, 24000000, 'VND', 'published',
    now() - ((57 % 21) || ' days')::interval,
    now() + ((20 + (57 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [58/94] group 8 (Project/Product Management): Nhà phân tích kinh doanh - Miền chứng khoán
  jid := 'f98b0670-34b1-5582-9426-a034fcfc0da9'::uuid;
  cid := company_ids[10];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhà phân tích kinh doanh - Miền chứng khoán',
    'Core Responsibilities:
- Thu thập, phân tích và định nghĩa yêu cầu nghiệp vụ trong lĩnh vực chứng khoán từ phía khách hàng/đối tác/nội bộ công ty;
- Nghiên cứu và phân tích thị trường chứng khoán, các sản phẩm đầu tư, quy trình giao dịch…;
- Phát triển ý tưởng sản phẩm đột phá (product breakthrough) trong lĩnh vực chứng khoán, tài chính, tích hợp AI để tạo ra trải nghiệm người dùng vượt trội;
- Tạo và quản lý hệ thống tài liệu chuyên ngành: SRS cho hệ thống giao dịch chứng khoán, AI algorithm specifications, compliance requirements, user journey cho các sản chứng khoán, tài chính;

AI & Innovation Focus:
- Nghiên cứu và đề xuất ứng dụng AI/ML trong các sản phẩm chứng khoán: robo-advisory, algorithmic trading, market sentiment analysis, risk management;
- Phân tích dữ liệu thị trường và hành vi người dùng để đưa ra insights cho product innovation;
- Thiết kế và optimize các AI-powered features: smart portfolio recommendation, automated rebalancing, predictive analytics;

Securities Domain Expertise:
- Đảm bảo compliance với các quy định của SSC, HNX, HOSE và các cơ quan quản lý khác;
- Phân tích và tối ưu hóa quy trình giao dịch: order management, execution, clearing & settlement;
- Nghiên cứu các loại chứng khoán: cổ phiếu, trái phiếu, phái sinh, ETF và đưa ra product roadmap;

Yêu cầu chi tiết: Domain Knowledge (Required)
- Tối thiểu 2 năm kinh nghiệm trong lĩnh vực chứng khoán/tài chính;
- Hiểu biết sâu về thị trường chứng khoán Việt Nam: quy trình giao dịch, settlement, margin trading…;
- Nắm vững các quy định của SSC, luật chứng khoán và các yêu cầu tuân thủ;
- Kinh nghiệm với trading platforms, order management systems, market data systems;

AI & Technology Mindset
- Kinh nghiệm hoặc hiểu biết về AI/ML applications trong fintech: recommendation systems, algorithmic trading, robo-advisory là một lợi thế;
- Product breakthrough mindset: khả năng think outside the box, đưa ra innovative solutions;
- Hiểu biết về data analytics, user behavior analysis và product metrics;
- Kinh nghiệm với A/B testing, user research và product experimentation;

Technical & Soft Skills
- Thành thạo các công cụ: Jira, Confluence, Figma/Sketch, SQL (basic);
- Chứng chỉ Business Analyst và/hoặc Securities Practitioner là một lợi thế;
- Tư duy analytical mạnh, khả năng problem-solving và strategic thinking;
- Kỹ năng giao tiếp & trình bày vấn đề tốt, có thể thuyết trình ý tưởng và influence stakeholders;
- Có kinh nghiệm làm việc trong môi trường Agile/Scrum;

Preferred Qualifications
- Kinh nghiệm làm việc tại công ty chứng khoán, fintech hoặc làm các sản phẩm chứng khoán;
- Có hiểu biết về chứng khoán, blockchain, cryptocurrency và digital assets;
- Background về finance, economics hoặc computer science;',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Jira, Confluence, Figma/Sketch, SQL
- Kỹ năng mềm: Tư duy analytical mạnh, Khả năng problem-solving, Strategic thinking, Kỹ năng giao tiếp, Trình bày vấn đề tốt
- Kinh nghiệm: 2 năm',
    '- Mức thu nhập hấp dẫn
- 12 ngày nghỉ phép hàng năm và 03 ngày nghỉ thưởng cho mỗi 12 tháng làm việc
- Hoạt động team building, nghỉ lễ cùng công ty
- Môi trường làm việc mở
- Tiếp cận môi trường fintech startup
- Được học hỏi và tiếp xúc với các chuyên gia trong lĩnh vực đầu tư và tài chính',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((58 % 21) || ' days')::interval,
    now() + ((20 + (58 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [59/94] group 8 (Project/Product Management): Nhà phân tích kinh doanh cao cấp
  jid := 'e01e5570-8e90-5f4e-b263-211b0af3817a'::uuid;
  cid := company_ids[11];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhà phân tích kinh doanh cao cấp',
    'Crossian là một doanh nghiệp thương mại điện tử dựa trên công nghệ tăng trưởng cao. Đằng sau thành công của chúng tôi là người dân của chúng tôi. Là một công ty khởi nghiệp được hình thành vào năm 2020, chúng tôi đã tạo ra một môi trường nhanh chóng và năng động, cho phép người dân của chúng tôi đạt 100 triệu đô la doanh thu vào năm 2024, tốc độ tăng trưởng trung bình tích lũy trên 1000% chỉ dưới 4 năm. Nhiệm vụ của chúng tôi bây giờ là khai thác sức mạnh của công nghệ để phát triển cách tiếp cận trực tiếp cho người tiêu dùng và nâng cao giá trị trọn đời của khách hàng. Chúng tôi đang tạo ra một nền tảng thương mại điện tử toàn diện có các giải pháp cho hàng tồn kho, danh mục, hậu cần, ... Nhà phân tích kinh doanh sẽ đóng vai trò là liên kết chính giữa nhu cầu kinh doanh và giải pháp kỹ thuật, đảm bảo phát triển thành công các sản phẩm đáp ứng yêu cầu của người dùng. Vai trò liên quan đến việc phân tích các quy trình kinh doanh, thu thập các yêu cầu và hợp tác với người quản lý sản phẩm, các bên liên quan và các nhóm chức năng chéo để cung cấp các giải pháp thương mại điện tử hiệu quả và tập trung vào người dùng.

Yêu cầu chi tiết: WHAT WE ARE LOOKING FOR: Educational Background: Bachelor’s degree in IT, Computer Science, or equivalent. Professional Experience: At least 5 years of experience in a Business Analyst role, demonstrating proficiency in handling business requirements from users and exceptional written communication in English. Software Development Process Knowledge: A deep understanding of the software development process, especially in software requirement analysis, to ensure the delivery of accurate and viable solutions. E-commerce Knowledge: Familiarity with tools and platforms relevant to e-commerce, logistics, inventory, and warehouse management systems (e.g., Odoo, Salesforce). Business Intelligence/Data Analysis: Proven experience in data analysis with a minimum of 6 months of hands-on practice, demonstrating the ability to derive actionable insights. UI/UX: Foundational understanding of UI/UX principles, including usefulness at a junior level and usability at an entry level, with a willingness to mentor and guide junior team members in these areas. Communication & Interpersonal Skills: Strong communication, presentation, and documentation capabilities, essential for effective stakeholder engagement and project documentation. Analytical Thinking & Problem-Solving: Excellent analytical and critical thinking skills, with a growth mindset focused on embracing challenges and continuous learning. Adaptability & Patience: A willingness to listen, stay calm, and patiently advocate for ideas across diverse groups, facilitating consensus and project advancement.',
    '- Bằng cấp: Bachelor’s degree in IT, Computer Science, or equivalent
- Kỹ năng chuyên môn: E-commerce platforms (Lazada, Shopee, Tiki), Data analysis, Software requirement analysis
- Kỹ năng mềm: Strong communication, Analytical thinking, Problem-solving, Adaptability, Interpersonal skills
- Kinh nghiệm: 5 năm',
    '- Full salary during probation
- Guaranteed 13th month salary
- 12 days work-from-home
- 12 days of paid annual leave
- Global health insurance package
- Annual health checkup
- Team building activities
- General company T&D Program',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((59 % 21) || ' days')::interval,
    now() + ((20 + (59 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [60/94] group 8 (Project/Product Management): Nhà phân tích kinh doanh
  jid := 'a686a3e1-5900-5c01-b3a0-9b84c776db6d'::uuid;
  cid := company_ids[12];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhà phân tích kinh doanh',
    'Tư vấn, thu thập, phân tích yêu cầu người dùng cuối, các cấp quản lý phía khách hàng để xác định mô hình nghiệp vụ tổng thể, phạm vi công việc, quy mô của hệ thống. Phân tích nghiệp vụ dựa trên yêu cầu và phạm vi đã thu thập, viết các tài liệu dự án, các tài liệu phục vụ cho phân tích thiết kế như tài liệu đặc tả yêu cầu (URD); tài liệu đặc tả yêu cầu phần mềm (SRS), tài liệu phân tích thiết kế (SDD) theo chuẩn ngôn ngữ UML; tài liệu mô tả, giới thiệu hệ thống và các tài liệu khác theo yêu cầu của dự án. Kiểm soát chất lượng và số lượng các tài liệu nghiệp vụ phục vụ cho quá trình triển khai, nghiệm thu dự án. Thực hiện kiểm soát phạm vi, yêu cầu thay đổi và phối hợp với các đơn vị khác trong giai đoạn triển khai, maintain hệ thống. Thực hiện hoặc kiểm soát chất lượng về thiết kế UI/UX, mockup, wireframe phần mềm bằng các công cụ Figma, excel hoặc các công cụ khác. Thực hiện hoặc kiểm soát chất lượng xây dựng kịch bản kiểm thử/vận hành thử hệ thống. Phối hợp kiểm thử ứng dụng, kiểm thử luồng nghiệp vụ. Kiểm soát chất lượng nghiệp vụ theo tinh thần Agile. Xây dựng chương trình, tài liệu hướng dẫn sử dụng và đào tạo người sử dụng cuối. Phối hợp với các đơn vị khác có liên quan trong việc triển khai hoạt động chung của công ty theo chỉ đạo của các cấp quản lý. Thực hiện báo cáo theo yêu cầu của người quản lý trực tiếp.

Yêu cầu chi tiết: Tốt nghiệp đại học các ngành Công nghệ thông tin, Hệ thống thông tin quản lý, các ngành gần với CNTT, Nhóm các ngành kinh tế như tài chính, kế toán,… am hiểu về CNTT. Tối thiểu 3 năm kinh nghiệm làm vị trí BA IT. Tham gia các dự án từ giai đoạn phân tích thiết kế đến hết giai đoạn kết thúc nghiệm thu dự án là một lợi thế. Có kinh nghiệm làm việc với các dự án có nghiệp vụ về thuế hoặc tài chính. Kỹ năng phân tích yêu cầu và quy trình nghiệp vụ. Có tư duy giải quyết vấn đề từ tổng quan đến chi tiết. Có khả năng phản biện và giải quyết vấn đề tốt. Kỹ năng viết tài liệu: Có khả năng tổng hợp, phân tích và tài liệu hóa yêu cầu, quy trình nghiệp vụ. Kỹ năng viết tài liệu chuyên môn CNTT theo chuẩn UML. Có hiểu biết về quy trình triển khai dự án, am hiểu thành phần trình tự và thủ tục nghiệm thu dự án theo quy định hiện hành. Kỹ năng sử dụng công cụ: Thành thạo các bộ công cụ MS Office, Visio, Draw.io và các công cụ phục vụ cho phân tích thiết kế nghiệp vụ. Có thể Onsite tại từng thời điểm theo yêu cầu của khách hàng tại Nguyễn Công Trứ, Hai Bà Trưng, Hà Nội. Kỹ năng tư vấn và thuyết phục khách hàng, định hướng và kiểm soát nghiệp vụ tốt. Có tinh thần trách nhiệm cao, chủ động trong công việc.',
    '- Bằng cấp: Tốt nghiệp đại học các ngành Công nghệ thông tin, Hệ thống thông tin quản lý, các ngành gần với CNTT, Nhóm các ngành kinh tế như tài chính, kế toán,… am hiểu về CNTT.
- Kỹ năng chuyên môn: Kỹ năng phân tích yêu cầu và quy trình nghiệp vụ, Kỹ năng viết tài liệu chuyên môn CNTT theo chuẩn UML, Thành thạo các bộ công cụ MS Office, Visio, Draw.io
- Kỹ năng mềm: Tư duy giải quyết vấn đề, Khả năng phản biện và giải quyết vấn đề, Kỹ năng tư vấn và thuyết phục khách hàng, Tinh thần trách nhiệm cao
- Kinh nghiệm: 3 năm',
    '- Thưởng hiệu quả làm việc vào cuối năm tài chính tổng thu nhập lên đến 16 tháng lương
- Thưởng dịp tết (tết dương và tết âm), dịp lễ (30/04-1/5; 2/9; Trung thu…) sinh nhật, hiếu-hỷ…
- Review đánh giá tăng lương hàng năm
- Nghỉ phép 12 ngày/năm, nghỉ ốm/nghỉ chế độ thai sản/hiếu hỷ… theo luật lao động
- Môi trường trẻ, năng động, chuyên nghiệp, sếp trẻ tâm lý, đồng nghiệp thân thiện',
    'Hà Nội', 'full_time'::public.employment_type,
    35000000, 35000000, 'VND', 'published',
    now() - ((60 % 21) || ' days')::interval,
    now() + ((20 + (60 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [61/94] group 8 (Project/Product Management): Quản lý dự án cao cấp
  jid := 'b6d32b5f-341e-5a49-a70c-61b04dd91281'::uuid;
  cid := company_ids[1];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Quản lý dự án cao cấp',
    'Quản lý toàn bộ vòng đời dự án phát triển sản phẩm: từ thu thập yêu cầu, xác định phạm vi, lập kế hoạch đến giám sát triển khai và bàn giao. Phối hợp chặt chẽ với đội sản phẩm, phát triển, QA và các bên liên quan để đảm bảo lộ trình sản phẩm được thực thi hiệu quả. Thiết lập và duy trì các tài liệu dự án: project charter, timeline, backlog, risk register, communication plan... Đảm bảo mọi hạng mục công việc bám sát roadmap, ngân sách và KPI đề ra. Quản lý nhóm dự án: phân công công việc, theo dõi tiến độ, hỗ trợ tháo gỡ vướng mắc trong quá trình thực hiện. Tổ chức các cuộc họp định kỳ (daily, planning, review, retrospective...) và báo cáo tiến độ đến CEO hoặc các bên liên quan. Nhận diện và quản lý rủi ro, thay đổi phạm vi dự án, đảm bảo tính chủ động và kiểm soát. Là đầu mối truyền thông giữa team kỹ thuật và bộ phận kinh doanh/đối tác, đảm bảo thông tin minh bạch và liên tục. Tham gia xây dựng proposal, kế hoạch phát hành (release plan), dự toán effort, timeline khi có yêu cầu mở rộng sản phẩm.

Yêu cầu chi tiết: Tốt nghiệp đại học chuyên ngành Công nghệ thông tin, Hệ thống thông tin, Quản trị dự án, Kinh tế hoặc lĩnh vực liên quan. Có từ 5 năm kinh nghiệm làm Project Manager phát triển sản phẩm công nghệ, ưu tiên các sản phẩm B2C, B2B hoặc SaaS. Thành thạo các nhóm quy trình quản lý dự án: lập kế hoạch, giám sát tiến độ, phân bổ nguồn lực, quản lý rủi ro, stakeholder và truyền thông nội bộ. Có khả năng xây dựng và quản lý backlog, timeline, milestone, release plan phù hợp với tiến độ phát triển sản phẩm. Từng quản lý dự án quy mô từ 15 người trở lên, có yếu tố tích hợp hệ thống hoặc triển khai hạ tầng là lợi thế. Hiểu rõ quy trình phát triển phần mềm, có kinh nghiệm làm việc trong các mô hình Agile/Scrum. Thành thạo công cụ quản lý dự án như Jira, Confluence. Có chứng chỉ PMP, PMI-ACP, PSM là lợi thế (không bắt buộc). Có kinh nghiệm quản lý 1 Program là lợi thế lớn. Ưu tiên ứng viên từng làm việc tại các công ty product-based, có trải nghiệm thực tiễn với các hệ thống lớn hoặc tích hợp nền tảng bên thứ ba (ví dụ: thanh toán, bảo hiểm, eKYC...). Kỹ năng giao tiếp, trình bày, phân tích vấn đề tốt; có khả năng kết nối và phối hợp giữa team kỹ thuật – team sản phẩm – team kinh doanh. Có tư duy quản trị logic, chủ động và định hướng giải quyết vấn đề thông qua quy trình, phối hợp nhóm hiệu quả.',
    '- Bằng cấp: Tốt nghiệp đại học chuyên ngành Công nghệ thông tin, Hệ thống thông tin, Quản trị dự án, Kinh tế hoặc lĩnh vực liên quan
- Kỹ năng chuyên môn: Jira, Confluence
- Kỹ năng mềm: Kỹ năng giao tiếp, Trình bày, Phân tích vấn đề, Kết nối và phối hợp
- Kinh nghiệm: 5 năm',
    '- Chế độ bảo hiểm
- Nghỉ phép theo quy định của công ty và pháp luật
- Khám sức khỏe định kỳ hàng năm
- Tăng lương mỗi năm theo năng lực làm việc
- Thưởng nhân viên xuất sắc
- Thưởng tháng lương 13
- Thưởng 2/9
- Thưởng Tết dương lịch
- Chính sách thăm hỏi toàn diện cho nhân sự',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((61 % 21) || ' days')::interval,
    now() + ((20 + (61 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [62/94] group 9 (Architecture): Kiến trúc sư giải pháp
  jid := '1588bdbb-882c-5989-8338-5a7052111df4'::uuid;
  cid := company_ids[2];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kiến trúc sư giải pháp',
    'Lãnh đạo kiến ​​trúc: Sở hữu toàn bộ kiến ​​trúc hệ thống bằng cách dẫn đầu thiết kế và phát triển nền tảng DTC/Thương mại điện tử toàn cầu, đa khu vực của chúng tôi bằng cách sử dụng các dịch vụ đám mây AWS, đảm bảo khả năng mở rộng và hiệu suất cao. Phát triển phụ trợ: Sử dụng nền tảng mạnh mẽ của bạn trong .NET Core và Node.js cho kiến ​​trúc sư và phát triển các giải pháp phụ trợ mạnh mẽ. Phát triển frontend: Áp dụng chuyên môn của bạn trong HTML5/CSS3, React.js và Next.js để tạo giao diện người dùng phản ứng và động. Phát triển ứng dụng di động: Đóng góp cho việc phát triển các ứng dụng di động cho cả nền tảng Android và iOS. Thiết kế phần mềm & kiến ​​trúc: Thực hiện các nguyên tắc thiết kế phần mềm, bao gồm các nguyên tắc vững chắc và mô hình thiết kế, để xây dựng các hệ thống hiệu suất cao, quy mô lớn. Giải pháp Đề xuất & Đánh giá: Đề xuất các giải pháp toàn diện và tiến hành đánh giá giải pháp kỹ lưỡng để đảm bảo tính toàn vẹn của hệ thống và sự liên kết với các mục tiêu kinh doanh. Xử lý sự cố thực hành: Hợp tác với nhóm trong giám sát hệ thống hàng ngày và khắc phục mọi vấn đề để duy trì hiệu suất hệ thống tối ưu. Mã hóa & Tiêu chuẩn: Tiến hành đánh giá mã, tích cực tham gia mã hóa các khung và nền tảng cốt lõi và thiết lập các quy ước mã hóa bằng cách sử dụng các công cụ phân tích mã. Tư vấn kỹ thuật: Tư vấn quản lý về các lộ trình Stack Stack để phù hợp với các mục tiêu kinh doanh trong môi trường bán lẻ tập trung vào công nghệ và công nghệ. Đổi mới & Lãnh đạo: Foster một tư duy cởi mở, nhanh nhẹn, thúc đẩy sự sáng tạo và đổi mới để lãnh đạo lộ trình công nghệ cho công nghệ đổi mới công nghệ của chúng tôi Coe và COE đổi mới quản lý sản phẩm của chúng tôi. Phát triển dựa trên giá trị: Thực hiện các phương pháp phát triển dựa trên OKR và dựa trên giá trị (VDD) để tối đa hóa giá trị kinh doanh. Tư duy sản phẩm: Tận dụng trải nghiệm của bạn với các phương pháp khởi động tinh gọn và tư duy tập trung vào sản phẩm để thúc đẩy các sáng kiến ​​phát triển.

Yêu cầu chi tiết: Education: Bachelor''s or Master''s degree in Computer Science, Information Technology, or a related field. Experience: Minimum of 5 years of experience in Solution Architect and 12 years in Software Development. Technical Expertise: Cloud Expertise: Strong proficiency in AWS cloud services with experience in architecting multi-region, globally scaled systems. Backend Skills: Extensive experience with .NET Core and Node.js for backend development. Frontend Skills: Proficient in HTML5/CSS3, React.js, and Next.js for frontend and web development. Mobile Development: Knowledge of app development for Android and iOS platforms. Software Design: Deep understanding of software design and architecture, including SOLID principles and design patterns. Large-Scale Systems: Proven experience working on large-scale, high-performance systems. Containerization: Experience with Docker and Kubernetes. DevOps: Familiarity with DevOps practices and CI/CD pipelines. Leadership and Team Collaboration: Technical Leadership: Ability to propose solutions, review system designs, and guide the development team. Hands-on Approach: Willingness to engage in daily system monitoring and problem-solving alongside the team. Code Quality: Experience in conducting code reviews, developing coding standards, and applying code analysis tools. Strategic Consulting: Ability to advise team & managers on tech stack roadmaps and align technology initiatives with business objectives. Thought Leadership: Demonstrated ability to lead and innovate within a team setting. Product and Innovation Mindset: Product Experience: Strong product-based experience and mindset with knowledge of lean startup principles. Soft Skills: Agile Mindset: Open, creative, and innovative mindset with experience in leading tech roadmaps in an Agile environment. Value-Driven Development: Familiarity with OKR-based approaches and Value-Driven Development (VDD). Problem-Solving: Strong analytical and critical thinking abilities. Communication Skills: Excellent verbal and written communication & presentation skills in English. Preferred (But not required): Certifications: AWS/Cloud Solutions Architect, TOGAF, ITIL, and/or Enterprise Architect certifications. Industry Experience: Experience in DTC/eCommerce or retail technology environments. Data-Driven Mindset: Experience with Data Analytics, AI / Machine Learning, and leveraging data for strategic decision-making. Startup Experience: Familiarity with scaling engineering teams in fast-paced startup environments.',
    '- Bằng cấp: Bachelor''s or Master''s degree in Computer Science, Information Technology, or a related field
- Kỹ năng chuyên môn: .NET Core, Node.js, HTML5, CSS3, React.js, Next.js, AWS cloud services, Docker, Kubernetes
- Kỹ năng mềm: Analytical thinking, Problem-solving, Communication skills, Agile mindset, Leadership
- Kinh nghiệm: 5 năm',
    '- Career Growth
- Dynamic work environment
- Modern office',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((62 % 21) || ' days')::interval,
    now() + ((20 + (62 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [63/94] group 9 (Architecture): Solution Architect (Kỹ Sư Giải Pháp Ứng Dụng)
  jid := '5ebfcaf8-0efe-5674-bb39-74d62d61cfa0'::uuid;
  cid := company_ids[3];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Solution Architect (Kỹ Sư Giải Pháp Ứng Dụng)',
    '1. Chiến lược kiến trúc ứng dụng
• Xây dựng và cập nhật khung kiến trúc ứng dụng thống nhất toàn ngân hàng.
• Định hướng chuyển đổi từ ứng dụng truyền thống sang cloud-native, microservices hoặc serverless.
2. Thiết kế giải pháp ứng dụng
• Phân tích yêu cầu nghiệp vụ, kỹ thuật và dữ liệu để thiết kế kiến trúc ứng dụng tối ưu.
• Xây dựng giải pháp phù hợp với cả môi trường on-prem và cloud (AWS, Azure, GCP...).
• Đề xuất các mô hình thiết kế đảm bảo khả năng mở rộng, tính sẵn sàng cao và tối ưu vận hành.
3. Kiến trúc tích hợp và kết nối hệ thống
• Thiết kế kiến trúc tích hợp giữa các hệ thống nghiệp vụ: Core Banking, CRM, kênh số, Data Platform.
• Tư vấn giải pháp API Gateway, ESB, message queue (Kafka, RabbitMQ), event streaming.
• Hỗ trợ chiến lược Open API và tích hợp với đối tác/Fintech theo mô hình Open Banking.
4. Chuyển đổi lên Cloud & hiện đại hóa ứng dụng
• Đề xuất và thiết kế lộ trình chuyển đổi ứng dụng lên cloud theo mô hình Rehost/Refactor/Replatform.
• Tối ưu hóa chi phí và hiệu suất vận hành trên cloud.
• Thúc đẩy ứng dụng DevSecOps, container hóa (Docker, Kubernetes), GitOps.
5. Đảm bảo phi chức năng (NFRs)
• Thiết kế để đáp ứng các yêu cầu: hiệu năng, bảo mật, ổn định, mở rộng, giám sát, logging...
• Tư vấn các chiến lược caching, HA, DR, autoscaling.
6. Đào tạo và phát triển năng lực kỹ thuật
• Hướng dẫn, đào tạo các nhóm kỹ thuật về kiến trúc hiện đại, công nghệ cloud và mô hình phát triển linh hoạt.
• Đóng vai trò kiến trúc sư chủ chốt trong hội đồng kiến trúc ngân hàng.

Yêu cầu chi tiết: Bằng cấp: Tốt nghiệp Cao Đẳng, Đại học chuyên ngành Công nghệ thông tin/ Điện tử viễn thông/ Tin học
Kinh nghiệm: 6-10 năm kinh nghiệm, trong đó có 5 năm kinh nghiệm ở vị trí tương đương
Hiểu biết sâu về kiến trúc phần mềm: monolith, microservices, event-driven, domain-driven design.
Kiến thức vững về cloud computing, hybrid architecture, containerization (Docker, Kubernetes).
Thành thạo mô hình tích hợp hệ thống: API (REST/gRPC), messaging, streaming, event sourcing.
Kiến thức tốt về bảo mật hệ thống, xác thực phân quyền, mã hóa, logging, audit.
Có tư duy chiến lược và khả năng truyền đạt kỹ thuật tốt.
Tư vấn công nghệ, chủ động xác định rủi ro kiển trúc và đề xuất giải pháp.
Làm việc chặt chẽ với PM, BA, DEV, QE
Khả năng cập nhật công nghệ mới và đánh giá áp dụng công nghệ phù hợp vào thực tiễn.
Quyết liệt, thẳng thắn, trực diện với vấn đề nhằm đạt mục tiêu trong công việc.
Chú trọng đến chi tiết trong công việc.',
    '- Bằng cấp: Tốt nghiệp Cao Đẳng, Đại học chuyên ngành Công nghệ thông tin, Điện tử viễn thông, Tin học
- Kỹ năng chuyên môn: Kiến trúc phần mềm, Cloud computing, Hybrid architecture, Containerization (Docker, Kubernetes), API (REST/gRPC), Messaging, Streaming, Event sourcing
- Kỹ năng mềm: Tư duy chiến lược, Khả năng truyền đạt kỹ thuật, Làm việc nhóm, Chú trọng đến chi tiết
- Kinh nghiệm: 5 năm',
    '- Mức lương cạnh tranh
- 13 ngày nghỉ phép linh hoạt
- Bảo hiểm đầy đủ theo luật lao động
- Lãi suất vay ưu đãi',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((63 % 21) || ' days')::interval,
    now() + ((20 + (63 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [64/94] group 9 (Architecture): Kiến trúc sư giải pháp - Microsoft Security
  jid := '9b9ad81d-ac21-5187-8ec3-ed032e7c7dc9'::uuid;
  cid := company_ids[4];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kiến trúc sư giải pháp - Microsoft Security',
    'Solution Architect - Microsoft Security sẽ đóng vai trò chủ chốt trong việc tư vấn, thiết kế và triển khai các giải pháp bảo mật Microsoft cho khách hàng. Người đảm nhiệm vị trí này sẽ là chuyên gia trong các công nghệ bảo mật của Microsoft, giúp doanh nghiệp nâng cao khả năng bảo vệ dữ liệu, danh tính, và hạ tầng CNTT của họ.

Yêu cầu chi tiết: Kinh nghiệm triển khai thực tế với các giải pháp Microsoft Security bao gồm: Danh tính & Quản lý truy cập: Microsoft Entra ID (Conditional Access, Identity Protection, PIM) - Endpoint & Cloud Security: Microsoft Defender for Endpoint, Defender for Cloud, Intune. - Giám sát & Điều tra bảo mật: Microsoft Sentinel, Defender XDR, KQL (Kusto Query Language). - Bảo vệ dữ liệu & Tuân thủ: Microsoft Purview (Information Protection, Insider Risk Management, DLP). - Hiểu biết về kiến trúc bảo mật và khả năng thiết kế giải pháp bảo mật toàn diện cho hệ thống Hybrid (On-prem & Cloud). - Khả năng giao tiếp và tư vấn tốt, có thể trình bày các khái niệm bảo mật phức tạp một cách dễ hiểu. - Kinh nghiệm đánh giá hệ thống bảo mật, thực hiện gap analysis và đưa ra giải pháp khắc phục. - Có khả năng làm việc độc lập và theo nhóm, tư duy giải quyết vấn đề nhanh chóng. - Kinh nghiệm đã được chứng minh trong việc thiết kế, triển khai và quản lý các giải pháp bảo mật của Microsoft trong môi trường doanh nghiệp. - Kinh nghiệm làm việc trong môi trường tư vấn hoặc dịch vụ chuyên nghiệp là một lợi thế lớn. - Kinh nghiệm lãnh đạo các dự án bảo mật và hướng dẫn các kỹ sư cấp dưới. - Chứng chỉ yêu cầu (Ưu tiên ứng viên có hoặc sẵn sàng thi chứng chỉ) AZ-500: Microsoft Certified: Azure Security Technologies SC-100: Microsoft Cybersecurity Architect SC-200: Microsoft Security Operations Analyst SC-300: Microsoft Security Identity and Access Administrator SC-400: Microsoft Information Protection Administrator Chứng chỉ Bảo mật khác (Giá trị Cộng thêm): CCSP, CISSP, CISM',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Microsoft Entra ID, Microsoft Defender for Endpoint, Microsoft Sentinel, Microsoft Purview, Intune, Defender for Cloud, KQL (Kusto Query Language)
- Kỹ năng mềm: Khả năng giao tiếp, Tư duy giải quyết vấn đề, Làm việc độc lập và theo nhóm
- Kinh nghiệm: 3 năm',
    '- Bảo hiểm xã hội
- Bảo hiểm sức khỏe
- Team building
- Du lịch hàng năm
- Thưởng hiệu quả làm việc
- Khám sức khỏe định kỳ',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((64 % 21) || ' days')::interval,
    now() + ((20 + (64 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [65/94] group 9 (Architecture): Kiến trúc sư web
  jid := '4a7a05cf-5509-56c3-9cf6-a97db5e71a9a'::uuid;
  cid := company_ids[5];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kiến trúc sư web',
    'FPT Software, một công ty con của FPT Group, là nhà cung cấp dịch vụ CNTT hàng đầu toàn cầu có trụ sở tại Việt Nam. Với hơn 33.000 nhân viên tại 88 văn phòng trên 30 quốc gia, chúng tôi phục vụ hơn 1.100 khách hàng, bao gồm 96 công ty Fortune 500. Chúng tôi tin rằng sự đổi mới nhiên liệu đa dạng và cố gắng tạo ra một nơi làm việc toàn diện nơi tài năng của tất cả các nền tảng phát triển mạnh. Chúng tôi hoan nghênh những người nước ngoài và các chuyên gia quốc tế để mang lại những quan điểm mới mẻ và giúp định hình tương lai của công nghệ. Tổng quan về công việc: Chúng tôi hiện đại hóa nền tảng tùy chỉnh sản phẩm của khách hàng với các tính năng AI, quy tắc cấu hình có thể mở rộng và UX nhập vai (3D, AR). Chúng tôi đang tìm kiếm một kiến ​​trúc sư giải pháp để thiết kế và hướng dẫn kiến ​​trúc lai, tích hợp một cấu hình bên thứ 3 trong khi lập kế hoạch cho một nền tảng chứng minh trong tương lai. Trách nhiệm: Thiết kế kiến ​​trúc hệ thống lai (hiện tại + trạng thái tương lai), tích hợp kỹ thuật chính của trình cấu hình bên thứ 3, các tính năng điều khiển AI của kiến ​​trúc sư AI: Khuyến nghị, tạo hình ảnh, trò chuyện, xác định mô hình dữ liệu quy tắc và quy tắc mở rộng, đảm bảo hỗ trợ cho trực quan hóa 3D/AR nâng cao, cá nhân hóa, hiệu suất địa chỉ, bảo mật và yêu cầu tuân thủ.

Yêu cầu chi tiết: • 8+ years in software/solution architecture
• Experience with product configurators, visual commerce, or CPQ
• Strong skills in API design, cloud platforms (AWS/Azure), and 3D libraries
• Familiar with integrating AI services and rules engines
• Excellent communication and documentation skills (English)
Preferred: Experience with Threekit, Spectrum, or similar; Agile/hybrid project environment familiarity.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: API design, cloud platforms (AWS/Azure), 3D libraries, product configurators, visual commerce, CPQ
- Kỹ năng mềm: Excellent communication, documentation skills
- Kinh nghiệm: 8 năm',
    '- Competitive salary package based on skills and experience
- Health insurance provided by Petrolimex (PJICO)
- Annual Summer Vacation
- Annual leave
- 20% discount on school fees for children at FPT School
- Udemy/Cousera accounts for every Fsofters
- Opportunity to work in international environments
- Dynamic, friendly working environment',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((65 % 21) || ' days')::interval,
    now() + ((20 + (65 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [66/94] group 10 (Networking): Kỹ sư mạng cao cấp
  jid := '3769a52f-efb5-565c-8e41-97a76fa138e7'::uuid;
  cid := company_ids[6];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ sư mạng cao cấp',
    '1. Thiết kế hệ thống mạng: Xây dựng, lựa chọn, triển khai các giải pháp/thiết kế mạng cho hệ thống nội bộ của công ty cũng như các dự án của khách hàng, đảm bảo tính ổn định, khả năng mở rộng và bảo mật của hệ thống.
2. Troubleshoot xử lý sự cố: Phân tích các vấn đề của hệ thống mạng, xử lý và khắc phục sự cố nhanh chóng nhằm đảm bảo hệ thống mạng hoạt động liên tục 24/7, tìm root cause và đưa biện pháp xử lý ngăn các sự cố lặp lại.
3. Hỗ trợ vận hành hệ thống mạng: Hỗ trợ vận hành hệ thống mạng theo quy trình quy định của công ty.
4. Tư vấn và phối hợp với các phòng ban: Hỗ trợ đội ngũ bán hàng và khách hàng về các vấn đề kỹ thuật liên quan tới mảng network; làm việc với các bộ phận bảo mật, vận hành và phát triển để đưa ra giải pháp kỹ thuật hoàn thiện.
5. Nghiên cứu và cập nhật công nghệ mới: Theo dõi xu hướng công nghệ trong lĩnh vực mạng để đề xuất áp dụng các giải pháp tiên tiến, giúp nâng cao hiệu quả vận hành và chất lượng dịch vụ.

Yêu cầu chi tiết: 1. Tốt nghiệp Đại học chuyên ngành CNTT, Viễn thông hoặc các ngành liên quan
2. Kinh nghiệm: Ít nhất 3 năm kinh nghiệm trong lĩnh vực quản trị, vận hành hệ thống mạng
3. Kiến thức chuyên sâu: Nắm được và có kinh nghiệm thiết kế, vận hành các giao thức mạng quan trọng như BGP, OSPF, STP, VPC, EVPN VXLAN...; có kiến thức nền vững về các giao thức và công nghệ liên quan như MPLS, VPN, Firewall và các giải pháp bảo mật hệ thống và kiến thức ATTT trong thiết kế và vận hành là một lợi thế
4. Kỹ năng thiết kế và triển khai: Có khả năng thiết kế cấu trúc mạng, quy hoạch tài nguyên, dự toán chi phí.
5. Năng lực Troubleshoot: Có kỹ năng và kinh nghiệm phân tích sự cố, đưa ra phương án xử lý, triển khai giải pháp khắc phục vấn đề nhanh chóng; khả năng ứng phó với các tình huống khẩn cấp.
6. Có khả năng làm việc độc lập cũng như phối hợp chặt chẽ với các bộ phận liên quan; kỹ năng truyền đạt và tư vấn kỹ thuật xuất sắc giúp làm rõ các giải pháp cho khách hàng.
7. Tư duy phân tích và sáng tạo: Nền tảng vững chắc về tư duy logic, khả năng phân tích, giải quyết vấn đề dưới áp lực cao và đưa ra những ý tưởng sáng tạo nhằm cải tiến hệ thống mạng.
8. Sẵn sàng cập nhật và áp dụng những công nghệ mới, tham gia các khóa đào tạo chuyên sâu và các hội thảo chuyên ngành để liên tục phát triển chuyên môn.',
    '- Bằng cấp: Tốt nghiệp Đại học chuyên ngành CNTT, Viễn thông hoặc các ngành liên quan, Các chứng chỉ chuyên môn như CCNP, CCIE hoặc tương đương là một lợi thế
- Kỹ năng chuyên môn: Thiết kế hệ thống mạng, Troubleshoot xử lý sự cố, Hỗ trợ vận hành hệ thống mạng, Tư vấn và phối hợp với các phòng ban, Nghiên cứu và cập nhật công nghệ mới
- Kỹ năng mềm: Kỹ năng truyền đạt và tư vấn kỹ thuật xuất sắc, Tư duy phân tích và sáng tạo, Khả năng làm việc độc lập và phối hợp chặt chẽ
- Kinh nghiệm: 3 năm',
    '- Hưởng mức thu nhập thuộc top các công ty hàng đầu trong lĩnh vực CNTT tại Việt Nam
- Các chế độ phúc lợi xã hội theo quy định pháp luật như: BHYT, BHXH, BHTN
- Hưởng các chế độ phúc lợi hấp dẫn khác: Du lịch, nghỉ mát, bảo hiểm sức khỏe, bảo hiểm nhân thọ cho nhân sự xuất sắc, thưởng theo kết quả sản xuất kinh doanh
- Đào tạo nâng cao nghiệp vụ, kỹ năng để trở thành chuyên gia hàng đầu trong lĩnh vực
- Cơ hội phát triển nghề nghiệp theo 2 chóp: quản lý hoặc chuyên gia',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((66 % 21) || ' days')::interval,
    now() + ((20 + (66 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [67/94] group 10 (Networking): Chuyên Viên/ Nhân Viên Quản Trị Mạng Cloud (Cloud Network Engineer)
  jid := '361842ed-a90b-5916-ac91-75e3e130638c'::uuid;
  cid := company_ids[7];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Chuyên Viên/ Nhân Viên Quản Trị Mạng Cloud (Cloud Network Engineer)',
    '- Triển khai, vận hành, giám sát hệ thống mạng tại các trung tâm dữ liệu của VNPAY tại HN và TPHCM như: SDN (Software define network), IDS, IPS..
- Triển khai và vận hành dịch vụ network Cloud.
- Xây dựng công cụ thông qua lập trình cho phép tự động hóa các tác vụ quản trị hệ thống.
- Nghiên cứu và triển khai các cấu phần mạng trong môi trường ảo hóa. Ưu tiên ứng viên có kinh nghiệm với các cấu phần mạng triển khai trên Openstack.
- Nghiên cứu và cập nhật công nghệ - kỹ thuật, cũng như các giải pháp để đảm bảo an toàn và bảo mật cho các hệ thống CNTT.
- Thực hiện sao lưu, bảo trì, phục hồi cấu hình của các thiết bị mạng và bảo mật.
- Phân tích, giải quyết các sự cố hệ thống mạng và bảo mật.

Yêu cầu chi tiết: - Tốt nghiệp Đại Học trở lên chuyên ngành Công nghệ thông tin, Công nghệ phần mềm, Điện tử viễn thông,...
- Có ít nhất 02 năm kinh nghiệm ở vị trí tương đương.
- Có kiến thức và hiểu biết cơ bản về Cloud, Network, Cloud Native, Network Security.
- Am hiểu về các mô hình mạng / bảo mật cho các doanh nghiệp hoặc có kiến thức về AWS Cloud, Google Cloud… là một lợi thế.
- Có kiến thức và kinh nghiệm trong lập trình với ngôn ngữ python là một lợi thế.
- Có kiến thức và hiểu biết về Linux và triển khai các ứng dụng mã nguồn mở.
- Có kỹ năng phân tích và giải quyết sự cố; tối ưu hệ thống ; sử dụng thành thạo các công cụ bổ trợ như Sniffer / Wireshark …
- Có kiến thức và hiểu về mô hình OSI / TCP IP
- Tính chuyên nghiệp: Chủ động trong công việc, sẵn sàng học cái mới, vượt qua thách thức, nỗ lực nghiệm thu dự án đúng hạn, tuân thủ quy định công ty, cộng tác hiệu quả với khách hàng, đối tác và đồng nghiệp.
- Có thể chịu được áp lực cao trong công việc.',
    '- Bằng cấp: Đại Học trở lên chuyên ngành Công nghệ thông tin, Công nghệ phần mềm, Điện tử viễn thông
- Kỹ năng chuyên môn: Cloud, Network, Cloud Native, Network Security, Python, Linux
- Kỹ năng mềm: Phân tích và giải quyết sự cố, Chủ động trong công việc, Chịu được áp lực cao
- Kinh nghiệm: 2 năm',
    '- Chế độ thưởng phong phú
- Hỗ trợ ăn sáng miễn phí
- Bảo hiểm sức khỏe cao cấp 24/7
- Khám sức khỏe định kỳ hàng năm
- Cung cấp máy tính & trang thiết bị làm việc hiện đại',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((67 % 21) || ' days')::interval,
    now() + ((20 + (67 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [68/94] group 10 (Networking): Network Engineer
  jid := 'de32fa48-5608-50ca-b58b-64bd4723d1c4'::uuid;
  cid := company_ids[8];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Network Engineer',
    'Thiết kế và thực hiện mạng:
  * Thiết kế và triển khai các giải pháp mạng, bao gồm mạng LAN, WAN và Trung tâm dữ liệu.
  * Định cấu hình các thiết bị mạng như bộ định tuyến, công tắc, tường lửa và bộ cân bằng tải.
  * Khắc phục sự cố và giải quyết các vấn đề mạng, đảm bảo hiệu suất mạng tối ưu.
  * Luôn cập nhật các công nghệ mạng mới nhất và thực tiễn tốt nhất trong ngành.

Sự hợp tác:
  * Làm việc chặt chẽ với các nhóm CNTT khác, bao gồm các nhóm bảo mật, hệ thống và ứng dụng, để đảm bảo các hoạt động mạng liền mạch.
  * Phối hợp với các đối tác bên ngoài và nhà cung cấp dịch vụ để điều phối các dịch vụ mạng và giải quyết các vấn đề.
  * Tham gia vào kế hoạch và thực hiện dự án, đảm bảo cung cấp kịp thời các giải pháp mạng.

Tài liệu:
  * Duy trì tài liệu toàn diện, bao gồm các sơ đồ mạng, tệp cấu hình và quy trình vận hành.
  * Phát triển và cập nhật các tiêu chuẩn và hướng dẫn mạng.

Yêu cầu chi tiết: * Bachelor''s degree in Computer Science, Engineering, or a related field.
  * Deep understanding of network protocols (TCP/IP, OSI model) and network technologies (LAN, WAN, VPN, routing, switching, firewall).
  * Experience in deploying networks using Cisco, Fortinet, Checkpoint.
  * Proficiency in network design and implementation tools.
  * Strong troubleshooting and problem-solving skills.
  * Excellent communication and interpersonal skills.
  * Strong attention to detail and ability to work independently.
  * Certifications such as CCNA, CCNP, NSE4, PCNSA, PCNSE or equivalent are preferred.
  * If you are a passionate network engineer with a strong desire to contribute to a dynamic and challenging environment, we encourage you to apply.',
    '- Bằng cấp: Bachelor''s degree in Computer Science, Engineering, or a related field
- Kỹ năng chuyên môn: network protocols (TCP/IP, OSI model), LAN, WAN, VPN, routing, switching, firewall, Cisco, Fortinet, Checkpoint
- Kỹ năng mềm: strong troubleshooting and problem-solving skills, excellent communication and interpersonal skills, strong attention to detail, ability to work independently
- Kinh nghiệm: 3 năm',
    '- Friendly, professional, dynamic working environment
- Opportunities for training, development and advancement your career path
- 13th month salary and bonus based on business profits
- 12 days annual leave
- Company trip, team building and other activities
- PNC Care (24/7 insurance)
- Health insurance
- social insurance
- unemployment insurance
- health check-up each year',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    30000000, 35000000, 'VND', 'published',
    now() - ((68 % 21) || ' days')::interval,
    now() + ((20 + (68 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [69/94] group 10 (Networking): Presale Network Engineer
  jid := '7f675bc5-7638-5842-b651-e2d9c3cc34ff'::uuid;
  cid := company_ids[9];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Presale Network Engineer',
    'Chịu trách nhiệm các công việc về tư vấn giải pháp hạ tầng network theo dự án của Công ty bao gồm: Nghiên cứu sản phẩm, giải pháp Mạng của các hãng như: Cisco, Juniper, Arista, Aruba, Extreme, H3C, Dell, … Tư vấn lập dự toán và xây dựng giải pháp cho các dự án CNTT. Thiết kế và xây dựng giải pháp kỹ thuật cho các dự án theo yêu cầu của kinh doanh và các bộ phận kỹ thuật. Phân tích, viết tài liệu trình bày giải pháp cho khách hàng. Cập nhật thông tin, phân tích các giải pháp, công nghệ, sản phẩm mới liên quan đến công việc được giao. Xây dựng hồ sơ kỹ thuật của hồ sơ dự thầu. Kết hợp với bộ phận kinh doanh gặp gỡ khách hàng và hỗ trợ triển khai dự án. Thiết lập quan hệ với các nhà cung cấp, phân phối. Chi tiết công việc sẽ trao đổi kỹ hơn khi phỏng vấn.

Yêu cầu chi tiết: Yêu cầu ứng viên: Kiến thức nền tảng về Network tốt. Có hiểu biết về các hệ thống: Network DC, Network Service Provider, hệ thống Wifi, hệ thống mạng LAN/WAN, ... Có các chứng chỉ quốc tế về mạng như: CCNP, CCIE, … là một lợi thế. Có kinh nghiệm tư vấn hạ tầng Mạng cho các khách hàng khối: Bank, Telco, khách hàng nhà nước, …. Làm chủ một số giải pháp, công nghệ mạng như: SDN, SDWAN, Segment Routing, MPLS, EVPN, VxLAN, … Có trách nhiệm và thái độ làm việc tốt, có kỹ năng thuyết trình, thuyết phục, kỹ năng giao tiếp, làm việc nhóm, giải quyết vấn đề và thuyết phục khách hàng. Có khả năng viết tài liệu, đào tạo, trình bày giải pháp, nghiên cứu. Giao tiếp Tiếng Anh cơ bản, có thể đọc hiểu tài liệu Tiếng Anh chuyên ngành.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Kiến thức nền tảng về Network, SDN, SDWAN, Segment Routing, MPLS, EVPN, VxLAN, CCNP, CCIE
- Kỹ năng mềm: Kỹ năng thuyết trình, Kỹ năng giao tiếp, Làm việc nhóm, Giải quyết vấn đề
- Kinh nghiệm: 1 năm',
    '- Cơ hội phát triển, thăng tiến
- Môi trường làm việc thân thiện, năng động
- Được đào tạo, làm việc cùng chuyên gia đầu ngành
- Được tham gia các khóa đào tạo nâng cao kỹ năng
- Ký hợp đồng lao động, đóng bảo hiểm đầy đủ
- Nghỉ phép 12 ngày/năm',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    30000000, 30000000, 'VND', 'published',
    now() - ((69 % 21) || ' days')::interval,
    now() + ((20 + (69 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [70/94] group 10 (Networking): Kỹ Sư Mạng Trung Tâm Dữ Liệu (DC Network Engineer)
  jid := '2a9e02b2-314f-5cde-88ae-57917453d516'::uuid;
  cid := company_ids[10];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ Sư Mạng Trung Tâm Dữ Liệu (DC Network Engineer)',
    'Bạn sẽ là một phần của đội Quản trị mạng, phụ trách vận hành hệ thống mạng lõi trong trung tâm dữ liệu (DC). Công việc bao gồm: Triển khai kênh truyền VPN/Internet trên nền tảng mạng DC VXLAN/EVPN, Xử lý sự cố mạng DC, đảm bảo kết nối ổn định, độ trễ thấp, Thực hiện kế hoạch bảo trì, bảo dưỡng thiết bị mạng theo định kỳ hoặc theo yêu cầu từ phòng Quản trị mạng, Mở rộng, nâng cấp hạ tầng mạng theo kế hoạch phát triển của hệ thống, Rà soát & đánh giá hiệu quả mạng định kỳ, đề xuất giải pháp cải thiện hiệu suất, tính sẵn sàng và khả năng mở rộng của hệ thống, Hỗ trợ đào tạo kỹ sư vận hành cấp 1, chia sẻ kinh nghiệm, hướng dẫn kỹ thuật.

Yêu cầu chi tiết: Bắt buộc: Tốt nghiệp ĐH trở lên chuyên ngành Điện tử viễn thông, CNTT hoặc liên quan, Hiểu rõ các giao thức mạng Layer 2 & Layer 3: STP, LACP, M-LAG, OSPF, BGP, Có từ 3-5 năm kinh nghiệm quản trị hệ thống mạng ISP hoặc mạng doanh nghiệp vừa và lớn, Có khả năng giao tiếp tiếng anh cơ bản, trao đổi công việc với đối tác nước ngoài qua email và chat. Ưu tiên: Đã từng làm việc với công nghệ mạng hiện đại trong DC như: VXLAN, EVPN, Network Automation, Có chứng chỉ như CCNA, CCNP, AWS hoặc tương đương, Tư duy hệ thống, khả năng xử lý sự cố tốt, sẵn sàng học hỏi công nghệ mới.',
    '- Bằng cấp: Tốt nghiệp ĐH trở lên chuyên ngành Điện tử viễn thông, CNTT hoặc liên quan
- Kỹ năng chuyên môn: Giao thức mạng Layer 2 & Layer 3: STP, LACP, M-LAG, OSPF, BGP, Công nghệ mạng hiện đại trong DC như: VXLAN, EVPN, Network Automation
- Kỹ năng mềm: Khả năng giao tiếp tiếng anh cơ bản
- Kinh nghiệm: 3 năm',
    '- Xe đưa đón
- Ăn trưa
- Review lương 1 năm/lần
- Nghỉ phép năm hưởng nguyên lương upto 30 ngày
- Tham gia đầy đủ chế độ BHXH theo quy định của nhà nước
- Đào tạo nâng cao kỹ năng, chuyên môn
- Cơ hội tham gia các hoạt động chia sẻ gắn kết nội bộ và cộng đồng',
    'Hà Nội', 'full_time'::public.employment_type,
    35000000, 35000000, 'VND', 'published',
    now() - ((70 % 21) || ' days')::interval,
    now() + ((20 + (70 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [71/94] group 11 (Cloud Computing): Cloud Engineer (Azure)
  jid := '1caea042-c712-5972-a2a4-71e0c3d2b622'::uuid;
  cid := company_ids[11];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Cloud Engineer (Azure)',
    'Chịu trách nhiệm về việc lập kế hoạch, triển khai và phát triển hạ tầng đám mây AWS/Azure. Xây dựng, phát hành và quản lý cấu hình của tất cả các hệ thống sản xuất. Quản lý một phương pháp tích hợp và triển khai liên tục cho các công nghệ dựa trên máy chủ. Làm việc cùng các nhóm kiến trúc và kỹ thuật để thiết kế và triển khai bất kỳ dịch vụ phần mềm có khả năng mở rộng nào. Đảm bảo bảo mật hệ thống cần thiết bằng cách sử dụng các giải pháp bảo mật đám mây hàng đầu. Cập nhật với các lựa chọn công nghệ mới và sản phẩm của nhà cung cấp, đánh giá xem cái nào sẽ phù hợp với công ty. Triển khai tích hợp liên tục/tiếp tục (CI/CD) khi cần thiết. Đề xuất cải tiến quy trình và kiến trúc. Sửa chữa hệ thống và giải quyết vấn đề trên tất cả các nền tảng và lĩnh vực ứng dụng. Giám sát việc kiểm tra chấp nhận trước sản xuất để đảm bảo chất lượng cao của dịch vụ và sản phẩm của công ty.

Yêu cầu chi tiết: 2+ năm kinh nghiệm sử dụng AWS/Azure. Các chứng chỉ Cloud liên quan: Cloud Solution Associate/ DevOps Associate. Kinh nghiệm thiết kế và xây dựng môi trường web trên AWS (EKS, EC2, S3, Route53, Lambda, Cloudwatch,...) hoặc Azure (Máy ảo, AKS, Azure SQL,...). Kinh nghiệm xây dựng và duy trì ứng dụng cloud-native. Kinh nghiệm sản xuất để xây dựng các hệ thống có khả năng mở rộng (cân bằng tải, memcached, kiến trúc master/slave). Một nền tảng vững chắc về quản trị hệ thống máy chủ Linux/Unix và Windows. Kinh nghiệm sử dụng các công cụ DevOps trong môi trường đám mây, như Ansible, Artifactory, Docker, GitHub, Jenkins, Kubernetes, Maven và Sonar Qube. Kinh nghiệm cài đặt và cấu hình các máy chủ ứng dụng khác nhau như JBoss, Tomcat và WebLogic. Kinh nghiệm sử dụng các giải pháp giám sát như Azure Monitor, CloudWatch, ELK Stack và Prometheus, Zabbix, Grafana. Hiểu biết về việc viết mã cơ sở hạ tầng dưới dạng mã (IaC), sử dụng các công cụ như CloudFormation hoặc Terraform, ARM Azure. Kiến thức về một hoặc nhiều ngôn ngữ lập trình được sử dụng nhiều như Python, Bash Shell, Power Shell. Kinh nghiệm trong việc sửa chữa các hệ thống phân tán. Thành thạo trong phát triển kịch bản và các ngôn ngữ kịch bản. Tiếng Anh: TOEIC >= 500.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: AWS, Azure, Cloud Solution Associate, DevOps Associate, EKS, EC2, S3, Route53, Lambda, Cloudwatch, AKS, Azure SQL, Ansible, Artifactory, Docker, GitHub, Jenkins, Kubernetes, Maven, Sonar Qube, Azure Monitor, CloudWatch, ELK Stack, Prometheus, Zabbix, Grafana, CloudFormation, Terraform, ARM Azure, Python, Bash Shell, Power Shell
- Kỹ năng mềm: Giải quyết vấn đề, Làm việc nhóm, Giao tiếp
- Kinh nghiệm: 2 năm',
    '- Bảo hiểm xã hội
- Bảo hiểm y tế
- Bảo hiểm thất nghiệp
- Nghỉ phép: 12 ngày/năm + 1 ngày nghỉ hưởng lương vào ngày sinh nhật
- Chế độ bảo hiểm nâng cao: CMC Care
- Du lịch hàng năm 1 tuần
- Teambuilding/dã ngoại định kỳ 2 lần/năm
- Trợ cấp thai sản dành cho nhân viên nữ
- Được trang bị laptop, các thiết bị công nghệ hiện đại trong quá trình làm việc
- Môi trường làm việc hiện đại, năng động, khuyến khích tối đa sự sáng tạo của nhân viên',
    'Hà Nội', 'full_time'::public.employment_type,
    35000000, 35000000, 'VND', 'published',
    now() - ((71 % 21) || ' days')::interval,
    now() + ((20 + (71 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [72/94] group 11 (Cloud Computing): Cloud Security Expert/Specialist
  jid := '0d52f580-9f39-5bb7-bcab-9f75ba940e0a'::uuid;
  cid := company_ids[12];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Cloud Security Expert/Specialist',
    '- Triển khai và cấu hình bảo mật cloud-native
  * Cấu hình và vận hành các dịch vụ bảo mật gốc của nền tảng cloud (AWS Security Hub, GuardDuty, Azure Defender, GCP SCC...).
  * Thiết lập baseline bảo mật cho các tài nguyên cloud: IAM, VPC, Storage, Compute, KMS, Monitoring…
  * Áp dụng các biện pháp mã hóa dữ liệu (at-rest, in-transit) và kiểm soát quyền truy cập.

**- Tích hợp công cụ bảo vệ hệ thống cloud**
  * Triển khai và tinh chỉnh các giải pháp CSPM, CWPP, CIEM, tích hợp với hệ thống giám sát tập trung (SIEM/SOAR).
  * Hỗ trợ xây dựng quy trình phát hiện mối đe dọa, cảnh báo bảo mật, thu thập log và điều tra sự cố.

- Phối hợp triển khai các dự án dịch vụ
  * Làm việc cùng các nhóm Consultant và Pentester trong quá trình thiết kế – kiểm thử – triển khai giải pháp bảo mật.
  * Đảm bảo đúng tiến độ, phạm vi, tiêu chuẩn kỹ thuật được yêu cầu trong từng dự án.

- Nghiên cứu, cập nhật công nghệ
  * Theo dõi và đánh giá các xu hướng kỹ thuật, lỗ hổng mới liên quan đến cloud security.
  * Đề xuất giải pháp cải thiện kỹ thuật, hiệu suất và mức độ bảo vệ hệ thống cloud hiện có.

Yêu cầu chi tiết: Kiến thức chuyên môn
  * Hiểu biết chuyên sâu về kiến trúc cloud và các dịch vụ bảo mật cloud-native (IAM, networking, encryption, logging...).
  * Thành thạo ít nhất một nền tảng cloud phổ biến (AWS, Azure, GCP).
  * Kiến thức nền tảng về các chuẩn bảo mật: CIS Benchmark, NIST 800-53, ISO/IEC 27017...
  * Có các chứng chỉ của các nhà cung cấp dịch vụ cloud như AWS Certified Solutions Architect - Associate, AWS Certified Security - Specialty, AWS Certified Solutions Architect - Professional ... là 1 lợi thế

- Kỹ năng kỹ thuật
  * Kinh nghiệm cấu hình và vận hành các công cụ bảo mật cloud (CloudTrail, Config Rules, GuardDuty, etc.).
  * Có khả năng triển khai IaC (Terraform, CloudFormation), CI/CD security là lợi thế.
  * Biết sử dụng hoặc tích hợp các hệ thống SIEM, SOAR, logging, threat detection.

- Kỹ năng mềm
  * Kỹ năng làm việc nhóm và phối hợp đa phòng ban tốt.
  * Khả năng viết tài liệu kỹ thuật, SOP, hướng dẫn cấu hình.
  * Tư duy hệ thống, có khả năng xử lý sự cố và phân tích nguyên nhân gốc rễ.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: AWS Security Hub, GuardDuty, Azure Defender, GCP SCC, IAM, VPC, Storage, Compute, KMS, Monitoring, Terraform, CloudFormation
- Kỹ năng mềm: Kỹ năng làm việc nhóm, Khả năng viết tài liệu kỹ thuật, Tư duy hệ thống, Khả năng xử lý sự cố
- Kinh nghiệm: 5 năm',
    '- Thử việc 02 tháng hưởng 100% lương
- Review lương 2 lần/năm
- Được đào tạo nâng cao nghiệp vụ
- Thưởng Quý, thưởng cuối năm
- 12 ngày phép năm + 1 ngày nghỉ vào ngày sinh nhật
- Được hưởng đầy đủ các chế độ bảo hiểm
- Môi trường làm việc thân thiện, năng động',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((72 % 21) || ' days')::interval,
    now() + ((20 + (72 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [73/94] group 11 (Cloud Computing): Nhà phát triển đám mây tiếp thị Saleforce
  jid := '59b7f38e-f9c4-57db-a031-23ff4544af8d'::uuid;
  cid := company_ids[1];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhà phát triển đám mây tiếp thị Saleforce',
    'Là công ty con của nhóm FPT, phần mềm FPT được biết đến như một nhà cung cấp dịch vụ công nghệ thông tin hàng đầu toàn cầu có trụ sở tại Việt Nam. Với hơn 30.000 nhân viên làm việc tại 83 văn phòng trên 30 quốc gia trên năm lục địa, FPT phần mềm luôn cung cấp các giải pháp tốt nhất cho hơn 1000 khách hàng, bao gồm 100 công ty Fortune 500. Đặt nguồn nhân lực làm nền tảng cho những thành tựu của nó, kinh nghiệm của nhân viên là ưu tiên hàng đầu của chúng tôi trong việc liên tục tạo ra một môi trường làm việc sáng tạo, cởi mở và thú vị cho mọi thành viên. Năm 2023, phần mềm FPT chính thức ghi dấu ấn trong danh sách công ty hàng tỷ đô la toàn cầu. Đây là bằng chứng về tài năng và nỗ lực của nhiều thế hệ nhân viên tại FPT Software. Tại sao không khám phá tiềm năng của bạn và bắt tay vào một hành trình tuyệt vời với chúng tôi? Trách nhiệm bao gồm phát triển và thực hiện các hành trình của khách hàng, duy trì chất lượng dữ liệu, xây dựng EDM và trang đích đáp ứng và hợp tác với các nhóm chức năng chéo.

Yêu cầu chi tiết: • At least 2 years of hands-on experience in Salesforce Marketing Cloud, ideally with SFMC certification. • Strong proficiency in Journey Builder, AMP Script, Email Studio, SQL, SSJS and automation tools. • Familiarity with any CDP such as Salesforce Data Cloud, Tealium, SAP CDP is preferred. Activating personalized experiences across channels is a strong asset. • Strong knowledge of email marketing metrics and best practices (open rates, CTR, deliverability, etc.) and the ability to translate data into actionable insights that shape both creative and promotional strategy. • Experience with email coding (HTML, CSS), and familiarity with email testing tools like Litmus. • Familiarity with data analysis tools such as Google Analytics 4, Datorama, Tableau, or other relevant. • Exceptional project management skills with proven ability to work collaboratively with creative teams and data teams for successful campaign execution.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Salesforce Marketing Cloud, Journey Builder, AMP Script, Email Studio, SQL, SSJS, automation tools, HTML, CSS, Google Analytics 4, Datorama, Tableau
- Kỹ năng mềm: Project management, Collaboration
- Kinh nghiệm: 2 năm',
    '- Competitive salary package based on skills and experience
- Health insurance provided by Petrolimex (PJICO)
- Annual Summer Vacation
- Annual leave, working conditions follow Vietnam labor laws
- 20% discount on school fees for children at FPT School
- Coursera accounts for every Fsofters
- Opportunity to work in international environments
- Dynamic, friendly working environment
- Casual dress code',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((73 % 21) || ' days')::interval,
    now() + ((20 + (73 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [74/94] group 12 (Blockchain & Web3): Kỹ sư blockchain
  jid := '4963b717-70b8-5a01-8e01-ca34766bb953'::uuid;
  cid := company_ids[2];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ sư blockchain',
    'Tham gia design, phát triển, maintaining các dự án Blockchain cho khách hàng Mỹ, Châu Âu: Research solution, phân tích , thiết kế và triển khai ứng dụng liên quan đến blockchain cho khách hàng. Phát triển frontend với ReactJS/ NextJS, tích hợp với smart contract/ API backend. Thiết kế và xây dựng backend api/ indexer. Code, test smart contract (Solidity, Ethereum hoặc EVM chains). Làm việc trực tiếp với PM và team khách hàng, chủ động đề xuất giải pháp kỹ thuật, giải quyết vấn đề trong quá trình development. Tham gia hỗ trợ estimation cho các dự án mới.

Yêu cầu chi tiết: Tốt nghiệp đại học chuyên ngành IT. Có kinh nghiệm trong lập trình Web ít nhất từ 1 năm trở lên. Thành thạo ReactJS, HTML/CSS, JavaScript/TypeScript làm dự án tối thiểu 3 năm. Có kinh nghiệm làm việc với Express hoặc NestJS tối thiểu 1 năm. Có kinh nghiệm code & test smart contract (Solidity / Rust ) trên Ethereum hoặc các EVM-compatible chains tối thiểu 1 năm. Có kiến thức vững về cơ chế hoạt động của blockchain, gas fee, transaction, ABI… Thành thạo việc deploy smart contract lên testnet/ mainnet (Goerli, Sepolia, BNB Testnet…). Thành thạo docker, docker-compose, có khả năng dựng server, môi trường phát triển dự án. Có khả năng đọc hiểu và tạo thiết kế hệ thống dùng UML. Có tinh thần trách nhiệm cao, không ngại việc, chủ động và sẵn sàng học hỏi công nghệ mới.',
    '- Bằng cấp: Tốt nghiệp đại học chuyên ngành IT
- Kỹ năng chuyên môn: ReactJS, HTML/CSS, JavaScript, TypeScript, Express, NestJS, Solidity, Rust, Ethereum, EVM-compatible chains, Docker, docker-compose
- Kỹ năng mềm: Tinh thần trách nhiệm cao, Chủ động, Sẵn sàng học hỏi công nghệ mới
- Kinh nghiệm: 3 năm',
    '- Công ty cung cấp thiết bị làm việc
- Tổng thu nhập một năm (TYI): 14++ tháng lương
- Trợ cấp dự án ODC
- Trợ cấp tiếng Nhật và các chứng chỉ IT
- Trợ cấp thai sản
- Thưởng thâm niên
- Khám sức khỏe
- Xét tăng lương 2 lần/năm
- Tham gia các Câu lạc bộ
- Môi trường làm việc chuyên nghiệp
- Cơ hội thăng tiến
- Du lịch 2 lần/năm',
    'Hà Nội', 'full_time'::public.employment_type,
    20000000, 30000000, 'VND', 'published',
    now() - ((74 % 21) || ' days')::interval,
    now() + ((20 + (74 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [75/94] group 12 (Blockchain & Web3): Nhà phát triển blockchain
  jid := '5dc07d78-c919-5711-9c42-c2155d4406ac'::uuid;
  cid := company_ids[3];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhà phát triển blockchain',
    'Thiết kế và phát triển các ứng dụng và dịch vụ dựa trên blockchain. Viết và triển khai các hợp đồng thông minh (tính vững chắc) trên các nền tảng như BSC, Ethereum, Solana, v.v. Nghiên cứu và áp dụng các công nghệ tiên tiến trong việc xây dựng các hệ thống blockchain và DAPP. Luôn cập nhật các xu hướng và đổi mới blockchain mới nhất. Phối hợp với các nhóm chức năng chéo để đảm bảo chất lượng sản phẩm và giao hàng kịp thời.

Yêu cầu chi tiết: At least 2–4 years of experience in blockchain development (preferably on EVMs), or 4+ years in backend development with at least 1 year in smart contract programming. Proficient in Solidity and familiar with EVM chains and gas optimization techniques. Experienced in upgradeable contract patterns (Proxy, EIP-1967, Diamond/EIP-2535). Deep understanding of token standards: ERC-20, ERC-721, ERC-1155, ERC-2612 (Permit), ERC-3643. Proficient with Git, and clean documentation practices. Comfortable reading technical specifications such as ERCs, EIPs, and whitepapers. Strong team player with experience collaborating with product and Backend teams, including code reviews and architecture discussions.',
    '- Bằng cấp: Bachelor''s degree or higher
- Kỹ năng chuyên môn: Solidity, EVM chains, Gas optimization techniques, Git
- Kỹ năng mềm: Team player, Collaboration, Communication
- Kinh nghiệm: 2 năm',
    '- 13th month salary bonus
- Health insurance
- Performance review with income increase opportunities
- Make-up allowance for girls
- Company trips',
    'Hà Nội, TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((75 % 21) || ' days')::interval,
    now() + ((20 + (75 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [76/94] group 13 (UI/UX & Design): UI/UX Designer
  jid := 'be35d2b0-7b1c-50f4-9341-90e5ba0ee8f2'::uuid;
  cid := company_ids[4];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'UI/UX Designer',
    '1. Thiết Kế và Phát Triển UI/UX: Tạo ra prototypes, wireframes, và mockups. Phát triển ý tưởng thiết kế từ concept đến sản phẩm cuối cùng. Thiết kế giao diện website E-commerce, Blog, Landing Page, Tool vận hành nội bộ. Thiết kế giao diện app E-commerce Kamereo. Đảm bảo các quyết định thiết kế được hình thành dựa trên những cơ sở vững chắc trong UI/UX: Áp dụng Design Principles & Guidelines trong thiết kế. Hiểu biết sâu về nguyên tắc UI/UX, thiết kế dựa trên người dùng (customer-centric). Nắm rõ cách triển khai personas, use cases, scenarios, user flow, screen flow, customer journey maps, và comparative analysis. Tạo ra prototypes, wireframes, và mockups. 2. Nghiên Cứu và Phân Tích Người Dùng: Thực hiện nghiên cứu người dùng (khách hàng doanh nghiệp F&B) để hiểu hành vi và nhu cầu của họ. Phân tích dữ liệu và feedback để cải thiện trải nghiệm người dùng. 3. Quản lý và Cập Nhật Design System: Quản lý và cập nhật design system. Phối hợp với Developer để đảm bảo design system được áp dụng một cách hiệu quả. 4. Hợp Tác Với Nhiều Bộ Phận: Làm việc với các nhóm Developer, Marketing, Content, và Product để đảm bảo rằng thiết kế đáp ứng đúng yêu cầu kỹ thuật và mục tiêu kinh doanh và mang lại trải nghiệm người dùng xuất sắc. Phối hợp với Developer để đảm bảo rằng các thiết kế được triển khai chính xác. 5. Quản lý và Cập Nhật Pitch Deck: Áp dụng kiến thức về Figma và các kỹ thuật visual design để cập nhật pitch deck (không thường xuyên), trình bày dữ liệu trực quan và bắt mắt, truyền đạt thông điệp và những thông tin quan trọng với các đối tác bên ngoài. 6. Cải Tiến Liên Tục: Đề xuất ý tưởng mới và cải tiến quy trình thiết kế.

Yêu cầu chi tiết: Ít nhất 3 năm kinh nghiệm trong lĩnh vực UI/UX Design cho web (responsive) và mobile. Thành thạo các công cụ thiết kế như Figma, Adobe XD, Sketch. Khả năng làm việc độc lập, chủ động và linh hoạt trong môi trường startup năng động. Kinh nghiệm làm việc với các nhóm phát triển sản phẩm và hiểu biết về quy trình phát triển phần mềm. Kỹ năng nghiên cứu người dùng và phân tích dữ liệu. Kỹ năng giao tiếp và làm việc nhóm tốt. Kỹ năng quản lý dự án và tổ chức công việc hiệu quả. Tiếng Anh giao tiếp tốt (thi thoảng cần chat với CEO người Nhật khi làm pitch deck). Kinh nghiệm phát triển Wordpress là lợi thế. Kinh nghiệm với HTML, CSS, và các framework lập trình giao diện là lợi thế.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Figma, Adobe XD, Sketch, HTML, CSS
- Kỹ năng mềm: Khả năng làm việc độc lập, Kỹ năng giao tiếp, Kỹ năng làm việc nhóm, Kỹ năng quản lý dự án
- Kinh nghiệm: 3 năm',
    '- Bảo hiểm xã hội
- Khám sức khỏe định kỳ
- Thưởng tháng 13
- Cung cấp Macbook và công cụ dụng cụ cần thiết',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((76 % 21) || ' days')::interval,
    now() + ((20 + (76 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [77/94] group 13 (UI/UX & Design): UI/UX Designer - Mobile App
  jid := 'c247ad8a-3df6-5951-b8a1-800e956755b0'::uuid;
  cid := company_ids[5];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'UI/UX Designer - Mobile App',
    'Thiết kế art chất lượng cao: icon, banner, screenshot, environment, background app, UI/UX, store listing, sketch... cho sản phẩm mobile. Quản lý chất lượng UIUX của các sản phẩm, chất lượng sản phẩm của member. Thiết kế assets cho những sản phẩm hiện tại và đảm bảo nhất quán về art style. Lưu trữ assets, resource dự án có hệ thống, tổ chức. Cùng team phân tích, tìm hiểu các tài liệu, đưa ra art style phù hợp cho sản phẩm. Phác thảo ý tưởng, thu thập ý kiến đóng góp từ các thành viên trong và ngoài dự án. Hoàn thành, đảm bảo chất lượng công việc theo yêu cầu dự án và được sự giám sát bởi Product Manager.

Yêu cầu chi tiết: Từ 3 năm kinh nghiệm làm việc, đã có những sản phẩm phát hành thực tế, chất lượng cao, được nhiều user sử dụng. Các app dạng tool, entertainment… Sử dụng thành thạo các phần mềm đồ hoạ như Photoshop, AI, hoặc các phần mềm khác. Có khả năng vẽ tay, vẽ máy. Có tư duy về mỹ thuật tốt, thích khám phá, nghiên cứu những kỹ thuật mới. Có khả năng sáng tạo, nắm bắt ý tưởng tốt, khả năng phân tích các mẫu thiết kế thành công và rút ra kinh nghiệm. Khả năng tự học trước sự thay đổi và cập nhật liên tục nhiều mẫu mã sản phẩm trend trên thị trường. Có kinh nghiệm về việc thiết kế giao diện cho ứng dụng UI/UX. Có trách nhiệm với công việc, tuân thủ deadline, có tinh thần học hỏi biết tiếp thu ý kiến. Có khả năng đáp ứng đa công việc (multitask), cởi mở và sẵn sàng học hỏi.',
    '- Bằng cấp: Cao Đẳng trở lên
- Kỹ năng chuyên môn: Photoshop, AI
- Kỹ năng mềm: Sáng tạo, Phân tích, Tư duy mỹ thuật, Chịu trách nhiệm, Tuân thủ deadline, Học hỏi
- Kinh nghiệm: 3 năm',
    '- Review lương, thưởng 2 lần/năm
- Thưởng 1-4 tháng lương/năm
- Hỗ trợ tiền ăn 1.000.000 VNĐ/tháng
- Bảo hiểm xã hội
- Team building
- Khám sức khỏe định kỳ
- Thưởng tháng 13
- Thưởng hiệu quả làm việc',
    'Hà Nội', 'full_time'::public.employment_type,
    15000000, 25000000, 'VND', 'published',
    now() - ((77 % 21) || ' days')::interval,
    now() + ((20 + (77 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [78/94] group 13 (UI/UX & Design): Product Designer (UI/UX Designer - Dự Án Banking)
  jid := '050d1204-0085-5a0c-b06a-598d6a523a6e'::uuid;
  cid := company_ids[6];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Product Designer (UI/UX Designer - Dự Án Banking)',
    'Chịu trách nhiệm thiết kế giao diện người dùng (UI) và trải nghiệm người dùng (UX) cho các sản phẩm số (Web và Mobile App), đảm bảo tính thẩm mỹ, trực quan và tối ưu hóa trải nghiệm người dùng. Làm việc chặt chẽ với các nhóm BA, PO/PM, phát triển và QA để phát triển sản phẩm chất lượng cao.

Yêu cầu chi tiết: Tốt nghiệp Đại học ngành Thiết kế Đồ họa, Công nghệ Thông tin hoặc tương đương. Kinh nghiệm: Tối thiểu 5 năm kinh nghiệm thiết kế UI/UX cho Web và Mobile App, tham gia ít nhất 3 dự án sản phẩm số quy mô trung-lớn, thể hiện qua portfolio. Lãnh đạo & phối hợp nhóm: Kinh nghiệm dẫn dắt đội thiết kế (2-3 thành viên), phân công, hướng dẫn và đánh giá công việc. Năng lực chuyên môn: Hiểu và áp dụng thành thạo lý thuyết UI/UX, layout cơ bản & nâng cao, typography, hệ thống màu sắc, thể hiện qua các dự án đã tham gia. Có kinh nghiệm tuân thủ và phát triển design systems. Kinh nghiệm thiết kế mobile-first, trải nghiệm tương tác và đồ họa số, nêu rõ trong các dự án. Công cụ & chuẩn mực: Thành thạo Figma, Sketch, Adobe XD, Zeplin (hoặc tương đương) để bàn giao thiết kế. Kinh nghiệm áp dụng chuẩn Apple Human Interface Guidelines (iOS) và Google Material Design Guidelines (Android). Yêu cầu kinh nghiệm: Đã tham gia các dự án có quy mô trung-lớn, tập trung vào trải nghiệm người dùng và giao diện trực quan. Có khả năng phân tích yêu cầu người dùng và chuyển đổi thành thiết kế thực tế.',
    '- Bằng cấp: Tốt nghiệp Đại học ngành Thiết kế Đồ họa, Công nghệ Thông tin hoặc tương đương
- Kỹ năng chuyên môn: Figma, Sketch, Adobe XD, Zeplin
- Kỹ năng mềm: Lãnh đạo, Phối hợp nhóm, Phân tích yêu cầu người dùng, Giao tiếp, Sáng tạo
- Kinh nghiệm: 5 năm',
    '- Thưởng dự án/thưởng kinh doanh: từ 1 – 5 tháng lương, trả cuối năm
- Đánh giá nhân sự và điều chỉnh lương: định kỳ 1 năm 1 lần
- Nghỉ phép: 12 ngày/năm
- BHXH, BHYT, BHTN cho 100% cán bộ sau thời gian thử việc
- Chế độ nghỉ mát, du xuân, liên hoan cuối năm cho nhân viên và gia đình
- Đào tạo chuyên sâu theo yêu cầu công việc',
    'Hà Nội', 'full_time'::public.employment_type,
    30000000, 50000000, 'VND', 'published',
    now() - ((78 % 21) || ' days')::interval,
    now() + ((20 + (78 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [79/94] group 13 (UI/UX & Design): UI/UX Manager
  jid := '262f4386-cf32-561f-908b-38f696be0b1f'::uuid;
  cid := company_ids[7];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'UI/UX Manager',
    'Đảm bảo chất lượng UI, UX cho toàn bộ các dự án mobile apps. Review chất lượng và tối ưu UI/UX các dự án. Đưa ra các tiêu chuẩn thiết kế và hướng dẫn cho team thiết kế để đảm bảo sự nhất quán và chất lượng sản phẩm. Phối hợp với Product Team, Marketing Team để đảm bảo chất lượng sản phẩm phù hợp với chiến lược kinh doanh của team. Quản lý và phát triển team UI/UX. Điều phối nhân sự, theo dõi và kiểm soát tiến độ cũng như chất lượng sản phẩm đầu ra. Xây dựng, đào tạo và quản lý đội ngũ nhân sự UIUX Designer: hướng dẫn, đồng hành, thúc đẩy sự sáng tạo, tinh thần làm việc nhóm và hiệu quả trong công việc. Duy trì và xây dựng quy trình làm việc của team thiết kế. Xây dựng cây tri thức chuyên môn cho Team. Phối hợp với BOM các bộ phận để bàn bạc, giải quyết các vấn đề chung, và cải tiến, hoàn thiện bộ máy tổ chức.

Yêu cầu chi tiết: Có ít nhất 5 năm kinh nghiệm UIUX Design cho các sản phẩm web/app (Ưu tiên mảng Mobile App). Có ít nhất 2 năm kinh nghiệm ở vị trí tương đương. Về chuyên môn UI: Am hiểu và vận dụng linh hoạt, chuyên sâu về quy tắc thiết kế, Design System, và style thiết kế của nhiều dòng sản phẩm. Về chuyên môn UX: Nắm vững kiến thức về xây dựng Wireframe, trải nghiệm trong app, và userflow cho app. Kiến thức khác: Quy trình phát triển sản phẩm, kiến thức về thị trường và dòng sản phẩm, chỉ số cơ bản về sản phẩm và marketing.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: UI/UX Design, Wireframe, Design System
- Kỹ năng mềm: Quản lý, Làm việc nhóm, Sáng tạo
- Kinh nghiệm: 5 năm',
    '- Thưởng tháng lương thứ 13
- Thưởng hiệu quả kinh doanh
- Cơ hội học hỏi và phát triển
- Môi trường làm việc thân thiện
- Khám sức khỏe
- Teambuilding
- Du lịch',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((79 % 21) || ' days')::interval,
    now() + ((20 + (79 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [80/94] group 13 (UI/UX & Design): Nhà thiết kế web UI/UX (figma/ui/ux - ưu tin shopify)
  jid := '130feb0d-aa6c-58f8-ac4a-06c34d6c985c'::uuid;
  cid := company_ids[8];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhà thiết kế web UI/UX (figma/ui/ux - ưu tin shopify)',
    'Thiết kế website mới hoặc tối ưu lại website hiện tại (desktop & mobile), đảm bảo giao diện trực quan, đẹp mắt, đồng bộ thương hiệu. Xây dựng UI/UX logic, mạch điều hướng thân thiện, tối ưu trải nghiệm mua sắm. Phối hợp với team Marketing & Dev để đảm bảo hiệu suất và tính thẩm mỹ của website. Thiết kế các landing page, banner, hình ảnh hỗ trợ chiến dịch quảng cáo. Đảm bảo các thiết kế đạt chuẩn responsive, thân thiện SEO và hiệu suất tải trang. Theo dõi và tối ưu UI/UX dựa trên hành vi người dùng thực tế (Google Analytics, Hotjar,...). Chịu trách nhiệm tối ưu chuyển đổi CVR của landing page. Cập nhật xu hướng thiết kế web mới, áp dụng vào sản phẩm để nâng cao chất lượng thẩm mỹ và hiệu quả tương tác. Kiểm tra, chỉnh sửa hiển thị website trên nhiều trình duyệt và thiết bị khác nhau.

Yêu cầu chi tiết: Có ít nhất 1-2 năm kinh nghiệm thiết kế Website. Ưu tiên thiết kế trên nền tảng Shopify, Webflow, WordPress. Thành thạo Figma hoặc các công cụ thiết kế tương đương. Am hiểu về trải nghiệm người dùng (UX) và có mắt thẩm mỹ tốt về giao diện (UI). Có kiến thức cơ bản về HTML/CSS (có khả năng sửa code, không bắt buộc code). Tư duy logic, chủ động tìm giải pháp, làm việc nhóm hiệu quả với content và quản lý dự án. Ưu tiên ứng viên có portfolio thực tế các website đã triển khai trên Shopify.',
    '- Bằng cấp: Cao Đẳng trở lên
- Kỹ năng chuyên môn: Figma, HTML, CSS, Shopify, Webflow, WordPress
- Kỹ năng mềm: Tư duy logic, Làm việc nhóm, Chủ động tìm giải pháp
- Kinh nghiệm: 1 năm',
    '- Thưởng năm theo hiệu quả hoạt động
- Chế độ tăng level hàng năm
- Đóng BHXH, BHYT theo quy định
- Môi trường làm việc năng động
- Tài trợ chi phí tham gia các hoạt động thể dục thể thao',
    'Đà Nẵng', 'full_time'::public.employment_type,
    10000000, 20000000, 'VND', 'published',
    now() - ((80 % 21) || ' days')::interval,
    now() + ((20 + (80 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [81/94] group 13 (UI/UX & Design): 2D UI/UX Artist (Game)
  jid := '31374996-e221-58ce-9645-9c895aeb9e4c'::uuid;
  cid := company_ids[9];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, '2D UI/UX Artist (Game)',
    'Thiết kế giao diện người dùng (UI) bao gồm icon, button, menu, cửa sổ popup, biểu tượng, và hệ thống HUD... Phát triển wireframe, prototype và user flow để thực hiện ý tưởng thiết kế. Tối ưu hóa trải nghiệm người dùng (UX) thông qua nghiên cứu hành vi người chơi và phân tích phản hồi. Phối hợp chặt chẽ với Game Design, Developers, Lead Art và các bạn member khác để xây dựng liên kết UI/UX trong game và core gameplay. Đảm bảo sự nhất quán về phong cách hình ảnh và thương hiệu trong toàn bộ trò chơi. Nghiên cứu xu hướng thiết kế mới và đề xuất ý tưởng cải tiến giao diện và trải nghiệm người dùng.

Yêu cầu chi tiết: Kinh nghiệm từ 1-3 năm trong thiết kế UI/UX, ưu tiên đã từng tham gia phát triển game casual, puzzle hoặc match-3. Hiểu biết về nguyên tắc thiết kế game, tâm lý người chơi và khả năng tạo ra các yếu tố UI hấp dẫn, dễ hiểu. Thành thạo các công cụ thiết kế như Figma, Adobe Photoshop, Illustrator, vẽ digital trên wacom. Có khả năng tối ưu hoá assets, cập nhật xu hướng thiết kế công cụ mới và tiêu chuẩn về accessibility. Biết Unity là lợi thế. Tư duy sáng tạo, khả năng làm việc độc lập và tinh thần làm việc nhóm cao. Kỹ năng giao tiếp tốt và sẵn sàng tiếp nhận phản hồi để cải thiện sản phẩm.',
    '- Bằng cấp: Cao Đẳng trở lên
- Kỹ năng chuyên môn: Figma, Adobe Photoshop, Illustrator, Digital drawing on Wacom
- Kỹ năng mềm: Creative thinking, Ability to work independently, Teamwork spirit, Good communication skills
- Kinh nghiệm: 1 năm',
    '- Thưởng cuối năm tùy thuộc vào doanh thu sản phẩm
- Được tham gia các buổi đào tạo toàn diện về kỹ năng mềm và kỹ năng chuyên môn
- Hỗ trợ xây dựng lộ trình phát triển nghề nghiệp
- Môi trường làm việc năng động, sáng tạo, chuyên nghiệp
- Trang thiết bị chuyên môn đầy đủ
- Các chế độ bảo hiểm, nghỉ phép, khám sức khỏe, thưởng lễ tết',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    30000000, 30000000, 'VND', 'published',
    now() - ((81 % 21) || ' days')::interval,
    now() + ((20 + (81 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [82/94] group 14 (ERP/CRM): Salesforce Expert
  jid := 'f0c6ff08-e84e-50d3-9743-e323771263bc'::uuid;
  cid := company_ids[10];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Salesforce Expert',
    'FPT Software, một công ty con của FPT Group, là nhà cung cấp dịch vụ CNTT hàng đầu toàn cầu có trụ sở tại Việt Nam. Với hơn 33.000 nhân viên tại 88 văn phòng trên 30 quốc gia, chúng tôi phục vụ hơn 1.100 khách hàng, bao gồm 96 công ty Fortune 500. Chúng tôi tin rằng sự đổi mới nhiên liệu đa dạng và cố gắng tạo ra một nơi làm việc toàn diện nơi tài năng của tất cả các nền tảng phát triển mạnh. Chúng tôi hoan nghênh những người nước ngoài và các chuyên gia quốc tế để mang lại những quan điểm mới mẻ và giúp định hình tương lai của công nghệ. Tổng quan về công việc: Chúng tôi đang tìm kiếm chuyên gia Salesforce với hơn 4 năm nền tảng Salesforce với vai trò chuyên gia kỹ thuật. Chuyên gia về vai trò của Salesforce đóng vai trò đối mặt với khách hàng quan trọng bằng cách cung cấp các giải pháp kỹ thuật để đảm bảo hiệu suất ứng dụng, sự nhanh nhẹn, khả năng bảo trì và quản trị danh mục ứng dụng bằng cách sử dụng nền tảng Salesforce. Trách nhiệm: Thiết kế và xác nhận kiến ​​trúc của các ứng dụng Salesforce. Dịch các yêu cầu kinh doanh thành các ứng dụng khả thi và có thể mở rộng, tận dụng các khả năng của Salesforce. Thành phần ứng dụng đảm bảo độc lập vòng đời. Xem xét và đề xuất các mẫu kiến ​​trúc. Chính xác cô lập các dịch vụ cốt lõi, để thúc đẩy khả năng tái sử dụng và chi phí bảo trì thấp hơn. Xác định các yêu cầu phi chức năng, cần tích hợp và hướng dẫn phong cách chung trên tất cả các ứng dụng Salesforce. Đánh giá các ứng dụng hiện có về hiệu suất, kiến ​​trúc và phát triển và đề xuất các thực tiễn tốt nhất.

Yêu cầu chi tiết: • Be a Problem solver, Customer Oriented and with great soft skills. • 4+ years of Salesforce platforms with technical expert roles • Understand and apply architecture patterns in enterprise projects. • Identify, evaluate and fix applications performance bottlenecks • Ability to conduct technical reviews during the software development life cycle and prescribe optimizations and improvement measures. • Proficient in web and mobile development – HTML, CSS, JavaScript, Relational Databases, C#, Java, … • Strong communication skills in English including verbal, written, presentation and interpersonal (any additional language would be ideal)',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Salesforce Administration, Salesforce Development (apex, Visualforce, Lightning Web Components), Salesforce Data Modeling, Salesforce Security, Salesforce Integration (apis), HTML, CSS, JavaScript, Relational Databases, C#, Java
- Kỹ năng mềm: Problem solver, Customer Oriented, Strong communication skills in English
- Kinh nghiệm: 4 năm',
    '- Attractive salary
- Annual compensation and performance bonus
- Opportunity to work with large corporations
- Working on large-scale projects
- Dynamic working environment
- Global and inclusive workplace
- Work-life balance benefits
- Private health insurance with optional family coverage
- Summer vacation allowance
- Sponsored training courses',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((82 % 21) || ' days')::interval,
    now() + ((20 + (82 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [83/94] group 14 (ERP/CRM): Trưởng Phòng IT (Phần Mềm Odoo)
  jid := 'e4c00e82-66e2-5fd2-913e-b8bbea437377'::uuid;
  cid := company_ids[11];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Trưởng Phòng IT (Phần Mềm Odoo)',
    'Lãnh đạo và quản lý toàn bộ nhân sự phòng, đảm bảo chất lượng sản phẩm và tiến độ dự án; Phân công, giám sát, đánh giá hiệu quả công việc của nhân viên trong phòng ban; Quản lý ngân sách, nguồn lực và thiết bị kỹ thuật; Quản lý, phát triển và vận hành hệ thống Odoo của công ty trong lĩnh vực Logistics – Vận tải; Quản lý dự án triển khai Odoo, bao gồm lập kế hoạch, phân công nhiệm vụ và giám sát tiến độ và đảm bảo chất lượng sản phẩm; Quản lý (chức năng, kỹ thuật, tài liệu), theo dõi, nâng cấp hệ thống Odoo; Tối ưu hoá quy trình làm việc và hiệu suất của hệ thống Odoo; Triển khai tích hợp Odoo với các hệ thống khác như CRM, Misa; Hỗ trợ, đào tạo nhân viên trong phòng ban khác về kiến thức, kỹ năng sử dụng phần mềm Odoo và các hệ thống IT khác; Phát triển hệ thống ERP (Mua hàng, bán hàng, Kế toán), WMS (Quản lý kho), Tablue (Phân tích báo cáo quản trị); Phối hợp với các phòng ban khác để tối ưu hóa quy trình logistics sử dụng Odoo; Tham gia làm việc, đánh giá năng lực các đơn vị tư vấn triển khai; Theo dõi và báo cáo tiến độ dự án cho các bên liên quan; Tham gia xây dựng các chính sách, chế độ liên quan đối với nhân viên trong phạm vi quản lý; Thực hiện các yêu cầu, nhiệm vụ khác theo sự quản lý của Giám đốc.

Yêu cầu chi tiết: - Tốt nghiệp đại học hệ chính quy các chuyên ngành CNTT, Khoa học máy tính, Hệ thống thông tin, Tin học kinh tế ..v..v.. và các chuyên ngành liên quan.
- Tối thiểu 3 năm kinh nghiệm quản lý dự án ERP ODDO, ưu tiên ứng viên có kinh nghiệm trong lĩnh vực logistics.
- Hiểu biết sâu rộng về các phương pháp quản lý dự án.
- Có kinh nghiệm làm lĩnh vực logistics đa phương thức gồm đường biển đường bộ đường hàng không nội địa quốc tế hoặc Chuyển phát nhanh là lợi thế;
- Có kinh nghiệm trong việc hoạch định chiến lược CNTT phù hợp hiệu quả với mô hình kinh doanh & hệ thống vận hành của công ty.
- Có khả năng tổ chức và quản lý nhân sự CNTT.
- Có khả năng giao tiếp, đàm phán tốt
- Kỹ năng lãnh đạo và quản lý nhóm hiệu quả.',
    '- Bằng cấp: Tốt nghiệp đại học hệ chính quy các chuyên ngành CNTT, Khoa học máy tính, Hệ thống thông tin, Tin học kinh tế
- Kỹ năng chuyên môn: Quản lý dự án ERP Odoo, Kiến thức về logistics, Tối ưu hoá quy trình làm việc, Triển khai tích hợp Odoo với các hệ thống khác như CRM, Misa
- Kỹ năng mềm: Giao tiếp, Đàm phán, Lãnh đạo, Quản lý nhóm
- Kinh nghiệm: 3 năm',
    '- Thưởng doanh thu cuối năm
- Đóng bảo hiểm y tế, bảo hiểm xã hội theo quy định của Nhà nước
- Thưởng Lễ, Tết (tháng lương 13)
- Nghỉ mát hàng năm
- Thể thao, TeamBuilding
- Hỗ trợ chi phí gói khám sức khỏe hàng năm',
    'Hà Nội', 'full_time'::public.employment_type,
    30000000, 40000000, 'VND', 'published',
    now() - ((83 % 21) || ' days')::interval,
    now() + ((20 + (83 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [84/94] group 14 (ERP/CRM): Intern - Thực Tập Sinh Odoo
  jid := '032b2061-b5d1-582b-9c1c-726a13176147'::uuid;
  cid := company_ids[12];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Intern - Thực Tập Sinh Odoo',
    'Thực tập sinh sẽ được đào tạo và hướng dẫn để có thể nắm bắt được quy trình làm việc. Tham gia on-job training tại các dự án thực tế của công ty. Sau quá trình thực tập sẽ được xét lên nhân viên chính thức. Công ty có đa dạng các dự án sử dụng đa dạng các loại ngôn ngữ, công nghệ. Thực tập sinh có thể được bố trí tham gia dự án phù hợp đúng theo nguyện vọng và định hướng cá nhân. Các dự án được tham gia là các dự án phát triển phần mềm của công ty, bao gồm: các dự án outsource web app, các dự án công nghệ mới Cloud (AWS/Azure), các dự án về nghiên cứu dữ liệu (Data Science sử dụng AI& BI), các dự án product của công ty. Domain chủ yếu về nghiệp vụ tài chính ngân hàng, quản trị doanh nghiệp,... Tham gia vào quá trình xây dựng phát triển, triển khai sản phẩm tới khách hàng Nhật Bản và Việt Nam. Tham gia thiết kế chi tiết, lập trình, unit test, xử lý lỗi của chương trình với các công nghệ và các ngôn ngữ lập trình đa dạng.

Yêu cầu chi tiết: Yêu cầu bắt buộc: Đang học hoặc Tốt nghiệp chuyên ngành công nghệ thông tin các trường: Đại học Bách khoa Hà Nội, Học viện Kỹ thuật quân sự, Đại học Công nghệ — ĐHQGHN, Học viện Kỹ thuật Mật mã, ….. Có kiến thức về ngôn ngữ lập trình Odoo,..... Nếu có kinh nghiệm làm việc sẽ được ưu tiên. Có thể làm fulltime, nếu part-time yêu cầu tối thiểu đi làm được 5 buổi (sáng/chiều) trên tuần. Có mong muốn được làm, chịu khó học hỏi, và có định hướng phát triển sâu về kỹ thuật. Có thể đọc hiểu tài liệu kỹ thuật bằng tiếng Anh.',
    '- Bằng cấp: Đang học hoặc Tốt nghiệp chuyên ngành công nghệ thông tin
- Kỹ năng chuyên môn: Ngôn ngữ lập trình Odoo
- Kỹ năng mềm: Chịu khó học hỏi, Có định hướng phát triển sâu về kỹ thuật
- Kinh nghiệm: Không yêu cầu',
    '- Được đào tạo, hướng dẫn bởi các Technical Leader
- Trợ cấp hàng tháng: 5 triệu VND (gross)
- Cơ hội lên chính thức sau quá trình thực tập
- Có cơ hội đi onsite tại Nhật Bản
- Thời gian làm việc linh hoạt',
    'Hà Nội', 'full_time'::public.employment_type,
    5000000, 5000000, 'VND', 'published',
    now() - ((84 % 21) || ' days')::interval,
    now() + ((20 + (84 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [85/94] group 14 (ERP/CRM): Nhà phát triển Salesior Salesforce
  jid := '31f39d5f-49ce-5269-8211-9ee0ec33ffb6'::uuid;
  cid := company_ids[1];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhà phát triển Salesior Salesforce',
    'Làm việc chặt chẽ với khách hàng, nhà phân tích kinh doanh và kiến ​​trúc sư để hiểu các yêu cầu và chuyển chúng thành các thiết kế kỹ thuật. Phát triển các thành phần Salesforce tùy chỉnh bằng cách sử dụng APEX, LWC, Visualforce, SOQL và Flow. Tùy chỉnh các đối tượng tiêu chuẩn và tùy chỉnh, quy trình công việc, quy trình phê duyệt và quy tắc xác thực. Triển khai tích hợp lực lượng Salesforce với các hệ thống bên ngoài thông qua các API REST/SOAP, phần mềm trung gian hoặc đầu nối của bên thứ ba. Tham gia vào kế hoạch kỹ thuật, ước tính và đánh giá mã. Đảm bảo các giải pháp tuân theo các thực tiễn tốt nhất của Salesforce và tuân thủ các yêu cầu về bảo mật và hiệu suất. Hỗ trợ di chuyển dữ liệu, triển khai hộp cát và triển khai sản xuất.

Yêu cầu chi tiết: Basic understanding and some hands-on experience with Salesforce development. Familiarity with Apex, LWC, Flow Builder, and Salesforce DX. Exposure to Sales Cloud, Service Cloud, or other Salesforce modules. Good understanding of Salesforce platform architecture, security, and governor limits. Familiarity with or exposure to Salesforce integrations with external systems (REST/SOAP APIs, middleware). Familiarity with CI/CD tools for Salesforce (Gearset, Copado, Jenkins, etc.). Experience with Agile/Scrum methodologies. Good communication skills and a collaborative mindset. A strong desire to learn and grow within the Salesforce ecosystem.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: Apex, LWC, Visualforce, SOQL, Flow, Salesforce DX, REST/SOAP APIs, CI/CD tools
- Kỹ năng mềm: Good communication skills, Collaborative mindset, Strong desire to learn and grow
- Kinh nghiệm: Không yêu cầu',
    '- 5-day workweek
- Social insurance
- Medical insurance
- Unemployment insurance
- Yearly performance bonus (up to 2 months’ salary)
- Regular team building events',
    'Hà Nội, Đà Nẵng', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((85 % 21) || ' days')::interval,
    now() + ((20 + (85 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [86/94] group 14 (ERP/CRM): Nhân Viên IT Support/Helpdesk (SAP, Odoo, Aras)
  jid := 'ba48be6d-007b-58eb-bd93-b9eb1b4ea17b'::uuid;
  cid := company_ids[2];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Nhân Viên IT Support/Helpdesk (SAP, Odoo, Aras)',
    'Quản trị hệ thống mạng nội bộ, internet tại nhà máy. Quản lý và bảo trì máy tính, máy in, các thiết bị CNTT của toàn nhà máy. Cài đặt, cấu hình phần mềm hệ thống cho nhân viên. Hỗ trợ khắc phục các sự cố kỹ thuật liên quan đến máy tính, mạng, phần mềm. Phối hợp với các nhà cung cấp dịch vụ CNTT và phần mềm ERP/MES để triển khai, duy trì vận hành hệ thống. Đề xuất giải pháp và thực hiện phát triển phần mềm phục vụ cho việc vận hành của nhà máy. Đào tạo cơ bản cho người dùng nội bộ về sử dụng phần mềm, thiết bị. Tham gia xây dựng quy trình quản lý tài sản CNTT, bảo mật dữ liệu nhà máy. Lập báo cáo định kỳ tình trạng hệ thống và đề xuất phương án nâng cấp (nếu cần).

Yêu cầu chi tiết: Nam/Nữ, tuổi từ 23 – 35. Tốt nghiệp Cao đẳng/Đại học chuyên ngành CNTT, mạng máy tính, điện tử viễn thông hoặc các ngành liên quan. Có tối thiểu 1 năm kinh nghiệm ở vị trí IT trong nhà máy, ưu tiên ngành sản xuất bao bì, in ấn, thực phẩm, nhựa, điện tử... Thành thạo kỹ năng xử lý sự cố máy tính, mạng LAN/WAN, máy chủ nội bộ. Ưu tiên ứng viên có kinh nghiệm hỗ trợ vận hành hệ thống ERP, MES, phần mềm sản xuất. Ưu tiên ứng viên có khả năng phát triển phần mềm để hỗ trợ vận hành doanh nghiệp bằng các ngôn ngữ lập trình: C#, Java, SQL. Ưu tiên ứng viên có kinh nghiệm làm việc với các nền tảng quản lý doanh nghiệp như SAP, Odoo, Aras. Trung thực, nhanh nhẹn, có tinh thần trách nhiệm cao.',
    '- Bằng cấp: Cao đẳng/Đại học chuyên ngành CNTT, mạng máy tính, điện tử viễn thông hoặc các ngành liên quan
- Kỹ năng chuyên môn: Xử lý sự cố máy tính, Mạng LAN/WAN, Máy chủ nội bộ, Hệ thống ERP, MES, Ngôn ngữ lập trình: C#, Java, SQL, SAP, Odoo, Aras
- Kỹ năng mềm: Trung thực, Nhanh nhẹn, Có tinh thần trách nhiệm cao
- Kinh nghiệm: 1 năm',
    '- Phụ cấp cơm trưa
- Phụ cấp chuyên cần
- Phụ cấp xăng xe
- Đóng BHXH đầy đủ theo quy định pháp luật
- Thưởng Tết, Lễ, hiệu suất công việc hằng năm
- Môi trường làm việc ổn định, lâu dài, có cơ hội phát triển chuyên môn',
    'Bắc Ninh', 'full_time'::public.employment_type,
    25000000, 40000000, 'VND', 'published',
    now() - ((86 % 21) || ' days')::interval,
    now() + ((20 + (86 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [87/94] group 14 (ERP/CRM): Trưởng Phòng IT Odoo
  jid := '15d77a04-9c6d-508f-ac93-2b3e9dc3eab6'::uuid;
  cid := company_ids[3];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Trưởng Phòng IT Odoo',
    'Quản lý, phát triển và vận hành hệ thống Odoo ERP của công ty trong lĩnh vực Logistics - Vận tải; Phân tích yêu cầu kinh doanh và đề xuất giải pháp tối ưu hóa quy trình bằng Odoo; Quản lý dự án triển khai Odoo, bao gồm lập kế hoạch, phân công nhiệm vụ và giám sát tiến độ và đảm bảo chất lượng sản phẩm; Lập trình, phát triển và tùy chỉnh các module Odoo theo yêu cầu cụ thể của doanh nghiệp; Tối ưu hóa quy trình làm việc và hiệu suất của hệ thống Odoo; Triển khai và tích hợp Odoo với các hệ thống khác như CRM, Misa; Đảm bảo an toàn và bảo mật thông tin cho hệ thống; Đào tạo và hỗ trợ người dùng cuối trong việc sử dụng hệ thống Odoo; Phối hợp với các phòng ban khác để tối ưu hóa quy trình logistics sử dụng Odoo.

Yêu cầu chi tiết: Có tối thiểu 03 năm kinh nghiệm ở vị trí trưởng phòng, tương đương hoặc cao hơn. Có kinh nghiệm Odoo từ 03 năm trở lên, có kinh nghiệm trong lĩnh vực logisitics là lợi thế; Thành thạo lập trình Python; Hiểu biết sâu sắc về Odoo framework và cách tùy chỉnh, phát triển các module Odoo; Có kinh nghiệm làm việc với các hệ thống CRM và ERP, đặc biệt là Odoo ERP; Kỹ năng quản lý nhóm, lãnh đạo và giao tiếp tốt; Có khả năng lập kế hoạch, tổ chức và quản lý dự án hiệu quả; Hiểu biết về quy trình kinh doanh trong lĩnh vực Logistics - Vận tải; Khả năng học hỏi nhanh, tư duy logic và giải quyết vấn đề tốt.',
    '- Bằng cấp: Cao Đẳng trở lên
- Kỹ năng chuyên môn: Odoo, Python, CRM, Misa
- Kỹ năng mềm: Kỹ năng quản lý nhóm, Lãnh đạo, Giao tiếp, Lập kế hoạch, Tổ chức, Quản lý dự án
- Kinh nghiệm: 3 năm',
    '- Được đóng BHXH, BHYT đầy đủ theo quy định
- Môi trường làm việc chuyên nghiệp, hiện đại
- Chế độ nghỉ phép, nghỉ lễ theo quy định
- Tham gia các hoạt động team building, du lịch hàng năm
- Thưởng theo hiệu quả công việc và các dịp lễ tết
- Phụ cấp ăn trưa, cước điện thoại
- Được cấp điện thoại, máy tính, tai nghe',
    'Hà Nội', 'full_time'::public.employment_type,
    25000000, 40000000, 'VND', 'published',
    now() - ((87 % 21) || ' days')::interval,
    now() + ((20 + (87 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [88/94] group 15 (IoT & Embedded): Kỹ Sư Thiết Kế FPGA (Thiết Kế Chip & RTL Logic)
  jid := 'c46362fd-ea23-5126-add6-d3f58854ebb7'::uuid;
  cid := company_ids[4];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ Sư Thiết Kế FPGA (Thiết Kế Chip & RTL Logic)',
    'Thiết kế hệ thống FPGA, đưa ra yêu cầu thiết kế các IP core trong hệ thống và có năng lực triển khai thực hiện công việc cho các kỹ sư, kỹ sư chính. Hiện thực hóa các các thuật toán xử lý số, xử lý tín hiệu và các giao thức truyền dữ liệu sử dụng ngôn ngữ mô tả phần cứng HDL (VHDL/VerilogHDL). Mô phỏng và xác minh thiết kế FPGA bằng các công cụ chuyên dụng nhằm đảm bảo chức năng và hiệu năng đáp ứng yêu cầu của dự án. Đề xuất các nền tảng công nghệ (platform) để thiết kế FPGA cho một hoặc nhiều sản phẩm. Thiết lập các yêu cầu, xây dựng quy trình, quy định trong thiết kế, phát triển FPGA. Xây dựng các giải pháp test chức năng, test tích hợp, kiểm thử các hệ thống có sử dụng FPGA. Đánh giá, phản biện và tối ưu hệ thống giải thuật và luồng xử lý dữ liệu trong hệ thống FPGA.

Yêu cầu chi tiết: Đối với sinh viên mới ra trường: Đam mê lĩnh vực thiết kế FPGA. Tốt nghiệp Đại học chính quy loại Khá trở lên chuyên ngành: Khoa học máy tính, Điện tử viễn thông,...hoặc các chuyên ngành kỹ thuật khác liên quan. Có kiến thức đào tạo cơ bản về thiết kế logic số, thiết kế mạch số, mạch điều khiển. Có hiểu biết cơ bản về kiến trúc máy tính nhúng trên nền tảng FPGA. Có khả năng chủ động trong công việc, có tinh thần trách nhiệm và có khả năng làm việc nhóm. Có khả năng đọc hiểu tài liệu Tiếng Anh và giao tiếp được bằng tiếng Anh là một lợi thế. Yêu cầu tiếng Anh TOEIC từ 550 trở lên hoặc có chứng chỉ tương đương. Đối với ứng viên có kinh nghiệm: Có tối thiểu 01 năm kinh nghiệm làm việc với các hệ thống FPGA cho các sản phẩm riêng biệt. Có tư duy logic, phân tích yêu cầu và giải quyết vấn đề. Có hiểu biết rất sâu sắc về các công nghệ thiết kế/xu hướng công nghệ thiết kế FPGA. Có khả năng đọc hiểu thiết kế chi tiết và ý nghĩa của các chỉ số trong thiết kế. Có khả năng xây dựng bài đo, phương pháp đánh giá; phương pháp debug lỗi trong quá trình lập trình, kiểm thử sản phẩm. Có khả năng phân tích và xây dựng yêu cầu thiết kế chi tiết; đề xuất thiết kế cho các lõi xử lý.',
    '- Bằng cấp: Tốt nghiệp Đại học chính quy loại Khá trở lên chuyên ngành: Khoa học máy tính, Điện tử viễn thông,...hoặc các chuyên ngành kỹ thuật khác liên quan.
- Kỹ năng chuyên môn: Thiết kế hệ thống FPGA, Ngôn ngữ mô tả phần cứng HDL (VHDL/VerilogHDL), Mô phỏng và xác minh thiết kế FPGA, Kiến thức về thiết kế logic số, Kiến thức về kiến trúc máy tính nhúng trên nền tảng FPGA
- Kỹ năng mềm: Có khả năng chủ động trong công việc, Có tinh thần trách nhiệm, Có khả năng làm việc nhóm
- Kinh nghiệm: 1 năm',
    '- Được hưởng các khoản quà, thưởng lễ tết, nghỉ mát hỗ trợ ăn trưa, điện thoại và các chế độ thưởng theo đóng góp, mức độ thành công của các sản phẩm nghiên cứu.
- Được hưởng 27 ngày nghỉ hưởng nguyên lương trong năm bao gồm 12 ngày nghỉ phép, 11 ngày nghỉ lễ tết, 3 ngày nghỉ mát và 1 ngày sáng tạo hàng năm.
- Được hưởng các chế độ BHXH, BHYT và BHTN theo Quy định và chế độ bảo hiểm riêng của Tập đoàn Viettel.',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((88 % 21) || ' days')::interval,
    now() + ((20 + (88 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [89/94] group 15 (IoT & Embedded): Kỹ Sư Quản Lý Dự Án Cơ Điện Nhẹ Và Giải Pháp IoT
  jid := '86dd59f1-55ac-5d09-b0d8-fc87550bb374'::uuid;
  cid := company_ids[5];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ Sư Quản Lý Dự Án Cơ Điện Nhẹ Và Giải Pháp IoT',
    'Lập kế hoạch thực hiện hạng mục tự động hóa/cơ điện nhẹ theo tiến độ tổng thể của dự án. Làm việc với Giám sát Chủ đầu tư về các vấn đề hiện trường, tiếp nhận & bàn giao mặt bằng thi công. Triển khai giám sát thi công đúng bản vẽ shop đã được duyệt, đảm bảo tiến độ, chất lượng và an toàn. Giao việc hàng ngày cho thầu phụ/tổ đội; trực tiếp kiểm tra, theo dõi chất lượng thi công. Phối hợp với kỹ sư khối lượng để đề xuất và kiểm soát vật tư bàn giao cho tổ đội. Xử lý sự cố phát sinh, lập biên bản vi phạm, đề xuất chế tài xử lý nhà thầu vi phạm. Phối hợp kỹ sư shopdrawing điều chỉnh bản vẽ/biện pháp thi công khi có thay đổi từ hiện trường. Nghiệm thu chất lượng với thầu phụ và CĐT. Tham gia bóc tách khối lượng, vẽ hoàn công, nghiệm thu và bảo vệ khối lượng với CĐT. Xác nhận hồ sơ chất lượng và khu vực thi công với các tổ đội liên quan. Thực hiện các công việc khác theo điều phối của Chỉ huy trưởng dự án.

Yêu cầu chi tiết: Lập kế hoạch thực hiện hạng mục tự động hóa/cơ điện nhẹ theo tiến độ tổng thể của dự án. Làm việc với Giám sát Chủ đầu tư về các vấn đề hiện trường, tiếp nhận & bàn giao mặt bằng thi công. Triển khai giám sát thi công đúng bản vẽ shop đã được duyệt, đảm bảo tiến độ, chất lượng và an toàn. Giao việc hàng ngày cho thầu phụ/tổ đội; trực tiếp kiểm tra, theo dõi chất lượng thi công. Phối hợp với kỹ sư khối lượng để đề xuất và kiểm soát vật tư bàn giao cho tổ đội. Xử lý sự cố phát sinh, lập biên bản vi phạm, đề xuất chế tài xử lý nhà thầu vi phạm. Phối hợp kỹ sư shopdrawing điều chỉnh bản vẽ/biện pháp thi công khi có thay đổi từ hiện trường. Nghiệm thu chất lượng với thầu phụ và CĐT. Tham gia bóc tách khối lượng, vẽ hoàn công, nghiệm thu và bảo vệ khối lượng với CĐT. Xác nhận hồ sơ chất lượng và khu vực thi công với các tổ đội liên quan. Thực hiện các công việc khác theo điều phối của Chỉ huy trưởng dự án.',
    '- Bằng cấp: Cao Đẳng trở lên
- Kỹ năng chuyên môn: Quản lý dự án, Kiến thức về hệ thống cơ điện nhẹ (M&E), Kiến thức về IoT (Internet of Things), Lập kế hoạch và theo dõi tiến độ dự án, Quản lý rủi ro
- Kinh nghiệm: 3 năm',
    '- Bảo hiểm xã hội
- Thưởng tháng 13
- Du lịch hàng năm
- Team building
- Thưởng hiệu quả làm việc
- Khám sức khỏe định kỳ',
    'Hà Nội', 'full_time'::public.employment_type,
    25000000, 25000000, 'VND', 'published',
    now() - ((89 % 21) || ' days')::interval,
    now() + ((20 + (89 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [90/94] group 15 (IoT & Embedded): Kỹ Sư Phát Triển Firmware, Lập Trình Nhúng, Điều Khiển Điện Cho Robot Phục Vụ
  jid := 'dd8fd5f6-bb11-5076-acaf-463e9e882e7f'::uuid;
  cid := company_ids[6];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ Sư Phát Triển Firmware, Lập Trình Nhúng, Điều Khiển Điện Cho Robot Phục Vụ',
    'Nơi làm việc: Nhật Bản, Saitama hoặc lân cận. Ngày phỏng vấn: dự kiến 15/07/2025. Ngày bắt đầu: dự kiến 01/11/2025. Số lượng tuyển: 2 người. Mức lương (gross): 430,000 yên đến 530,000 yên tháng. Trợ cấp đi lại: Chi trả riêng. Tăng ca: Chi trả riêng. Tăng lương: Năm 1 lần. Khám sức khỏe: Năm 1 lần. Trợ cấp tham gia PV: 1,000,000 vnd (bất kể kết quả). Đặc trưng công việc: Tham gia vào toàn bộ quá trình chế tạo và tất cả các bước cần thiết để vận hành robot. Bao quát từ điều khiển motor, cảm biến đến dựng logic vận hành và kiểm tra vận hành trên thiết bị thật. Phối hợp với các kỹ sư ở lĩnh vực khác như điều khiển điện, cơ khí để hướng tới tối ưu hóa tổng thể. Có cơ hội tiếp cận nhiều công nghệ đa dạng như phần mềm, cơ khí, cảm biến, truyền thông, AI và phối hợp với các lĩnh vực khác. Tham gia xuyên suốt từ khâu thiết kế đến thử nghiệm, vận hành và cải tiến. Có khả năng cao ý tưởng mới của bạn sẽ được áp dụng và triển khai ngay. Tham gia phát triển công nghệ trực tiếp giải quyết vấn đề xã hội như thiếu nhân lực và nâng cao hiệu suất trong ngành dịch vụ.

Yêu cầu chi tiết: Yêu cầu công việc (Bắt buộc): Có kinh nghiệm thiết kế sơ đồ mạch điện và bảng mạch (PCB), Có kinh nghiệm sử dụng phần mềm CAD chuyên về điện (như Altium Designer, OrCAD, AutoCAD...), Có kinh nghiệm phát triển phần mềm nhúng (C, C++...), Có kinh nghiệm thiết kế chi tiết và lập trình, Trình độ tiếng Nhật từ N3 trở lên. Yêu cầu công việc (Ưu tiên): Có kinh nghiệm phát triển liên quan đến robot, Có kinh nghiệm điều khiển giao tiếp không dây và thiết bị ngoại vi, Có kiến thức về điều khiển phần cứng như cảm biến, camera, motor, Có kinh nghiệm xác định yêu cầu và thiết kế cơ bản, Có kinh nghiệm thiết kế mạch điều khiển motor, Có kinh nghiệm thiết kế mạch xử lý tín hiệu cảm biến, Trình độ tiếng Nhật từ N2 trở lên.',
    '- Bằng cấp: Cao Đẳng trở lên
- Kỹ năng chuyên môn: Thiết kế sơ đồ mạch điện và bảng mạch (PCB), Sử dụng phần mềm CAD (như Altium Designer, OrCAD, AutoCAD), Phát triển phần mềm nhúng (C, C++), Thiết kế chi tiết và lập trình
- Kỹ năng mềm: Đam mê điều khiển robot, Tư duy linh hoạt, Hợp tác giữa các team phần mềm và phần cứng, Kiên trì phát triển sản phẩm
- Kinh nghiệm: 2 năm',
    '- Hỗ trợ 100% thủ tục, chi phí, vé máy bay sang Nhật
- Tăng lương hằng năm
- Trợ cấp nhà ở
- Bảo hiểm xã hội, bảo hiểm thất nghiệp, bảo hiểm chăm sóc sức khỏe
- Khám sức khỏe định kỳ hằng năm
- Nghỉ thứ 7, chủ nhật, lễ tết Nhật Bản (hơn 125 ngày/năm)',
    'Nhật Bản', 'full_time'::public.employment_type,
    78000000, 95000000, 'VND', 'published',
    now() - ((90 % 21) || ' days')::interval,
    now() + ((20 + (90 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [91/94] group 15 (IoT & Embedded): Kỹ sư nhúng (Autosar, CAN Tools, BSW)
  jid := '5f242d62-bfcd-57c1-a48e-c4052ccea7ca'::uuid;
  cid := company_ids[7];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ sư nhúng (Autosar, CAN Tools, BSW)',
    'Thiết kế và thực hiện phần mềm dựa trên ô tô; Định cấu hình các mô -đun BSW (MCAL, COM, DCM, v.v.), ánh xạ RTE và SWC. Phát triển trình điều khiển cấp thấp và tích hợp các ngăn xếp truyền thông (CAN, LIN, UDS, Ethernet). Thực hiện kiểm tra đơn vị/tích hợp và duy trì đường ống CI/CD. Sử dụng các công cụ như ca nô, capl, polyspace để đảm bảo tuân thủ (MISRA, ISO 26262). Gỡ lỗi, phân tích thất bại và cộng tác giữa các nhóm. Thiết kế tài liệu, tiến hành đánh giá mã và tích hợp hệ thống hỗ trợ.

Yêu cầu chi tiết: MUST HAVE: Strong in C/C++ programming for Embedded Software with Debugger Environment. Good in CAN protocol/ Diagnostic/ Microcontroller/ sensor/ IO/ Serial knowledge. Knowledge & experience in Automotive Domain and tools (CANoe, CANalyser & CAPL programming). Knowledge and experience in AUTOSAR. NICE TO HAVE: Electronics/ Mechatronics/ Computer Engineering or relevant background. SW development in area of CAN, Diagnostics, Vehicle Functions, Automotive etc. OS Scheduler, Pre-emptive, Round robin & Cooperative scheduling. Experience in Networking protocols such as CAN, LIN etc. Unit Testing (Tessy & RTRT), TPT & Integration Testing Tools. Experience in defining and execution of Test Cases with techniques (White Box and Black box). Exposure to Test Automation scripting tools (Python & Perl) ECU Test & LabCar. Knowledge on CAN, ISO14229, ISO26262, J1939 & UDS standards. Experience in Closed loop LabCar, INCA or similar tools. MISRA 2004 and 2012 Coding guidelines (PC-lint, LDRA & PRQA). Knowledge & experience in Matlab/Simulink is plus. Knowledge & experience in V-model and development process. SDLC and Software Development Models (Water Fall/ Agile). Good English language skills.',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: C/C++ programming, CAN protocol, Automotive Domain tools (CANoe, CANalyser, CAPL), AUTOSAR, Low-level drivers, Communication stacks (CAN, LIN, UDS, Ethernet), CI/CD pipelines, Debugging tools
- Kỹ năng mềm: Collaboration, Documentation, Code reviews
- Kinh nghiệm: 1 năm',
    '- 13th Salary
- Performance Bonus
- Premium healthcare insurance
- E-learning platform (Udemy)
- Annual leave up to 17 days
- Professional and Personal Development Training Programs
- Company trip and Year-End-Party
- Coffee and snacks provided
- Holiday celebrations',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((91 % 21) || ' days')::interval,
    now() + ((20 + (91 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [92/94] group 15 (IoT & Embedded): Kỹ sư nhúng DSP âm thanh
  jid := '3e9da17d-0a2a-59dc-9530-c7b9c9c32083'::uuid;
  cid := company_ids[8];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ sư nhúng DSP âm thanh',
    'Là nhà phát triển SW nhúng âm thanh, ứng viên sẽ tham gia phát triển nền tảng âm thanh trên hệ thống ô tô. Phân tích yêu cầu của khách hàng, thiết kế và phát triển các tính năng có thể được sử dụng trong nhiều nền tảng âm thanh khác nhau. Phát triển và thực hiện các thử nghiệm đơn vị và chức năng cho các thành phần. Nghiên cứu công nghệ mới, phương pháp mới để tăng cường hiệu suất của hệ thống nhúng. Thiết kế và thực hiện các thành phần DSP SW hiệu quả, chất lượng cao, không gặp sự cố cho các dự án của khách hàng. Duy trì một cơ sở mã tín hiệu âm thanh chung, dễ dàng tùy chỉnh, chéo-DSP.

Yêu cầu chi tiết: Bachelor’s or Master’s degree in Computer Science, Software Engineering, or a related field. Minimum of 2 years of experience. Experience with in-vehicle infotainment systems or other automotive software development is highly desirable. Knowledge of current DSP architectures and of the associated SW build tool-chains. Profound experience in design and implementation of cycle-and memory-efficient DSP SW in C/C++. Well-founded experience in DSP-specific source code optimization, and integration into vendor-specific audio processing frameworks. Knowledge of technical acoustics (transducers, sound-wave propagation). Knowledge of and experience in time-and frequency response equalization of car interior acoustics. Knowledge of psychoacoustics and of the deducible implicit requirements for audio processing systems. Knowledge of the technology of audio hardware components (e.g.: microphones, digital transmission systems, amplifiers, loudspeakers). Knowledge of methods and tools for audio measurements. A certain passion for audio and music. Competent English communication skills is a plus.',
    '- Bằng cấp: Bachelor’s or Master’s degree in Computer Science, Software Engineering, or a related field.
- Kỹ năng chuyên môn: C/C++ programming, DSP architectures, Audio signal processing, In-vehicle infotainment systems
- Kỹ năng mềm: English communication skills
- Kinh nghiệm: 2 năm',
    '- 13th Salary
- Performance Bonus
- Pass Probation Bonus
- Premium healthcare insurance benefits
- Flexible working time
- Annual leave up to 17 days
- Professional and Personal Development Training Programs
- Company trip in summer
- Coffee and snacks provided
- Holiday celebrations and parties',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((92 % 21) || ' days')::interval,
    now() + ((20 + (92 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [93/94] group 15 (IoT & Embedded): Kỹ sư hệ thống nhúng (MCU, RTOS, Linux OS)
  jid := '42a2fef4-31a8-542b-a249-948f53170656'::uuid;
  cid := company_ids[9];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ sư hệ thống nhúng (MCU, RTOS, Linux OS)',
    'Một đơn vị vi điều khiển (MCU) kiểm soát nhiều chức năng trong những chiếc xe hiện đại ngày nay. Là một kỹ sư hệ thống nhúng, bạn sẽ có cơ hội trải nghiệm chu kỳ phát triển đầy đủ bao gồm phân tích yêu cầu, thiết kế trình điều khiển/phần mềm, mã hóa và thử nghiệm. Trong thực tế, bạn sẽ tập trung vào một giai đoạn và mô -đun cụ thể trong MCU và tìm cách tăng trình độ kỹ thuật và kinh nghiệm miền của bạn.

Yêu cầu chi tiết: MUST HAVE
  * Bachelor’s Degree or above in Electronic Engineering, Telecommunication, Computer Science, Computer,...
  * Strong in C/C++ programming for Embedded Development.
  * Experience in communication protocols (e.g., SPI, LIN, CAN, FR, ETH, etc.) and MCU peripheral devices (e.g., EEPROM, Flash, etc.).
  * Experienced with firmware development and implementing hardware drivers and low-level code for device registers for microcontroller platforms.
  * Experienced with Stack, Queues, Pipeline, Socket, Boot loader, secure boot.
  * Experienced with embedded software development, Linux OS, RTOS.
  * Capable of reading and understanding MCU hardware manual.

NICE TO HAVE
  * Knowledge of scripting languages (e.g., Python, Unix Shell Scripts, Visual Basic, etc.).
  * Familiar with source version control software (e.g., GIT, SVN, etc.).
  * Familiar with CMMI and/or A-SPICE working environments.
  * Experience in AUTOSAR standard.
  * Good at problem analysis and solving.
  * Good English language skills.
  * Effective communication skills.',
    '- Bằng cấp: Bachelor’s Degree or above in Electronic Engineering, Telecommunication, Computer Science, Computer
- Kỹ năng chuyên môn: C/C++ programming for Embedded Development, communication protocols (e.g., SPI, LIN, CAN, FR, ETH), MCU peripheral devices (e.g., EEPROM, Flash), firmware development, hardware drivers, low-level code for device registers, Stack, Queues, Pipeline, Socket, Boot loader, secure boot, embedded software development, Linux OS, RTOS
- Kỹ năng mềm: problem analysis, solving, effective communication
- Kinh nghiệm: 1 năm',
    '- 13th Salary
- Performance Bonus
- Pass probation Bonus
- Premium healthcare insurance benefits
- family medical benefit
- e-learning platform-Udemy
- Annual leave up to 17 days
- Professional and Personal Development Training Programs
- 4 Stars standard company trip in summer
- big annual Year-End-Party
- Coffee and snacks provided
- Holiday celebrations and parties for team members and family',
    'TP. Hồ Chí Minh', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((93 % 21) || ' days')::interval,
    now() + ((20 + (93 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [94/94] group 15 (IoT & Embedded): Kỹ Sư Lập Trình Nhúng
  jid := 'c27bd1bd-3231-597d-8bb7-b9e011ac4ce0'::uuid;
  cid := company_ids[10];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'Kỹ Sư Lập Trình Nhúng',
    '- Phát triển các thiết bị đầu cuối thông minh (Smart phone, Tablet), thiết bị IoT, thiết bị xử lý trí tuệ nhân tạo tại biên dựa trên các nền tảng của Qualcomm, NXP…;
- Porting hệ điều hành Android, Linux, RTOS cho các nền tảng phần cứng của Qualcomm, NXP;
- Phối hợp với bộ phận phần cứng để debug, bring up thiết bị;
- Tham gia vào tất cả các giai đoạn phát triển phần mềm từ phân tích yêu cầu, thiết kế, triển khai, kiểm tra hệ thống;
- Thực hiện các công việc được quản lý phân công;

Yêu cầu chi tiết: • Tốt nghiệp Đại học loại Khá trở lên các chuyên ngành Cơ điện tử, Điện tử - Viễn thông, Điện - tự động hóa, CNTT, Kỹ thuật máy tính;
• Tiếng Anh: TOEIC từ 550 trở lên hoặc tương đương;
• Kiến thức nền tảng
- Hệ điều hành Linux: 
+ Hiểu biết về cấu trúc và hoạt động của Linux;
+ Quản lý hệ thống, cấu hình, và sử dụng các công cụ dòng lệnh.
- Hệ điều hành Android:
+ Kiến thức về hệ điều hành Android, từ phiên bản cơ bản đến các phiên bản mới nhất;
+ Hiểu biết về Android SDK và NDK.
- Kỹ năng lập trình: Thành thạo C/C++; có kiến thức về các ngôn ngữ Java/Kotlin/Python là một lợi thế;
- Kỹ năng phát triển phần mềm
+ Quản lý mã nguồn: Sử dụng Git để quản lý và phối hợp công việc.
+ Phát triển phần mềm nhúng: Hiểu biết về các giao thức truyền thông (I2C, SPI, UART); Kinh nghiệm làm việc với các vi điều khiển và vi xử lý.
+ Hiểu biết về kiến trúc ARM, x86, SoC, ...
+ Debugging: Sử dụng các công cụ như GDB, các công cụ phân tích bộ nhớ khác.',
    '- Bằng cấp: Đại học loại Khá trở lên các chuyên ngành Cơ điện tử, Điện tử - Viễn thông, Điện - tự động hóa, CNTT, Kỹ thuật máy tính
- Kỹ năng chuyên môn: Hệ điều hành Linux, Hệ điều hành Android, C/C++, Java, Kotlin, Python, Git, I2C, SPI, UART
- Kỹ năng mềm: Kỹ năng làm việc nhóm, Giao tiếp hiệu quả
- Kinh nghiệm: Không yêu cầu',
    '- Thu nhập hấp dẫn, thưởng theo hiệu quả công việc
- Được làm việc trong Công ty sản xuất hàng đầu Việt nam
- Cơ hội được đào tạo nâng cao nghiệp vụ
- Được hưởng đầy đủ các chính sách BHXH, BHYT
- Môi trường năng động, nhiều hoạt động văn hóa',
    'Hà Nội', 'full_time'::public.employment_type,
    null, null, 'VND', 'published',
    now() - ((94 % 21) || ' days')::interval,
    now() + ((20 + (94 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

end $$;
-- === END VIETJOBS-IT-SEED ===
