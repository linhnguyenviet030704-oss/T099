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
  applicant_ids uuid[] := '{}';
  form_user_ids uuid[] := '{}';
  full_name text;
  email text;
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
    'Falcon Security VN'
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

  -- [1/10] group 1 (Software Development): Senior Mobile Developer
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

  -- [2/10] group 2 (DevOps/Infrastructure): DevOps Engineer Middle Level
  jid := '6ed7b553-746b-55df-8958-a3fefb9ff56b'::uuid;
  cid := company_ids[2];
  insert into public.job_posts (
    id, company_id, created_by_user_id, title, description, requirements,
    benefits, location, employment_type, salary_min, salary_max, currency,
    status, published_at, deadline_at
  ) values (
    jid, cid, recruiter_id, 'DevOps Engineer Middle Level',
    'Thiết kế, thực hiện và duy trì các đường ống tích hợp liên tục và triển khai liên tục (CI/CD) để tự động hóa các quy trình phân phối phần mềm. Quản lý và tối ưu hóa cơ sở hạ tầng đám mây trên các nền tảng như AWS, Azure hoặc Google Cloud để đảm bảo khả năng mở rộng, độ tin cậy và hiệu quả chi phí. Thực hiện và duy trì các công cụ quan sát (ví dụ: Datadog, Elk, Grafana, Prometheus, Sentry). Xác định và giám sát các chỉ số cấp độ dịch vụ (SLI), mục tiêu cấp độ dịch vụ (SLO) và đảm bảo tuân thủ các thỏa thuận cấp độ dịch vụ (SLA) để duy trì độ tin cậy của hệ thống cao. Tự động hóa các quy trình triển khai, thử nghiệm và giám sát để tăng cường hiệu quả và giảm thiểu can thiệp thủ công. Phối hợp với các nhóm phát triển để thiết kế và thực hiện các giải pháp có thể mở rộng, có thể bảo trì và an toàn. Giám sát hiệu suất hệ thống, khắc phục sự cố và thực hiện các giải pháp để đảm bảo tính khả dụng cao và thời gian chết tối thiểu. Tham gia đánh giá mã, cung cấp phản hồi cho các nhà phát triển về các nguyên tắc thực tiễn và DevOps tốt nhất. Luôn cập nhật các công cụ, công nghệ và phương pháp mới nhất của DevOps để thúc đẩy cải tiến liên tục trong các quy trình. Đảm bảo các tiêu chuẩn bảo mật và tuân thủ được tích hợp vào tất cả các thực tiễn của DevOps.

Yêu cầu chi tiết: 1. Must Have: 2 - 4 years of experience in a DevOps or related role, such as systems administration or software engineering with a focus on automation. Proven experience in designing and managing CI/CD pipelines and cloud-based infrastructure. Proficiency in scripting languages such as Bash, Python, or Go. Strong knowledge of containerization technologies, including Docker and Kubernetes. Familiarity with version control systems, particularly Git. Experience with cloud platforms like AWS, Azure, or Google Cloud. Experience with infrastructure as code tools like Terraform. Proficiency in monitoring and logging tools such as Datadog, ELK Stack, Grafana, Prometheus, Sentry, New Relic. Strong understanding of SLA, SLI, and SLO concepts and their application in ensuring system reliability and performance. Experience in on-call rotations and incident response. Strong problem-solving and analytical skills to address complex technical challenges. 2. Nice to have: Certifications in cloud platforms (AWS, Azure, GCP). Experience working in agile development environments and familiarity with agile methodologies, especially Scrum. Document infrastructure, deployment processes, and incident resolutions to support team knowledge and operational consistency. Good command of English (Listening, Reading, Writing).',
    '- Bằng cấp: Đại Học trở lên
- Kỹ năng chuyên môn: CI/CD pipelines, AWS, Azure, Google Cloud, Bash, Python, Go, Docker, Kubernetes, Git, Terraform, Datadog, ELK Stack, Grafana, Prometheus, Sentry
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
    now() - ((2 % 21) || ' days')::interval,
    now() + ((20 + (2 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [3/10] group 3 (System Administration): Chuyên Viên IT Helpdesk
  jid := '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd'::uuid;
  cid := company_ids[3];
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
    now() - ((3 % 21) || ' days')::interval,
    now() + ((20 + (3 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [4/10] group 4 (Cybersecurity): Senior Pentest
  jid := 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac'::uuid;
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
    now() - ((4 % 21) || ' days')::interval,
    now() + ((20 + (4 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [5/10] group 5 (Data): Data Analyst
  jid := '87af7aff-a2b6-534f-a79f-72a337b8273e'::uuid;
  cid := company_ids[5];
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
    now() - ((5 % 21) || ' days')::interval,
    now() + ((20 + (5 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [6/10] group 6 (AI/ML): Kỹ Sư Trí Tuệ Nhân Tạo - AI/ Deep Learing/ Computer Vision
  jid := '456a83d7-876e-5487-9a36-db85e70c5dc9'::uuid;
  cid := company_ids[6];
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
    now() - ((6 % 21) || ' days')::interval,
    now() + ((20 + (6 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [7/10] group 7 (QA/Testing): Chuyên Viên Kiểm Thử
  jid := '644919cf-d485-567c-b03e-62ba618e78b1'::uuid;
  cid := company_ids[7];
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
    now() - ((7 % 21) || ' days')::interval,
    now() + ((20 + (7 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [8/10] group 8 (Project/Product Management): Chuyên Viên Cao Cấp Phân Tích Nghiệp Vụ (Thẻ & Hóa Đơn Điện Tử)
  jid := '116e8b11-78ab-5dbb-85d2-ada26ef3fa78'::uuid;
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
    now() - ((8 % 21) || ' days')::interval,
    now() + ((20 + (8 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [9/10] group 9 (Architecture): Kiến trúc sư giải pháp
  jid := '0206a38a-1c02-518d-9e63-4ee28e9b3df9'::uuid;
  cid := company_ids[9];
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
    now() - ((9 % 21) || ' days')::interval,
    now() + ((20 + (9 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

  -- [10/10] group 10 (Networking): Kỹ sư mạng cao cấp
  jid := '1700d323-d774-5b20-935e-6f040b44b90a'::uuid;
  cid := company_ids[10];
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
    now() - ((10 % 21) || ' days')::interval,
    now() + ((20 + (10 % 45)) || ' days')::interval
  )
  on conflict (id) do nothing;

end $$;
-- === END VIETJOBS-IT-SEED ===

-- === BEGIN GENERATED-CV-SEED (generated by scripts/seed_generated_cvs.py) ===
-- Synthetic IT resumes (data_find/generated_cv/metadata.csv) seeded as
-- candidate accounts + job_submits against the VIETJOBS-IT-SEED job_posts
-- above (same group), capped at 15 CVs per group, so they act as the demo
-- application pool for CV<->JD matching (match_resumes_for_job joins
-- through job_submits). PDF bytes are rendered from the markdown copied
-- into supabase/seed_assets/cvs/ and uploaded separately -- see
-- scripts/seed_upload_generated_cvs.py.
-- Regenerate with: python scripts/seed_generated_cvs.py
-- Do not hand-edit the rows below -- the block gets replaced wholesale.

-- G1-BE-01 (group 1 Software Development / Backend Developer): Backend Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'g1-be-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Do Hoang Nam'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
  jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111'::text, 'email', 'g1-be-01@seed.local'),
  'email', '11111111-1111-1111-1111-111111111111'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '76be3951-6d78-58e2-b3f9-45967fa95f50', '11111111-1111-1111-1111-111111111111', 'resumes',
  '11111111-1111-1111-1111-111111111111/resumes/76be3951-6d78-58e2-b3f9-45967fa95f50/g1-be-01.pdf',
  'g1-be-01.pdf',
  'Backend Engineer',
  'application/pdf', 588604, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'e4092db4-2d4d-50e0-b5ca-def272bb9d4e', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', '11111111-1111-1111-1111-111111111111', '76be3951-6d78-58e2-b3f9-45967fa95f50',
  'Cover letter -- Backend Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G1-BE-02 (group 1 Software Development / Backend Developer): .NET Backend Developer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '2500f3af-afcc-524a-a509-7bcbadf3fbfa',
  'authenticated', 'authenticated', 'g1-be-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vu Thi Lan Huong'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '2500f3af-afcc-524a-a509-7bcbadf3fbfa',
  jsonb_build_object('sub', '2500f3af-afcc-524a-a509-7bcbadf3fbfa'::text, 'email', 'g1-be-02@seed.local'),
  'email', '2500f3af-afcc-524a-a509-7bcbadf3fbfa'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '9cd1764d-30e3-5984-9feb-c4b45ef4708a', '2500f3af-afcc-524a-a509-7bcbadf3fbfa', 'resumes',
  '2500f3af-afcc-524a-a509-7bcbadf3fbfa/resumes/9cd1764d-30e3-5984-9feb-c4b45ef4708a/g1-be-02.pdf',
  'g1-be-02.pdf',
  '.NET Backend Developer',
  'application/pdf', 586737, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '083050ec-85dd-51ee-a25a-c15fb2a5b917', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', '2500f3af-afcc-524a-a509-7bcbadf3fbfa', '9cd1764d-30e3-5984-9feb-c4b45ef4708a',
  'Cover letter -- .NET Backend Developer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G1-BE-03 (group 1 Software Development / Backend Developer): Senior Backend Developer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '51ef0c90-9a94-5129-8962-5a7b4d36e0e6',
  'authenticated', 'authenticated', 'g1-be-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Le Tuan Kiet'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '51ef0c90-9a94-5129-8962-5a7b4d36e0e6',
  jsonb_build_object('sub', '51ef0c90-9a94-5129-8962-5a7b4d36e0e6'::text, 'email', 'g1-be-03@seed.local'),
  'email', '51ef0c90-9a94-5129-8962-5a7b4d36e0e6'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '49d7e3bf-9dd5-563c-8cdd-0e162c46abc0', '51ef0c90-9a94-5129-8962-5a7b4d36e0e6', 'resumes',
  '51ef0c90-9a94-5129-8962-5a7b4d36e0e6/resumes/49d7e3bf-9dd5-563c-8cdd-0e162c46abc0/g1-be-03.pdf',
  'g1-be-03.pdf',
  'Senior Backend Developer',
  'application/pdf', 589048, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '86eaa242-bbf7-51bf-ba2e-7011bed4db1e', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', '51ef0c90-9a94-5129-8962-5a7b4d36e0e6', '49d7e3bf-9dd5-563c-8cdd-0e162c46abc0',
  'Cover letter -- Senior Backend Developer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '86eaa242-bbf7-51bf-ba2e-7011bed4db1e', '22222222-2222-2222-2222-222222222222', 'screening'::public.application_status,
  'Seed pipeline screening', false
);

-- G1-BE-04 (group 1 Software Development / Backend Developer): Backend Developer Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '6aaa47ba-48c6-55fb-83d2-222905c70ed9',
  'authenticated', 'authenticated', 'g1-be-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Minh Quan'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '6aaa47ba-48c6-55fb-83d2-222905c70ed9',
  jsonb_build_object('sub', '6aaa47ba-48c6-55fb-83d2-222905c70ed9'::text, 'email', 'g1-be-04@seed.local'),
  'email', '6aaa47ba-48c6-55fb-83d2-222905c70ed9'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '3fa90416-317c-5f80-8087-e0fabb898ab9', '6aaa47ba-48c6-55fb-83d2-222905c70ed9', 'resumes',
  '6aaa47ba-48c6-55fb-83d2-222905c70ed9/resumes/3fa90416-317c-5f80-8087-e0fabb898ab9/g1-be-04.pdf',
  'g1-be-04.pdf',
  'Backend Developer Intern',
  'application/pdf', 588102, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '633135be-1159-5b86-8e36-f4d65c8702ef', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', '6aaa47ba-48c6-55fb-83d2-222905c70ed9', '3fa90416-317c-5f80-8087-e0fabb898ab9',
  'Cover letter -- Backend Developer Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G1-BE-05 (group 1 Software Development / Backend Developer): Backend Developer (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '96fbc5c6-eb2d-57bc-aace-98f3dd21f1e0',
  'authenticated', 'authenticated', 'g1-be-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Le Van Phuc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '96fbc5c6-eb2d-57bc-aace-98f3dd21f1e0',
  jsonb_build_object('sub', '96fbc5c6-eb2d-57bc-aace-98f3dd21f1e0'::text, 'email', 'g1-be-05@seed.local'),
  'email', '96fbc5c6-eb2d-57bc-aace-98f3dd21f1e0'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '92da0d08-4633-5ece-82b7-f9ae54ee6a72', '96fbc5c6-eb2d-57bc-aace-98f3dd21f1e0', 'resumes',
  '96fbc5c6-eb2d-57bc-aace-98f3dd21f1e0/resumes/92da0d08-4633-5ece-82b7-f9ae54ee6a72/g1-be-05.pdf',
  'g1-be-05.pdf',
  'Backend Developer (Fresher)',
  'application/pdf', 587528, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '3d5fee31-9a25-512a-986e-270dd0ee9c71', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', '96fbc5c6-eb2d-57bc-aace-98f3dd21f1e0', '92da0d08-4633-5ece-82b7-f9ae54ee6a72',
  'Cover letter -- Backend Developer (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G1-BE-06 (group 1 Software Development / Backend Developer): Senior Backend Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '74c34304-f75f-5515-a949-dcdf07dc90d5',
  'authenticated', 'authenticated', 'g1-be-06@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Thi Thu Trang'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '74c34304-f75f-5515-a949-dcdf07dc90d5',
  jsonb_build_object('sub', '74c34304-f75f-5515-a949-dcdf07dc90d5'::text, 'email', 'g1-be-06@seed.local'),
  'email', '74c34304-f75f-5515-a949-dcdf07dc90d5'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '41bcfa39-9bff-5d0b-bf35-cd59f714a76e', '74c34304-f75f-5515-a949-dcdf07dc90d5', 'resumes',
  '74c34304-f75f-5515-a949-dcdf07dc90d5/resumes/41bcfa39-9bff-5d0b-bf35-cd59f714a76e/g1-be-06.pdf',
  'g1-be-06.pdf',
  'Senior Backend Engineer',
  'application/pdf', 589208, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'daa1be30-cf47-56c2-9aa3-6e55fc550b28', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', '74c34304-f75f-5515-a949-dcdf07dc90d5', '41bcfa39-9bff-5d0b-bf35-cd59f714a76e',
  'Cover letter -- Senior Backend Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'daa1be30-cf47-56c2-9aa3-6e55fc550b28', '22222222-2222-2222-2222-222222222222', 'interview'::public.application_status,
  'Seed pipeline interview', false
);

-- G1-BE-07 (group 1 Software Development / Backend Developer): Backend Developer Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '537398a9-235f-512d-bbad-f0a358ccb16b',
  'authenticated', 'authenticated', 'g1-be-07@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Do Van Hieu'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '537398a9-235f-512d-bbad-f0a358ccb16b',
  jsonb_build_object('sub', '537398a9-235f-512d-bbad-f0a358ccb16b'::text, 'email', 'g1-be-07@seed.local'),
  'email', '537398a9-235f-512d-bbad-f0a358ccb16b'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '7ecdd12a-e721-5e1c-8475-f3db078f5d45', '537398a9-235f-512d-bbad-f0a358ccb16b', 'resumes',
  '537398a9-235f-512d-bbad-f0a358ccb16b/resumes/7ecdd12a-e721-5e1c-8475-f3db078f5d45/g1-be-07.pdf',
  'g1-be-07.pdf',
  'Backend Developer Intern',
  'application/pdf', 587967, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '5fe9b333-13d7-5131-944f-df4439d7009b', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', '537398a9-235f-512d-bbad-f0a358ccb16b', '7ecdd12a-e721-5e1c-8475-f3db078f5d45',
  'Cover letter -- Backend Developer Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G1-BE-08 (group 1 Software Development / Backend Developer): Backend Developer Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '49bf9b14-f829-554c-99f2-2e4ddfa902ff',
  'authenticated', 'authenticated', 'g1-be-08@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Le Thi My Linh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '49bf9b14-f829-554c-99f2-2e4ddfa902ff',
  jsonb_build_object('sub', '49bf9b14-f829-554c-99f2-2e4ddfa902ff'::text, 'email', 'g1-be-08@seed.local'),
  'email', '49bf9b14-f829-554c-99f2-2e4ddfa902ff'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '37934444-b912-5f50-9a03-86faf1b5d130', '49bf9b14-f829-554c-99f2-2e4ddfa902ff', 'resumes',
  '49bf9b14-f829-554c-99f2-2e4ddfa902ff/resumes/37934444-b912-5f50-9a03-86faf1b5d130/g1-be-08.pdf',
  'g1-be-08.pdf',
  'Backend Developer Intern',
  'application/pdf', 587910, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '13c21902-3995-56ac-8025-46ef3f5e67a6', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', '49bf9b14-f829-554c-99f2-2e4ddfa902ff', '37934444-b912-5f50-9a03-86faf1b5d130',
  'Cover letter -- Backend Developer Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G1-BE-09 (group 1 Software Development / Backend Developer): Backend Developer Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '5e391f21-c6b3-5182-8a65-418ef36323d2',
  'authenticated', 'authenticated', 'g1-be-09@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Duc Long'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '5e391f21-c6b3-5182-8a65-418ef36323d2',
  jsonb_build_object('sub', '5e391f21-c6b3-5182-8a65-418ef36323d2'::text, 'email', 'g1-be-09@seed.local'),
  'email', '5e391f21-c6b3-5182-8a65-418ef36323d2'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '8ea19dcc-4234-5ea2-ad45-41759f0c4b18', '5e391f21-c6b3-5182-8a65-418ef36323d2', 'resumes',
  '5e391f21-c6b3-5182-8a65-418ef36323d2/resumes/8ea19dcc-4234-5ea2-ad45-41759f0c4b18/g1-be-09.pdf',
  'g1-be-09.pdf',
  'Backend Developer Intern',
  'application/pdf', 587854, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '34517bc8-fbc6-525a-b7e0-18e335c2a488', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', '5e391f21-c6b3-5182-8a65-418ef36323d2', '8ea19dcc-4234-5ea2-ad45-41759f0c4b18',
  'Cover letter -- Backend Developer Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '34517bc8-fbc6-525a-b7e0-18e335c2a488', '22222222-2222-2222-2222-222222222222', 'offer'::public.application_status,
  'Seed pipeline offer', false
);

-- G1-DT-01 (group 1 Software Development / Desktop Application Developer): Senior Software Engineer (WPF/.NET)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '4c55f98f-cf59-5b16-97fe-f36bc6acd46f',
  'authenticated', 'authenticated', 'g1-dt-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Van Tung'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '4c55f98f-cf59-5b16-97fe-f36bc6acd46f',
  jsonb_build_object('sub', '4c55f98f-cf59-5b16-97fe-f36bc6acd46f'::text, 'email', 'g1-dt-01@seed.local'),
  'email', '4c55f98f-cf59-5b16-97fe-f36bc6acd46f'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'aa10a113-b0f4-578c-b417-37a711139149', '4c55f98f-cf59-5b16-97fe-f36bc6acd46f', 'resumes',
  '4c55f98f-cf59-5b16-97fe-f36bc6acd46f/resumes/aa10a113-b0f4-578c-b417-37a711139149/g1-dt-01.pdf',
  'g1-dt-01.pdf',
  'Senior Software Engineer (WPF/.NET)',
  'application/pdf', 589219, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '623b307e-3821-50fa-8076-10113a7d6ffc', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', '4c55f98f-cf59-5b16-97fe-f36bc6acd46f', 'aa10a113-b0f4-578c-b417-37a711139149',
  'Cover letter -- Senior Software Engineer (WPF/.NET)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G1-DT-02 (group 1 Software Development / Desktop Application Developer): Java Desktop Developer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '74ffeaa5-b058-5585-a492-2643ba85bb36',
  'authenticated', 'authenticated', 'g1-dt-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Trinh Cong Minh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '74ffeaa5-b058-5585-a492-2643ba85bb36',
  jsonb_build_object('sub', '74ffeaa5-b058-5585-a492-2643ba85bb36'::text, 'email', 'g1-dt-02@seed.local'),
  'email', '74ffeaa5-b058-5585-a492-2643ba85bb36'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '696f5cb2-5642-536b-9a38-2310e1dc195c', '74ffeaa5-b058-5585-a492-2643ba85bb36', 'resumes',
  '74ffeaa5-b058-5585-a492-2643ba85bb36/resumes/696f5cb2-5642-536b-9a38-2310e1dc195c/g1-dt-02.pdf',
  'g1-dt-02.pdf',
  'Java Desktop Developer',
  'application/pdf', 586785, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '7c835d9c-91da-563e-93a8-d49cfcebd43e', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', '74ffeaa5-b058-5585-a492-2643ba85bb36', '696f5cb2-5642-536b-9a38-2310e1dc195c',
  'Cover letter -- Java Desktop Developer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G1-DT-03 (group 1 Software Development / Desktop Application Developer): Senior Software Engineer (C++/Qt)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'e54f9699-9f02-5a74-a2bf-43fa851066fa',
  'authenticated', 'authenticated', 'g1-dt-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Ha Minh Duc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'e54f9699-9f02-5a74-a2bf-43fa851066fa',
  jsonb_build_object('sub', 'e54f9699-9f02-5a74-a2bf-43fa851066fa'::text, 'email', 'g1-dt-03@seed.local'),
  'email', 'e54f9699-9f02-5a74-a2bf-43fa851066fa'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '1b5f93fb-67f8-5174-93a1-c8268f7293bb', 'e54f9699-9f02-5a74-a2bf-43fa851066fa', 'resumes',
  'e54f9699-9f02-5a74-a2bf-43fa851066fa/resumes/1b5f93fb-67f8-5174-93a1-c8268f7293bb/g1-dt-03.pdf',
  'g1-dt-03.pdf',
  'Senior Software Engineer (C++/Qt)',
  'application/pdf', 589404, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '98f605e4-3c22-550e-a774-f82bcae525a9', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', 'e54f9699-9f02-5a74-a2bf-43fa851066fa', '1b5f93fb-67f8-5174-93a1-c8268f7293bb',
  'Cover letter -- Senior Software Engineer (C++/Qt)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '98f605e4-3c22-550e-a774-f82bcae525a9', '22222222-2222-2222-2222-222222222222', 'rejected'::public.application_status,
  'Seed pipeline rejected', false
);

-- G1-DT-04 (group 1 Software Development / Desktop Application Developer): Desktop Application Developer Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '9b4abc03-5af5-5860-b753-4e5b5576c4fb',
  'authenticated', 'authenticated', 'g1-dt-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Dinh Thi Thao'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '9b4abc03-5af5-5860-b753-4e5b5576c4fb',
  jsonb_build_object('sub', '9b4abc03-5af5-5860-b753-4e5b5576c4fb'::text, 'email', 'g1-dt-04@seed.local'),
  'email', '9b4abc03-5af5-5860-b753-4e5b5576c4fb'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '2b7eeaea-6098-57c9-814a-4faab05820e4', '9b4abc03-5af5-5860-b753-4e5b5576c4fb', 'resumes',
  '9b4abc03-5af5-5860-b753-4e5b5576c4fb/resumes/2b7eeaea-6098-57c9-814a-4faab05820e4/g1-dt-04.pdf',
  'g1-dt-04.pdf',
  'Desktop Application Developer Intern',
  'application/pdf', 588032, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '6cf9d3b3-d607-5a23-adf5-a5505dc0dfcb', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', '9b4abc03-5af5-5860-b753-4e5b5576c4fb', '2b7eeaea-6098-57c9-814a-4faab05820e4',
  'Cover letter -- Desktop Application Developer Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G1-DT-05 (group 1 Software Development / Desktop Application Developer): Desktop Application Developer (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'b752b13f-1d11-520c-98f6-b287043369c9',
  'authenticated', 'authenticated', 'g1-dt-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Dang Thi Thu Trang'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'b752b13f-1d11-520c-98f6-b287043369c9',
  jsonb_build_object('sub', 'b752b13f-1d11-520c-98f6-b287043369c9'::text, 'email', 'g1-dt-05@seed.local'),
  'email', 'b752b13f-1d11-520c-98f6-b287043369c9'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'a0619a1a-5075-585e-91e8-c10cfd65eca0', 'b752b13f-1d11-520c-98f6-b287043369c9', 'resumes',
  'b752b13f-1d11-520c-98f6-b287043369c9/resumes/a0619a1a-5075-585e-91e8-c10cfd65eca0/g1-dt-05.pdf',
  'g1-dt-05.pdf',
  'Desktop Application Developer (Fresher)',
  'application/pdf', 587348, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '93b2aa14-7da1-5858-8e3e-fec2c2521aa3', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', 'b752b13f-1d11-520c-98f6-b287043369c9', 'a0619a1a-5075-585e-91e8-c10cfd65eca0',
  'Cover letter -- Desktop Application Developer (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G1-DT-06 (group 1 Software Development / Desktop Application Developer): Senior Software Engineer (Electron/TypeScript)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '1748b7c9-9b49-5502-8dad-044ed134c1b8',
  'authenticated', 'authenticated', 'g1-dt-06@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Ngo Thi Kim Ngan'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '1748b7c9-9b49-5502-8dad-044ed134c1b8',
  jsonb_build_object('sub', '1748b7c9-9b49-5502-8dad-044ed134c1b8'::text, 'email', 'g1-dt-06@seed.local'),
  'email', '1748b7c9-9b49-5502-8dad-044ed134c1b8'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '835233a9-0f07-5097-b41c-7694f338d1bc', '1748b7c9-9b49-5502-8dad-044ed134c1b8', 'resumes',
  '1748b7c9-9b49-5502-8dad-044ed134c1b8/resumes/835233a9-0f07-5097-b41c-7694f338d1bc/g1-dt-06.pdf',
  'g1-dt-06.pdf',
  'Senior Software Engineer (Electron/TypeScript)',
  'application/pdf', 589510, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '0f0e4e1b-ae5a-5cd3-973b-2aa28b6e715b', 'b1a71b69-20b5-5ccc-a8bd-087664d77801', '1748b7c9-9b49-5502-8dad-044ed134c1b8', '835233a9-0f07-5097-b41c-7694f338d1bc',
  'Cover letter -- Senior Software Engineer (Electron/TypeScript)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '0f0e4e1b-ae5a-5cd3-973b-2aa28b6e715b', '22222222-2222-2222-2222-222222222222', 'screening'::public.application_status,
  'Seed pipeline screening', false
);

-- G2-CL-01 (group 2 DevOps/Infrastructure / Cloud Engineer): Senior Cloud Engineer (AWS)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '255dbd02-98c8-5d16-b6b6-99f99de6b649',
  'authenticated', 'authenticated', 'g2-cl-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vo Thanh Tung'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '255dbd02-98c8-5d16-b6b6-99f99de6b649',
  jsonb_build_object('sub', '255dbd02-98c8-5d16-b6b6-99f99de6b649'::text, 'email', 'g2-cl-01@seed.local'),
  'email', '255dbd02-98c8-5d16-b6b6-99f99de6b649'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '3fd61c4a-d3b1-5e51-8984-01c2f5237f48', '255dbd02-98c8-5d16-b6b6-99f99de6b649', 'resumes',
  '255dbd02-98c8-5d16-b6b6-99f99de6b649/resumes/3fd61c4a-d3b1-5e51-8984-01c2f5237f48/g2-cl-01.pdf',
  'g2-cl-01.pdf',
  'Senior Cloud Engineer (AWS)',
  'application/pdf', 589978, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'c476e393-4089-5ab5-99b4-bfd29a16c892', '6ed7b553-746b-55df-8958-a3fefb9ff56b', '255dbd02-98c8-5d16-b6b6-99f99de6b649', '3fd61c4a-d3b1-5e51-8984-01c2f5237f48',
  'Cover letter -- Senior Cloud Engineer (AWS)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G2-CL-02 (group 2 DevOps/Infrastructure / Cloud Engineer): Junior Cloud Engineer (Azure)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'b6343557-85d3-5273-9fb7-b632983e0aa4',
  'authenticated', 'authenticated', 'g2-cl-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Bui Thi Ngoc Anh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'b6343557-85d3-5273-9fb7-b632983e0aa4',
  jsonb_build_object('sub', 'b6343557-85d3-5273-9fb7-b632983e0aa4'::text, 'email', 'g2-cl-02@seed.local'),
  'email', 'b6343557-85d3-5273-9fb7-b632983e0aa4'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '5dcb50f7-4ca4-50e6-875c-4d685f60ba09', 'b6343557-85d3-5273-9fb7-b632983e0aa4', 'resumes',
  'b6343557-85d3-5273-9fb7-b632983e0aa4/resumes/5dcb50f7-4ca4-50e6-875c-4d685f60ba09/g2-cl-02.pdf',
  'g2-cl-02.pdf',
  'Junior Cloud Engineer (Azure)',
  'application/pdf', 587073, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'ebfb94d6-14a7-52d3-a30c-3cc93d9154a1', '6ed7b553-746b-55df-8958-a3fefb9ff56b', 'b6343557-85d3-5273-9fb7-b632983e0aa4', '5dcb50f7-4ca4-50e6-875c-4d685f60ba09',
  'Cover letter -- Junior Cloud Engineer (Azure)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G2-CL-03 (group 2 DevOps/Infrastructure / Cloud Engineer): Cloud Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '20abcc71-2335-5a7a-b488-0b7062d8857f',
  'authenticated', 'authenticated', 'g2-cl-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Hoang Gia Bao'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '20abcc71-2335-5a7a-b488-0b7062d8857f',
  jsonb_build_object('sub', '20abcc71-2335-5a7a-b488-0b7062d8857f'::text, 'email', 'g2-cl-03@seed.local'),
  'email', '20abcc71-2335-5a7a-b488-0b7062d8857f'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '053ccaad-d3d5-520c-bc99-fba947709225', '20abcc71-2335-5a7a-b488-0b7062d8857f', 'resumes',
  '20abcc71-2335-5a7a-b488-0b7062d8857f/resumes/053ccaad-d3d5-520c-bc99-fba947709225/g2-cl-03.pdf',
  'g2-cl-03.pdf',
  'Cloud Engineer',
  'application/pdf', 589895, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'ae8ff4f8-8f59-5827-8c28-30ee791b79bd', '6ed7b553-746b-55df-8958-a3fefb9ff56b', '20abcc71-2335-5a7a-b488-0b7062d8857f', '053ccaad-d3d5-520c-bc99-fba947709225',
  'Cover letter -- Cloud Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'ae8ff4f8-8f59-5827-8c28-30ee791b79bd', '22222222-2222-2222-2222-222222222222', 'interview'::public.application_status,
  'Seed pipeline interview', false
);

-- G2-CL-04 (group 2 DevOps/Infrastructure / Cloud Engineer): Cloud Engineer Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '5658f764-8615-5c6e-9ced-daf3739b89b4',
  'authenticated', 'authenticated', 'g2-cl-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Nhat Minh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '5658f764-8615-5c6e-9ced-daf3739b89b4',
  jsonb_build_object('sub', '5658f764-8615-5c6e-9ced-daf3739b89b4'::text, 'email', 'g2-cl-04@seed.local'),
  'email', '5658f764-8615-5c6e-9ced-daf3739b89b4'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '3d5f53e8-69cc-5f5d-a0f7-ea42501f5f59', '5658f764-8615-5c6e-9ced-daf3739b89b4', 'resumes',
  '5658f764-8615-5c6e-9ced-daf3739b89b4/resumes/3d5f53e8-69cc-5f5d-a0f7-ea42501f5f59/g2-cl-04.pdf',
  'g2-cl-04.pdf',
  'Cloud Engineer Intern',
  'application/pdf', 588266, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '9dcca6e4-fc70-5b74-84c0-a5475f9605a1', '6ed7b553-746b-55df-8958-a3fefb9ff56b', '5658f764-8615-5c6e-9ced-daf3739b89b4', '3d5f53e8-69cc-5f5d-a0f7-ea42501f5f59',
  'Cover letter -- Cloud Engineer Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G2-CL-05 (group 2 DevOps/Infrastructure / Cloud Engineer): Cloud Engineer (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'f78dd822-0d79-56ee-b461-da794c450b00',
  'authenticated', 'authenticated', 'g2-cl-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Bui Thi Kim Ngan'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'f78dd822-0d79-56ee-b461-da794c450b00',
  jsonb_build_object('sub', 'f78dd822-0d79-56ee-b461-da794c450b00'::text, 'email', 'g2-cl-05@seed.local'),
  'email', 'f78dd822-0d79-56ee-b461-da794c450b00'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '0a2446a5-c2d3-5aaa-954f-1af09ef3a9c9', 'f78dd822-0d79-56ee-b461-da794c450b00', 'resumes',
  'f78dd822-0d79-56ee-b461-da794c450b00/resumes/0a2446a5-c2d3-5aaa-954f-1af09ef3a9c9/g2-cl-05.pdf',
  'g2-cl-05.pdf',
  'Cloud Engineer (Fresher)',
  'application/pdf', 587508, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '897969eb-2716-500d-9b96-7ab91349539c', '6ed7b553-746b-55df-8958-a3fefb9ff56b', 'f78dd822-0d79-56ee-b461-da794c450b00', '0a2446a5-c2d3-5aaa-954f-1af09ef3a9c9',
  'Cover letter -- Cloud Engineer (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G2-CL-06 (group 2 DevOps/Infrastructure / Cloud Engineer): Senior Cloud Engineer (Azure)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '1f514bff-2674-5a72-8489-89356dfe525a',
  'authenticated', 'authenticated', 'g2-cl-06@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Ngo Thi Hai Yen'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '1f514bff-2674-5a72-8489-89356dfe525a',
  jsonb_build_object('sub', '1f514bff-2674-5a72-8489-89356dfe525a'::text, 'email', 'g2-cl-06@seed.local'),
  'email', '1f514bff-2674-5a72-8489-89356dfe525a'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '4b17e0a5-b208-5f32-a250-7bcd4fcd0115', '1f514bff-2674-5a72-8489-89356dfe525a', 'resumes',
  '1f514bff-2674-5a72-8489-89356dfe525a/resumes/4b17e0a5-b208-5f32-a250-7bcd4fcd0115/g2-cl-06.pdf',
  'g2-cl-06.pdf',
  'Senior Cloud Engineer (Azure)',
  'application/pdf', 590047, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '60f0d4cb-6f08-5d13-bfef-eed8a440728c', '6ed7b553-746b-55df-8958-a3fefb9ff56b', '1f514bff-2674-5a72-8489-89356dfe525a', '4b17e0a5-b208-5f32-a250-7bcd4fcd0115',
  'Cover letter -- Senior Cloud Engineer (Azure)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '60f0d4cb-6f08-5d13-bfef-eed8a440728c', '22222222-2222-2222-2222-222222222222', 'offer'::public.application_status,
  'Seed pipeline offer', false
);

-- G2-CL-07 (group 2 DevOps/Infrastructure / Cloud Engineer): Cloud Engineer Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'd8e7e290-c13e-5fcc-b669-f833c6c3289e',
  'authenticated', 'authenticated', 'g2-cl-07@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Dang Tuan Kiet'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'd8e7e290-c13e-5fcc-b669-f833c6c3289e',
  jsonb_build_object('sub', 'd8e7e290-c13e-5fcc-b669-f833c6c3289e'::text, 'email', 'g2-cl-07@seed.local'),
  'email', 'd8e7e290-c13e-5fcc-b669-f833c6c3289e'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'c269445e-c76d-55d1-8156-045a74c6d350', 'd8e7e290-c13e-5fcc-b669-f833c6c3289e', 'resumes',
  'd8e7e290-c13e-5fcc-b669-f833c6c3289e/resumes/c269445e-c76d-55d1-8156-045a74c6d350/g2-cl-07.pdf',
  'g2-cl-07.pdf',
  'Cloud Engineer Intern',
  'application/pdf', 588178, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'bf6e8536-e34e-59e0-9e5b-342f934e797b', '6ed7b553-746b-55df-8958-a3fefb9ff56b', 'd8e7e290-c13e-5fcc-b669-f833c6c3289e', 'c269445e-c76d-55d1-8156-045a74c6d350',
  'Cover letter -- Cloud Engineer Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G2-CL-08 (group 2 DevOps/Infrastructure / Cloud Engineer): Cloud Engineer Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'ac1c4ff3-c820-5417-ba9d-334755b57a13',
  'authenticated', 'authenticated', 'g2-cl-08@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Thi Phuong Thao'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'ac1c4ff3-c820-5417-ba9d-334755b57a13',
  jsonb_build_object('sub', 'ac1c4ff3-c820-5417-ba9d-334755b57a13'::text, 'email', 'g2-cl-08@seed.local'),
  'email', 'ac1c4ff3-c820-5417-ba9d-334755b57a13'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '0e2393af-b53d-513d-82bc-14a93745c157', 'ac1c4ff3-c820-5417-ba9d-334755b57a13', 'resumes',
  'ac1c4ff3-c820-5417-ba9d-334755b57a13/resumes/0e2393af-b53d-513d-82bc-14a93745c157/g2-cl-08.pdf',
  'g2-cl-08.pdf',
  'Cloud Engineer Intern',
  'application/pdf', 588230, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '1cbf67bb-1488-5898-965e-7a6ef2e7ca90', '6ed7b553-746b-55df-8958-a3fefb9ff56b', 'ac1c4ff3-c820-5417-ba9d-334755b57a13', '0e2393af-b53d-513d-82bc-14a93745c157',
  'Cover letter -- Cloud Engineer Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G2-CL-09 (group 2 DevOps/Infrastructure / Cloud Engineer): Cloud Engineer Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '82b08ead-3227-5a76-929e-3c3b080a3607',
  'authenticated', 'authenticated', 'g2-cl-09@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Ho Quoc Dung'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '82b08ead-3227-5a76-929e-3c3b080a3607',
  jsonb_build_object('sub', '82b08ead-3227-5a76-929e-3c3b080a3607'::text, 'email', 'g2-cl-09@seed.local'),
  'email', '82b08ead-3227-5a76-929e-3c3b080a3607'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'a351433f-a9c8-5727-aa60-01d935bee1ab', '82b08ead-3227-5a76-929e-3c3b080a3607', 'resumes',
  '82b08ead-3227-5a76-929e-3c3b080a3607/resumes/a351433f-a9c8-5727-aa60-01d935bee1ab/g2-cl-09.pdf',
  'g2-cl-09.pdf',
  'Cloud Engineer Intern',
  'application/pdf', 588028, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '1f5c9aec-1918-5384-9d1d-7396ffbd6d2f', '6ed7b553-746b-55df-8958-a3fefb9ff56b', '82b08ead-3227-5a76-929e-3c3b080a3607', 'a351433f-a9c8-5727-aa60-01d935bee1ab',
  'Cover letter -- Cloud Engineer Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '1f5c9aec-1918-5384-9d1d-7396ffbd6d2f', '22222222-2222-2222-2222-222222222222', 'rejected'::public.application_status,
  'Seed pipeline rejected', false
);

-- G2-DO-01 (group 2 DevOps/Infrastructure / DevOps Engineer): Senior DevOps Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '5b366720-bc3a-5489-b7ba-6129c7f84ad3',
  'authenticated', 'authenticated', 'g2-do-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Hoang Long'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '5b366720-bc3a-5489-b7ba-6129c7f84ad3',
  jsonb_build_object('sub', '5b366720-bc3a-5489-b7ba-6129c7f84ad3'::text, 'email', 'g2-do-01@seed.local'),
  'email', '5b366720-bc3a-5489-b7ba-6129c7f84ad3'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'a7008da1-77ae-57ba-bebd-2e3ee331463f', '5b366720-bc3a-5489-b7ba-6129c7f84ad3', 'resumes',
  '5b366720-bc3a-5489-b7ba-6129c7f84ad3/resumes/a7008da1-77ae-57ba-bebd-2e3ee331463f/g2-do-01.pdf',
  'g2-do-01.pdf',
  'Senior DevOps Engineer',
  'application/pdf', 590363, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '3479dc7a-0876-5fd8-8e2f-066411eab1cc', '6ed7b553-746b-55df-8958-a3fefb9ff56b', '5b366720-bc3a-5489-b7ba-6129c7f84ad3', 'a7008da1-77ae-57ba-bebd-2e3ee331463f',
  'Cover letter -- Senior DevOps Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G2-DO-02 (group 2 DevOps/Infrastructure / DevOps Engineer): DevOps Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '99d71e65-1980-5798-be8e-767ead305cd6',
  'authenticated', 'authenticated', 'g2-do-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Tran Minh Hieu'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '99d71e65-1980-5798-be8e-767ead305cd6',
  jsonb_build_object('sub', '99d71e65-1980-5798-be8e-767ead305cd6'::text, 'email', 'g2-do-02@seed.local'),
  'email', '99d71e65-1980-5798-be8e-767ead305cd6'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '251aedcd-1402-5421-af9a-8d9932264160', '99d71e65-1980-5798-be8e-767ead305cd6', 'resumes',
  '99d71e65-1980-5798-be8e-767ead305cd6/resumes/251aedcd-1402-5421-af9a-8d9932264160/g2-do-02.pdf',
  'g2-do-02.pdf',
  'DevOps Engineer',
  'application/pdf', 587078, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '5ff0b4f5-d89c-5510-a04f-ce7bf7d8c381', '6ed7b553-746b-55df-8958-a3fefb9ff56b', '99d71e65-1980-5798-be8e-767ead305cd6', '251aedcd-1402-5421-af9a-8d9932264160',
  'Cover letter -- DevOps Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G2-DO-03 (group 2 DevOps/Infrastructure / DevOps Engineer): DevOps Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'be9ab773-644f-5ee9-93d8-d474997bbb13',
  'authenticated', 'authenticated', 'g2-do-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Le Thi Bich Ngoc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'be9ab773-644f-5ee9-93d8-d474997bbb13',
  jsonb_build_object('sub', 'be9ab773-644f-5ee9-93d8-d474997bbb13'::text, 'email', 'g2-do-03@seed.local'),
  'email', 'be9ab773-644f-5ee9-93d8-d474997bbb13'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '02d4fbd0-6f46-56db-ab06-9676f04a6e30', 'be9ab773-644f-5ee9-93d8-d474997bbb13', 'resumes',
  'be9ab773-644f-5ee9-93d8-d474997bbb13/resumes/02d4fbd0-6f46-56db-ab06-9676f04a6e30/g2-do-03.pdf',
  'g2-do-03.pdf',
  'DevOps Engineer',
  'application/pdf', 589562, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '8333cea2-ff22-5ee3-9e0a-b2f07f24adeb', '6ed7b553-746b-55df-8958-a3fefb9ff56b', 'be9ab773-644f-5ee9-93d8-d474997bbb13', '02d4fbd0-6f46-56db-ab06-9676f04a6e30',
  'Cover letter -- DevOps Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '8333cea2-ff22-5ee3-9e0a-b2f07f24adeb', '22222222-2222-2222-2222-222222222222', 'screening'::public.application_status,
  'Seed pipeline screening', false
);

-- G2-DO-04 (group 2 DevOps/Infrastructure / DevOps Engineer): DevOps Engineer Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '807e3316-166a-55c0-8fd0-2d73f0398197',
  'authenticated', 'authenticated', 'g2-do-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vu Minh Khoi'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '807e3316-166a-55c0-8fd0-2d73f0398197',
  jsonb_build_object('sub', '807e3316-166a-55c0-8fd0-2d73f0398197'::text, 'email', 'g2-do-04@seed.local'),
  'email', '807e3316-166a-55c0-8fd0-2d73f0398197'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'f73dd32c-b35c-5a93-a916-6a9542d3277d', '807e3316-166a-55c0-8fd0-2d73f0398197', 'resumes',
  '807e3316-166a-55c0-8fd0-2d73f0398197/resumes/f73dd32c-b35c-5a93-a916-6a9542d3277d/g2-do-04.pdf',
  'g2-do-04.pdf',
  'DevOps Engineer Intern',
  'application/pdf', 588251, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '5cbe09fb-9bc1-5d70-a31d-efe2e4eef65b', '6ed7b553-746b-55df-8958-a3fefb9ff56b', '807e3316-166a-55c0-8fd0-2d73f0398197', 'f73dd32c-b35c-5a93-a916-6a9542d3277d',
  'Cover letter -- DevOps Engineer Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G2-DO-05 (group 2 DevOps/Infrastructure / DevOps Engineer): DevOps Engineer (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'b059b94e-168d-5dea-8eb7-aefc7b3cb159',
  'authenticated', 'authenticated', 'g2-do-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Van Hieu'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'b059b94e-168d-5dea-8eb7-aefc7b3cb159',
  jsonb_build_object('sub', 'b059b94e-168d-5dea-8eb7-aefc7b3cb159'::text, 'email', 'g2-do-05@seed.local'),
  'email', 'b059b94e-168d-5dea-8eb7-aefc7b3cb159'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'd00b8941-bddd-569f-a092-4729112d5516', 'b059b94e-168d-5dea-8eb7-aefc7b3cb159', 'resumes',
  'b059b94e-168d-5dea-8eb7-aefc7b3cb159/resumes/d00b8941-bddd-569f-a092-4729112d5516/g2-do-05.pdf',
  'g2-do-05.pdf',
  'DevOps Engineer (Fresher)',
  'application/pdf', 587531, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'd50a66f2-e79a-5e9e-a6e6-0261d7c368a1', '6ed7b553-746b-55df-8958-a3fefb9ff56b', 'b059b94e-168d-5dea-8eb7-aefc7b3cb159', 'd00b8941-bddd-569f-a092-4729112d5516',
  'Cover letter -- DevOps Engineer (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G2-DO-06 (group 2 DevOps/Infrastructure / DevOps Engineer): Senior DevOps Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'ab9c5d84-000b-58fb-83a0-17b787fa5566',
  'authenticated', 'authenticated', 'g2-do-06@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Bui Xuan Thang'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'ab9c5d84-000b-58fb-83a0-17b787fa5566',
  jsonb_build_object('sub', 'ab9c5d84-000b-58fb-83a0-17b787fa5566'::text, 'email', 'g2-do-06@seed.local'),
  'email', 'ab9c5d84-000b-58fb-83a0-17b787fa5566'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '371165c9-e613-51bf-8c41-e9147eec96f0', 'ab9c5d84-000b-58fb-83a0-17b787fa5566', 'resumes',
  'ab9c5d84-000b-58fb-83a0-17b787fa5566/resumes/371165c9-e613-51bf-8c41-e9147eec96f0/g2-do-06.pdf',
  'g2-do-06.pdf',
  'Senior DevOps Engineer',
  'application/pdf', 590053, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'd77f0621-b5d2-54fd-b8ed-142f4a1fcea0', '6ed7b553-746b-55df-8958-a3fefb9ff56b', 'ab9c5d84-000b-58fb-83a0-17b787fa5566', '371165c9-e613-51bf-8c41-e9147eec96f0',
  'Cover letter -- Senior DevOps Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'd77f0621-b5d2-54fd-b8ed-142f4a1fcea0', '22222222-2222-2222-2222-222222222222', 'interview'::public.application_status,
  'Seed pipeline interview', false
);

-- G3-OP-01 (group 3 System Administration / IT Operations): IT Operations Lead
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'cd4a5fe3-423f-5c29-a856-020cc48c7fe4',
  'authenticated', 'authenticated', 'g3-op-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Truong Anh Duy'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'cd4a5fe3-423f-5c29-a856-020cc48c7fe4',
  jsonb_build_object('sub', 'cd4a5fe3-423f-5c29-a856-020cc48c7fe4'::text, 'email', 'g3-op-01@seed.local'),
  'email', 'cd4a5fe3-423f-5c29-a856-020cc48c7fe4'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '735043b2-cec8-5f97-9b2a-f55e83655272', 'cd4a5fe3-423f-5c29-a856-020cc48c7fe4', 'resumes',
  'cd4a5fe3-423f-5c29-a856-020cc48c7fe4/resumes/735043b2-cec8-5f97-9b2a-f55e83655272/g3-op-01.pdf',
  'g3-op-01.pdf',
  'IT Operations Lead',
  'application/pdf', 590163, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'd1837fe7-3546-591e-bdd8-73666954e430', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', 'cd4a5fe3-423f-5c29-a856-020cc48c7fe4', '735043b2-cec8-5f97-9b2a-f55e83655272',
  'Cover letter -- IT Operations Lead'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G3-OP-02 (group 3 System Administration / IT Operations): NOC Operator
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '855fcec8-cdeb-5260-a74d-ff4050f8d9ac',
  'authenticated', 'authenticated', 'g3-op-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Le Thi Ha Phuong'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '855fcec8-cdeb-5260-a74d-ff4050f8d9ac',
  jsonb_build_object('sub', '855fcec8-cdeb-5260-a74d-ff4050f8d9ac'::text, 'email', 'g3-op-02@seed.local'),
  'email', '855fcec8-cdeb-5260-a74d-ff4050f8d9ac'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '5f4f0999-9318-55b1-94e0-3cd1b9a52743', '855fcec8-cdeb-5260-a74d-ff4050f8d9ac', 'resumes',
  '855fcec8-cdeb-5260-a74d-ff4050f8d9ac/resumes/5f4f0999-9318-55b1-94e0-3cd1b9a52743/g3-op-02.pdf',
  'g3-op-02.pdf',
  'NOC Operator',
  'application/pdf', 587083, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '91981f92-dee4-5f3b-a847-1b5460af518d', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', '855fcec8-cdeb-5260-a74d-ff4050f8d9ac', '5f4f0999-9318-55b1-94e0-3cd1b9a52743',
  'Cover letter -- NOC Operator'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G3-OP-03 (group 3 System Administration / IT Operations): Senior IT Operations Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '93a1de6b-36b2-5d5d-a3e9-5bc90c42caa6',
  'authenticated', 'authenticated', 'g3-op-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Duc Manh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '93a1de6b-36b2-5d5d-a3e9-5bc90c42caa6',
  jsonb_build_object('sub', '93a1de6b-36b2-5d5d-a3e9-5bc90c42caa6'::text, 'email', 'g3-op-03@seed.local'),
  'email', '93a1de6b-36b2-5d5d-a3e9-5bc90c42caa6'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'd1471b34-c75b-5094-b867-46e9c88bea19', '93a1de6b-36b2-5d5d-a3e9-5bc90c42caa6', 'resumes',
  '93a1de6b-36b2-5d5d-a3e9-5bc90c42caa6/resumes/d1471b34-c75b-5094-b867-46e9c88bea19/g3-op-03.pdf',
  'g3-op-03.pdf',
  'Senior IT Operations Engineer',
  'application/pdf', 590139, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'a1cb597b-2b5f-540b-bc57-e306f16a09e5', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', '93a1de6b-36b2-5d5d-a3e9-5bc90c42caa6', 'd1471b34-c75b-5094-b867-46e9c88bea19',
  'Cover letter -- Senior IT Operations Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'a1cb597b-2b5f-540b-bc57-e306f16a09e5', '22222222-2222-2222-2222-222222222222', 'offer'::public.application_status,
  'Seed pipeline offer', false
);

-- G3-OP-04 (group 3 System Administration / IT Operations): IT Operations Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '63d0fae7-8415-5419-a885-be25781af73f',
  'authenticated', 'authenticated', 'g3-op-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Hoang Minh Duc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '63d0fae7-8415-5419-a885-be25781af73f',
  jsonb_build_object('sub', '63d0fae7-8415-5419-a885-be25781af73f'::text, 'email', 'g3-op-04@seed.local'),
  'email', '63d0fae7-8415-5419-a885-be25781af73f'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '8e882286-68ca-5b1a-a416-4234b71b31e2', '63d0fae7-8415-5419-a885-be25781af73f', 'resumes',
  '63d0fae7-8415-5419-a885-be25781af73f/resumes/8e882286-68ca-5b1a-a416-4234b71b31e2/g3-op-04.pdf',
  'g3-op-04.pdf',
  'IT Operations Intern',
  'application/pdf', 588471, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '31b05207-0e93-58c4-8ab2-26dafb801623', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', '63d0fae7-8415-5419-a885-be25781af73f', '8e882286-68ca-5b1a-a416-4234b71b31e2',
  'Cover letter -- IT Operations Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G3-OP-05 (group 3 System Administration / IT Operations): IT Operations (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '95528a90-a0ee-5455-859a-672fa96d5129',
  'authenticated', 'authenticated', 'g3-op-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Tran Van Loc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '95528a90-a0ee-5455-859a-672fa96d5129',
  jsonb_build_object('sub', '95528a90-a0ee-5455-859a-672fa96d5129'::text, 'email', 'g3-op-05@seed.local'),
  'email', '95528a90-a0ee-5455-859a-672fa96d5129'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '4f9de339-e3f8-503f-af38-e0219dfc3b95', '95528a90-a0ee-5455-859a-672fa96d5129', 'resumes',
  '95528a90-a0ee-5455-859a-672fa96d5129/resumes/4f9de339-e3f8-503f-af38-e0219dfc3b95/g3-op-05.pdf',
  'g3-op-05.pdf',
  'IT Operations (Fresher)',
  'application/pdf', 587285, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '83566d64-b4d5-53e3-9616-b84bc7dd932b', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', '95528a90-a0ee-5455-859a-672fa96d5129', '4f9de339-e3f8-503f-af38-e0219dfc3b95',
  'Cover letter -- IT Operations (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G3-OP-06 (group 3 System Administration / IT Operations): Senior IT Operations Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'e6f14e40-6f05-51d1-9044-02181b8f1b87',
  'authenticated', 'authenticated', 'g3-op-06@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vu Hoang Nam'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'e6f14e40-6f05-51d1-9044-02181b8f1b87',
  jsonb_build_object('sub', 'e6f14e40-6f05-51d1-9044-02181b8f1b87'::text, 'email', 'g3-op-06@seed.local'),
  'email', 'e6f14e40-6f05-51d1-9044-02181b8f1b87'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '1cf2e661-f76a-5d6c-b7e5-d4b8403192cd', 'e6f14e40-6f05-51d1-9044-02181b8f1b87', 'resumes',
  'e6f14e40-6f05-51d1-9044-02181b8f1b87/resumes/1cf2e661-f76a-5d6c-b7e5-d4b8403192cd/g3-op-06.pdf',
  'g3-op-06.pdf',
  'Senior IT Operations Engineer',
  'application/pdf', 589536, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '288d771a-4117-5428-b2b7-5e67085690da', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', 'e6f14e40-6f05-51d1-9044-02181b8f1b87', '1cf2e661-f76a-5d6c-b7e5-d4b8403192cd',
  'Cover letter -- Senior IT Operations Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '288d771a-4117-5428-b2b7-5e67085690da', '22222222-2222-2222-2222-222222222222', 'rejected'::public.application_status,
  'Seed pipeline rejected', false
);

-- G3-OP-07 (group 3 System Administration / IT Operations): IT Operations Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '4c37838a-9702-55fe-8455-c0a2ac9987b3',
  'authenticated', 'authenticated', 'g3-op-07@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Thi Khanh Linh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '4c37838a-9702-55fe-8455-c0a2ac9987b3',
  jsonb_build_object('sub', '4c37838a-9702-55fe-8455-c0a2ac9987b3'::text, 'email', 'g3-op-07@seed.local'),
  'email', '4c37838a-9702-55fe-8455-c0a2ac9987b3'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '6732f25d-b343-534c-9663-0f8010c4c5bb', '4c37838a-9702-55fe-8455-c0a2ac9987b3', 'resumes',
  '4c37838a-9702-55fe-8455-c0a2ac9987b3/resumes/6732f25d-b343-534c-9663-0f8010c4c5bb/g3-op-07.pdf',
  'g3-op-07.pdf',
  'IT Operations Intern',
  'application/pdf', 588265, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '219ab7d2-00cb-5b3f-af4b-9391fdc43a49', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', '4c37838a-9702-55fe-8455-c0a2ac9987b3', '6732f25d-b343-534c-9663-0f8010c4c5bb',
  'Cover letter -- IT Operations Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G3-OP-08 (group 3 System Administration / IT Operations): IT Operations Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '01bb4676-d40f-580b-8e29-5dc9394ca156',
  'authenticated', 'authenticated', 'g3-op-08@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Tran Van Khai'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '01bb4676-d40f-580b-8e29-5dc9394ca156',
  jsonb_build_object('sub', '01bb4676-d40f-580b-8e29-5dc9394ca156'::text, 'email', 'g3-op-08@seed.local'),
  'email', '01bb4676-d40f-580b-8e29-5dc9394ca156'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'f718940d-2ea4-5970-9345-e8515a132408', '01bb4676-d40f-580b-8e29-5dc9394ca156', 'resumes',
  '01bb4676-d40f-580b-8e29-5dc9394ca156/resumes/f718940d-2ea4-5970-9345-e8515a132408/g3-op-08.pdf',
  'g3-op-08.pdf',
  'IT Operations Intern',
  'application/pdf', 588160, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '854e6e46-6550-5764-95f5-ad4461048c0f', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', '01bb4676-d40f-580b-8e29-5dc9394ca156', 'f718940d-2ea4-5970-9345-e8515a132408',
  'Cover letter -- IT Operations Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G3-OP-09 (group 3 System Administration / IT Operations): IT Operations Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '1206177a-0703-59d8-b46a-1083b1e8f9be',
  'authenticated', 'authenticated', 'g3-op-09@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Thi Lan Phuong'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '1206177a-0703-59d8-b46a-1083b1e8f9be',
  jsonb_build_object('sub', '1206177a-0703-59d8-b46a-1083b1e8f9be'::text, 'email', 'g3-op-09@seed.local'),
  'email', '1206177a-0703-59d8-b46a-1083b1e8f9be'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '30a373af-38b7-5463-9d1e-d01866d584b3', '1206177a-0703-59d8-b46a-1083b1e8f9be', 'resumes',
  '1206177a-0703-59d8-b46a-1083b1e8f9be/resumes/30a373af-38b7-5463-9d1e-d01866d584b3/g3-op-09.pdf',
  'g3-op-09.pdf',
  'IT Operations Intern',
  'application/pdf', 588182, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '66f059f6-4bf4-5ed7-aed0-932aaecffb54', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', '1206177a-0703-59d8-b46a-1083b1e8f9be', '30a373af-38b7-5463-9d1e-d01866d584b3',
  'Cover letter -- IT Operations Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '66f059f6-4bf4-5ed7-aed0-932aaecffb54', '22222222-2222-2222-2222-222222222222', 'screening'::public.application_status,
  'Seed pipeline screening', false
);

-- G3-HD-01 (group 3 System Administration / IT Support/Helpdesk): Service Desk Team Leader
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '6ecc578e-216f-5312-ad16-c4f66bf14d01',
  'authenticated', 'authenticated', 'g3-hd-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vo Minh Tam'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '6ecc578e-216f-5312-ad16-c4f66bf14d01',
  jsonb_build_object('sub', '6ecc578e-216f-5312-ad16-c4f66bf14d01'::text, 'email', 'g3-hd-01@seed.local'),
  'email', '6ecc578e-216f-5312-ad16-c4f66bf14d01'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'c0459a14-0def-5401-97b5-9b382d182182', '6ecc578e-216f-5312-ad16-c4f66bf14d01', 'resumes',
  '6ecc578e-216f-5312-ad16-c4f66bf14d01/resumes/c0459a14-0def-5401-97b5-9b382d182182/g3-hd-01.pdf',
  'g3-hd-01.pdf',
  'Service Desk Team Leader',
  'application/pdf', 590102, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'ebce5ae0-f0c1-5245-a8ba-77bc8de6fb68', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', '6ecc578e-216f-5312-ad16-c4f66bf14d01', 'c0459a14-0def-5401-97b5-9b382d182182',
  'Cover letter -- Service Desk Team Leader'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G3-HD-02 (group 3 System Administration / IT Support/Helpdesk): IT Helpdesk
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '9881e86d-1da2-5088-b1a9-a0803680f3eb',
  'authenticated', 'authenticated', 'g3-hd-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Van Loc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '9881e86d-1da2-5088-b1a9-a0803680f3eb',
  jsonb_build_object('sub', '9881e86d-1da2-5088-b1a9-a0803680f3eb'::text, 'email', 'g3-hd-02@seed.local'),
  'email', '9881e86d-1da2-5088-b1a9-a0803680f3eb'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'dfbae3ad-a373-53d1-872c-448b295a477d', '9881e86d-1da2-5088-b1a9-a0803680f3eb', 'resumes',
  '9881e86d-1da2-5088-b1a9-a0803680f3eb/resumes/dfbae3ad-a373-53d1-872c-448b295a477d/g3-hd-02.pdf',
  'g3-hd-02.pdf',
  'IT Helpdesk',
  'application/pdf', 586805, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '929e8783-3272-5c32-88b6-718466ad48c1', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', '9881e86d-1da2-5088-b1a9-a0803680f3eb', 'dfbae3ad-a373-53d1-872c-448b295a477d',
  'Cover letter -- IT Helpdesk'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G3-HD-03 (group 3 System Administration / IT Support/Helpdesk): IT Support Specialist
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '0bf3b9b2-9b23-5d19-800f-83c42b67cef9',
  'authenticated', 'authenticated', 'g3-hd-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Hoang Thi Thanh Truc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '0bf3b9b2-9b23-5d19-800f-83c42b67cef9',
  jsonb_build_object('sub', '0bf3b9b2-9b23-5d19-800f-83c42b67cef9'::text, 'email', 'g3-hd-03@seed.local'),
  'email', '0bf3b9b2-9b23-5d19-800f-83c42b67cef9'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'a806c5cc-ef89-52c4-9fb6-f09e5d18f08d', '0bf3b9b2-9b23-5d19-800f-83c42b67cef9', 'resumes',
  '0bf3b9b2-9b23-5d19-800f-83c42b67cef9/resumes/a806c5cc-ef89-52c4-9fb6-f09e5d18f08d/g3-hd-03.pdf',
  'g3-hd-03.pdf',
  'IT Support Specialist',
  'application/pdf', 589677, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '1593bd67-f1a4-53dc-aa12-4e0654d66435', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', '0bf3b9b2-9b23-5d19-800f-83c42b67cef9', 'a806c5cc-ef89-52c4-9fb6-f09e5d18f08d',
  'Cover letter -- IT Support Specialist'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '1593bd67-f1a4-53dc-aa12-4e0654d66435', '22222222-2222-2222-2222-222222222222', 'interview'::public.application_status,
  'Seed pipeline interview', false
);

-- G3-HD-04 (group 3 System Administration / IT Support/Helpdesk): IT Support/Helpdesk Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'ca454cd1-1cf7-5902-88b7-af4456b55b31',
  'authenticated', 'authenticated', 'g3-hd-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vo Minh Khoi'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'ca454cd1-1cf7-5902-88b7-af4456b55b31',
  jsonb_build_object('sub', 'ca454cd1-1cf7-5902-88b7-af4456b55b31'::text, 'email', 'g3-hd-04@seed.local'),
  'email', 'ca454cd1-1cf7-5902-88b7-af4456b55b31'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '1e4a703b-32c8-5960-93ad-88685d8f5e53', 'ca454cd1-1cf7-5902-88b7-af4456b55b31', 'resumes',
  'ca454cd1-1cf7-5902-88b7-af4456b55b31/resumes/1e4a703b-32c8-5960-93ad-88685d8f5e53/g3-hd-04.pdf',
  'g3-hd-04.pdf',
  'IT Support/Helpdesk Intern',
  'application/pdf', 588129, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '081c65fc-ac03-50bb-b0aa-ed382a5ed6cc', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', 'ca454cd1-1cf7-5902-88b7-af4456b55b31', '1e4a703b-32c8-5960-93ad-88685d8f5e53',
  'Cover letter -- IT Support/Helpdesk Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G3-HD-05 (group 3 System Administration / IT Support/Helpdesk): IT Support/Helpdesk (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'bc1cd750-f645-583e-b83d-8767d14d45eb',
  'authenticated', 'authenticated', 'g3-hd-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Thi Bich Ngoc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'bc1cd750-f645-583e-b83d-8767d14d45eb',
  jsonb_build_object('sub', 'bc1cd750-f645-583e-b83d-8767d14d45eb'::text, 'email', 'g3-hd-05@seed.local'),
  'email', 'bc1cd750-f645-583e-b83d-8767d14d45eb'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'e9371fe5-77a1-543a-9bc1-776af74c513c', 'bc1cd750-f645-583e-b83d-8767d14d45eb', 'resumes',
  'bc1cd750-f645-583e-b83d-8767d14d45eb/resumes/e9371fe5-77a1-543a-9bc1-776af74c513c/g3-hd-05.pdf',
  'g3-hd-05.pdf',
  'IT Support/Helpdesk (Fresher)',
  'application/pdf', 587450, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '61a00be9-2f4d-53d9-8480-8b2420d802ad', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', 'bc1cd750-f645-583e-b83d-8767d14d45eb', 'e9371fe5-77a1-543a-9bc1-776af74c513c',
  'Cover letter -- IT Support/Helpdesk (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G3-HD-06 (group 3 System Administration / IT Support/Helpdesk): Senior IT Support Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '5cead10c-a73e-576e-9444-9846e89bd1cb',
  'authenticated', 'authenticated', 'g3-hd-06@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Thanh Son'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '5cead10c-a73e-576e-9444-9846e89bd1cb',
  jsonb_build_object('sub', '5cead10c-a73e-576e-9444-9846e89bd1cb'::text, 'email', 'g3-hd-06@seed.local'),
  'email', '5cead10c-a73e-576e-9444-9846e89bd1cb'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'a5d6e21f-8fac-5b51-a180-ab13a1c416bb', '5cead10c-a73e-576e-9444-9846e89bd1cb', 'resumes',
  '5cead10c-a73e-576e-9444-9846e89bd1cb/resumes/a5d6e21f-8fac-5b51-a180-ab13a1c416bb/g3-hd-06.pdf',
  'g3-hd-06.pdf',
  'Senior IT Support Engineer',
  'application/pdf', 589511, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'f27c372e-5cfd-53da-8fbd-018ba2a0af49', '5665b34b-a3e9-5ba4-8ef2-416c4d8e1bfd', '5cead10c-a73e-576e-9444-9846e89bd1cb', 'a5d6e21f-8fac-5b51-a180-ab13a1c416bb',
  'Cover letter -- Senior IT Support Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'f27c372e-5cfd-53da-8fbd-018ba2a0af49', '22222222-2222-2222-2222-222222222222', 'offer'::public.application_status,
  'Seed pipeline offer', false
);

-- G4-GRC-01 (group 4 Cybersecurity / GRC (Governance, Risk and Compliance)): Senior Information Security GRC Manager
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'd7f22349-fbf6-5887-8c7e-55f528aa26c2',
  'authenticated', 'authenticated', 'g4-grc-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Luong Thi Minh Chau'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'd7f22349-fbf6-5887-8c7e-55f528aa26c2',
  jsonb_build_object('sub', 'd7f22349-fbf6-5887-8c7e-55f528aa26c2'::text, 'email', 'g4-grc-01@seed.local'),
  'email', 'd7f22349-fbf6-5887-8c7e-55f528aa26c2'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '7d4e8a5e-7ec9-5fa7-852c-907d9700e707', 'd7f22349-fbf6-5887-8c7e-55f528aa26c2', 'resumes',
  'd7f22349-fbf6-5887-8c7e-55f528aa26c2/resumes/7d4e8a5e-7ec9-5fa7-852c-907d9700e707/g4-grc-01.pdf',
  'g4-grc-01.pdf',
  'Senior Information Security GRC Manager',
  'application/pdf', 590321, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'fcf9f60d-1e1a-514f-a6e1-f5abbb12b787', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', 'd7f22349-fbf6-5887-8c7e-55f528aa26c2', '7d4e8a5e-7ec9-5fa7-852c-907d9700e707',
  'Cover letter -- Senior Information Security GRC Manager'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G4-GRC-02 (group 4 Cybersecurity / GRC (Governance, Risk and Compliance)): Information Security Compliance Officer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '1f8a72fd-b654-5bd4-8752-1b961eb51f6c',
  'authenticated', 'authenticated', 'g4-grc-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Huu Phuc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '1f8a72fd-b654-5bd4-8752-1b961eb51f6c',
  jsonb_build_object('sub', '1f8a72fd-b654-5bd4-8752-1b961eb51f6c'::text, 'email', 'g4-grc-02@seed.local'),
  'email', '1f8a72fd-b654-5bd4-8752-1b961eb51f6c'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'bf135c6c-d25d-5d11-ac66-feb8201cfd27', '1f8a72fd-b654-5bd4-8752-1b961eb51f6c', 'resumes',
  '1f8a72fd-b654-5bd4-8752-1b961eb51f6c/resumes/bf135c6c-d25d-5d11-ac66-feb8201cfd27/g4-grc-02.pdf',
  'g4-grc-02.pdf',
  'Information Security Compliance Officer',
  'application/pdf', 587061, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'fa6ebc6a-3e7b-5e15-b9f6-e4825583b279', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', '1f8a72fd-b654-5bd4-8752-1b961eb51f6c', 'bf135c6c-d25d-5d11-ac66-feb8201cfd27',
  'Cover letter -- Information Security Compliance Officer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G4-GRC-03 (group 4 Cybersecurity / GRC (Governance, Risk and Compliance)): Security Governance Lead (programme and systems)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'eccd97f2-257f-512f-b44c-f9f367d39198',
  'authenticated', 'authenticated', 'g4-grc-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vo Quoc Trung'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'eccd97f2-257f-512f-b44c-f9f367d39198',
  jsonb_build_object('sub', 'eccd97f2-257f-512f-b44c-f9f367d39198'::text, 'email', 'g4-grc-03@seed.local'),
  'email', 'eccd97f2-257f-512f-b44c-f9f367d39198'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '4f8c83e1-0a34-5b72-8531-c72458582948', 'eccd97f2-257f-512f-b44c-f9f367d39198', 'resumes',
  'eccd97f2-257f-512f-b44c-f9f367d39198/resumes/4f8c83e1-0a34-5b72-8531-c72458582948/g4-grc-03.pdf',
  'g4-grc-03.pdf',
  'Security Governance Lead (programme and systems)',
  'application/pdf', 590368, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '70798def-7ad7-5ff8-b4fc-dc11650d0fdc', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', 'eccd97f2-257f-512f-b44c-f9f367d39198', '4f8c83e1-0a34-5b72-8531-c72458582948',
  'Cover letter -- Security Governance Lead (programme and systems)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '70798def-7ad7-5ff8-b4fc-dc11650d0fdc', '22222222-2222-2222-2222-222222222222', 'rejected'::public.application_status,
  'Seed pipeline rejected', false
);

-- G4-GRC-04 (group 4 Cybersecurity / GRC (Governance, Risk and Compliance)): GRC Analyst Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'fed74127-d5d0-5b74-bd22-ab7749cfb5a9',
  'authenticated', 'authenticated', 'g4-grc-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Thi Phuong Mai'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'fed74127-d5d0-5b74-bd22-ab7749cfb5a9',
  jsonb_build_object('sub', 'fed74127-d5d0-5b74-bd22-ab7749cfb5a9'::text, 'email', 'g4-grc-04@seed.local'),
  'email', 'fed74127-d5d0-5b74-bd22-ab7749cfb5a9'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'f3a0abf7-645f-56e9-8b17-7803f808f3fe', 'fed74127-d5d0-5b74-bd22-ab7749cfb5a9', 'resumes',
  'fed74127-d5d0-5b74-bd22-ab7749cfb5a9/resumes/f3a0abf7-645f-56e9-8b17-7803f808f3fe/g4-grc-04.pdf',
  'g4-grc-04.pdf',
  'GRC Analyst Intern',
  'application/pdf', 588218, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'd90becbe-430b-5cbd-bf57-e7ad1cd07053', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', 'fed74127-d5d0-5b74-bd22-ab7749cfb5a9', 'f3a0abf7-645f-56e9-8b17-7803f808f3fe',
  'Cover letter -- GRC Analyst Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G4-GRC-05 (group 4 Cybersecurity / GRC (Governance, Risk and Compliance)): GRC Analyst (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'e473fd26-9846-5b4a-8fc6-8f201c84303b',
  'authenticated', 'authenticated', 'g4-grc-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Tran Thi Kim Chi'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'e473fd26-9846-5b4a-8fc6-8f201c84303b',
  jsonb_build_object('sub', 'e473fd26-9846-5b4a-8fc6-8f201c84303b'::text, 'email', 'g4-grc-05@seed.local'),
  'email', 'e473fd26-9846-5b4a-8fc6-8f201c84303b'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'b437f392-a59a-5201-a56a-eef7a4d31801', 'e473fd26-9846-5b4a-8fc6-8f201c84303b', 'resumes',
  'e473fd26-9846-5b4a-8fc6-8f201c84303b/resumes/b437f392-a59a-5201-a56a-eef7a4d31801/g4-grc-05.pdf',
  'g4-grc-05.pdf',
  'GRC Analyst (Fresher)',
  'application/pdf', 587407, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '7be62cfb-0d2e-5f77-a6b0-b722872693de', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', 'e473fd26-9846-5b4a-8fc6-8f201c84303b', 'b437f392-a59a-5201-a56a-eef7a4d31801',
  'Cover letter -- GRC Analyst (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G4-GRC-06 (group 4 Cybersecurity / GRC (Governance, Risk and Compliance)): Senior Information Security GRC Manager
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '35fd20fa-0049-50ae-86f4-898a87b011b1',
  'authenticated', 'authenticated', 'g4-grc-06@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Hoang Thi Bich Ngoc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '35fd20fa-0049-50ae-86f4-898a87b011b1',
  jsonb_build_object('sub', '35fd20fa-0049-50ae-86f4-898a87b011b1'::text, 'email', 'g4-grc-06@seed.local'),
  'email', '35fd20fa-0049-50ae-86f4-898a87b011b1'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '588b550f-5ab0-5328-98a0-c6e03dec911a', '35fd20fa-0049-50ae-86f4-898a87b011b1', 'resumes',
  '35fd20fa-0049-50ae-86f4-898a87b011b1/resumes/588b550f-5ab0-5328-98a0-c6e03dec911a/g4-grc-06.pdf',
  'g4-grc-06.pdf',
  'Senior Information Security GRC Manager',
  'application/pdf', 589472, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '17cee535-b046-5655-a610-339d4b08b6cd', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', '35fd20fa-0049-50ae-86f4-898a87b011b1', '588b550f-5ab0-5328-98a0-c6e03dec911a',
  'Cover letter -- Senior Information Security GRC Manager'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '17cee535-b046-5655-a610-339d4b08b6cd', '22222222-2222-2222-2222-222222222222', 'screening'::public.application_status,
  'Seed pipeline screening', false
);

-- G4-GRC-07 (group 4 Cybersecurity / GRC (Governance, Risk and Compliance)): GRC Analyst Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '1f5f9310-b703-5c8b-b3d6-7e0c7eca6748',
  'authenticated', 'authenticated', 'g4-grc-07@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Hoang Van Minh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '1f5f9310-b703-5c8b-b3d6-7e0c7eca6748',
  jsonb_build_object('sub', '1f5f9310-b703-5c8b-b3d6-7e0c7eca6748'::text, 'email', 'g4-grc-07@seed.local'),
  'email', '1f5f9310-b703-5c8b-b3d6-7e0c7eca6748'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '57a0c62b-9ebe-5620-962e-08894a55431e', '1f5f9310-b703-5c8b-b3d6-7e0c7eca6748', 'resumes',
  '1f5f9310-b703-5c8b-b3d6-7e0c7eca6748/resumes/57a0c62b-9ebe-5620-962e-08894a55431e/g4-grc-07.pdf',
  'g4-grc-07.pdf',
  'GRC Analyst Intern',
  'application/pdf', 588235, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '553f200f-296b-5ae0-b48d-fda11f2cab45', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', '1f5f9310-b703-5c8b-b3d6-7e0c7eca6748', '57a0c62b-9ebe-5620-962e-08894a55431e',
  'Cover letter -- GRC Analyst Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G4-GRC-08 (group 4 Cybersecurity / GRC (Governance, Risk and Compliance)): GRC Analyst Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '13fd0f22-1d3d-5895-9e67-75215eb23114',
  'authenticated', 'authenticated', 'g4-grc-08@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Tran Thi Hong Hanh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '13fd0f22-1d3d-5895-9e67-75215eb23114',
  jsonb_build_object('sub', '13fd0f22-1d3d-5895-9e67-75215eb23114'::text, 'email', 'g4-grc-08@seed.local'),
  'email', '13fd0f22-1d3d-5895-9e67-75215eb23114'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '3c685dd4-8c6b-50a7-adea-544bff6bef06', '13fd0f22-1d3d-5895-9e67-75215eb23114', 'resumes',
  '13fd0f22-1d3d-5895-9e67-75215eb23114/resumes/3c685dd4-8c6b-50a7-adea-544bff6bef06/g4-grc-08.pdf',
  'g4-grc-08.pdf',
  'GRC Analyst Intern',
  'application/pdf', 588059, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '9cc112a9-4a8e-5ba8-9521-2ccf699f1efa', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', '13fd0f22-1d3d-5895-9e67-75215eb23114', '3c685dd4-8c6b-50a7-adea-544bff6bef06',
  'Cover letter -- GRC Analyst Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G4-IR-01 (group 4 Cybersecurity / Incident Response): Incident Response Lead (DFIR)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'ef038841-0c0e-5547-82e5-8c92bcac773c',
  'authenticated', 'authenticated', 'g4-ir-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Ho Sy Nam'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'ef038841-0c0e-5547-82e5-8c92bcac773c',
  jsonb_build_object('sub', 'ef038841-0c0e-5547-82e5-8c92bcac773c'::text, 'email', 'g4-ir-01@seed.local'),
  'email', 'ef038841-0c0e-5547-82e5-8c92bcac773c'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'ab00d80c-34ae-54ea-b615-827c4d499b8f', 'ef038841-0c0e-5547-82e5-8c92bcac773c', 'resumes',
  'ef038841-0c0e-5547-82e5-8c92bcac773c/resumes/ab00d80c-34ae-54ea-b615-827c4d499b8f/g4-ir-01.pdf',
  'g4-ir-01.pdf',
  'Incident Response Lead (DFIR)',
  'application/pdf', 590487, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '3fd1ecc5-202f-54d3-af63-31acd7fa5347', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', 'ef038841-0c0e-5547-82e5-8c92bcac773c', 'ab00d80c-34ae-54ea-b615-827c4d499b8f',
  'Cover letter -- Incident Response Lead (DFIR)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '3fd1ecc5-202f-54d3-af63-31acd7fa5347', '22222222-2222-2222-2222-222222222222', 'interview'::public.application_status,
  'Seed pipeline interview', false
);

-- G4-IR-02 (group 4 Cybersecurity / Incident Response): Incident Response Analyst
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '3180a151-f713-578a-b6e1-a15aed1c7d23',
  'authenticated', 'authenticated', 'g4-ir-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Le Van Thinh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '3180a151-f713-578a-b6e1-a15aed1c7d23',
  jsonb_build_object('sub', '3180a151-f713-578a-b6e1-a15aed1c7d23'::text, 'email', 'g4-ir-02@seed.local'),
  'email', '3180a151-f713-578a-b6e1-a15aed1c7d23'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'd3d008f3-1518-5448-a984-6e486f2c30d1', '3180a151-f713-578a-b6e1-a15aed1c7d23', 'resumes',
  '3180a151-f713-578a-b6e1-a15aed1c7d23/resumes/d3d008f3-1518-5448-a984-6e486f2c30d1/g4-ir-02.pdf',
  'g4-ir-02.pdf',
  'Incident Response Analyst',
  'application/pdf', 586958, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '955750d4-f4f4-5343-9211-714787a4a1d5', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', '3180a151-f713-578a-b6e1-a15aed1c7d23', 'd3d008f3-1518-5448-a984-6e486f2c30d1',
  'Cover letter -- Incident Response Analyst'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G4-IR-03 (group 4 Cybersecurity / Incident Response): Incident Response Manager (investigation and regulatory)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'fb7c2e16-2d06-5784-898c-e7707350a086',
  'authenticated', 'authenticated', 'g4-ir-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Thi Quynh Anh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'fb7c2e16-2d06-5784-898c-e7707350a086',
  jsonb_build_object('sub', 'fb7c2e16-2d06-5784-898c-e7707350a086'::text, 'email', 'g4-ir-03@seed.local'),
  'email', 'fb7c2e16-2d06-5784-898c-e7707350a086'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '8b6a1168-7d61-5e1e-82c3-3027a9de57f5', 'fb7c2e16-2d06-5784-898c-e7707350a086', 'resumes',
  'fb7c2e16-2d06-5784-898c-e7707350a086/resumes/8b6a1168-7d61-5e1e-82c3-3027a9de57f5/g4-ir-03.pdf',
  'g4-ir-03.pdf',
  'Incident Response Manager (investigation and regulatory)',
  'application/pdf', 590373, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '8c799903-5a27-5714-8abf-1df0f26a4828', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', 'fb7c2e16-2d06-5784-898c-e7707350a086', '8b6a1168-7d61-5e1e-82c3-3027a9de57f5',
  'Cover letter -- Incident Response Manager (investigation and regulatory)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G4-IR-04 (group 4 Cybersecurity / Incident Response): Incident Response Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '55859453-890a-5fec-9305-ca2ba06ec1a3',
  'authenticated', 'authenticated', 'g4-ir-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vu Thi Thanh Thuy'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '55859453-890a-5fec-9305-ca2ba06ec1a3',
  jsonb_build_object('sub', '55859453-890a-5fec-9305-ca2ba06ec1a3'::text, 'email', 'g4-ir-04@seed.local'),
  'email', '55859453-890a-5fec-9305-ca2ba06ec1a3'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'a8fb72bc-68c0-5a59-abd8-257a2e0adea3', '55859453-890a-5fec-9305-ca2ba06ec1a3', 'resumes',
  '55859453-890a-5fec-9305-ca2ba06ec1a3/resumes/a8fb72bc-68c0-5a59-abd8-257a2e0adea3/g4-ir-04.pdf',
  'g4-ir-04.pdf',
  'Incident Response Intern',
  'application/pdf', 588399, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'fd66be0c-536f-58b8-992e-3aae7e9deef5', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', '55859453-890a-5fec-9305-ca2ba06ec1a3', 'a8fb72bc-68c0-5a59-abd8-257a2e0adea3',
  'Cover letter -- Incident Response Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'fd66be0c-536f-58b8-992e-3aae7e9deef5', '22222222-2222-2222-2222-222222222222', 'offer'::public.application_status,
  'Seed pipeline offer', false
);

-- G4-IR-05 (group 4 Cybersecurity / Incident Response): Incident Response Analyst (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '56917bd2-31f2-52d1-99e0-5a6bbdc68bec',
  'authenticated', 'authenticated', 'g4-ir-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Thi Hong'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '56917bd2-31f2-52d1-99e0-5a6bbdc68bec',
  jsonb_build_object('sub', '56917bd2-31f2-52d1-99e0-5a6bbdc68bec'::text, 'email', 'g4-ir-05@seed.local'),
  'email', '56917bd2-31f2-52d1-99e0-5a6bbdc68bec'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '7a427f9b-8681-5dee-b73e-aec9c49a9285', '56917bd2-31f2-52d1-99e0-5a6bbdc68bec', 'resumes',
  '56917bd2-31f2-52d1-99e0-5a6bbdc68bec/resumes/7a427f9b-8681-5dee-b73e-aec9c49a9285/g4-ir-05.pdf',
  'g4-ir-05.pdf',
  'Incident Response Analyst (Fresher)',
  'application/pdf', 587346, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '6f33bc00-f799-50ae-ba3e-abe171b52251', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', '56917bd2-31f2-52d1-99e0-5a6bbdc68bec', '7a427f9b-8681-5dee-b73e-aec9c49a9285',
  'Cover letter -- Incident Response Analyst (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G4-IR-06 (group 4 Cybersecurity / Incident Response): Senior Incident Response Lead (DFIR)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '379e541e-8d77-533f-aab0-1fa7e847383d',
  'authenticated', 'authenticated', 'g4-ir-06@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Dinh Cong Hieu'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '379e541e-8d77-533f-aab0-1fa7e847383d',
  jsonb_build_object('sub', '379e541e-8d77-533f-aab0-1fa7e847383d'::text, 'email', 'g4-ir-06@seed.local'),
  'email', '379e541e-8d77-533f-aab0-1fa7e847383d'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'e4075df1-a4ea-5b58-9f74-c9547eca22ab', '379e541e-8d77-533f-aab0-1fa7e847383d', 'resumes',
  '379e541e-8d77-533f-aab0-1fa7e847383d/resumes/e4075df1-a4ea-5b58-9f74-c9547eca22ab/g4-ir-06.pdf',
  'g4-ir-06.pdf',
  'Senior Incident Response Lead (DFIR)',
  'application/pdf', 589499, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'aa324242-a604-5339-9f17-00f5335d890f', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', '379e541e-8d77-533f-aab0-1fa7e847383d', 'e4075df1-a4ea-5b58-9f74-c9547eca22ab',
  'Cover letter -- Senior Incident Response Lead (DFIR)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G4-IR-07 (group 4 Cybersecurity / Incident Response): Incident Response Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a91bb3df-d195-5083-8910-f55ac8dc4249',
  'authenticated', 'authenticated', 'g4-ir-07@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Van Sang'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'a91bb3df-d195-5083-8910-f55ac8dc4249',
  jsonb_build_object('sub', 'a91bb3df-d195-5083-8910-f55ac8dc4249'::text, 'email', 'g4-ir-07@seed.local'),
  'email', 'a91bb3df-d195-5083-8910-f55ac8dc4249'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '771ff411-089d-57c0-ad63-9412ba643de1', 'a91bb3df-d195-5083-8910-f55ac8dc4249', 'resumes',
  'a91bb3df-d195-5083-8910-f55ac8dc4249/resumes/771ff411-089d-57c0-ad63-9412ba643de1/g4-ir-07.pdf',
  'g4-ir-07.pdf',
  'Incident Response Intern',
  'application/pdf', 588220, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '830ab9b7-c075-575f-bc37-54a8d68c275d', 'dc3942f6-f80b-5cbc-9a35-05c453e1b3ac', 'a91bb3df-d195-5083-8910-f55ac8dc4249', '771ff411-089d-57c0-ad63-9412ba643de1',
  'Cover letter -- Incident Response Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '830ab9b7-c075-575f-bc37-54a8d68c275d', '22222222-2222-2222-2222-222222222222', 'rejected'::public.application_status,
  'Seed pipeline rejected', false
);

-- G5-BI-01 (group 5 Data / BI Developer): Senior BI Developer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '5e444447-8bd3-5dd7-b265-956245541b94',
  'authenticated', 'authenticated', 'g5-bi-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Phan Thi Kieu Trinh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '5e444447-8bd3-5dd7-b265-956245541b94',
  jsonb_build_object('sub', '5e444447-8bd3-5dd7-b265-956245541b94'::text, 'email', 'g5-bi-01@seed.local'),
  'email', '5e444447-8bd3-5dd7-b265-956245541b94'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '67842585-9885-52b8-9a50-0065ef81b444', '5e444447-8bd3-5dd7-b265-956245541b94', 'resumes',
  '5e444447-8bd3-5dd7-b265-956245541b94/resumes/67842585-9885-52b8-9a50-0065ef81b444/g5-bi-01.pdf',
  'g5-bi-01.pdf',
  'Senior BI Developer',
  'application/pdf', 590630, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'e225db57-2539-5445-85fb-79541b25bbd2', '87af7aff-a2b6-534f-a79f-72a337b8273e', '5e444447-8bd3-5dd7-b265-956245541b94', '67842585-9885-52b8-9a50-0065ef81b444',
  'Cover letter -- Senior BI Developer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G5-BI-02 (group 5 Data / BI Developer): BI Developer (Power BI)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '26c21314-4100-507e-bd7f-b53a9c4d5916',
  'authenticated', 'authenticated', 'g5-bi-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vu Thanh Lam'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '26c21314-4100-507e-bd7f-b53a9c4d5916',
  jsonb_build_object('sub', '26c21314-4100-507e-bd7f-b53a9c4d5916'::text, 'email', 'g5-bi-02@seed.local'),
  'email', '26c21314-4100-507e-bd7f-b53a9c4d5916'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '0a6df5a2-5d8f-5f24-ab44-2199d74f69bf', '26c21314-4100-507e-bd7f-b53a9c4d5916', 'resumes',
  '26c21314-4100-507e-bd7f-b53a9c4d5916/resumes/0a6df5a2-5d8f-5f24-ab44-2199d74f69bf/g5-bi-02.pdf',
  'g5-bi-02.pdf',
  'BI Developer (Power BI)',
  'application/pdf', 587125, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'f55c4eb3-4415-5c9f-a1fe-60e098854cd9', '87af7aff-a2b6-534f-a79f-72a337b8273e', '26c21314-4100-507e-bd7f-b53a9c4d5916', '0a6df5a2-5d8f-5f24-ab44-2199d74f69bf',
  'Cover letter -- BI Developer (Power BI)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G5-BI-03 (group 5 Data / BI Developer): BI Developer / Analytics Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '3a5d4bc8-316f-5308-a50f-dc7193d8a586',
  'authenticated', 'authenticated', 'g5-bi-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Gia Phuc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '3a5d4bc8-316f-5308-a50f-dc7193d8a586',
  jsonb_build_object('sub', '3a5d4bc8-316f-5308-a50f-dc7193d8a586'::text, 'email', 'g5-bi-03@seed.local'),
  'email', '3a5d4bc8-316f-5308-a50f-dc7193d8a586'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'a327c3df-f224-5d78-8516-50f60795584c', '3a5d4bc8-316f-5308-a50f-dc7193d8a586', 'resumes',
  '3a5d4bc8-316f-5308-a50f-dc7193d8a586/resumes/a327c3df-f224-5d78-8516-50f60795584c/g5-bi-03.pdf',
  'g5-bi-03.pdf',
  'BI Developer / Analytics Engineer',
  'application/pdf', 590013, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '72fd28e7-5d45-58ee-9d30-dfc5f13c0d89', '87af7aff-a2b6-534f-a79f-72a337b8273e', '3a5d4bc8-316f-5308-a50f-dc7193d8a586', 'a327c3df-f224-5d78-8516-50f60795584c',
  'Cover letter -- BI Developer / Analytics Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '72fd28e7-5d45-58ee-9d30-dfc5f13c0d89', '22222222-2222-2222-2222-222222222222', 'screening'::public.application_status,
  'Seed pipeline screening', false
);

-- G5-BI-04 (group 5 Data / BI Developer): BI Developer Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'd721e471-7770-5fba-aa95-87826dcb7c73',
  'authenticated', 'authenticated', 'g5-bi-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Thi Quynh Anh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'd721e471-7770-5fba-aa95-87826dcb7c73',
  jsonb_build_object('sub', 'd721e471-7770-5fba-aa95-87826dcb7c73'::text, 'email', 'g5-bi-04@seed.local'),
  'email', 'd721e471-7770-5fba-aa95-87826dcb7c73'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'acbc2160-c5c0-5386-a5d3-8476f1e6ffc8', 'd721e471-7770-5fba-aa95-87826dcb7c73', 'resumes',
  'd721e471-7770-5fba-aa95-87826dcb7c73/resumes/acbc2160-c5c0-5386-a5d3-8476f1e6ffc8/g5-bi-04.pdf',
  'g5-bi-04.pdf',
  'BI Developer Intern',
  'application/pdf', 588446, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'a37fbb41-a193-5a76-9c5a-50472db405d2', '87af7aff-a2b6-534f-a79f-72a337b8273e', 'd721e471-7770-5fba-aa95-87826dcb7c73', 'acbc2160-c5c0-5386-a5d3-8476f1e6ffc8',
  'Cover letter -- BI Developer Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G5-BI-05 (group 5 Data / BI Developer): BI Developer (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'fbbfcf1e-b0b1-53cc-a2d3-3f1d3355947d',
  'authenticated', 'authenticated', 'g5-bi-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Hoang Yen'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'fbbfcf1e-b0b1-53cc-a2d3-3f1d3355947d',
  jsonb_build_object('sub', 'fbbfcf1e-b0b1-53cc-a2d3-3f1d3355947d'::text, 'email', 'g5-bi-05@seed.local'),
  'email', 'fbbfcf1e-b0b1-53cc-a2d3-3f1d3355947d'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '4d890f0e-568d-5c26-97a1-dd043635001b', 'fbbfcf1e-b0b1-53cc-a2d3-3f1d3355947d', 'resumes',
  'fbbfcf1e-b0b1-53cc-a2d3-3f1d3355947d/resumes/4d890f0e-568d-5c26-97a1-dd043635001b/g5-bi-05.pdf',
  'g5-bi-05.pdf',
  'BI Developer (Fresher)',
  'application/pdf', 587270, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'a457e840-1436-5e61-b4cb-ea41fb784c33', '87af7aff-a2b6-534f-a79f-72a337b8273e', 'fbbfcf1e-b0b1-53cc-a2d3-3f1d3355947d', '4d890f0e-568d-5c26-97a1-dd043635001b',
  'Cover letter -- BI Developer (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G5-BI-06 (group 5 Data / BI Developer): Senior BI Developer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'b81a6199-c95a-5dc5-935e-a73a7f4e31f8',
  'authenticated', 'authenticated', 'g5-bi-06@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vu Thi Thanh Huyen'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'b81a6199-c95a-5dc5-935e-a73a7f4e31f8',
  jsonb_build_object('sub', 'b81a6199-c95a-5dc5-935e-a73a7f4e31f8'::text, 'email', 'g5-bi-06@seed.local'),
  'email', 'b81a6199-c95a-5dc5-935e-a73a7f4e31f8'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '81a06936-2ac6-5b2b-8c57-c9a0527f7d96', 'b81a6199-c95a-5dc5-935e-a73a7f4e31f8', 'resumes',
  'b81a6199-c95a-5dc5-935e-a73a7f4e31f8/resumes/81a06936-2ac6-5b2b-8c57-c9a0527f7d96/g5-bi-06.pdf',
  'g5-bi-06.pdf',
  'Senior BI Developer',
  'application/pdf', 589186, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '01c890fd-ee07-5ec0-a616-1ffec6e6a043', '87af7aff-a2b6-534f-a79f-72a337b8273e', 'b81a6199-c95a-5dc5-935e-a73a7f4e31f8', '81a06936-2ac6-5b2b-8c57-c9a0527f7d96',
  'Cover letter -- Senior BI Developer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '01c890fd-ee07-5ec0-a616-1ffec6e6a043', '22222222-2222-2222-2222-222222222222', 'interview'::public.application_status,
  'Seed pipeline interview', false
);

-- G5-BI-07 (group 5 Data / BI Developer): BI Developer Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '6c6a4f09-6023-5703-bcf2-d0346e7cb053',
  'authenticated', 'authenticated', 'g5-bi-07@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Do Thi Que Anh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '6c6a4f09-6023-5703-bcf2-d0346e7cb053',
  jsonb_build_object('sub', '6c6a4f09-6023-5703-bcf2-d0346e7cb053'::text, 'email', 'g5-bi-07@seed.local'),
  'email', '6c6a4f09-6023-5703-bcf2-d0346e7cb053'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '76d1c026-cc46-5a74-877a-9cab853060c0', '6c6a4f09-6023-5703-bcf2-d0346e7cb053', 'resumes',
  '6c6a4f09-6023-5703-bcf2-d0346e7cb053/resumes/76d1c026-cc46-5a74-877a-9cab853060c0/g5-bi-07.pdf',
  'g5-bi-07.pdf',
  'BI Developer Intern',
  'application/pdf', 587394, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'b3e7baf9-9ffe-5692-8e3f-0cf2fc0b32e9', '87af7aff-a2b6-534f-a79f-72a337b8273e', '6c6a4f09-6023-5703-bcf2-d0346e7cb053', '76d1c026-cc46-5a74-877a-9cab853060c0',
  'Cover letter -- BI Developer Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G5-BI-08 (group 5 Data / BI Developer): BI Developer Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '7c53660a-daac-59b1-9c38-759c4b7ce3f1',
  'authenticated', 'authenticated', 'g5-bi-08@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Do Hai Dang'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '7c53660a-daac-59b1-9c38-759c4b7ce3f1',
  jsonb_build_object('sub', '7c53660a-daac-59b1-9c38-759c4b7ce3f1'::text, 'email', 'g5-bi-08@seed.local'),
  'email', '7c53660a-daac-59b1-9c38-759c4b7ce3f1'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'ab70c5ad-1ef2-5d79-bb3a-a5b2c48661eb', '7c53660a-daac-59b1-9c38-759c4b7ce3f1', 'resumes',
  '7c53660a-daac-59b1-9c38-759c4b7ce3f1/resumes/ab70c5ad-1ef2-5d79-bb3a-a5b2c48661eb/g5-bi-08.pdf',
  'g5-bi-08.pdf',
  'BI Developer Intern',
  'application/pdf', 587378, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '3d4b1c1b-7fae-5747-9e6c-e5b4fba7b9bd', '87af7aff-a2b6-534f-a79f-72a337b8273e', '7c53660a-daac-59b1-9c38-759c4b7ce3f1', 'ab70c5ad-1ef2-5d79-bb3a-a5b2c48661eb',
  'Cover letter -- BI Developer Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G5-BI-09 (group 5 Data / BI Developer): BI Developer Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'ef371c46-7fdc-584a-8f46-2a315a90dc41',
  'authenticated', 'authenticated', 'g5-bi-09@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vu Thi Bao Ngoc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'ef371c46-7fdc-584a-8f46-2a315a90dc41',
  jsonb_build_object('sub', 'ef371c46-7fdc-584a-8f46-2a315a90dc41'::text, 'email', 'g5-bi-09@seed.local'),
  'email', 'ef371c46-7fdc-584a-8f46-2a315a90dc41'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '9e55a0d7-c221-5d04-ae0f-611cb163cb35', 'ef371c46-7fdc-584a-8f46-2a315a90dc41', 'resumes',
  'ef371c46-7fdc-584a-8f46-2a315a90dc41/resumes/9e55a0d7-c221-5d04-ae0f-611cb163cb35/g5-bi-09.pdf',
  'g5-bi-09.pdf',
  'BI Developer Intern',
  'application/pdf', 587349, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'dc430ee8-2499-5f66-a6b6-aaa082bfe6f5', '87af7aff-a2b6-534f-a79f-72a337b8273e', 'ef371c46-7fdc-584a-8f46-2a315a90dc41', '9e55a0d7-c221-5d04-ae0f-611cb163cb35',
  'Cover letter -- BI Developer Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'dc430ee8-2499-5f66-a6b6-aaa082bfe6f5', '22222222-2222-2222-2222-222222222222', 'offer'::public.application_status,
  'Seed pipeline offer', false
);

-- G5-DA-01 (group 5 Data / Data Analyst): Senior Data Analyst
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '86e0c3f1-26fe-5615-9228-f6c14d75348f',
  'authenticated', 'authenticated', 'g5-da-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Doan Thi Thuy Duong'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '86e0c3f1-26fe-5615-9228-f6c14d75348f',
  jsonb_build_object('sub', '86e0c3f1-26fe-5615-9228-f6c14d75348f'::text, 'email', 'g5-da-01@seed.local'),
  'email', '86e0c3f1-26fe-5615-9228-f6c14d75348f'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'dd380576-2dca-5d96-8f96-3be010708242', '86e0c3f1-26fe-5615-9228-f6c14d75348f', 'resumes',
  '86e0c3f1-26fe-5615-9228-f6c14d75348f/resumes/dd380576-2dca-5d96-8f96-3be010708242/g5-da-01.pdf',
  'g5-da-01.pdf',
  'Senior Data Analyst',
  'application/pdf', 590575, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '909b60fd-e1ff-55d8-8ffc-8b61ace19036', '87af7aff-a2b6-534f-a79f-72a337b8273e', '86e0c3f1-26fe-5615-9228-f6c14d75348f', 'dd380576-2dca-5d96-8f96-3be010708242',
  'Cover letter -- Senior Data Analyst'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G5-DA-02 (group 5 Data / Data Analyst): Data Analyst
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '19d02395-924e-554e-a475-9cb91ddc5f96',
  'authenticated', 'authenticated', 'g5-da-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Tien Dat'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '19d02395-924e-554e-a475-9cb91ddc5f96',
  jsonb_build_object('sub', '19d02395-924e-554e-a475-9cb91ddc5f96'::text, 'email', 'g5-da-02@seed.local'),
  'email', '19d02395-924e-554e-a475-9cb91ddc5f96'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'dffe633f-bcea-5fc4-a2d4-b35e661e956d', '19d02395-924e-554e-a475-9cb91ddc5f96', 'resumes',
  '19d02395-924e-554e-a475-9cb91ddc5f96/resumes/dffe633f-bcea-5fc4-a2d4-b35e661e956d/g5-da-02.pdf',
  'g5-da-02.pdf',
  'Data Analyst',
  'application/pdf', 587057, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '583348e9-f082-5fbd-92aa-216f5f85451e', '87af7aff-a2b6-534f-a79f-72a337b8273e', '19d02395-924e-554e-a475-9cb91ddc5f96', 'dffe633f-bcea-5fc4-a2d4-b35e661e956d',
  'Cover letter -- Data Analyst'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G5-DA-03 (group 5 Data / Data Analyst): Product Data Analyst
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a8dca4f8-a642-57e8-8de4-611d33c256e7',
  'authenticated', 'authenticated', 'g5-da-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Mai Thi Hoai An'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'a8dca4f8-a642-57e8-8de4-611d33c256e7',
  jsonb_build_object('sub', 'a8dca4f8-a642-57e8-8de4-611d33c256e7'::text, 'email', 'g5-da-03@seed.local'),
  'email', 'a8dca4f8-a642-57e8-8de4-611d33c256e7'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '0e99e8a1-962b-54e0-a156-7e9bc70e01c4', 'a8dca4f8-a642-57e8-8de4-611d33c256e7', 'resumes',
  'a8dca4f8-a642-57e8-8de4-611d33c256e7/resumes/0e99e8a1-962b-54e0-a156-7e9bc70e01c4/g5-da-03.pdf',
  'g5-da-03.pdf',
  'Product Data Analyst',
  'application/pdf', 589978, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'fdbf7c2b-ba74-5013-88d8-b4a78533fd3d', '87af7aff-a2b6-534f-a79f-72a337b8273e', 'a8dca4f8-a642-57e8-8de4-611d33c256e7', '0e99e8a1-962b-54e0-a156-7e9bc70e01c4',
  'Cover letter -- Product Data Analyst'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'fdbf7c2b-ba74-5013-88d8-b4a78533fd3d', '22222222-2222-2222-2222-222222222222', 'rejected'::public.application_status,
  'Seed pipeline rejected', false
);

-- G5-DA-04 (group 5 Data / Data Analyst): Data Analyst Intern
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '3d37a81d-265e-5d9b-9521-160d2c1b6f84',
  'authenticated', 'authenticated', 'g5-da-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Thi Thanh Huyen'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '3d37a81d-265e-5d9b-9521-160d2c1b6f84',
  jsonb_build_object('sub', '3d37a81d-265e-5d9b-9521-160d2c1b6f84'::text, 'email', 'g5-da-04@seed.local'),
  'email', '3d37a81d-265e-5d9b-9521-160d2c1b6f84'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'fbc20b35-7bed-56bf-8ce3-320d13a1fafb', '3d37a81d-265e-5d9b-9521-160d2c1b6f84', 'resumes',
  '3d37a81d-265e-5d9b-9521-160d2c1b6f84/resumes/fbc20b35-7bed-56bf-8ce3-320d13a1fafb/g5-da-04.pdf',
  'g5-da-04.pdf',
  'Data Analyst Intern',
  'application/pdf', 588408, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'beeabbb7-3061-52b4-a7e3-84d27d2d7caa', '87af7aff-a2b6-534f-a79f-72a337b8273e', '3d37a81d-265e-5d9b-9521-160d2c1b6f84', 'fbc20b35-7bed-56bf-8ce3-320d13a1fafb',
  'Cover letter -- Data Analyst Intern'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G5-DA-05 (group 5 Data / Data Analyst): Data Analyst (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'd068972e-6990-53a1-b65e-58b00e7cb401',
  'authenticated', 'authenticated', 'g5-da-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Thi Thu Ha'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'd068972e-6990-53a1-b65e-58b00e7cb401',
  jsonb_build_object('sub', 'd068972e-6990-53a1-b65e-58b00e7cb401'::text, 'email', 'g5-da-05@seed.local'),
  'email', 'd068972e-6990-53a1-b65e-58b00e7cb401'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'be20d629-91af-5d60-aa62-be5e76e14e89', 'd068972e-6990-53a1-b65e-58b00e7cb401', 'resumes',
  'd068972e-6990-53a1-b65e-58b00e7cb401/resumes/be20d629-91af-5d60-aa62-be5e76e14e89/g5-da-05.pdf',
  'g5-da-05.pdf',
  'Data Analyst (Fresher)',
  'application/pdf', 587438, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '76109577-b6c3-5945-a022-ec157d8cdf9f', '87af7aff-a2b6-534f-a79f-72a337b8273e', 'd068972e-6990-53a1-b65e-58b00e7cb401', 'be20d629-91af-5d60-aa62-be5e76e14e89',
  'Cover letter -- Data Analyst (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G5-DA-06 (group 5 Data / Data Analyst): Senior Data Analyst
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '4e6b2a8d-25b1-529a-b003-86344f599e9c',
  'authenticated', 'authenticated', 'g5-da-06@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Le Thi Minh Chau'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '4e6b2a8d-25b1-529a-b003-86344f599e9c',
  jsonb_build_object('sub', '4e6b2a8d-25b1-529a-b003-86344f599e9c'::text, 'email', 'g5-da-06@seed.local'),
  'email', '4e6b2a8d-25b1-529a-b003-86344f599e9c'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'aa1ceb30-e4c6-5787-9a6d-02a7654bc581', '4e6b2a8d-25b1-529a-b003-86344f599e9c', 'resumes',
  '4e6b2a8d-25b1-529a-b003-86344f599e9c/resumes/aa1ceb30-e4c6-5787-9a6d-02a7654bc581/g5-da-06.pdf',
  'g5-da-06.pdf',
  'Senior Data Analyst',
  'application/pdf', 589520, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'bdc274ab-497d-55e8-8241-38fd13d67d5d', '87af7aff-a2b6-534f-a79f-72a337b8273e', '4e6b2a8d-25b1-529a-b003-86344f599e9c', 'aa1ceb30-e4c6-5787-9a6d-02a7654bc581',
  'Cover letter -- Senior Data Analyst'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'bdc274ab-497d-55e8-8241-38fd13d67d5d', '22222222-2222-2222-2222-222222222222', 'screening'::public.application_status,
  'Seed pipeline screening', false
);

-- G6-AI-01 (group 6 AI/ML / AI Research Scientist): Senior Research Scientist
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'fa75313c-fc75-50ea-8737-b14198c5a2cf',
  'authenticated', 'authenticated', 'g6-ai-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Truong Quoc Dung'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'fa75313c-fc75-50ea-8737-b14198c5a2cf',
  jsonb_build_object('sub', 'fa75313c-fc75-50ea-8737-b14198c5a2cf'::text, 'email', 'g6-ai-01@seed.local'),
  'email', 'fa75313c-fc75-50ea-8737-b14198c5a2cf'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '353e33bc-c87e-5175-bb91-694b728d9681', 'fa75313c-fc75-50ea-8737-b14198c5a2cf', 'resumes',
  'fa75313c-fc75-50ea-8737-b14198c5a2cf/resumes/353e33bc-c87e-5175-bb91-694b728d9681/g6-ai-01.pdf',
  'g6-ai-01.pdf',
  'Senior Research Scientist',
  'application/pdf', 589881, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'b58e717e-646c-526a-ace1-f890e16ce183', '456a83d7-876e-5487-9a36-db85e70c5dc9', 'fa75313c-fc75-50ea-8737-b14198c5a2cf', '353e33bc-c87e-5175-bb91-694b728d9681',
  'Cover letter -- Senior Research Scientist'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G6-AI-02 (group 6 AI/ML / AI Research Scientist): AI Research Resident
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '285111dd-9b2e-5c91-b70c-bd4d66222402',
  'authenticated', 'authenticated', 'g6-ai-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Cao Thi Thanh Huyen'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '285111dd-9b2e-5c91-b70c-bd4d66222402',
  jsonb_build_object('sub', '285111dd-9b2e-5c91-b70c-bd4d66222402'::text, 'email', 'g6-ai-02@seed.local'),
  'email', '285111dd-9b2e-5c91-b70c-bd4d66222402'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'da4c44cf-57b2-5df0-92d6-d13ce5d6c488', '285111dd-9b2e-5c91-b70c-bd4d66222402', 'resumes',
  '285111dd-9b2e-5c91-b70c-bd4d66222402/resumes/da4c44cf-57b2-5df0-92d6-d13ce5d6c488/g6-ai-02.pdf',
  'g6-ai-02.pdf',
  'AI Research Resident',
  'application/pdf', 587617, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '9001f9c5-413a-5e4a-9186-ba6defe04e33', '456a83d7-876e-5487-9a36-db85e70c5dc9', '285111dd-9b2e-5c91-b70c-bd4d66222402', 'da4c44cf-57b2-5df0-92d6-d13ce5d6c488',
  'Cover letter -- AI Research Resident'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G6-AI-03 (group 6 AI/ML / AI Research Scientist): Research Scientist, Edge AI
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '618f8cc6-0a0c-544a-b099-b603c3625a5f',
  'authenticated', 'authenticated', 'g6-ai-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Hoang Van Chuong'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '618f8cc6-0a0c-544a-b099-b603c3625a5f',
  jsonb_build_object('sub', '618f8cc6-0a0c-544a-b099-b603c3625a5f'::text, 'email', 'g6-ai-03@seed.local'),
  'email', '618f8cc6-0a0c-544a-b099-b603c3625a5f'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'e574523a-da7b-5c2a-ba13-914619e31785', '618f8cc6-0a0c-544a-b099-b603c3625a5f', 'resumes',
  '618f8cc6-0a0c-544a-b099-b603c3625a5f/resumes/e574523a-da7b-5c2a-ba13-914619e31785/g6-ai-03.pdf',
  'g6-ai-03.pdf',
  'Research Scientist, Edge AI',
  'application/pdf', 590731, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '90402ece-0b8c-5a51-ab92-647799e6183b', '456a83d7-876e-5487-9a36-db85e70c5dc9', '618f8cc6-0a0c-544a-b099-b603c3625a5f', 'e574523a-da7b-5c2a-ba13-914619e31785',
  'Cover letter -- Research Scientist, Edge AI'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '90402ece-0b8c-5a51-ab92-647799e6183b', '22222222-2222-2222-2222-222222222222', 'interview'::public.application_status,
  'Seed pipeline interview', false
);

