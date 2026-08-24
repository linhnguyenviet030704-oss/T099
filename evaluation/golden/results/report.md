# Golden Dataset Eval Report — Ingest Agent + Matching Agent

- Chạy lúc: 2026-08-24T14:54:09.060564+00:00
- LLM backend dùng cho eval: OpenAI `gpt-4o-mini` (chat) + `text-embedding-3-small` (embedding, 1536-dim)
  - **Không phải Qwen** (`QWEN_API_KEY` trong `.env` trả về 403 Forbidden khi test) — theo yêu cầu, đổi sang OpenAI cho riêng pipeline eval này. Code production (`backend/app/clients/llm.py`) không bị đổi, vẫn gọi Qwen.
- Nguồn JD: `data_find/data/vietjobs/VietJobs_full.csv` (VietJobs dataset), 20 JD chọn trong `evaluation/golden/jds.json`, trải trên 15 nhóm ngành IT
- CV: 40 CV thật (2/JD) lấy từ `data_find/generated_cv` (EN) + `data_find/generated_cv_vi` (VI), không LLM-sinh riêng — `evaluation/golden/cvs_manifest.json`

## Giới hạn phương pháp (đọc trước khi diễn giải số liệu)

1. **20 JD trải trên 15 nhóm ngành IT** (`data_find/data/it-job-categories.md` nhóm 1-15 — nhóm 16-20 chưa có CV nên không chọn JD từ đó), quota theo cỡ pool CV mỗi nhóm trong `data_find/generated_cv/metadata.csv`: nhóm 1-5 (Software Dev, DevOps/Infra, SysAdmin, Cybersecurity, Data) 2 JD/nhóm, nhóm 6-15 còn lại 1 JD/nhóm. Skill taxonomy dùng để chọn JD và tính `coverage_score` giờ có 186 skill / 9 nhóm domain (`skill_graph.json`), không còn giới hạn 10 skill như phiên bản golden set trước.
2. **CV lấy từ 2 pool có sẵn, không LLM-sinh riêng theo JD**: `data_find/generated_cv` (432 CV tiếng Anh, gắn nhãn sẵn `quality_profile` polished/sparse/cross_domain) và `data_find/generated_cv_vi` (34 bản dịch tiếng Việt của các CV cụ thể trong pool trên). Variant "a" = CV `polished` đúng subgroup của JD; variant "b" = CV `sparse` (hoặc `cross_domain` nếu subgroup không có `sparse`) cùng subgroup — độ khớp phản ánh chất lượng hồ sơ thật có sẵn, không bị ép về đúng % mong muốn như thiết kế cũ.
3. **8-10/20 JD có 1 trong 2 variant là bản tiếng Việt** (khi CV được chọn có sẵn bản dịch), trải trên nhiều nhóm khác nhau — kiểm thử khả năng Ingest Agent parse/match CV tiếng Việt, không chỉ tiếng Anh như phiên bản trước.
4. Ranking chạy **offline** (không seed Supabase) — dùng đúng `score_candidates()`/RRF/`coverage_score()` thật, nhưng khoảng cách semantic tính bằng cosine Python thay vì RPC pgvector (cùng công thức, khác nơi chạy). Pool chấm điểm quan hệ (LLM-judge) đóng đầy đủ: 40 CV × 20 JD = 800 cặp.
5. **Test cả 2 chiều matching**: mục 1 ở trên là chiều JD -> CV (`score_candidates`, `rrf.py`). Mục 1b dưới đây là chiều ngược CV -> JD (`score_jobs_for_resume`, `rrf_jobs.py`) — logic RRF thật đứng sau agent recommend (`backend/app/agents/recommend/graph.py`, `POST /api/v1/chat` chiều candidate). Cùng pool 40 CV × 20 JD, cùng qrels 800 cặp, chỉ đảo trục so sánh. JD embedding dùng cho chiều CV -> JD được tính qua `expand_query()` một lần (giống hệt cách `ingest_job()` production nhúng job tại thời điểm ingest), so khớp với embedding CV gốc (không expand) — đúng bất đối xứng thật của hệ thống, không phải giản lược riêng cho eval.

## 1. Ranking metrics (Matching Agent, chiều JD -> CV)