-- G6-AI-04 (group 6 AI/ML / AI Research Scientist): AI Research Scientist (Fresher / Research Assistant)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'c438d3a0-215a-598e-9302-f60f2ec0b3c4',
  'authenticated', 'authenticated', 'g6-ai-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Le Duc Anh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'c438d3a0-215a-598e-9302-f60f2ec0b3c4',
  jsonb_build_object('sub', 'c438d3a0-215a-598e-9302-f60f2ec0b3c4'::text, 'email', 'g6-ai-04@seed.local'),
  'email', 'c438d3a0-215a-598e-9302-f60f2ec0b3c4'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '810c1f85-82a3-5841-b46b-c629b5167bc4', 'c438d3a0-215a-598e-9302-f60f2ec0b3c4', 'resumes',
  'c438d3a0-215a-598e-9302-f60f2ec0b3c4/resumes/810c1f85-82a3-5841-b46b-c629b5167bc4/g6-ai-04.pdf',
  'g6-ai-04.pdf',
  'AI Research Scientist (Fresher / Research Assistant)',
  'application/pdf', 587658, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '14464fac-3943-55a7-b05f-c98f4f958a88', '456a83d7-876e-5487-9a36-db85e70c5dc9', 'c438d3a0-215a-598e-9302-f60f2ec0b3c4', '810c1f85-82a3-5841-b46b-c629b5167bc4',
  'Cover letter -- AI Research Scientist (Fresher / Research Assistant)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G6-AI-05 (group 6 AI/ML / AI Research Scientist): Senior Research Scientist
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '97e1d9b5-1cac-5f9c-957e-ac879ec8b57e',
  'authenticated', 'authenticated', 'g6-ai-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Ngo Thanh Long'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '97e1d9b5-1cac-5f9c-957e-ac879ec8b57e',
  jsonb_build_object('sub', '97e1d9b5-1cac-5f9c-957e-ac879ec8b57e'::text, 'email', 'g6-ai-05@seed.local'),
  'email', '97e1d9b5-1cac-5f9c-957e-ac879ec8b57e'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'e900f6ce-8054-5a00-8b2f-187520080bc1', '97e1d9b5-1cac-5f9c-957e-ac879ec8b57e', 'resumes',
  '97e1d9b5-1cac-5f9c-957e-ac879ec8b57e/resumes/e900f6ce-8054-5a00-8b2f-187520080bc1/g6-ai-05.pdf',
  'g6-ai-05.pdf',
  'Senior Research Scientist',
  'application/pdf', 589885, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'db1d8da0-ff98-5b8f-a36d-d402df8e70f3', '456a83d7-876e-5487-9a36-db85e70c5dc9', '97e1d9b5-1cac-5f9c-957e-ac879ec8b57e', 'e900f6ce-8054-5a00-8b2f-187520080bc1',
  'Cover letter -- Senior Research Scientist'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G6-CV-01 (group 6 AI/ML / Computer Vision Engineer): Senior Computer Vision Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '67ccf215-a9a0-5c73-bde9-100671d044a7',
  'authenticated', 'authenticated', 'g6-cv-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Minh Triet'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '67ccf215-a9a0-5c73-bde9-100671d044a7',
  jsonb_build_object('sub', '67ccf215-a9a0-5c73-bde9-100671d044a7'::text, 'email', 'g6-cv-01@seed.local'),
  'email', '67ccf215-a9a0-5c73-bde9-100671d044a7'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'bb42348c-66a2-5870-afc9-c6709353624b', '67ccf215-a9a0-5c73-bde9-100671d044a7', 'resumes',
  '67ccf215-a9a0-5c73-bde9-100671d044a7/resumes/bb42348c-66a2-5870-afc9-c6709353624b/g6-cv-01.pdf',
  'g6-cv-01.pdf',
  'Senior Computer Vision Engineer',
  'application/pdf', 591043, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '5565c0ba-24d7-571b-a641-60c76a3e137d', '456a83d7-876e-5487-9a36-db85e70c5dc9', '67ccf215-a9a0-5c73-bde9-100671d044a7', 'bb42348c-66a2-5870-afc9-c6709353624b',
  'Cover letter -- Senior Computer Vision Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '5565c0ba-24d7-571b-a641-60c76a3e137d', '22222222-2222-2222-2222-222222222222', 'offer'::public.application_status,
  'Seed pipeline offer', false
);

-- G6-CV-02 (group 6 AI/ML / Computer Vision Engineer): Computer Vision Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '723204f0-64f4-5830-847c-21d3d90049cf',
  'authenticated', 'authenticated', 'g6-cv-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vo Van Tai'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '723204f0-64f4-5830-847c-21d3d90049cf',
  jsonb_build_object('sub', '723204f0-64f4-5830-847c-21d3d90049cf'::text, 'email', 'g6-cv-02@seed.local'),
  'email', '723204f0-64f4-5830-847c-21d3d90049cf'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '8b147673-fb6f-5482-b6a9-7203e72d33b2', '723204f0-64f4-5830-847c-21d3d90049cf', 'resumes',
  '723204f0-64f4-5830-847c-21d3d90049cf/resumes/8b147673-fb6f-5482-b6a9-7203e72d33b2/g6-cv-02.pdf',
  'g6-cv-02.pdf',
  'Computer Vision Engineer',
  'application/pdf', 587786, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '17f1e918-db6a-581f-8a31-77c9ff92c162', '456a83d7-876e-5487-9a36-db85e70c5dc9', '723204f0-64f4-5830-847c-21d3d90049cf', '8b147673-fb6f-5482-b6a9-7203e72d33b2',
  'Cover letter -- Computer Vision Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G6-CV-03 (group 6 AI/ML / Computer Vision Engineer): Computer Vision Engineer, Medical Imaging
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '0b65ef59-cd4e-5adb-9a2f-5530eccf3678',
  'authenticated', 'authenticated', 'g6-cv-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Lam Thi Bao Chau'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '0b65ef59-cd4e-5adb-9a2f-5530eccf3678',
  jsonb_build_object('sub', '0b65ef59-cd4e-5adb-9a2f-5530eccf3678'::text, 'email', 'g6-cv-03@seed.local'),
  'email', '0b65ef59-cd4e-5adb-9a2f-5530eccf3678'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'b42e885e-92e2-519d-9c43-30031576e33b', '0b65ef59-cd4e-5adb-9a2f-5530eccf3678', 'resumes',
  '0b65ef59-cd4e-5adb-9a2f-5530eccf3678/resumes/b42e885e-92e2-519d-9c43-30031576e33b/g6-cv-03.pdf',
  'g6-cv-03.pdf',
  'Computer Vision Engineer, Medical Imaging',
  'application/pdf', 590963, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'b814244c-9a75-504b-81f1-3430ae76a6cb', '456a83d7-876e-5487-9a36-db85e70c5dc9', '0b65ef59-cd4e-5adb-9a2f-5530eccf3678', 'b42e885e-92e2-519d-9c43-30031576e33b',
  'Cover letter -- Computer Vision Engineer, Medical Imaging'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G6-CV-04 (group 6 AI/ML / Computer Vision Engineer): Computer Vision Engineer (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'b19de15d-dd83-571d-a0c8-dd42d9ac380b',
  'authenticated', 'authenticated', 'g6-cv-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vo Thanh Long'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'b19de15d-dd83-571d-a0c8-dd42d9ac380b',
  jsonb_build_object('sub', 'b19de15d-dd83-571d-a0c8-dd42d9ac380b'::text, 'email', 'g6-cv-04@seed.local'),
  'email', 'b19de15d-dd83-571d-a0c8-dd42d9ac380b'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'b08314af-e0a1-58d6-8f58-606f0cede112', 'b19de15d-dd83-571d-a0c8-dd42d9ac380b', 'resumes',
  'b19de15d-dd83-571d-a0c8-dd42d9ac380b/resumes/b08314af-e0a1-58d6-8f58-606f0cede112/g6-cv-04.pdf',
  'g6-cv-04.pdf',
  'Computer Vision Engineer (Fresher)',
  'application/pdf', 587911, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'b58d57de-b8ea-55c1-88d5-1c61fc484530', '456a83d7-876e-5487-9a36-db85e70c5dc9', 'b19de15d-dd83-571d-a0c8-dd42d9ac380b', 'b08314af-e0a1-58d6-8f58-606f0cede112',
  'Cover letter -- Computer Vision Engineer (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'b58d57de-b8ea-55c1-88d5-1c61fc484530', '22222222-2222-2222-2222-222222222222', 'rejected'::public.application_status,
  'Seed pipeline rejected', false
);