Precision/Recall dùng ngưỡng `grade >= 1` (LLM-judge relevance). MRR dùng ngưỡng `grade == 2`. NDCG dùng graded relevance 0/1/2 trực tiếp. Pool: 40 CV chung cho cả 20 JD.

| JD | P@5 | R@5 | NDCG@5 | P@10 | R@10 | NDCG@10 | MRR |
|---|---|---|---|---|---|---|---|
| JD-01 (Lập Trình Viên Full Stack (W) | 0.60 | 0.23 | 0.23 | 0.60 | 0.46 | 0.46 | 0.12 |
| JD-02 (Frontend Developer (next.js,) | 0.80 | 0.57 | 0.87 | 0.60 | 0.86 | 0.88 | 1.00 |
| JD-03 (Devops Engineer) | 0.80 | 0.22 | 0.52 | 0.90 | 0.50 | 0.70 | 0.33 |
| JD-04 (Kỹ sư độ tin cậy trang web c) | 1.00 | 0.25 | 0.82 | 0.90 | 0.45 | 0.83 | 1.00 |
| JD-05 (System Administrator) | 0.80 | 0.25 | 0.44 | 0.90 | 0.56 | 0.66 | 0.25 |
| JD-06 (Chuyên Viên IT (Chuyên Viên ) | 0.80 | 0.20 | 0.34 | 0.80 | 0.40 | 0.54 | 0.20 |
| JD-07 (Thực tập bảo mật đám mây) | 1.00 | 0.21 | 0.63 | 0.90 | 0.38 | 0.60 | 0.33 |
| JD-08 (Người kiểm tra bảo mật (Pent) | 1.00 | 0.56 | 1.00 | 0.70 | 0.78 | 0.92 | 1.00 |
| JD-09 (Kỹ Sư Dữ Liệu Cấp Cao) | 0.80 | 0.21 | 0.66 | 0.80 | 0.42 | 0.70 | 0.00 |
| JD-10 (Business Data Analyst) | 0.60 | 0.30 | 0.37 | 0.60 | 0.60 | 0.42 | 0.08 |
| JD-11 (AI/NLP Engineer) | 0.40 | 0.50 | 0.30 | 0.40 | 1.00 | 0.59 | 0.14 |
| JD-12 (Nhân Viên Tester) | 0.60 | 0.20 | 0.41 | 0.80 | 0.53 | 0.66 | 0.17 |
| JD-13 (Liên kết quản lý dự án) | 1.00 | 0.24 | 1.00 | 0.80 | 0.38 | 0.86 | 0.00 |
| JD-14 (Kiến trúc sư giải pháp) | 0.80 | 0.33 | 0.85 | 0.80 | 0.67 | 0.84 | 0.00 |
| JD-15 (Kỹ sư mạng L2 (nói tiếng Nhậ) | 0.80 | 1.00 | 1.00 | 0.40 | 1.00 | 1.00 | 0.00 |
| JD-16 (Cloud Engineer (Azure)) | 0.80 | 0.25 | 0.30 | 0.80 | 0.50 | 0.46 | 0.17 |
| JD-17 (Kỹ sư blockchain) | 0.60 | 0.33 | 0.38 | 0.60 | 0.67 | 0.46 | 0.05 |
| JD-18 (Senior UI/UX Design) | 0.40 | 0.67 | 0.61 | 0.20 | 0.67 | 0.61 | 0.33 |
| JD-19 (DevOps Engineer - Vận Hành E) | 0.80 | 0.27 | 0.71 | 0.80 | 0.53 | 0.72 | 1.00 |
| JD-20 (Kỹ Sư Lập Trình Embedded/IoT) | 0.20 | 0.25 | 0.08 | 0.30 | 0.75 | 0.39 | 0.17 |
| **Trung bình (macro)** | **0.73** | **0.35** | **0.58** | **0.68** | **0.61** | **0.66** | **0.32** |

## 1b. Reverse ranking metrics (Matching Agent, chiều CV -> JD / recommend)

Cùng pool 40 CV × 20 JD và qrels ở trên, xếp hạng theo chiều ngược: với mỗi CV, dùng `score_jobs_for_resume()` (`backend/app/services/matching/rrf_jobs.py`) — logic RRF thật đứng sau agent recommend (`POST /api/v1/chat`, chiều candidate, không truyền `job_id`) — để xếp hạng toàn bộ 20 JD. "own-JD rank" = vị trí JD gốc của CV đó trong danh sách 20 JD đã xếp hạng (kỳ vọng gần hạng 1); "own-JD grade" = điểm LLM-judge đã chấm cho đúng cặp đó.

| CV | own JD | own-JD rank | own-JD grade | P@5 | R@5 | NDCG@5 | P@10 | R@10 | NDCG@10 | MRR |
|---|---|---|---|---|---|---|---|---|---|---|
| G1-FE-01 | JD-02 | 1 | 2 | 0.80 | 0.57 | 0.92 | 0.50 | 0.71 | 0.87 | 1.00 |
| G1-FE-02 | JD-02 | 2 | 1 | 0.60 | 0.60 | 0.72 | 0.40 | 0.80 | 0.84 | 0.00 |
| G1-FS-01 | JD-01 | 2 | 2 | 1.00 | 0.31 | 1.00 | 0.90 | 0.56 | 0.96 | 1.00 |
| G1-FS-02 | JD-01 | 3 | 2 | 0.60 | 0.75 | 0.69 | 0.40 | 1.00 | 0.75 | 0.33 |
| G10-NE-01 | JD-15 | 10 | 1 | 0.60 | 0.50 | 0.65 | 0.60 | 1.00 | 0.87 | 0.00 |
| G10-NE-02 | JD-15 | 1 | 1 | 0.40 | 1.00 | 1.00 | 0.20 | 1.00 | 1.00 | 0.00 |
| G11-CC-01 | JD-16 | 1 | 2 | 1.00 | 0.45 | 0.80 | 0.80 | 0.73 | 0.75 | 1.00 |
| G11-CC-02 | JD-16 | 4 | 1 | 0.60 | 0.38 | 0.65 | 0.70 | 0.88 | 0.81 | 0.00 |
| G12-BC-01 | JD-17 | 5 | 2 | 0.40 | 0.50 | 0.39 | 0.40 | 1.00 | 0.53 | 0.20 |
| G12-BC-03 | JD-17 | 6 | 1 | 1.00 | 0.38 | 0.47 | 0.90 | 0.69 | 0.63 | 0.14 |
| G13-IXD-01 | JD-18 | 1 | 2 | 0.40 | 1.00 | 0.96 | 0.20 | 1.00 | 0.96 | 1.00 |
| G13-IXD-02 | JD-18 | 1 | 1 | 0.20 | 1.00 | 1.00 | 0.10 | 1.00 | 1.00 | 0.00 |
| G14-ODO-01 | JD-19 | 1 | 2 | 1.00 | 0.29 | 1.00 | 0.90 | 0.53 | 0.95 | 1.00 |
| G14-ODO-02 | JD-19 | 1 | 1 | 0.60 | 0.50 | 0.68 | 0.40 | 0.67 | 0.70 | 0.00 |
| G15-EMB-01 | JD-20 | 1 | 2 | 0.20 | 1.00 | 1.00 | 0.10 | 1.00 | 1.00 | 1.00 |
| G15-EMB-02 | JD-20 | 1 | 1 | 0.20 | 1.00 | 1.00 | 0.10 | 1.00 | 1.00 | 0.00 |
| G2-DO-01 | JD-03 | 6 | 2 | 1.00 | 0.45 | 0.91 | 0.90 | 0.82 | 0.95 | 1.00 |
| G2-DO-02 | JD-03 | 3 | 2 | 1.00 | 0.62 | 0.64 | 0.80 | 1.00 | 0.78 | 0.33 |
| G2-PE-01 | JD-04 | 4 | 2 | 1.00 | 0.45 | 0.80 | 0.80 | 0.73 | 0.84 | 1.00 |
| G2-PE-02 | JD-04 | 1 | 2 | 1.00 | 0.45 | 0.77 | 0.90 | 0.82 | 0.92 | 1.00 |
| G3-OP-01 | JD-06 | 4 | 2 | 1.00 | 0.56 | 0.77 | 0.70 | 0.78 | 0.71 | 0.25 |
| G3-OP-02 | JD-06 | 1 | 1 | 0.20 | 0.25 | 0.39 | 0.40 | 1.00 | 0.78 | 0.00 |
| G3-SA-01 | JD-05 | 1 | 1 | 0.80 | 0.67 | 0.65 | 0.60 | 1.00 | 0.72 | 0.20 |
| G3-SA-03 | JD-05 | 2 | 2 | 1.00 | 0.56 | 0.66 | 0.80 | 0.89 | 0.75 | 0.50 |
| G4-PT-01 | JD-08 | 1 | 2 | 0.40 | 0.67 | 0.82 | 0.20 | 0.67 | 0.82 | 1.00 |
| G4-PT-02 | JD-07 | 5 | 1 | 0.60 | 0.75 | 0.88 | 0.40 | 1.00 | 0.96 | 1.00 |
| G4-PT-03 | JD-08 | 1 | 2 | 0.60 | 0.38 | 0.77 | 0.50 | 0.62 | 0.75 | 1.00 |
| G4-PT-09 | JD-07 | 1 | 1 | 0.20 | 0.33 | 0.47 | 0.20 | 0.67 | 0.61 | 0.00 |
| G5-BI-01 | JD-09 | 1 | 1 | 0.40 | 0.67 | 0.77 | 0.20 | 0.67 | 0.77 | 0.00 |
| G5-BI-02 | JD-09 | 1 | 1 | 0.40 | 1.00 | 1.00 | 0.20 | 1.00 | 1.00 | 0.00 |
| G5-DA-01 | JD-10 | 4 | 1 | 0.60 | 0.75 | 0.75 | 0.40 | 1.00 | 0.87 | 0.00 |
| G5-DA-02 | JD-10 | 2 | 0 | 0.00 | 0.00 | 0.00 | 0.10 | 1.00 | 0.29 | 0.00 |
| G6-NLP-01 | JD-11 | 1 | 2 | 0.40 | 0.67 | 0.85 | 0.20 | 0.67 | 0.85 | 1.00 |
| G6-NLP-02 | JD-11 | 1 | 1 | 0.20 | 0.25 | 0.39 | 0.20 | 0.50 | 0.51 | 0.00 |
| G7-AT-01 | JD-12 | 2 | 2 | 0.80 | 0.33 | 0.76 | 0.70 | 0.58 | 0.73 | 0.50 |
| G7-AT-03 | JD-12 | 7 | 1 | 1.00 | 0.36 | 0.60 | 0.90 | 0.64 | 0.75 | 0.12 |
| G8-BA-01 | JD-13 | 17 | 1 | 0.40 | 0.67 | 0.82 | 0.20 | 0.67 | 0.82 | 1.00 |
| G8-BA-02 | JD-13 | 11 | 1 | 0.40 | 0.67 | 0.67 | 0.20 | 0.67 | 0.67 | 0.00 |
| G9-CA-02 | JD-14 | 4 | 1 | 1.00 | 0.56 | 0.87 | 0.80 | 0.89 | 0.85 | 1.00 |
| G9-CA-04 | JD-14 | 14 | 1 | 0.80 | 0.40 | 0.51 | 0.70 | 0.70 | 0.62 | 0.10 |
| **Trung bình (macro)** | | | | **0.62** | **0.57** | **0.74** | **0.49** | **0.81** | **0.80** | **0.44** |

**Calibration (CV -> JD):** 26/40 CV có JD gốc lọt top-3 trong xếp hạng 20 JD.

## 2. Calibration check (LLM-judge vs CV thiết kế sẵn, chiều JD -> CV)

40 cặp "ruột" (mỗi CV so với đúng JD gốc của nó) — kỳ vọng variant `a` ra grade 2, variant `b` ra grade thấp hơn.

- JD-01 / G1-FS-01: judge_grade=2 (own-JD calibration pair)
- JD-01 / G1-FS-02: judge_grade=2 (own-JD calibration pair)
- JD-02 / G1-FE-01: judge_grade=2 (own-JD calibration pair)
- JD-02 / G1-FE-02: judge_grade=1 (own-JD calibration pair)
- JD-03 / G2-DO-01: judge_grade=2 (own-JD calibration pair)
- JD-03 / G2-DO-02: judge_grade=2 (own-JD calibration pair)
- JD-04 / G2-PE-01: judge_grade=2 (own-JD calibration pair)
- JD-04 / G2-PE-02: judge_grade=2 (own-JD calibration pair)
- JD-05 / G3-SA-01: judge_grade=1 (own-JD calibration pair)
- JD-05 / G3-SA-03: judge_grade=2 (own-JD calibration pair)
- JD-06 / G3-OP-01: judge_grade=2 (own-JD calibration pair)
- JD-06 / G3-OP-02: judge_grade=1 (own-JD calibration pair)
- JD-07 / G4-PT-02: judge_grade=1 (own-JD calibration pair)
- JD-07 / G4-PT-09: judge_grade=1 (own-JD calibration pair)
- JD-08 / G4-PT-01: judge_grade=2 (own-JD calibration pair)
- JD-08 / G4-PT-03: judge_grade=2 (own-JD calibration pair)
- JD-09 / G5-BI-02: judge_grade=1 (own-JD calibration pair)
- JD-09 / G5-BI-01: judge_grade=1 (own-JD calibration pair)
- JD-10 / G5-DA-02: judge_grade=0 (own-JD calibration pair)
- JD-10 / G5-DA-01: judge_grade=1 (own-JD calibration pair)
- JD-11 / G6-NLP-01: judge_grade=2 (own-JD calibration pair)
- JD-11 / G6-NLP-02: judge_grade=1 (own-JD calibration pair)
- JD-12 / G7-AT-01: judge_grade=2 (own-JD calibration pair)
- JD-12 / G7-AT-03: judge_grade=1 (own-JD calibration pair)
- JD-13 / G8-BA-01: judge_grade=1 (own-JD calibration pair)
- JD-13 / G8-BA-02: judge_grade=1 (own-JD calibration pair)
- JD-14 / G9-CA-04: judge_grade=1 (own-JD calibration pair)
- JD-14 / G9-CA-02: judge_grade=1 (own-JD calibration pair)
- JD-15 / G10-NE-01: judge_grade=1 (own-JD calibration pair)
- JD-15 / G10-NE-02: judge_grade=1 (own-JD calibration pair)
- JD-16 / G11-CC-02: judge_grade=1 (own-JD calibration pair)
- JD-16 / G11-CC-01: judge_grade=2 (own-JD calibration pair)
- JD-17 / G12-BC-01: judge_grade=2 (own-JD calibration pair)
- JD-17 / G12-BC-03: judge_grade=1 (own-JD calibration pair)
- JD-18 / G13-IXD-01: judge_grade=2 (own-JD calibration pair)
- JD-18 / G13-IXD-02: judge_grade=1 (own-JD calibration pair)
- JD-19 / G14-ODO-02: judge_grade=1 (own-JD calibration pair)
- JD-19 / G14-ODO-01: judge_grade=2 (own-JD calibration pair)
- JD-20 / G15-EMB-01: judge_grade=2 (own-JD calibration pair)
- JD-20 / G15-EMB-02: judge_grade=1 (own-JD calibration pair)

## 3. LLM-as-judge: chất lượng Ingest Agent

**Độ tin cậy cột "Skill false-negative":** đã spot-check thủ công (VD `JD-01-A`) và phát hiện judge liệt kê cả skill **không hề xuất hiện trong text CV** (tự bịa), lẫn skill ngoài phạm vi 10-skill taxonomy dù prompt đã yêu cầu chỉ xét trong đó (VD "Django", "MySQL", "WebSockets"). Vì vậy cột này **không nên coi là danh sách lỗi extract_skills() đã xác nhận** — chỉ mang tính gợi ý cần kiểm tra thủ công thêm, không phải kết luận cuối. Cột Faithfulness đáng tin hơn (so sánh trực tiếp 2 đoạn văn bản, không yêu cầu judge tự nhớ toàn bộ CV).

| CV | Faithfulness (summarize) | Skill false-positive | Skill false-negative (chưa xác thực, xem lưu ý trên) |
|---|---|---|---|
| G1-FE-02 | 1.00 | ['bootstrap', 'postman', 'nodejs', 'mysql'] | ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'SQL', 'Linux'] |
| G2-PE-02 | 1.00 | ['kubernetes', 'prometheus', 'terraform', 'gitlab_ci', 'ansible', 'jenkins', 'grafana', 'nodejs', 'cicd', 'nginx', 'bash', 'helm', 'aws', 'golang'] | ['Python', 'Docker', 'Linux', 'React'] |
| G1-FS-02 | 1.00 | ['tailwind_css', 'expressjs', 'mongodb', 'nodejs', 'nextjs', 'mysql', 'figma'] | ['Python', 'PostgreSQL', 'SQL', 'Linux'] |
| G1-FE-01 | 1.00 | ['tailwind_css', 'angular', 'gitlab_ci', 'graphql', 'nextjs', 'webpack', 'jquery', 'html', 'redux', 'figma', 'vite', 'jest', 'vuejs', 'css', 'golang', 'testng'] | ['Python', 'PostgreSQL', 'SQL', 'Linux'] |
| G1-FS-01 | 0.95 | ['github_actions', 'ruby_on_rails', 'tailwind_css', 'expressjs', 'graphql', 'nodejs', 'nextjs', 'redis', 'ruby', 'css', 'testng'] | ['PostgreSQL', 'Python', 'FastAPI', 'Docker', 'Git', 'Linux'] |
| G2-PE-01 | 1.00 | ['github_actions', 'gitlab_ci', 'kubernetes', 'prometheus', 'terraform', 'ansible', 'jenkins', 'grafana', 'bash', 'golang'] | ['Python', 'Docker', 'TypeScript', 'Git', 'Linux'] |
| G2-DO-02 | 1.00 | ['kubernetes', 'ansible', 'jenkins', 'mysql', 'nginx', 'bash', 'aws'] | ['Docker', 'Linux', 'Git'] |
| G2-DO-01 | 0.95 | ['github_actions', 'elasticsearch', 'kubernetes', 'prometheus', 'terraform', 'gitlab_ci', 'ansible', 'jenkins', 'grafana'] | ['Python', 'Docker', 'SQL', 'Git', 'Linux'] |
| G3-SA-03 | 0.90 | ['sql_server', 'elasticsearch', 'kubernetes', 'ansible'] | ['PostgreSQL', 'Git', 'Linux'] |
| G3-OP-02 | 1.00 | ['grafana', 'excel'] | ['Linux'] |
| G4-PT-02 | 1.00 | ['mysql', 'owasp', 'php'] | ['Python', 'Linux'] |
| G3-OP-01 | 0.95 | ['elasticsearch', 'powershell', 'kubernetes', 'prometheus', 'confluence', 'grafana', 'azure', 'bash', 'jira'] | ['Python', 'SQL', 'Linux'] |
| G4-PT-01 | 0.90 | ['javascript', 'python'] | ['Python', 'JavaScript'] |
| G4-PT-09 | 1.00 | ['owasp', 'bash'] | ['Python', 'Linux'] |
| G3-SA-01 | 1.00 | ['linux', 'bash', 'ansible', 'grafana'] | ['Linux'] |
| G4-PT-03 | 0.90 | ['github_actions', 'javascript', 'typescript', 'gitlab_ci', 'solidity', 'graphql', 'postman'] | ['Python', 'FastAPI', 'PostgreSQL', 'JavaScript', 'TypeScript', 'React', 'SQL'] |
| G5-DA-02 | 1.00 | ['power_bi', 'pandas', 'excel'] | ['Python', 'SQL'] |
| G5-BI-02 | 1.00 | ['sql_server', 'power_bi', 'excel', 'jquery'] | ['SQL'] |
| G8-BA-01 | 0.95 | - | - |
| G8-BA-02 | 1.00 | ['confluence', 'excel', 'jira'] | ['SQL'] |
| G5-BI-01 | 0.90 | ['sql_server', 'snowflake', 'power_bi', 'tableau', 'azure', 'figma', 'excel', 'etl', 'salesforce', 'jquery'] | ['Python', 'Git', 'SQL'] |
| G6-NLP-01 | 0.95 | ['machine_learning', 'elasticsearch', 'kubernetes', 'pytorch', 'nlp'] | ['Python', 'FastAPI', 'Docker'] |
| G5-DA-01 | 0.95 | ['sql_server', 'bigquery', 'power_bi', 'airflow'] | ['Python', 'SQL'] |
| G6-NLP-02 | 1.00 | ['selenium', 'pytorch', 'postman', 'mysql'] | ['Python', 'Docker', 'Git'] |
| G9-CA-04 | 1.00 | ['kubernetes', 'terraform', 'azure', 'aws'] | ['Python', 'Linux', 'Git'] |
| G10-NE-02 | 1.00 | ['packet_tracer', 'firewall', 'cisco', 'excel', 'ccna', 'vpn'] | - |
| G11-CC-02 | 1.00 | ['kubernetes', 'powerpoint', 'terraform', 'aws', 'gcp', 'excel'] | ['docker', 'linux', 'sql'] |
| G7-AT-01 | 1.00 | ['github_actions', 'gitlab_ci', 'selenium', 'jenkins', 'testng', 'java', 'k6', 'embedded_c'] | ['Python', 'FastAPI', 'PostgreSQL', 'React', 'Linux'] |
| G7-AT-03 | 0.95 | ['github_actions', 'spring_boot', 'kubernetes', 'gitlab_ci', 'selenium', 'ansible', 'grafana', 'mysql', 'nginx', 'java', 'bash', 'helm', 'aws', 'golang', 'k6'] | ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'JavaScript', 'React', 'SQL', 'Linux'] |
| G10-NE-01 | 0.95 | ['ansible', 'cisco'] | ['Python'] |
| G9-CA-02 | 1.00 | ['bash', 'kubernetes', 'prometheus', 'terraform', 'firewall', 'ansible', 'jenkins', 'grafana', 'mysql', 'cicd', 'nginx', 'helm', 'aws', 'vpn', 'github_actions'] | ['Python', 'Docker'] |
| G13-IXD-02 | 1.00 | ['illustrator', 'photoshop', 'figma'] | - |
| G13-IXD-01 | 0.90 | ['git'] | ['React'] |
| G14-ODO-02 | 1.00 | ['postgresql', 'javascript', 'laravel', 'jquery', 'nginx', 'odoo', 'php', 'golang'] | ['PostgreSQL', 'JavaScript', 'Python', 'Docker', 'Git'] |
| G12-BC-01 | 0.95 | ['kubernetes', 'terraform', 'solidity', 'ethereum', 'kafka', 'java', 'rust', 'nodejs', 'evm', 'golang', 'can_bus'] | ['PostgreSQL', 'TypeScript'] |
| G14-ODO-01 | 0.90 | ['gitlab_ci'] | ['Python', 'PostgreSQL', 'Docker', 'Git', 'Linux'] |
| G12-BC-03 | 0.90 | ['kubernetes', 'prometheus', 'terraform', 'gitlab_ci', 'debezium', 'oracle_database', 'mysql', 'apache_spark', 'kafka', 'flink', 'cicd', 'java', 'nodejs', 'etl', 'evm', 'golang'] | ['Git', 'Linux'] |
| G15-EMB-02 | 1.00 | ['python', 'linux', 'git'] | ['Python', 'Git', 'Linux'] |
| G11-CC-01 | 0.90 | ['github_actions', 'powershell', 'terraform', 'azure'] | ['Git'] |
| G15-EMB-01 | 1.00 | ['python', 'linux', 'git'] | ['Python', 'Linux', 'Git'] |

**Faithfulness trung bình: 0.97** (40/40 CV có điểm hợp lệ)

Case có claim không được support (đáng xem lại):
- **G2-DO-01**: ['The summary does not mention the specific reduction in median pipeline time from 21 to 7 minutes, which is a significant detail in the original.', 'The summary omits the detail about the nine-month effort and persuasion involved in migrating services to a single templated chart.', "The summary does not include the detail about the internal 'deploy clinic' reducing ticket load significantly.", 'The summary does not mention the specific number of significant incidents handled as the infra responder.']
- **G4-PT-01**: ['Mentor two junior testers.']
- **G8-BA-01**: ['Handled roughly 3.4 million transactions a month within a year of launch.']
- **G5-BI-01**: ['dataset certification', 'Other: Python, Git, Figma']
- **G5-DA-01**: ['GA4']
- **G7-AT-03**: ['Giảm chi phí CI cho các giai đoạn kiểm thử khoảng 35% (không có thông tin cụ thể về chi phí CI trong ORIGINAL).', 'Viết lớp kiểm thử tích hợp bằng Testcontainers (không có thông tin cụ thể về lớp kiểm thử tích hợp trong ORIGINAL).']
- **G12-BC-01**: ['The summary does not mention the specific incident related to the bridge relayer monitoring, which involved a nonce-management bug that caused a 90-minute proof submission failure.']
- **G14-ODO-01**: ['Lập trình viên Python', 'Ứng dụng Django và Flask, PostgreSQL cho các công cụ nội bộ và trang web của khách hàng.']

## 4. Ghi chú

- Cache LLM/embedding tại `evaluation/golden/.cache/` theo content hash — chạy lại `run_eval.py` không tốn gọi API trùng lặp.
- Đổi model (`CHAT_MODEL`/`EMBED_MODEL` trong `llm_openai.py`) thì phải xoá cache và chạy lại toàn bộ, không so sánh chéo được giữa các lần chạy khác model.

## 5. Phát hiện: hiệu ứng "hub" embedding (đáng lưu ý khi đọc số liệu chiều JD -> CV)

Kiểm tra trực tiếp khoảng cách cosine từ mỗi CV đến cả 20 JD-embedding (script chẩn đoán, không phải phần pipeline chính) cho thấy **4 CV — `G4-PT-09`, `G9-CA-04`, `G7-AT-03`, `G14-ODO-01` — có khoảng cách trung bình đến TOÀN BỘ 20 JD thấp hơn mọi CV tiếng Anh trong pool** (mean cosine distance 0.43–0.49, so với dải 0.50–0.64 của các CV còn lại), bất kể lĩnh vực chuyên môn thực tế của chúng (pentest, cloud architect, test automation, Odoo developer) khác nhau hoàn toàn và khác JD đang xét. Đây là hiện tượng "hubness" đã biết trong không gian embedding chiều cao (một số điểm trở thành "hàng xóm gần nhất" bất thường với rất nhiều điểm khác, không phụ thuộc nội dung ngữ nghĩa) — không phải lỗi trong script eval (khoảng cách/cosine/rank đều tính đúng), mà là đặc tính thật của `text-embedding-3-small` trên chính các văn bản CV này.

Cả 4 CV "hub" đều dùng bản tóm tắt **tiếng Việt** (do CV nguồn là bản dịch VI, `summarize_resume()` tôn trọng ngôn ngữ gốc) — nhưng không phải mọi CV tiếng Việt đều là hub (4/8 CV VI còn lại nằm ở giữa dải phân bố, không bất thường), nên ngôn ngữ có thể là một yếu tố góp phần chứ không phải nguyên nhân duy nhất.

**Hệ quả với số liệu:** ở chiều JD -> CV (mục 1), 4 CV hub này chiếm nhiều vị trí top-5 của các JD không liên quan (VD `G9-CA-04` xuất hiện trong top-5 của cả JD-01 Full Stack, JD-03 DevOps, JD-16 Cloud — hợp lý — lẫn JD-06 IT Operations, JD-09 Data Engineer — kém hợp lý hơn), có thể đẩy CV thật sự phù hợp ra khỏi top-K, làm giảm Recall@5/10 thật của các JD đó. MRR macro chiều JD->CV (0.32) thấp hơn đáng kể so với NDCG (0.66) một phần vì hiệu ứng này. Ở chiều CV -> JD (mục 1b), cùng 4 CV này lại có own-JD rank kém (`G9-CA-04`: hạng 14/20, `G7-AT-03`: hạng 7/20) — vì khi mọi JD đều "gần" như nhau với một CV hub, JD đúng không còn nổi bật lên rõ ràng.

Đây là phát hiện thật về hành vi hệ thống, không phải giới hạn của bộ eval — golden set v1 (toàn CV tiếng Anh) chưa từng lộ ra hiện tượng này vì thiếu đa dạng ngôn ngữ/nội dung để hub xuất hiện rõ.