-- G6-CV-05 (group 6 AI/ML / Computer Vision Engineer): Senior Computer Vision Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '98992457-4ab4-59bb-a26a-6a8e03f50441',
  'authenticated', 'authenticated', 'g6-cv-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Dang Quoc Huy'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '98992457-4ab4-59bb-a26a-6a8e03f50441',
  jsonb_build_object('sub', '98992457-4ab4-59bb-a26a-6a8e03f50441'::text, 'email', 'g6-cv-05@seed.local'),
  'email', '98992457-4ab4-59bb-a26a-6a8e03f50441'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '060f402b-bdca-5114-b46e-f4b5fea84c8b', '98992457-4ab4-59bb-a26a-6a8e03f50441', 'resumes',
  '98992457-4ab4-59bb-a26a-6a8e03f50441/resumes/060f402b-bdca-5114-b46e-f4b5fea84c8b/g6-cv-05.pdf',
  'g6-cv-05.pdf',
  'Senior Computer Vision Engineer',
  'application/pdf', 589598, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '721961cb-208b-53c8-be7a-6a92fe4508e9', '456a83d7-876e-5487-9a36-db85e70c5dc9', '98992457-4ab4-59bb-a26a-6a8e03f50441', '060f402b-bdca-5114-b46e-f4b5fea84c8b',
  'Cover letter -- Senior Computer Vision Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G6-MLO-01 (group 6 AI/ML / MLOps Engineer): Senior MLOps Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'd0f4d8b9-c752-5b8b-aa66-b602aa738b5c',
  'authenticated', 'authenticated', 'g6-mlo-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Dinh Cong Thanh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'd0f4d8b9-c752-5b8b-aa66-b602aa738b5c',
  jsonb_build_object('sub', 'd0f4d8b9-c752-5b8b-aa66-b602aa738b5c'::text, 'email', 'g6-mlo-01@seed.local'),
  'email', 'd0f4d8b9-c752-5b8b-aa66-b602aa738b5c'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'a546127b-20cc-52e5-b03a-14c257a922be', 'd0f4d8b9-c752-5b8b-aa66-b602aa738b5c', 'resumes',
  'd0f4d8b9-c752-5b8b-aa66-b602aa738b5c/resumes/a546127b-20cc-52e5-b03a-14c257a922be/g6-mlo-01.pdf',
  'g6-mlo-01.pdf',
  'Senior MLOps Engineer',
  'application/pdf', 590743, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '21008370-179d-51ba-ad29-0dc8ed820b24', '456a83d7-876e-5487-9a36-db85e70c5dc9', 'd0f4d8b9-c752-5b8b-aa66-b602aa738b5c', 'a546127b-20cc-52e5-b03a-14c257a922be',
  'Cover letter -- Senior MLOps Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G6-MLO-02 (group 6 AI/ML / MLOps Engineer): MLOps Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '242c9bf2-cdaa-5402-bdaf-ab843e3c742f',
  'authenticated', 'authenticated', 'g6-mlo-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Huu Phat'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '242c9bf2-cdaa-5402-bdaf-ab843e3c742f',
  jsonb_build_object('sub', '242c9bf2-cdaa-5402-bdaf-ab843e3c742f'::text, 'email', 'g6-mlo-02@seed.local'),
  'email', '242c9bf2-cdaa-5402-bdaf-ab843e3c742f'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '7f94d0bc-fed6-5514-85ba-6f3efbf44137', '242c9bf2-cdaa-5402-bdaf-ab843e3c742f', 'resumes',
  '242c9bf2-cdaa-5402-bdaf-ab843e3c742f/resumes/7f94d0bc-fed6-5514-85ba-6f3efbf44137/g6-mlo-02.pdf',
  'g6-mlo-02.pdf',
  'MLOps Engineer',
  'application/pdf', 587753, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '587be212-b3f8-5916-8a67-25e978024317', '456a83d7-876e-5487-9a36-db85e70c5dc9', '242c9bf2-cdaa-5402-bdaf-ab843e3c742f', '7f94d0bc-fed6-5514-85ba-6f3efbf44137',
  'Cover letter -- MLOps Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '587be212-b3f8-5916-8a67-25e978024317', '22222222-2222-2222-2222-222222222222', 'screening'::public.application_status,
  'Seed pipeline screening', false
);

-- G6-MLO-03 (group 6 AI/ML / MLOps Engineer): MLOps Lead
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'f97fd433-8d3c-5852-a7a5-1df1393012f1',
  'authenticated', 'authenticated', 'g6-mlo-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Ha Thi Kim Lien'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'f97fd433-8d3c-5852-a7a5-1df1393012f1',
  jsonb_build_object('sub', 'f97fd433-8d3c-5852-a7a5-1df1393012f1'::text, 'email', 'g6-mlo-03@seed.local'),
  'email', 'f97fd433-8d3c-5852-a7a5-1df1393012f1'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'e7674a4a-f9dc-565a-8cc6-a78e263c349d', 'f97fd433-8d3c-5852-a7a5-1df1393012f1', 'resumes',
  'f97fd433-8d3c-5852-a7a5-1df1393012f1/resumes/e7674a4a-f9dc-565a-8cc6-a78e263c349d/g6-mlo-03.pdf',
  'g6-mlo-03.pdf',
  'MLOps Lead',
  'application/pdf', 590914, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'c32d3e44-aeef-5141-8612-ce18d07eb61f', '456a83d7-876e-5487-9a36-db85e70c5dc9', 'f97fd433-8d3c-5852-a7a5-1df1393012f1', 'e7674a4a-f9dc-565a-8cc6-a78e263c349d',
  'Cover letter -- MLOps Lead'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G6-MLO-04 (group 6 AI/ML / MLOps Engineer): MLOps Engineer (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'ef4cf45f-453e-5033-b5b0-b9813e2a7bb6',
  'authenticated', 'authenticated', 'g6-mlo-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Dang Thi Thu Ha'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'ef4cf45f-453e-5033-b5b0-b9813e2a7bb6',
  jsonb_build_object('sub', 'ef4cf45f-453e-5033-b5b0-b9813e2a7bb6'::text, 'email', 'g6-mlo-04@seed.local'),
  'email', 'ef4cf45f-453e-5033-b5b0-b9813e2a7bb6'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '64a69355-35de-5543-a58f-9f09e18450c7', 'ef4cf45f-453e-5033-b5b0-b9813e2a7bb6', 'resumes',
  'ef4cf45f-453e-5033-b5b0-b9813e2a7bb6/resumes/64a69355-35de-5543-a58f-9f09e18450c7/g6-mlo-04.pdf',
  'g6-mlo-04.pdf',
  'MLOps Engineer (Fresher)',
  'application/pdf', 587873, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'c696929f-e554-5f68-8517-c19bf0092068', '456a83d7-876e-5487-9a36-db85e70c5dc9', 'ef4cf45f-453e-5033-b5b0-b9813e2a7bb6', '64a69355-35de-5543-a58f-9f09e18450c7',
  'Cover letter -- MLOps Engineer (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G6-MLO-05 (group 6 AI/ML / MLOps Engineer): Senior MLOps Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '28ab0eec-5722-5261-8d56-bb5a03c0fc41',
  'authenticated', 'authenticated', 'g6-mlo-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Tran Anh Duc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '28ab0eec-5722-5261-8d56-bb5a03c0fc41',
  jsonb_build_object('sub', '28ab0eec-5722-5261-8d56-bb5a03c0fc41'::text, 'email', 'g6-mlo-05@seed.local'),
  'email', '28ab0eec-5722-5261-8d56-bb5a03c0fc41'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '84f3dc11-5b73-5004-8f58-289527aec7af', '28ab0eec-5722-5261-8d56-bb5a03c0fc41', 'resumes',
  '28ab0eec-5722-5261-8d56-bb5a03c0fc41/resumes/84f3dc11-5b73-5004-8f58-289527aec7af/g6-mlo-05.pdf',
  'g6-mlo-05.pdf',
  'Senior MLOps Engineer',
  'application/pdf', 589707, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'baf777c3-e38f-5cda-8161-1e0894c8e741', '456a83d7-876e-5487-9a36-db85e70c5dc9', '28ab0eec-5722-5261-8d56-bb5a03c0fc41', '84f3dc11-5b73-5004-8f58-289527aec7af',
  'Cover letter -- Senior MLOps Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'baf777c3-e38f-5cda-8161-1e0894c8e741', '22222222-2222-2222-2222-222222222222', 'interview'::public.application_status,
  'Seed pipeline interview', false
);

-- G7-AT-01 (group 7 QA/Testing / Automation Test Engineer): Senior Automation Test Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '8e6d1f39-3412-57df-9a55-c4e27826f5dc',
  'authenticated', 'authenticated', 'g7-at-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Dang Hoang Phuc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '8e6d1f39-3412-57df-9a55-c4e27826f5dc',
  jsonb_build_object('sub', '8e6d1f39-3412-57df-9a55-c4e27826f5dc'::text, 'email', 'g7-at-01@seed.local'),
  'email', '8e6d1f39-3412-57df-9a55-c4e27826f5dc'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '1fc0549a-682a-5dd5-b41f-f2eb20368939', '8e6d1f39-3412-57df-9a55-c4e27826f5dc', 'resumes',
  '8e6d1f39-3412-57df-9a55-c4e27826f5dc/resumes/1fc0549a-682a-5dd5-b41f-f2eb20368939/g7-at-01.pdf',
  'g7-at-01.pdf',
  'Senior Automation Test Engineer',
  'application/pdf', 590766, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '7e8776b5-1abd-5b70-b453-15b577623596', '644919cf-d485-567c-b03e-62ba618e78b1', '8e6d1f39-3412-57df-9a55-c4e27826f5dc', '1fc0549a-682a-5dd5-b41f-f2eb20368939',
  'Cover letter -- Senior Automation Test Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G7-AT-02 (group 7 QA/Testing / Automation Test Engineer): Automation Tester
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '090c034b-b41b-5f06-919d-5d3f65f013ed',
  'authenticated', 'authenticated', 'g7-at-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vu Thi Thu Hien'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '090c034b-b41b-5f06-919d-5d3f65f013ed',
  jsonb_build_object('sub', '090c034b-b41b-5f06-919d-5d3f65f013ed'::text, 'email', 'g7-at-02@seed.local'),
  'email', '090c034b-b41b-5f06-919d-5d3f65f013ed'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '29be1be3-3346-5381-b3a3-264d56751f5c', '090c034b-b41b-5f06-919d-5d3f65f013ed', 'resumes',
  '090c034b-b41b-5f06-919d-5d3f65f013ed/resumes/29be1be3-3346-5381-b3a3-264d56751f5c/g7-at-02.pdf',
  'g7-at-02.pdf',
  'Automation Tester',
  'application/pdf', 587599, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'a3f5fd46-0bbf-5281-a363-e6bf29e26f09', '644919cf-d485-567c-b03e-62ba618e78b1', '090c034b-b41b-5f06-919d-5d3f65f013ed', '29be1be3-3346-5381-b3a3-264d56751f5c',
  'Cover letter -- Automation Tester'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G7-AT-03 (group 7 QA/Testing / Automation Test Engineer): Test Automation Engineer (test infrastructure focus)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '51a22a60-298c-5a63-813c-f2a6d2a977c1',
  'authenticated', 'authenticated', 'g7-at-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Hoang Van Cuong'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '51a22a60-298c-5a63-813c-f2a6d2a977c1',
  jsonb_build_object('sub', '51a22a60-298c-5a63-813c-f2a6d2a977c1'::text, 'email', 'g7-at-03@seed.local'),
  'email', '51a22a60-298c-5a63-813c-f2a6d2a977c1'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '1ed60efb-35c6-5410-ae55-6f962b80a9c2', '51a22a60-298c-5a63-813c-f2a6d2a977c1', 'resumes',
  '51a22a60-298c-5a63-813c-f2a6d2a977c1/resumes/1ed60efb-35c6-5410-ae55-6f962b80a9c2/g7-at-03.pdf',
  'g7-at-03.pdf',
  'Test Automation Engineer (test infrastructure focus)',
  'application/pdf', 590343, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'd11420ef-2dfd-55ae-9904-75bb78050940', '644919cf-d485-567c-b03e-62ba618e78b1', '51a22a60-298c-5a63-813c-f2a6d2a977c1', '1ed60efb-35c6-5410-ae55-6f962b80a9c2',
  'Cover letter -- Test Automation Engineer (test infrastructure focus)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'd11420ef-2dfd-55ae-9904-75bb78050940', '22222222-2222-2222-2222-222222222222', 'offer'::public.application_status,
  'Seed pipeline offer', false
);

-- G7-AT-04 (group 7 QA/Testing / Automation Test Engineer): Automation Test Engineer (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'abd38c80-be8e-542e-8833-b2aa5ab0b531',
  'authenticated', 'authenticated', 'g7-at-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Tran Thi Kim Anh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'abd38c80-be8e-542e-8833-b2aa5ab0b531',
  jsonb_build_object('sub', 'abd38c80-be8e-542e-8833-b2aa5ab0b531'::text, 'email', 'g7-at-04@seed.local'),
  'email', 'abd38c80-be8e-542e-8833-b2aa5ab0b531'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'c8447b87-bce8-58c6-8a24-6d95dc5d7986', 'abd38c80-be8e-542e-8833-b2aa5ab0b531', 'resumes',
  'abd38c80-be8e-542e-8833-b2aa5ab0b531/resumes/c8447b87-bce8-58c6-8a24-6d95dc5d7986/g7-at-04.pdf',
  'g7-at-04.pdf',
  'Automation Test Engineer (Fresher)',
  'application/pdf', 587800, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'c20ab25c-29d5-59ec-a2a1-afff14014157', '644919cf-d485-567c-b03e-62ba618e78b1', 'abd38c80-be8e-542e-8833-b2aa5ab0b531', 'c8447b87-bce8-58c6-8a24-6d95dc5d7986',
  'Cover letter -- Automation Test Engineer (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G7-AT-05 (group 7 QA/Testing / Automation Test Engineer): Senior Automation Test Engineer (Mobile and API)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '0130b1af-cb0f-58e1-bcb3-807aa4fdd5b4',
  'authenticated', 'authenticated', 'g7-at-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Bui Quang Vinh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '0130b1af-cb0f-58e1-bcb3-807aa4fdd5b4',
  jsonb_build_object('sub', '0130b1af-cb0f-58e1-bcb3-807aa4fdd5b4'::text, 'email', 'g7-at-05@seed.local'),
  'email', '0130b1af-cb0f-58e1-bcb3-807aa4fdd5b4'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'f2c194ee-0e80-5c4b-87ae-13ea66633551', '0130b1af-cb0f-58e1-bcb3-807aa4fdd5b4', 'resumes',
  '0130b1af-cb0f-58e1-bcb3-807aa4fdd5b4/resumes/f2c194ee-0e80-5c4b-87ae-13ea66633551/g7-at-05.pdf',
  'g7-at-05.pdf',
  'Senior Automation Test Engineer (Mobile and API)',
  'application/pdf', 590091, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'f4e3fa50-1cfb-5230-9824-99f2b98efabb', '644919cf-d485-567c-b03e-62ba618e78b1', '0130b1af-cb0f-58e1-bcb3-807aa4fdd5b4', 'f2c194ee-0e80-5c4b-87ae-13ea66633551',
  'Cover letter -- Senior Automation Test Engineer (Mobile and API)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G7-MT-01 (group 7 QA/Testing / Manual Tester): Senior Test Analyst (Banking and Insurance)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'cffa0de8-8b87-557d-bdef-058509b62ac7',
  'authenticated', 'authenticated', 'g7-mt-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Thi Thanh Huyen'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'cffa0de8-8b87-557d-bdef-058509b62ac7',
  jsonb_build_object('sub', 'cffa0de8-8b87-557d-bdef-058509b62ac7'::text, 'email', 'g7-mt-01@seed.local'),
  'email', 'cffa0de8-8b87-557d-bdef-058509b62ac7'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'cc9d310d-8bdc-5cd9-aa87-ea1ebd962b4e', 'cffa0de8-8b87-557d-bdef-058509b62ac7', 'resumes',
  'cffa0de8-8b87-557d-bdef-058509b62ac7/resumes/cc9d310d-8bdc-5cd9-aa87-ea1ebd962b4e/g7-mt-01.pdf',
  'g7-mt-01.pdf',
  'Senior Test Analyst (Banking and Insurance)',
  'application/pdf', 591442, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '95be8125-c79e-5e84-a31a-2fb86d72145f', '644919cf-d485-567c-b03e-62ba618e78b1', 'cffa0de8-8b87-557d-bdef-058509b62ac7', 'cc9d310d-8bdc-5cd9-aa87-ea1ebd962b4e',
  'Cover letter -- Senior Test Analyst (Banking and Insurance)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '95be8125-c79e-5e84-a31a-2fb86d72145f', '22222222-2222-2222-2222-222222222222', 'rejected'::public.application_status,
  'Seed pipeline rejected', false
);

-- G7-MT-02 (group 7 QA/Testing / Manual Tester): Manual Tester
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '62e9df62-c2e4-5a38-b447-75268f6da8f5',
  'authenticated', 'authenticated', 'g7-mt-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Le Van Quyet'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '62e9df62-c2e4-5a38-b447-75268f6da8f5',
  jsonb_build_object('sub', '62e9df62-c2e4-5a38-b447-75268f6da8f5'::text, 'email', 'g7-mt-02@seed.local'),
  'email', '62e9df62-c2e4-5a38-b447-75268f6da8f5'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'b62dc1bd-84fa-5107-9764-7bb37bf63c25', '62e9df62-c2e4-5a38-b447-75268f6da8f5', 'resumes',
  '62e9df62-c2e4-5a38-b447-75268f6da8f5/resumes/b62dc1bd-84fa-5107-9764-7bb37bf63c25/g7-mt-02.pdf',
  'g7-mt-02.pdf',
  'Manual Tester',
  'application/pdf', 587325, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '321d6c1a-471b-5b18-ae1b-d002bee33fe0', '644919cf-d485-567c-b03e-62ba618e78b1', '62e9df62-c2e4-5a38-b447-75268f6da8f5', 'b62dc1bd-84fa-5107-9764-7bb37bf63c25',
  'Cover letter -- Manual Tester'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G7-MT-03 (group 7 QA/Testing / Manual Tester): Senior Manual Tester / Acceptance Testing
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '33166b8d-d6c2-59e8-8464-0bbe0b8496ee',
  'authenticated', 'authenticated', 'g7-mt-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Thi Ngoc Diem'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '33166b8d-d6c2-59e8-8464-0bbe0b8496ee',
  jsonb_build_object('sub', '33166b8d-d6c2-59e8-8464-0bbe0b8496ee'::text, 'email', 'g7-mt-03@seed.local'),
  'email', '33166b8d-d6c2-59e8-8464-0bbe0b8496ee'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '30de3e78-0760-5855-8065-b28f6793f777', '33166b8d-d6c2-59e8-8464-0bbe0b8496ee', 'resumes',
  '33166b8d-d6c2-59e8-8464-0bbe0b8496ee/resumes/30de3e78-0760-5855-8065-b28f6793f777/g7-mt-03.pdf',
  'g7-mt-03.pdf',
  'Senior Manual Tester / Acceptance Testing',
  'application/pdf', 590228, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '7009f104-1d50-5057-9c8e-c3b05f00ed4d', '644919cf-d485-567c-b03e-62ba618e78b1', '33166b8d-d6c2-59e8-8464-0bbe0b8496ee', '30de3e78-0760-5855-8065-b28f6793f777',
  'Cover letter -- Senior Manual Tester / Acceptance Testing'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G7-MT-04 (group 7 QA/Testing / Manual Tester): Manual Tester (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '724896a3-4d53-53c0-b0cf-02f8ddf2061b',
  'authenticated', 'authenticated', 'g7-mt-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Van Phu'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '724896a3-4d53-53c0-b0cf-02f8ddf2061b',
  jsonb_build_object('sub', '724896a3-4d53-53c0-b0cf-02f8ddf2061b'::text, 'email', 'g7-mt-04@seed.local'),
  'email', '724896a3-4d53-53c0-b0cf-02f8ddf2061b'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '603165c7-1618-5a60-93d5-3d0a2092e9aa', '724896a3-4d53-53c0-b0cf-02f8ddf2061b', 'resumes',
  '724896a3-4d53-53c0-b0cf-02f8ddf2061b/resumes/603165c7-1618-5a60-93d5-3d0a2092e9aa/g7-mt-04.pdf',
  'g7-mt-04.pdf',
  'Manual Tester (Fresher)',
  'application/pdf', 587686, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '6f6401f0-0ba8-515e-8228-81e32d3f3a7b', '644919cf-d485-567c-b03e-62ba618e78b1', '724896a3-4d53-53c0-b0cf-02f8ddf2061b', '603165c7-1618-5a60-93d5-3d0a2092e9aa',
  'Cover letter -- Manual Tester (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '6f6401f0-0ba8-515e-8228-81e32d3f3a7b', '22222222-2222-2222-2222-222222222222', 'screening'::public.application_status,
  'Seed pipeline screening', false
);

-- G7-MT-05 (group 7 QA/Testing / Manual Tester): Senior Test Lead (E-commerce)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '3ce42c07-f79f-5b3a-b3b4-351d4eadde38',
  'authenticated', 'authenticated', 'g7-mt-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Do Thi Kim Ngan'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '3ce42c07-f79f-5b3a-b3b4-351d4eadde38',
  jsonb_build_object('sub', '3ce42c07-f79f-5b3a-b3b4-351d4eadde38'::text, 'email', 'g7-mt-05@seed.local'),
  'email', '3ce42c07-f79f-5b3a-b3b4-351d4eadde38'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '42ed553b-4507-5282-ba03-87521549d98c', '3ce42c07-f79f-5b3a-b3b4-351d4eadde38', 'resumes',
  '3ce42c07-f79f-5b3a-b3b4-351d4eadde38/resumes/42ed553b-4507-5282-ba03-87521549d98c/g7-mt-05.pdf',
  'g7-mt-05.pdf',
  'Senior Test Lead (E-commerce)',
  'application/pdf', 590195, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'f272b4f5-1c9f-5892-a294-699bc432df91', '644919cf-d485-567c-b03e-62ba618e78b1', '3ce42c07-f79f-5b3a-b3b4-351d4eadde38', '42ed553b-4507-5282-ba03-87521549d98c',
  'Cover letter -- Senior Test Lead (E-commerce)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G7-PT-01 (group 7 QA/Testing / Performance Tester): Senior Performance Test Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '58d458ca-9a4a-5f94-b001-c294bc53a120',
  'authenticated', 'authenticated', 'g7-pt-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Ngoc Lam'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '58d458ca-9a4a-5f94-b001-c294bc53a120',
  jsonb_build_object('sub', '58d458ca-9a4a-5f94-b001-c294bc53a120'::text, 'email', 'g7-pt-01@seed.local'),
  'email', '58d458ca-9a4a-5f94-b001-c294bc53a120'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'a7e471a1-1134-53c9-9bac-79fde9ca8e62', '58d458ca-9a4a-5f94-b001-c294bc53a120', 'resumes',
  '58d458ca-9a4a-5f94-b001-c294bc53a120/resumes/a7e471a1-1134-53c9-9bac-79fde9ca8e62/g7-pt-01.pdf',
  'g7-pt-01.pdf',
  'Senior Performance Test Engineer',
  'application/pdf', 592278, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '7060b3a5-4001-53d7-9dc6-192165c2a20b', '644919cf-d485-567c-b03e-62ba618e78b1', '58d458ca-9a4a-5f94-b001-c294bc53a120', 'a7e471a1-1134-53c9-9bac-79fde9ca8e62',
  'Cover letter -- Senior Performance Test Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G7-PT-02 (group 7 QA/Testing / Performance Tester): Performance Tester
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '12582d0e-33cb-5877-bc4b-55de2692c5da',
  'authenticated', 'authenticated', 'g7-pt-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Thi Anh Tuyet'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '12582d0e-33cb-5877-bc4b-55de2692c5da',
  jsonb_build_object('sub', '12582d0e-33cb-5877-bc4b-55de2692c5da'::text, 'email', 'g7-pt-02@seed.local'),
  'email', '12582d0e-33cb-5877-bc4b-55de2692c5da'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'aa29954a-a2d2-5791-92aa-3ea46a80013d', '12582d0e-33cb-5877-bc4b-55de2692c5da', 'resumes',
  '12582d0e-33cb-5877-bc4b-55de2692c5da/resumes/aa29954a-a2d2-5791-92aa-3ea46a80013d/g7-pt-02.pdf',
  'g7-pt-02.pdf',
  'Performance Tester',
  'application/pdf', 587493, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'ca936ee5-f174-5dbd-a8e1-b04d78993d5a', '644919cf-d485-567c-b03e-62ba618e78b1', '12582d0e-33cb-5877-bc4b-55de2692c5da', 'aa29954a-a2d2-5791-92aa-3ea46a80013d',
  'Cover letter -- Performance Tester'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'ca936ee5-f174-5dbd-a8e1-b04d78993d5a', '22222222-2222-2222-2222-222222222222', 'interview'::public.application_status,
  'Seed pipeline interview', false
);

-- G7-PT-03 (group 7 QA/Testing / Performance Tester): Performance and Reliability Test Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'd25c47db-8b8e-5a3b-bba0-c98b8c0cbe2c',
  'authenticated', 'authenticated', 'g7-pt-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vo Dinh Khang'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'd25c47db-8b8e-5a3b-bba0-c98b8c0cbe2c',
  jsonb_build_object('sub', 'd25c47db-8b8e-5a3b-bba0-c98b8c0cbe2c'::text, 'email', 'g7-pt-03@seed.local'),
  'email', 'd25c47db-8b8e-5a3b-bba0-c98b8c0cbe2c'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '080d34f6-38c6-585e-a1e8-a3895d689239', 'd25c47db-8b8e-5a3b-bba0-c98b8c0cbe2c', 'resumes',
  'd25c47db-8b8e-5a3b-bba0-c98b8c0cbe2c/resumes/080d34f6-38c6-585e-a1e8-a3895d689239/g7-pt-03.pdf',
  'g7-pt-03.pdf',
  'Performance and Reliability Test Engineer',
  'application/pdf', 591666, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '869b8334-bf46-5790-a8c9-c4d394956d13', '644919cf-d485-567c-b03e-62ba618e78b1', 'd25c47db-8b8e-5a3b-bba0-c98b8c0cbe2c', '080d34f6-38c6-585e-a1e8-a3895d689239',
  'Cover letter -- Performance and Reliability Test Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G7-PT-04 (group 7 QA/Testing / Performance Tester): Performance Tester (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a6e6a331-00da-5383-bbbe-6086b8b68dec',
  'authenticated', 'authenticated', 'g7-pt-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Hoang Thi Bich Tram'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'a6e6a331-00da-5383-bbbe-6086b8b68dec',
  jsonb_build_object('sub', 'a6e6a331-00da-5383-bbbe-6086b8b68dec'::text, 'email', 'g7-pt-04@seed.local'),
  'email', 'a6e6a331-00da-5383-bbbe-6086b8b68dec'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '44ada2ad-6ebf-56e4-8c92-2dc740ce12f3', 'a6e6a331-00da-5383-bbbe-6086b8b68dec', 'resumes',
  'a6e6a331-00da-5383-bbbe-6086b8b68dec/resumes/44ada2ad-6ebf-56e4-8c92-2dc740ce12f3/g7-pt-04.pdf',
  'g7-pt-04.pdf',
  'Performance Tester (Fresher)',
  'application/pdf', 587809, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '15669dc9-afd8-5e0d-b807-0297440ce610', '644919cf-d485-567c-b03e-62ba618e78b1', 'a6e6a331-00da-5383-bbbe-6086b8b68dec', '44ada2ad-6ebf-56e4-8c92-2dc740ce12f3',
  'Cover letter -- Performance Tester (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G7-PT-05 (group 7 QA/Testing / Performance Tester): Senior Performance Engineer (Core Banking and Payments)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'fb251012-f05e-50da-b4b6-090ad30931f5',
  'authenticated', 'authenticated', 'g7-pt-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Tran Dinh Bao'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'fb251012-f05e-50da-b4b6-090ad30931f5',
  jsonb_build_object('sub', 'fb251012-f05e-50da-b4b6-090ad30931f5'::text, 'email', 'g7-pt-05@seed.local'),
  'email', 'fb251012-f05e-50da-b4b6-090ad30931f5'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'f5e9f29e-e589-5917-b8a1-ec7d49e5ba93', 'fb251012-f05e-50da-b4b6-090ad30931f5', 'resumes',
  'fb251012-f05e-50da-b4b6-090ad30931f5/resumes/f5e9f29e-e589-5917-b8a1-ec7d49e5ba93/g7-pt-05.pdf',
  'g7-pt-05.pdf',
  'Senior Performance Engineer (Core Banking and Payments)',
  'application/pdf', 590612, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'a0d308f5-a9d5-5bf5-a3d7-69d8b1b11cfa', '644919cf-d485-567c-b03e-62ba618e78b1', 'fb251012-f05e-50da-b4b6-090ad30931f5', 'f5e9f29e-e589-5917-b8a1-ec7d49e5ba93',
  'Cover letter -- Senior Performance Engineer (Core Banking and Payments)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'a0d308f5-a9d5-5bf5-a3d7-69d8b1b11cfa', '22222222-2222-2222-2222-222222222222', 'offer'::public.application_status,
  'Seed pipeline offer', false
);

-- G8-BA-01 (group 8 Project/Product Management / Business Analyst): Senior Business Analyst (Banking)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '1ed10963-3303-5651-af5e-603efe699281',
  'authenticated', 'authenticated', 'g8-ba-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Thi Kieu Oanh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '1ed10963-3303-5651-af5e-603efe699281',
  jsonb_build_object('sub', '1ed10963-3303-5651-af5e-603efe699281'::text, 'email', 'g8-ba-01@seed.local'),
  'email', '1ed10963-3303-5651-af5e-603efe699281'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'd3e4db28-95d1-5e39-be23-09c62df954a1', '1ed10963-3303-5651-af5e-603efe699281', 'resumes',
  '1ed10963-3303-5651-af5e-603efe699281/resumes/d3e4db28-95d1-5e39-be23-09c62df954a1/g8-ba-01.pdf',
  'g8-ba-01.pdf',
  'Senior Business Analyst (Banking)',
  'application/pdf', 591653, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '00b291d7-a3bf-5848-b737-caee23062a6a', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', '1ed10963-3303-5651-af5e-603efe699281', 'd3e4db28-95d1-5e39-be23-09c62df954a1',
  'Cover letter -- Senior Business Analyst (Banking)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G8-BA-02 (group 8 Project/Product Management / Business Analyst): Business Analyst (Junior)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '29d414a3-afdd-5457-bded-4e95de65cf12',
  'authenticated', 'authenticated', 'g8-ba-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Truong Van Minh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '29d414a3-afdd-5457-bded-4e95de65cf12',
  jsonb_build_object('sub', '29d414a3-afdd-5457-bded-4e95de65cf12'::text, 'email', 'g8-ba-02@seed.local'),
  'email', '29d414a3-afdd-5457-bded-4e95de65cf12'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'f89c4cfc-4a97-55cd-8477-b8f81cc762a8', '29d414a3-afdd-5457-bded-4e95de65cf12', 'resumes',
  '29d414a3-afdd-5457-bded-4e95de65cf12/resumes/f89c4cfc-4a97-55cd-8477-b8f81cc762a8/g8-ba-02.pdf',
  'g8-ba-02.pdf',
  'Business Analyst (Junior)',
  'application/pdf', 587020, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '84ebde5a-b54e-55b3-aeb0-d578e05cdec4', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', '29d414a3-afdd-5457-bded-4e95de65cf12', 'f89c4cfc-4a97-55cd-8477-b8f81cc762a8',
  'Cover letter -- Business Analyst (Junior)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G8-BA-03 (group 8 Project/Product Management / Business Analyst): Business Analyst (data / reporting systems)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '9d0201d4-6453-5062-b4be-fbe4c700782a',
  'authenticated', 'authenticated', 'g8-ba-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Le Thi Anh Thu'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '9d0201d4-6453-5062-b4be-fbe4c700782a',
  jsonb_build_object('sub', '9d0201d4-6453-5062-b4be-fbe4c700782a'::text, 'email', 'g8-ba-03@seed.local'),
  'email', '9d0201d4-6453-5062-b4be-fbe4c700782a'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '96f47415-4f2c-516d-a0cd-7a3acddf1d2b', '9d0201d4-6453-5062-b4be-fbe4c700782a', 'resumes',
  '9d0201d4-6453-5062-b4be-fbe4c700782a/resumes/96f47415-4f2c-516d-a0cd-7a3acddf1d2b/g8-ba-03.pdf',
  'g8-ba-03.pdf',
  'Business Analyst (data / reporting systems)',
  'application/pdf', 590610, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'cd344ebe-9f1f-5748-a084-cc79f12f1653', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', '9d0201d4-6453-5062-b4be-fbe4c700782a', '96f47415-4f2c-516d-a0cd-7a3acddf1d2b',
  'Cover letter -- Business Analyst (data / reporting systems)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'cd344ebe-9f1f-5748-a084-cc79f12f1653', '22222222-2222-2222-2222-222222222222', 'rejected'::public.application_status,
  'Seed pipeline rejected', false
);

-- G8-BA-04 (group 8 Project/Product Management / Business Analyst): Business Analyst (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '8885197d-7463-58ab-ac08-fd0072bcdbb5',
  'authenticated', 'authenticated', 'g8-ba-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Tran Van Hieu'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '8885197d-7463-58ab-ac08-fd0072bcdbb5',
  jsonb_build_object('sub', '8885197d-7463-58ab-ac08-fd0072bcdbb5'::text, 'email', 'g8-ba-04@seed.local'),
  'email', '8885197d-7463-58ab-ac08-fd0072bcdbb5'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '5c9b0369-0f91-557a-b372-95395dad32fb', '8885197d-7463-58ab-ac08-fd0072bcdbb5', 'resumes',
  '8885197d-7463-58ab-ac08-fd0072bcdbb5/resumes/5c9b0369-0f91-557a-b372-95395dad32fb/g8-ba-04.pdf',
  'g8-ba-04.pdf',
  'Business Analyst (Fresher)',
  'application/pdf', 587711, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '37a8153d-7f55-5ec3-80dc-ff442e73799c', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', '8885197d-7463-58ab-ac08-fd0072bcdbb5', '5c9b0369-0f91-557a-b372-95395dad32fb',
  'Cover letter -- Business Analyst (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G8-BA-05 (group 8 Project/Product Management / Business Analyst): Senior Business Analyst (Banking)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '404bddf4-d39d-52dd-b9f7-e1d9c1cf7462',
  'authenticated', 'authenticated', 'g8-ba-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Hoang Thi Mai Phuong'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '404bddf4-d39d-52dd-b9f7-e1d9c1cf7462',
  jsonb_build_object('sub', '404bddf4-d39d-52dd-b9f7-e1d9c1cf7462'::text, 'email', 'g8-ba-05@seed.local'),
  'email', '404bddf4-d39d-52dd-b9f7-e1d9c1cf7462'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '968e60de-6096-5b21-8901-5892320a6490', '404bddf4-d39d-52dd-b9f7-e1d9c1cf7462', 'resumes',
  '404bddf4-d39d-52dd-b9f7-e1d9c1cf7462/resumes/968e60de-6096-5b21-8901-5892320a6490/g8-ba-05.pdf',
  'g8-ba-05.pdf',
  'Senior Business Analyst (Banking)',
  'application/pdf', 589803, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'ff26b10c-30a6-5152-8bd6-404b1b888f1d', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', '404bddf4-d39d-52dd-b9f7-e1d9c1cf7462', '968e60de-6096-5b21-8901-5892320a6490',
  'Cover letter -- Senior Business Analyst (Banking)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G8-PDM-01 (group 8 Project/Product Management / Product Manager): Senior Product Manager (Fintech)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '76451d25-1bf7-56a7-9f27-b5ac7fa68f1a',
  'authenticated', 'authenticated', 'g8-pdm-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Tran Le Minh Thu'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '76451d25-1bf7-56a7-9f27-b5ac7fa68f1a',
  jsonb_build_object('sub', '76451d25-1bf7-56a7-9f27-b5ac7fa68f1a'::text, 'email', 'g8-pdm-01@seed.local'),
  'email', '76451d25-1bf7-56a7-9f27-b5ac7fa68f1a'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '0c9efac1-3d31-5e2a-b4fd-d39d78d34696', '76451d25-1bf7-56a7-9f27-b5ac7fa68f1a', 'resumes',
  '76451d25-1bf7-56a7-9f27-b5ac7fa68f1a/resumes/0c9efac1-3d31-5e2a-b4fd-d39d78d34696/g8-pdm-01.pdf',
  'g8-pdm-01.pdf',
  'Senior Product Manager (Fintech)',
  'application/pdf', 591797, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '4f732395-552f-503f-acbf-120c193d62aa', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', '76451d25-1bf7-56a7-9f27-b5ac7fa68f1a', '0c9efac1-3d31-5e2a-b4fd-d39d78d34696',
  'Cover letter -- Senior Product Manager (Fintech)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '4f732395-552f-503f-acbf-120c193d62aa', '22222222-2222-2222-2222-222222222222', 'screening'::public.application_status,
  'Seed pipeline screening', false
);

-- G8-PDM-02 (group 8 Project/Product Management / Product Manager): Product Manager
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '62fb8398-cca5-5b34-b66d-14396960cb2e',
  'authenticated', 'authenticated', 'g8-pdm-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Hoang An'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '62fb8398-cca5-5b34-b66d-14396960cb2e',
  jsonb_build_object('sub', '62fb8398-cca5-5b34-b66d-14396960cb2e'::text, 'email', 'g8-pdm-02@seed.local'),
  'email', '62fb8398-cca5-5b34-b66d-14396960cb2e'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'cab13683-e9d5-5d54-bb74-f9cfa63d3fd8', '62fb8398-cca5-5b34-b66d-14396960cb2e', 'resumes',
  '62fb8398-cca5-5b34-b66d-14396960cb2e/resumes/cab13683-e9d5-5d54-bb74-f9cfa63d3fd8/g8-pdm-02.pdf',
  'g8-pdm-02.pdf',
  'Product Manager',
  'application/pdf', 587067, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '1532e26b-21ee-518d-b2ee-bcfda27cb953', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', '62fb8398-cca5-5b34-b66d-14396960cb2e', 'cab13683-e9d5-5d54-bb74-f9cfa63d3fd8',
  'Cover letter -- Product Manager'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G8-PDM-03 (group 8 Project/Product Management / Product Manager): Product Manager (data-facing products)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '577acf90-ad31-53db-9d17-05b675a1a885',
  'authenticated', 'authenticated', 'g8-pdm-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vu Quoc Thai'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '577acf90-ad31-53db-9d17-05b675a1a885',
  jsonb_build_object('sub', '577acf90-ad31-53db-9d17-05b675a1a885'::text, 'email', 'g8-pdm-03@seed.local'),
  'email', '577acf90-ad31-53db-9d17-05b675a1a885'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '437e9ce8-f9a6-5555-866b-008fe37e2ed7', '577acf90-ad31-53db-9d17-05b675a1a885', 'resumes',
  '577acf90-ad31-53db-9d17-05b675a1a885/resumes/437e9ce8-f9a6-5555-866b-008fe37e2ed7/g8-pdm-03.pdf',
  'g8-pdm-03.pdf',
  'Product Manager (data-facing products)',
  'application/pdf', 590631, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'e890a54b-4a6a-5b26-9d65-e5bf6a3acd4d', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', '577acf90-ad31-53db-9d17-05b675a1a885', '437e9ce8-f9a6-5555-866b-008fe37e2ed7',
  'Cover letter -- Product Manager (data-facing products)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G8-PDM-04 (group 8 Project/Product Management / Product Manager): Associate Product Manager (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '78ceb391-b182-5972-8f8f-d8ff5f63b7cb',
  'authenticated', 'authenticated', 'g8-pdm-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Thi Mai Linh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '78ceb391-b182-5972-8f8f-d8ff5f63b7cb',
  jsonb_build_object('sub', '78ceb391-b182-5972-8f8f-d8ff5f63b7cb'::text, 'email', 'g8-pdm-04@seed.local'),
  'email', '78ceb391-b182-5972-8f8f-d8ff5f63b7cb'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'f94e2f1d-3f16-5f06-84a3-e239cb509cdf', '78ceb391-b182-5972-8f8f-d8ff5f63b7cb', 'resumes',
  '78ceb391-b182-5972-8f8f-d8ff5f63b7cb/resumes/f94e2f1d-3f16-5f06-84a3-e239cb509cdf/g8-pdm-04.pdf',
  'g8-pdm-04.pdf',
  'Associate Product Manager (Fresher)',
  'application/pdf', 587864, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '07e95a03-d7c1-5df3-9165-0223d95584fc', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', '78ceb391-b182-5972-8f8f-d8ff5f63b7cb', 'f94e2f1d-3f16-5f06-84a3-e239cb509cdf',
  'Cover letter -- Associate Product Manager (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '07e95a03-d7c1-5df3-9165-0223d95584fc', '22222222-2222-2222-2222-222222222222', 'interview'::public.application_status,
  'Seed pipeline interview', false
);

-- G8-PDM-05 (group 8 Project/Product Management / Product Manager): Senior Product Manager (E-commerce)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'facc4eae-f196-54cd-967d-46faa09c0106',
  'authenticated', 'authenticated', 'g8-pdm-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Do Thi Lan Anh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'facc4eae-f196-54cd-967d-46faa09c0106',
  jsonb_build_object('sub', 'facc4eae-f196-54cd-967d-46faa09c0106'::text, 'email', 'g8-pdm-05@seed.local'),
  'email', 'facc4eae-f196-54cd-967d-46faa09c0106'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '486fb385-4714-5ae8-aa8b-fef509fb132e', 'facc4eae-f196-54cd-967d-46faa09c0106', 'resumes',
  'facc4eae-f196-54cd-967d-46faa09c0106/resumes/486fb385-4714-5ae8-aa8b-fef509fb132e/g8-pdm-05.pdf',
  'g8-pdm-05.pdf',
  'Senior Product Manager (E-commerce)',
  'application/pdf', 590061, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '58fc41d2-3e41-585d-9051-ab3837e67e8c', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', 'facc4eae-f196-54cd-967d-46faa09c0106', '486fb385-4714-5ae8-aa8b-fef509fb132e',
  'Cover letter -- Senior Product Manager (E-commerce)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G8-PO-01 (group 8 Project/Product Management / Product Owner): Senior Product Owner (Insurance platform)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '0dc644e3-0ad4-5fe5-8fb6-ef4d67f7c6ad',
  'authenticated', 'authenticated', 'g8-po-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Ngo Duc Trung'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '0dc644e3-0ad4-5fe5-8fb6-ef4d67f7c6ad',
  jsonb_build_object('sub', '0dc644e3-0ad4-5fe5-8fb6-ef4d67f7c6ad'::text, 'email', 'g8-po-01@seed.local'),
  'email', '0dc644e3-0ad4-5fe5-8fb6-ef4d67f7c6ad'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'faad49db-de87-5851-85d2-e51c61fd7e4a', '0dc644e3-0ad4-5fe5-8fb6-ef4d67f7c6ad', 'resumes',
  '0dc644e3-0ad4-5fe5-8fb6-ef4d67f7c6ad/resumes/faad49db-de87-5851-85d2-e51c61fd7e4a/g8-po-01.pdf',
  'g8-po-01.pdf',
  'Senior Product Owner (Insurance platform)',
  'application/pdf', 591821, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'ce62d0b4-98e0-5efd-bd77-2799cb895974', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', '0dc644e3-0ad4-5fe5-8fb6-ef4d67f7c6ad', 'faad49db-de87-5851-85d2-e51c61fd7e4a',
  'Cover letter -- Senior Product Owner (Insurance platform)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G8-PO-02 (group 8 Project/Product Management / Product Owner): Product Owner
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'b03f63c8-cab7-52a8-bd5e-78d4c65b31a5',
  'authenticated', 'authenticated', 'g8-po-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Tran Thi Hue Chi'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'b03f63c8-cab7-52a8-bd5e-78d4c65b31a5',
  jsonb_build_object('sub', 'b03f63c8-cab7-52a8-bd5e-78d4c65b31a5'::text, 'email', 'g8-po-02@seed.local'),
  'email', 'b03f63c8-cab7-52a8-bd5e-78d4c65b31a5'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '5b44b058-d1ba-5123-8986-49af32f90867', 'b03f63c8-cab7-52a8-bd5e-78d4c65b31a5', 'resumes',
  'b03f63c8-cab7-52a8-bd5e-78d4c65b31a5/resumes/5b44b058-d1ba-5123-8986-49af32f90867/g8-po-02.pdf',
  'g8-po-02.pdf',
  'Product Owner',
  'application/pdf', 586988, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '2d38e826-2626-507a-b05b-347feaa05ea2', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', 'b03f63c8-cab7-52a8-bd5e-78d4c65b31a5', '5b44b058-d1ba-5123-8986-49af32f90867',
  'Cover letter -- Product Owner'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '2d38e826-2626-507a-b05b-347feaa05ea2', '22222222-2222-2222-2222-222222222222', 'offer'::public.application_status,
  'Seed pipeline offer', false
);

-- G8-PO-03 (group 8 Project/Product Management / Product Owner): Product Owner (ERP / finance systems)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'ab40cdfd-d20d-54a7-babb-55d1a107e51f',
  'authenticated', 'authenticated', 'g8-po-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Ho Minh Quan'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'ab40cdfd-d20d-54a7-babb-55d1a107e51f',
  jsonb_build_object('sub', 'ab40cdfd-d20d-54a7-babb-55d1a107e51f'::text, 'email', 'g8-po-03@seed.local'),
  'email', 'ab40cdfd-d20d-54a7-babb-55d1a107e51f'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '52caea3f-29c5-50e9-9656-e092f7c102b2', 'ab40cdfd-d20d-54a7-babb-55d1a107e51f', 'resumes',
  'ab40cdfd-d20d-54a7-babb-55d1a107e51f/resumes/52caea3f-29c5-50e9-9656-e092f7c102b2/g8-po-03.pdf',
  'g8-po-03.pdf',
  'Product Owner (ERP / finance systems)',
  'application/pdf', 590982, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '8141444d-d05c-5579-8473-5d6dbd49942a', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', 'ab40cdfd-d20d-54a7-babb-55d1a107e51f', '52caea3f-29c5-50e9-9656-e092f7c102b2',
  'Cover letter -- Product Owner (ERP / finance systems)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G8-PO-04 (group 8 Project/Product Management / Product Owner): Associate Product Owner (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '7abe938a-59ca-58a8-8fd9-571ad1a5152f',
  'authenticated', 'authenticated', 'g8-po-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Do Thi Thu Huyen'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '7abe938a-59ca-58a8-8fd9-571ad1a5152f',
  jsonb_build_object('sub', '7abe938a-59ca-58a8-8fd9-571ad1a5152f'::text, 'email', 'g8-po-04@seed.local'),
  'email', '7abe938a-59ca-58a8-8fd9-571ad1a5152f'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'a88c0277-c455-5864-9151-2cec9d8dcdf7', '7abe938a-59ca-58a8-8fd9-571ad1a5152f', 'resumes',
  '7abe938a-59ca-58a8-8fd9-571ad1a5152f/resumes/a88c0277-c455-5864-9151-2cec9d8dcdf7/g8-po-04.pdf',
  'g8-po-04.pdf',
  'Associate Product Owner (Fresher)',
  'application/pdf', 587643, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '7b2d1592-ff02-5b5d-8e77-4a60ce5e7c9e', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', '7abe938a-59ca-58a8-8fd9-571ad1a5152f', 'a88c0277-c455-5864-9151-2cec9d8dcdf7',
  'Cover letter -- Associate Product Owner (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G8-PO-05 (group 8 Project/Product Management / Product Owner): Senior Product Owner (Logistics Platform)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'd9795864-6243-5dfc-80d5-a2392815b829',
  'authenticated', 'authenticated', 'g8-po-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Thanh Son'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'd9795864-6243-5dfc-80d5-a2392815b829',
  jsonb_build_object('sub', 'd9795864-6243-5dfc-80d5-a2392815b829'::text, 'email', 'g8-po-05@seed.local'),
  'email', 'd9795864-6243-5dfc-80d5-a2392815b829'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '83c7f562-bbbb-5e17-be1c-f407dc8ade58', 'd9795864-6243-5dfc-80d5-a2392815b829', 'resumes',
  'd9795864-6243-5dfc-80d5-a2392815b829/resumes/83c7f562-bbbb-5e17-be1c-f407dc8ade58/g8-po-05.pdf',
  'g8-po-05.pdf',
  'Senior Product Owner (Logistics Platform)',
  'application/pdf', 589820, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'b55dbb30-6519-56b7-a523-4e4f4071fc1c', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78', 'd9795864-6243-5dfc-80d5-a2392815b829', '83c7f562-bbbb-5e17-be1c-f407dc8ade58',
  'Cover letter -- Senior Product Owner (Logistics Platform)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'b55dbb30-6519-56b7-a523-4e4f4071fc1c', '22222222-2222-2222-2222-222222222222', 'rejected'::public.application_status,
  'Seed pipeline rejected', false
);

-- G9-CA-01 (group 9 Architecture / Cloud Architect): Cloud Architect (AWS)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'b2ea2215-1129-5dfa-9d02-d6306f484c6d',
  'authenticated', 'authenticated', 'g9-ca-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Trinh Thi Thu Hang'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'b2ea2215-1129-5dfa-9d02-d6306f484c6d',
  jsonb_build_object('sub', 'b2ea2215-1129-5dfa-9d02-d6306f484c6d'::text, 'email', 'g9-ca-01@seed.local'),
  'email', 'b2ea2215-1129-5dfa-9d02-d6306f484c6d'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '7eb33ea4-c685-5568-92d8-f54572564a82', 'b2ea2215-1129-5dfa-9d02-d6306f484c6d', 'resumes',
  'b2ea2215-1129-5dfa-9d02-d6306f484c6d/resumes/7eb33ea4-c685-5568-92d8-f54572564a82/g9-ca-01.pdf',
  'g9-ca-01.pdf',
  'Cloud Architect (AWS)',
  'application/pdf', 591805, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '623e41b5-2d0b-5b3f-ba0f-3b6663f2263b', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', 'b2ea2215-1129-5dfa-9d02-d6306f484c6d', '7eb33ea4-c685-5568-92d8-f54572564a82',
  'Cover letter -- Cloud Architect (AWS)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G9-CA-02 (group 9 Architecture / Cloud Architect): Cloud Architect / Senior DevOps
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '1e36ab77-afe3-5c1d-9eea-9fccf054c9cf',
  'authenticated', 'authenticated', 'g9-ca-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Trong Nhan'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '1e36ab77-afe3-5c1d-9eea-9fccf054c9cf',
  jsonb_build_object('sub', '1e36ab77-afe3-5c1d-9eea-9fccf054c9cf'::text, 'email', 'g9-ca-02@seed.local'),
  'email', '1e36ab77-afe3-5c1d-9eea-9fccf054c9cf'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'ac936692-618e-5419-a5ee-2f5f35c43b85', '1e36ab77-afe3-5c1d-9eea-9fccf054c9cf', 'resumes',
  '1e36ab77-afe3-5c1d-9eea-9fccf054c9cf/resumes/ac936692-618e-5419-a5ee-2f5f35c43b85/g9-ca-02.pdf',
  'g9-ca-02.pdf',
  'Cloud Architect / Senior DevOps',
  'application/pdf', 587335, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'f998ece9-c88d-5f2a-8018-2c9f44ada1e7', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', '1e36ab77-afe3-5c1d-9eea-9fccf054c9cf', 'ac936692-618e-5419-a5ee-2f5f35c43b85',
  'Cover letter -- Cloud Architect / Senior DevOps'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G9-CA-03 (group 9 Architecture / Cloud Architect): Cloud Architect (network & security focus)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'ca1be833-a826-5b6f-a3a5-cd68e654d70f',
  'authenticated', 'authenticated', 'g9-ca-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Doan Van Kiet'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'ca1be833-a826-5b6f-a3a5-cd68e654d70f',
  jsonb_build_object('sub', 'ca1be833-a826-5b6f-a3a5-cd68e654d70f'::text, 'email', 'g9-ca-03@seed.local'),
  'email', 'ca1be833-a826-5b6f-a3a5-cd68e654d70f'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '674c2558-1b15-5788-97e7-097212a44608', 'ca1be833-a826-5b6f-a3a5-cd68e654d70f', 'resumes',
  'ca1be833-a826-5b6f-a3a5-cd68e654d70f/resumes/674c2558-1b15-5788-97e7-097212a44608/g9-ca-03.pdf',
  'g9-ca-03.pdf',
  'Cloud Architect (network & security focus)',
  'application/pdf', 591660, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'b2b55815-6b41-5328-8c0b-8cb11eae25f7', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', 'ca1be833-a826-5b6f-a3a5-cd68e654d70f', '674c2558-1b15-5788-97e7-097212a44608',
  'Cover letter -- Cloud Architect (network & security focus)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'b2b55815-6b41-5328-8c0b-8cb11eae25f7', '22222222-2222-2222-2222-222222222222', 'screening'::public.application_status,
  'Seed pipeline screening', false
);

-- G9-CA-04 (group 9 Architecture / Cloud Architect): Cloud Engineer / Junior Cloud Architect (Fresher, architecture track)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'eba0f18c-1d32-5b18-bcf1-43750e6aa3d2',
  'authenticated', 'authenticated', 'g9-ca-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Hoang Thi Kim Chi'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'eba0f18c-1d32-5b18-bcf1-43750e6aa3d2',
  jsonb_build_object('sub', 'eba0f18c-1d32-5b18-bcf1-43750e6aa3d2'::text, 'email', 'g9-ca-04@seed.local'),
  'email', 'eba0f18c-1d32-5b18-bcf1-43750e6aa3d2'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '9920b8f8-2daa-5be9-a2e1-f1524af2f3ef', 'eba0f18c-1d32-5b18-bcf1-43750e6aa3d2', 'resumes',
  'eba0f18c-1d32-5b18-bcf1-43750e6aa3d2/resumes/9920b8f8-2daa-5be9-a2e1-f1524af2f3ef/g9-ca-04.pdf',
  'g9-ca-04.pdf',
  'Cloud Engineer / Junior Cloud Architect (Fresher, architecture track)',
  'application/pdf', 588039, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '79280c23-c58d-5101-9e67-4f7946ec0d2f', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', 'eba0f18c-1d32-5b18-bcf1-43750e6aa3d2', '9920b8f8-2daa-5be9-a2e1-f1524af2f3ef',
  'Cover letter -- Cloud Engineer / Junior Cloud Architect (Fresher, architecture track)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G9-CA-05 (group 9 Architecture / Cloud Architect): Senior Cloud Architect (Azure & Multi-cloud, Banking)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'c0624506-57c4-5825-b8bc-8c6994b614d9',
  'authenticated', 'authenticated', 'g9-ca-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Thi Ngoc Anh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'c0624506-57c4-5825-b8bc-8c6994b614d9',
  jsonb_build_object('sub', 'c0624506-57c4-5825-b8bc-8c6994b614d9'::text, 'email', 'g9-ca-05@seed.local'),
  'email', 'c0624506-57c4-5825-b8bc-8c6994b614d9'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'c7458103-ad1d-58b4-8abe-a32c6b6447ef', 'c0624506-57c4-5825-b8bc-8c6994b614d9', 'resumes',
  'c0624506-57c4-5825-b8bc-8c6994b614d9/resumes/c7458103-ad1d-58b4-8abe-a32c6b6447ef/g9-ca-05.pdf',
  'g9-ca-05.pdf',
  'Senior Cloud Architect (Azure & Multi-cloud, Banking)',
  'application/pdf', 589705, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'db827e00-832b-526c-a4f3-9d96154c8c15', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', 'c0624506-57c4-5825-b8bc-8c6994b614d9', 'c7458103-ad1d-58b4-8abe-a32c6b6447ef',
  'Cover letter -- Senior Cloud Architect (Azure & Multi-cloud, Banking)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G9-EA-01 (group 9 Architecture / Enterprise Architect): Head of Enterprise Architecture
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '04961895-16f4-5887-ae77-a943713ffa3f',
  'authenticated', 'authenticated', 'g9-ea-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Hoang Thi Minh Hang'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '04961895-16f4-5887-ae77-a943713ffa3f',
  jsonb_build_object('sub', '04961895-16f4-5887-ae77-a943713ffa3f'::text, 'email', 'g9-ea-01@seed.local'),
  'email', '04961895-16f4-5887-ae77-a943713ffa3f'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '825ab2b4-5178-5784-aace-4c7be9171bb2', '04961895-16f4-5887-ae77-a943713ffa3f', 'resumes',
  '04961895-16f4-5887-ae77-a943713ffa3f/resumes/825ab2b4-5178-5784-aace-4c7be9171bb2/g9-ea-01.pdf',
  'g9-ea-01.pdf',
  'Head of Enterprise Architecture',
  'application/pdf', 592016, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'c559a115-dd25-5d6b-bf9e-a78b86a8fbb0', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', '04961895-16f4-5887-ae77-a943713ffa3f', '825ab2b4-5178-5784-aace-4c7be9171bb2',
  'Cover letter -- Head of Enterprise Architecture'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'c559a115-dd25-5d6b-bf9e-a78b86a8fbb0', '22222222-2222-2222-2222-222222222222', 'interview'::public.application_status,
  'Seed pipeline interview', false
);

-- G9-EA-02 (group 9 Architecture / Enterprise Architect): Enterprise Architect
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '7669c675-8470-56e4-908c-930dd07331a2',
  'authenticated', 'authenticated', 'g9-ea-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Dang Van Sang'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '7669c675-8470-56e4-908c-930dd07331a2',
  jsonb_build_object('sub', '7669c675-8470-56e4-908c-930dd07331a2'::text, 'email', 'g9-ea-02@seed.local'),
  'email', '7669c675-8470-56e4-908c-930dd07331a2'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '6e5a20b7-d617-5c39-8c1d-8cc2ea4c64d4', '7669c675-8470-56e4-908c-930dd07331a2', 'resumes',
  '7669c675-8470-56e4-908c-930dd07331a2/resumes/6e5a20b7-d617-5c39-8c1d-8cc2ea4c64d4/g9-ea-02.pdf',
  'g9-ea-02.pdf',
  'Enterprise Architect',
  'application/pdf', 587224, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '7ac273f8-e5ad-5efc-973e-06b2d4b0515f', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', '7669c675-8470-56e4-908c-930dd07331a2', '6e5a20b7-d617-5c39-8c1d-8cc2ea4c64d4',
  'Cover letter -- Enterprise Architect'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G9-EA-03 (group 9 Architecture / Enterprise Architect): Enterprise Architect (data & compliance focus)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '7fb707f4-3787-53ff-8589-2c9aed1b6aba',
  'authenticated', 'authenticated', 'g9-ea-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Mai Van Hoan'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '7fb707f4-3787-53ff-8589-2c9aed1b6aba',
  jsonb_build_object('sub', '7fb707f4-3787-53ff-8589-2c9aed1b6aba'::text, 'email', 'g9-ea-03@seed.local'),
  'email', '7fb707f4-3787-53ff-8589-2c9aed1b6aba'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '4ef51afb-f931-58a2-aa0d-4ccb2b63caee', '7fb707f4-3787-53ff-8589-2c9aed1b6aba', 'resumes',
  '7fb707f4-3787-53ff-8589-2c9aed1b6aba/resumes/4ef51afb-f931-58a2-aa0d-4ccb2b63caee/g9-ea-03.pdf',
  'g9-ea-03.pdf',
  'Enterprise Architect (data & compliance focus)',
  'application/pdf', 591601, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '765b0a42-849b-5e68-bed4-99162cafd212', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', '7fb707f4-3787-53ff-8589-2c9aed1b6aba', '4ef51afb-f931-58a2-aa0d-4ccb2b63caee',
  'Cover letter -- Enterprise Architect (data & compliance focus)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G9-EA-04 (group 9 Architecture / Enterprise Architect): IT Strategy & Enterprise Architecture Analyst (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'e127b99d-c0aa-5812-af36-40f5af0af4b4',
  'authenticated', 'authenticated', 'g9-ea-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Van Thanh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'e127b99d-c0aa-5812-af36-40f5af0af4b4',
  jsonb_build_object('sub', 'e127b99d-c0aa-5812-af36-40f5af0af4b4'::text, 'email', 'g9-ea-04@seed.local'),
  'email', 'e127b99d-c0aa-5812-af36-40f5af0af4b4'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '7dd646b9-8b3b-5aa8-bd40-3542c2fb1408', 'e127b99d-c0aa-5812-af36-40f5af0af4b4', 'resumes',
  'e127b99d-c0aa-5812-af36-40f5af0af4b4/resumes/7dd646b9-8b3b-5aa8-bd40-3542c2fb1408/g9-ea-04.pdf',
  'g9-ea-04.pdf',
  'IT Strategy & Enterprise Architecture Analyst (Fresher)',
  'application/pdf', 587801, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'e89b1b0d-9c82-59e8-988e-d6cce6618f2c', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', 'e127b99d-c0aa-5812-af36-40f5af0af4b4', '7dd646b9-8b3b-5aa8-bd40-3542c2fb1408',
  'Cover letter -- IT Strategy & Enterprise Architecture Analyst (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'e89b1b0d-9c82-59e8-988e-d6cce6618f2c', '22222222-2222-2222-2222-222222222222', 'offer'::public.application_status,
  'Seed pipeline offer', false
);

-- G9-EA-05 (group 9 Architecture / Enterprise Architect): Senior Enterprise Architect (Telecom Group)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '7509c450-f487-5305-9ff7-d204cace1ab2',
  'authenticated', 'authenticated', 'g9-ea-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Ngo Thi Bich Ngoc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '7509c450-f487-5305-9ff7-d204cace1ab2',
  jsonb_build_object('sub', '7509c450-f487-5305-9ff7-d204cace1ab2'::text, 'email', 'g9-ea-05@seed.local'),
  'email', '7509c450-f487-5305-9ff7-d204cace1ab2'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '9a084cf1-3aa7-520a-af1e-3e8bc2fab69e', '7509c450-f487-5305-9ff7-d204cace1ab2', 'resumes',
  '7509c450-f487-5305-9ff7-d204cace1ab2/resumes/9a084cf1-3aa7-520a-af1e-3e8bc2fab69e/g9-ea-05.pdf',
  'g9-ea-05.pdf',
  'Senior Enterprise Architect (Telecom Group)',
  'application/pdf', 589684, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '6828495e-8713-5fbf-b7e7-1caae4bda15d', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', '7509c450-f487-5305-9ff7-d204cace1ab2', '9a084cf1-3aa7-520a-af1e-3e8bc2fab69e',
  'Cover letter -- Senior Enterprise Architect (Telecom Group)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G9-SWA-01 (group 9 Architecture / Software Architect): Software Architect / Principal Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'cf238388-9fcc-52f7-9b4a-3d534bf13025',
  'authenticated', 'authenticated', 'g9-swa-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Tran Ngoc Hai'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'cf238388-9fcc-52f7-9b4a-3d534bf13025',
  jsonb_build_object('sub', 'cf238388-9fcc-52f7-9b4a-3d534bf13025'::text, 'email', 'g9-swa-01@seed.local'),
  'email', 'cf238388-9fcc-52f7-9b4a-3d534bf13025'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'f0ac4209-899e-536e-98d1-66fc140197c7', 'cf238388-9fcc-52f7-9b4a-3d534bf13025', 'resumes',
  'cf238388-9fcc-52f7-9b4a-3d534bf13025/resumes/f0ac4209-899e-536e-98d1-66fc140197c7/g9-swa-01.pdf',
  'g9-swa-01.pdf',
  'Software Architect / Principal Engineer',
  'application/pdf', 591937, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'e2984f81-85ed-52b6-892e-df8e216434e1', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', 'cf238388-9fcc-52f7-9b4a-3d534bf13025', 'f0ac4209-899e-536e-98d1-66fc140197c7',
  'Cover letter -- Software Architect / Principal Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G9-SWA-02 (group 9 Architecture / Software Architect): Software Architect / Technical Lead
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '17026385-c04b-508d-8d07-44d37bb4f6f5',
  'authenticated', 'authenticated', 'g9-swa-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vu Van Truong'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '17026385-c04b-508d-8d07-44d37bb4f6f5',
  jsonb_build_object('sub', '17026385-c04b-508d-8d07-44d37bb4f6f5'::text, 'email', 'g9-swa-02@seed.local'),
  'email', '17026385-c04b-508d-8d07-44d37bb4f6f5'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '8f32803b-0af8-5da4-a2bf-264661cc8e90', '17026385-c04b-508d-8d07-44d37bb4f6f5', 'resumes',
  '17026385-c04b-508d-8d07-44d37bb4f6f5/resumes/8f32803b-0af8-5da4-a2bf-264661cc8e90/g9-swa-02.pdf',
  'g9-swa-02.pdf',
  'Software Architect / Technical Lead',
  'application/pdf', 587202, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'cc8a21f0-2c35-5021-b146-7b2379f03e3c', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', '17026385-c04b-508d-8d07-44d37bb4f6f5', '8f32803b-0af8-5da4-a2bf-264661cc8e90',
  'Cover letter -- Software Architect / Technical Lead'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'cc8a21f0-2c35-5021-b146-7b2379f03e3c', '22222222-2222-2222-2222-222222222222', 'rejected'::public.application_status,
  'Seed pipeline rejected', false
);

-- G9-SWA-03 (group 9 Architecture / Software Architect): Software Architect (connected products / IoT platform)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'ff3b974e-cc59-53fc-87d4-89ec6e955f13',
  'authenticated', 'authenticated', 'g9-swa-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Ly Quoc Bao'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'ff3b974e-cc59-53fc-87d4-89ec6e955f13',
  jsonb_build_object('sub', 'ff3b974e-cc59-53fc-87d4-89ec6e955f13'::text, 'email', 'g9-swa-03@seed.local'),
  'email', 'ff3b974e-cc59-53fc-87d4-89ec6e955f13'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '78c46189-5c07-559f-b8ce-82d787c5882c', 'ff3b974e-cc59-53fc-87d4-89ec6e955f13', 'resumes',
  'ff3b974e-cc59-53fc-87d4-89ec6e955f13/resumes/78c46189-5c07-559f-b8ce-82d787c5882c/g9-swa-03.pdf',
  'g9-swa-03.pdf',
  'Software Architect (connected products / IoT platform)',
  'application/pdf', 591966, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'd495870b-1993-5c6e-b6d8-178c95d4713a', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', 'ff3b974e-cc59-53fc-87d4-89ec6e955f13', '78c46189-5c07-559f-b8ce-82d787c5882c',
  'Cover letter -- Software Architect (connected products / IoT platform)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G9-SWA-04 (group 9 Architecture / Software Architect): Backend Engineer / Junior Software Architect (Fresher, architecture track)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'f7b2a575-d34d-5aa7-aaa5-f8757909307e',
  'authenticated', 'authenticated', 'g9-swa-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Le Thi Hong Nhung'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'f7b2a575-d34d-5aa7-aaa5-f8757909307e',
  jsonb_build_object('sub', 'f7b2a575-d34d-5aa7-aaa5-f8757909307e'::text, 'email', 'g9-swa-04@seed.local'),
  'email', 'f7b2a575-d34d-5aa7-aaa5-f8757909307e'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '2842bf6e-4e16-5c71-9987-48612282b918', 'f7b2a575-d34d-5aa7-aaa5-f8757909307e', 'resumes',
  'f7b2a575-d34d-5aa7-aaa5-f8757909307e/resumes/2842bf6e-4e16-5c71-9987-48612282b918/g9-swa-04.pdf',
  'g9-swa-04.pdf',
  'Backend Engineer / Junior Software Architect (Fresher, architecture track)',
  'application/pdf', 587992, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'a8587ef9-9070-51f5-8ccc-3971f1121e89', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', 'f7b2a575-d34d-5aa7-aaa5-f8757909307e', '2842bf6e-4e16-5c71-9987-48612282b918',
  'Cover letter -- Backend Engineer / Junior Software Architect (Fresher, architecture track)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G9-SWA-05 (group 9 Architecture / Software Architect): Senior Software Architect / Principal Engineer (Platform Engineering)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'b8b5a4e5-0d09-5803-8143-d7025313e88d',
  'authenticated', 'authenticated', 'g9-swa-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Do Minh Quan'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'b8b5a4e5-0d09-5803-8143-d7025313e88d',
  jsonb_build_object('sub', 'b8b5a4e5-0d09-5803-8143-d7025313e88d'::text, 'email', 'g9-swa-05@seed.local'),
  'email', 'b8b5a4e5-0d09-5803-8143-d7025313e88d'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '4a4cfdd2-7821-5e9d-8998-7c4a47dcfd22', 'b8b5a4e5-0d09-5803-8143-d7025313e88d', 'resumes',
  'b8b5a4e5-0d09-5803-8143-d7025313e88d/resumes/4a4cfdd2-7821-5e9d-8998-7c4a47dcfd22/g9-swa-05.pdf',
  'g9-swa-05.pdf',
  'Senior Software Architect / Principal Engineer (Platform Engineering)',
  'application/pdf', 589407, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'c6636a0a-2ec7-57ae-bd03-83bfa5a58420', '0206a38a-1c02-518d-9e63-4ee28e9b3df9', 'b8b5a4e5-0d09-5803-8143-d7025313e88d', '4a4cfdd2-7821-5e9d-8998-7c4a47dcfd22',
  'Cover letter -- Senior Software Architect / Principal Engineer (Platform Engineering)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'c6636a0a-2ec7-57ae-bd03-83bfa5a58420', '22222222-2222-2222-2222-222222222222', 'screening'::public.application_status,
  'Seed pipeline screening', false
);

-- G10-NE-01 (group 10 Networking / Network Engineer): Senior Network Engineer (data centre / service provider)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a2eb1e38-1e3c-5ced-ae8d-ffc9a459fa96',
  'authenticated', 'authenticated', 'g10-ne-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Cong Vinh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'a2eb1e38-1e3c-5ced-ae8d-ffc9a459fa96',
  jsonb_build_object('sub', 'a2eb1e38-1e3c-5ced-ae8d-ffc9a459fa96'::text, 'email', 'g10-ne-01@seed.local'),
  'email', 'a2eb1e38-1e3c-5ced-ae8d-ffc9a459fa96'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'd1ab230e-d741-59a5-8d7e-db4837cdaafa', 'a2eb1e38-1e3c-5ced-ae8d-ffc9a459fa96', 'resumes',
  'a2eb1e38-1e3c-5ced-ae8d-ffc9a459fa96/resumes/d1ab230e-d741-59a5-8d7e-db4837cdaafa/g10-ne-01.pdf',
  'g10-ne-01.pdf',
  'Senior Network Engineer (data centre / service provider)',
  'application/pdf', 591759, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '3864f562-5ddf-5d4d-8775-941efdaf4aab', '1700d323-d774-5b20-935e-6f040b44b90a', 'a2eb1e38-1e3c-5ced-ae8d-ffc9a459fa96', 'd1ab230e-d741-59a5-8d7e-db4837cdaafa',
  'Cover letter -- Senior Network Engineer (data centre / service provider)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G10-NE-02 (group 10 Networking / Network Engineer): Network Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'bd2a88b2-4bde-5660-b511-79b2e17023d7',
  'authenticated', 'authenticated', 'g10-ne-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Tran Thi Kim Tuyen'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'bd2a88b2-4bde-5660-b511-79b2e17023d7',
  jsonb_build_object('sub', 'bd2a88b2-4bde-5660-b511-79b2e17023d7'::text, 'email', 'g10-ne-02@seed.local'),
  'email', 'bd2a88b2-4bde-5660-b511-79b2e17023d7'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '389e4d4f-605c-5ee7-b0b8-45aba1db673d', 'bd2a88b2-4bde-5660-b511-79b2e17023d7', 'resumes',
  'bd2a88b2-4bde-5660-b511-79b2e17023d7/resumes/389e4d4f-605c-5ee7-b0b8-45aba1db673d/g10-ne-02.pdf',
  'g10-ne-02.pdf',
  'Network Engineer',
  'application/pdf', 587032, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '0eea9907-5648-52b6-8e44-d1088b158809', '1700d323-d774-5b20-935e-6f040b44b90a', 'bd2a88b2-4bde-5660-b511-79b2e17023d7', '389e4d4f-605c-5ee7-b0b8-45aba1db673d',
  'Cover letter -- Network Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G10-NE-03 (group 10 Networking / Network Engineer): Network Engineer (network automation / hybrid cloud)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '6b92dced-dd86-59e3-994f-1992ba17e063',
  'authenticated', 'authenticated', 'g10-ne-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Pham Anh Khoa'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '6b92dced-dd86-59e3-994f-1992ba17e063',
  jsonb_build_object('sub', '6b92dced-dd86-59e3-994f-1992ba17e063'::text, 'email', 'g10-ne-03@seed.local'),
  'email', '6b92dced-dd86-59e3-994f-1992ba17e063'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '1813a3e0-3703-513f-902a-679e9ae72bc2', '6b92dced-dd86-59e3-994f-1992ba17e063', 'resumes',
  '6b92dced-dd86-59e3-994f-1992ba17e063/resumes/1813a3e0-3703-513f-902a-679e9ae72bc2/g10-ne-03.pdf',
  'g10-ne-03.pdf',
  'Network Engineer (network automation / hybrid cloud)',
  'application/pdf', 590882, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '08016e3d-adcc-51da-b0ac-55568ccd6e62', '1700d323-d774-5b20-935e-6f040b44b90a', '6b92dced-dd86-59e3-994f-1992ba17e063', '1813a3e0-3703-513f-902a-679e9ae72bc2',
  'Cover letter -- Network Engineer (network automation / hybrid cloud)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  '08016e3d-adcc-51da-b0ac-55568ccd6e62', '22222222-2222-2222-2222-222222222222', 'interview'::public.application_status,
  'Seed pipeline interview', false
);

-- G10-NE-04 (group 10 Networking / Network Engineer): Network Engineer (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '4585f488-0002-5089-826f-098687fd6c03',
  'authenticated', 'authenticated', 'g10-ne-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vo Van Khoi'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '4585f488-0002-5089-826f-098687fd6c03',
  jsonb_build_object('sub', '4585f488-0002-5089-826f-098687fd6c03'::text, 'email', 'g10-ne-04@seed.local'),
  'email', '4585f488-0002-5089-826f-098687fd6c03'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '53059186-bab2-5214-8327-ff20b56d07f9', '4585f488-0002-5089-826f-098687fd6c03', 'resumes',
  '4585f488-0002-5089-826f-098687fd6c03/resumes/53059186-bab2-5214-8327-ff20b56d07f9/g10-ne-04.pdf',
  'g10-ne-04.pdf',
  'Network Engineer (Fresher)',
  'application/pdf', 587952, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '858da99f-95ab-5785-be53-51534ead5981', '1700d323-d774-5b20-935e-6f040b44b90a', '4585f488-0002-5089-826f-098687fd6c03', '53059186-bab2-5214-8327-ff20b56d07f9',
  'Cover letter -- Network Engineer (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G10-NE-05 (group 10 Networking / Network Engineer): Senior Network Engineer (Retail Connectivity & Cloud)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a776387a-73dd-5eca-a920-8e52a3f4f6da',
  'authenticated', 'authenticated', 'g10-ne-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vu Duc Manh'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'a776387a-73dd-5eca-a920-8e52a3f4f6da',
  jsonb_build_object('sub', 'a776387a-73dd-5eca-a920-8e52a3f4f6da'::text, 'email', 'g10-ne-05@seed.local'),
  'email', 'a776387a-73dd-5eca-a920-8e52a3f4f6da'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '4ebdc98e-a667-5986-8916-318dcce53c65', 'a776387a-73dd-5eca-a920-8e52a3f4f6da', 'resumes',
  'a776387a-73dd-5eca-a920-8e52a3f4f6da/resumes/4ebdc98e-a667-5986-8916-318dcce53c65/g10-ne-05.pdf',
  'g10-ne-05.pdf',
  'Senior Network Engineer (Retail Connectivity & Cloud)',
  'application/pdf', 589558, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '78c8929a-e975-5b49-b23e-a9d6537cb670', '1700d323-d774-5b20-935e-6f040b44b90a', 'a776387a-73dd-5eca-a920-8e52a3f4f6da', '4ebdc98e-a667-5986-8916-318dcce53c65',
  'Cover letter -- Senior Network Engineer (Retail Connectivity & Cloud)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G10-NSE-01 (group 10 Networking / Network Security Engineer): Senior Network Security Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '6069494c-06ee-5f18-a490-520c84375c5f',
  'authenticated', 'authenticated', 'g10-nse-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Vo Hoang Nam'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '6069494c-06ee-5f18-a490-520c84375c5f',
  jsonb_build_object('sub', '6069494c-06ee-5f18-a490-520c84375c5f'::text, 'email', 'g10-nse-01@seed.local'),
  'email', '6069494c-06ee-5f18-a490-520c84375c5f'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'f3cd07bf-e9fe-5bdf-8b74-c16a10e9275e', '6069494c-06ee-5f18-a490-520c84375c5f', 'resumes',
  '6069494c-06ee-5f18-a490-520c84375c5f/resumes/f3cd07bf-e9fe-5bdf-8b74-c16a10e9275e/g10-nse-01.pdf',
  'g10-nse-01.pdf',
  'Senior Network Security Engineer',
  'application/pdf', 591923, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'ee6ed8f9-c6ef-5e4c-b6ce-19a9fea8cd97', '1700d323-d774-5b20-935e-6f040b44b90a', '6069494c-06ee-5f18-a490-520c84375c5f', 'f3cd07bf-e9fe-5bdf-8b74-c16a10e9275e',
  'Cover letter -- Senior Network Security Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'ee6ed8f9-c6ef-5e4c-b6ce-19a9fea8cd97', '22222222-2222-2222-2222-222222222222', 'offer'::public.application_status,
  'Seed pipeline offer', false
);

-- G10-NSE-02 (group 10 Networking / Network Security Engineer): Network Security Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '943aa827-83df-59f6-8f2a-a41391d20bf1',
  'authenticated', 'authenticated', 'g10-nse-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Duong Van Hieu'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '943aa827-83df-59f6-8f2a-a41391d20bf1',
  jsonb_build_object('sub', '943aa827-83df-59f6-8f2a-a41391d20bf1'::text, 'email', 'g10-nse-02@seed.local'),
  'email', '943aa827-83df-59f6-8f2a-a41391d20bf1'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '7b80b7c7-e236-5382-8df0-51baa7ccbaf8', '943aa827-83df-59f6-8f2a-a41391d20bf1', 'resumes',
  '943aa827-83df-59f6-8f2a-a41391d20bf1/resumes/7b80b7c7-e236-5382-8df0-51baa7ccbaf8/g10-nse-02.pdf',
  'g10-nse-02.pdf',
  'Network Security Engineer',
  'application/pdf', 587049, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '56e04e79-a787-5e8c-a6b6-d269247a0f40', '1700d323-d774-5b20-935e-6f040b44b90a', '943aa827-83df-59f6-8f2a-a41391d20bf1', '7b80b7c7-e236-5382-8df0-51baa7ccbaf8',
  'Cover letter -- Network Security Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G10-NSE-03 (group 10 Networking / Network Security Engineer): Network Security Engineer (detection & response focus)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'ed5c1a7c-bc99-55bf-bd25-79e600c25ffe',
  'authenticated', 'authenticated', 'g10-nse-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Thi Hoai Thu'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'ed5c1a7c-bc99-55bf-bd25-79e600c25ffe',
  jsonb_build_object('sub', 'ed5c1a7c-bc99-55bf-bd25-79e600c25ffe'::text, 'email', 'g10-nse-03@seed.local'),
  'email', 'ed5c1a7c-bc99-55bf-bd25-79e600c25ffe'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'a7d26791-2211-5bfe-a42b-c27260a09b0f', 'ed5c1a7c-bc99-55bf-bd25-79e600c25ffe', 'resumes',
  'ed5c1a7c-bc99-55bf-bd25-79e600c25ffe/resumes/a7d26791-2211-5bfe-a42b-c27260a09b0f/g10-nse-03.pdf',
  'g10-nse-03.pdf',
  'Network Security Engineer (detection & response focus)',
  'application/pdf', 591736, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '0c4acd2a-6bbd-58a9-a86f-90063365c7f5', '1700d323-d774-5b20-935e-6f040b44b90a', 'ed5c1a7c-bc99-55bf-bd25-79e600c25ffe', 'a7d26791-2211-5bfe-a42b-c27260a09b0f',
  'Cover letter -- Network Security Engineer (detection & response focus)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G10-NSE-04 (group 10 Networking / Network Security Engineer): Network Security Engineer (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '8f7391f3-38d0-5393-b235-fe9fa2ea1cdd',
  'authenticated', 'authenticated', 'g10-nse-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Thi Bao Chau'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '8f7391f3-38d0-5393-b235-fe9fa2ea1cdd',
  jsonb_build_object('sub', '8f7391f3-38d0-5393-b235-fe9fa2ea1cdd'::text, 'email', 'g10-nse-04@seed.local'),
  'email', '8f7391f3-38d0-5393-b235-fe9fa2ea1cdd'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '5d7a922f-79a6-5674-b235-e72f528663ad', '8f7391f3-38d0-5393-b235-fe9fa2ea1cdd', 'resumes',
  '8f7391f3-38d0-5393-b235-fe9fa2ea1cdd/resumes/5d7a922f-79a6-5674-b235-e72f528663ad/g10-nse-04.pdf',
  'g10-nse-04.pdf',
  'Network Security Engineer (Fresher)',
  'application/pdf', 587917, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'c3941c04-f147-5925-afca-8bb856e166e5', '1700d323-d774-5b20-935e-6f040b44b90a', '8f7391f3-38d0-5393-b235-fe9fa2ea1cdd', '5d7a922f-79a6-5674-b235-e72f528663ad',
  'Cover letter -- Network Security Engineer (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'c3941c04-f147-5925-afca-8bb856e166e5', '22222222-2222-2222-2222-222222222222', 'rejected'::public.application_status,
  'Seed pipeline rejected', false
);

-- G10-NSE-05 (group 10 Networking / Network Security Engineer): Senior Network Security Engineer (Cloud & Perimeter)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'e5f91b62-85cd-5e6d-898d-992daf8fea06',
  'authenticated', 'authenticated', 'g10-nse-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Ho Quoc Bao'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'e5f91b62-85cd-5e6d-898d-992daf8fea06',
  jsonb_build_object('sub', 'e5f91b62-85cd-5e6d-898d-992daf8fea06'::text, 'email', 'g10-nse-05@seed.local'),
  'email', 'e5f91b62-85cd-5e6d-898d-992daf8fea06'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '88ee283c-efa7-5eba-8cc7-0df291c67134', 'e5f91b62-85cd-5e6d-898d-992daf8fea06', 'resumes',
  'e5f91b62-85cd-5e6d-898d-992daf8fea06/resumes/88ee283c-efa7-5eba-8cc7-0df291c67134/g10-nse-05.pdf',
  'g10-nse-05.pdf',
  'Senior Network Security Engineer (Cloud & Perimeter)',
  'application/pdf', 589464, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'f63ed5f4-6b37-5008-b78c-2fe5e0269203', '1700d323-d774-5b20-935e-6f040b44b90a', 'e5f91b62-85cd-5e6d-898d-992daf8fea06', '88ee283c-efa7-5eba-8cc7-0df291c67134',
  'Cover letter -- Senior Network Security Engineer (Cloud & Perimeter)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G10-TEL-01 (group 10 Networking / Telecom Engineer): Senior Telecom Engineer (mobile core / transport)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'dd9ace01-60a0-56c2-9328-a8952140444d',
  'authenticated', 'authenticated', 'g10-tel-01@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Hoang Dinh Chien'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'dd9ace01-60a0-56c2-9328-a8952140444d',
  jsonb_build_object('sub', 'dd9ace01-60a0-56c2-9328-a8952140444d'::text, 'email', 'g10-tel-01@seed.local'),
  'email', 'dd9ace01-60a0-56c2-9328-a8952140444d'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '7c04e0be-e9c4-54b5-bf73-20733ec0d9db', 'dd9ace01-60a0-56c2-9328-a8952140444d', 'resumes',
  'dd9ace01-60a0-56c2-9328-a8952140444d/resumes/7c04e0be-e9c4-54b5-bf73-20733ec0d9db/g10-tel-01.pdf',
  'g10-tel-01.pdf',
  'Senior Telecom Engineer (mobile core / transport)',
  'application/pdf', 591988, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '97c30e12-7af1-5508-99c2-e1dafb13ba18', '1700d323-d774-5b20-935e-6f040b44b90a', 'dd9ace01-60a0-56c2-9328-a8952140444d', '7c04e0be-e9c4-54b5-bf73-20733ec0d9db',
  'Cover letter -- Senior Telecom Engineer (mobile core / transport)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G10-TEL-02 (group 10 Networking / Telecom Engineer): Telecom Engineer
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '28db7971-8d9d-5eb6-bec3-de3c856779a1',
  'authenticated', 'authenticated', 'g10-tel-02@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Nguyen Van Toan'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '28db7971-8d9d-5eb6-bec3-de3c856779a1',
  jsonb_build_object('sub', '28db7971-8d9d-5eb6-bec3-de3c856779a1'::text, 'email', 'g10-tel-02@seed.local'),
  'email', '28db7971-8d9d-5eb6-bec3-de3c856779a1'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  'cb6779a9-894d-566c-8f3b-599f889f4262', '28db7971-8d9d-5eb6-bec3-de3c856779a1', 'resumes',
  '28db7971-8d9d-5eb6-bec3-de3c856779a1/resumes/cb6779a9-894d-566c-8f3b-599f889f4262/g10-tel-02.pdf',
  'g10-tel-02.pdf',
  'Telecom Engineer',
  'application/pdf', 587107, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'aecda247-198f-5da8-a8ef-15cecbed9b55', '1700d323-d774-5b20-935e-6f040b44b90a', '28db7971-8d9d-5eb6-bec3-de3c856779a1', 'cb6779a9-894d-566c-8f3b-599f889f4262',
  'Cover letter -- Telecom Engineer'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'aecda247-198f-5da8-a8ef-15cecbed9b55', '22222222-2222-2222-2222-222222222222', 'screening'::public.application_status,
  'Seed pipeline screening', false
);

-- G10-TEL-03 (group 10 Networking / Telecom Engineer): Telecom Engineer (private 5G / industrial connectivity)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', '98046294-153a-5ba0-94af-530bf1232f0f',
  'authenticated', 'authenticated', 'g10-tel-03@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Le Thi Phuong Dung'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), '98046294-153a-5ba0-94af-530bf1232f0f',
  jsonb_build_object('sub', '98046294-153a-5ba0-94af-530bf1232f0f'::text, 'email', 'g10-tel-03@seed.local'),
  'email', '98046294-153a-5ba0-94af-530bf1232f0f'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '583a8fe0-66f9-557d-b53d-547cf56780be', '98046294-153a-5ba0-94af-530bf1232f0f', 'resumes',
  '98046294-153a-5ba0-94af-530bf1232f0f/resumes/583a8fe0-66f9-557d-b53d-547cf56780be/g10-tel-03.pdf',
  'g10-tel-03.pdf',
  'Telecom Engineer (private 5G / industrial connectivity)',
  'application/pdf', 592105, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  '8c5f8804-9893-50c8-85a2-72635c8e9d8d', '1700d323-d774-5b20-935e-6f040b44b90a', '98046294-153a-5ba0-94af-530bf1232f0f', '583a8fe0-66f9-557d-b53d-547cf56780be',
  'Cover letter -- Telecom Engineer (private 5G / industrial connectivity)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G10-TEL-04 (group 10 Networking / Telecom Engineer): Telecom Engineer (Fresher)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'b412efad-f840-5033-94b8-e3df9d2a627b',
  'authenticated', 'authenticated', 'g10-tel-04@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Tran Minh Duc'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'b412efad-f840-5033-94b8-e3df9d2a627b',
  jsonb_build_object('sub', 'b412efad-f840-5033-94b8-e3df9d2a627b'::text, 'email', 'g10-tel-04@seed.local'),
  'email', 'b412efad-f840-5033-94b8-e3df9d2a627b'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '2e5daa18-6a89-5946-ade7-3720f1f390c3', 'b412efad-f840-5033-94b8-e3df9d2a627b', 'resumes',
  'b412efad-f840-5033-94b8-e3df9d2a627b/resumes/2e5daa18-6a89-5946-ade7-3720f1f390c3/g10-tel-04.pdf',
  'g10-tel-04.pdf',
  'Telecom Engineer (Fresher)',
  'application/pdf', 587833, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'e5f2e604-3dec-53ab-86b4-6654c444cd59', '1700d323-d774-5b20-935e-6f040b44b90a', 'b412efad-f840-5033-94b8-e3df9d2a627b', '2e5daa18-6a89-5946-ade7-3720f1f390c3',
  'Cover letter -- Telecom Engineer (Fresher)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

-- G10-TEL-05 (group 10 Networking / Telecom Engineer): Senior Telecom Engineer (Transmission & Broadband Access)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'de61700e-956f-5568-9ddb-cb637043305a',
  'authenticated', 'authenticated', 'g10-tel-05@seed.local', crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', 'Trinh Cong Hau'),
  now(), now(), '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(), 'de61700e-956f-5568-9ddb-cb637043305a',
  jsonb_build_object('sub', 'de61700e-956f-5568-9ddb-cb637043305a'::text, 'email', 'g10-tel-05@seed.local'),
  'email', 'de61700e-956f-5568-9ddb-cb637043305a'::text, now(), now(), now()
)
on conflict do nothing;

insert into public.resumes (
  id, user_id, bucket_id, storage_path, original_filename, title,
  mime_type, size_bytes, is_default
) values (
  '280d9923-64aa-5e9c-8e70-7ef43469e492', 'de61700e-956f-5568-9ddb-cb637043305a', 'resumes',
  'de61700e-956f-5568-9ddb-cb637043305a/resumes/280d9923-64aa-5e9c-8e70-7ef43469e492/g10-tel-05.pdf',
  'g10-tel-05.pdf',
  'Senior Telecom Engineer (Transmission & Broadband Access)',
  'application/pdf', 589194, true
)
on conflict (id) do nothing;

insert into public.job_submits (
  id, job_post_id, applicant_user_id, resume_id, cover_letter
) values (
  'd06696f6-5825-58b7-bccc-fa3715d2b9f1', '1700d323-d774-5b20-935e-6f040b44b90a', 'de61700e-956f-5568-9ddb-cb637043305a', '280d9923-64aa-5e9c-8e70-7ef43469e492',
  'Cover letter -- Senior Telecom Engineer (Transmission & Broadband Access)'
)
on conflict (job_post_id, applicant_user_id) do nothing;

insert into public.application_stages (
  application_id, changed_by_user_id, stage, note, is_system_generated
) values (
  'd06696f6-5825-58b7-bccc-fa3715d2b9f1', '22222222-2222-2222-2222-222222222222', 'interview'::public.application_status,
  'Seed pipeline interview', false
);

insert into public.saved_jobs (user_id, job_post_id) values
  ('11111111-1111-1111-1111-111111111111', '0206a38a-1c02-518d-9e63-4ee28e9b3df9'),
  ('11111111-1111-1111-1111-111111111111', '116e8b11-78ab-5dbb-85d2-ada26ef3fa78'),
  ('11111111-1111-1111-1111-111111111111', '1700d323-d774-5b20-935e-6f040b44b90a')
on conflict (user_id, job_post_id) do nothing;

-- === END GENERATED-CV-SEED ===
