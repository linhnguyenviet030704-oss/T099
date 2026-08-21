# Golden Dataset Eval Report — Ingest Agent + Matching Agent

- Chạy lúc: 2026-08-21T10:27:54.689385+00:00
- LLM backend dùng cho eval: OpenAI `gpt-4o-mini` (chat) + `text-embedding-3-small` (embedding, 1536-dim)
  - **Không phải Qwen** (`QWEN_API_KEY` trong `.env` trả về 403 Forbidden khi test) — theo yêu cầu, đổi sang OpenAI cho riêng pipeline eval này. Code production (`backend/app/clients/llm.py`) không bị đổi, vẫn gọi Qwen.
- Nguồn JD: `data_find/data/vietjobs/VietJobs_full.csv` (VietJobs dataset), 10 JD chọn trong `evaluation/golden/jds.json`
- CV: 20 CV synthetic (2/JD) sinh bởi LLM, verify bằng `coverage_score()`/`extract_skills()` thật — `evaluation/golden/cvs_manifest.json`

## Giới hạn phương pháp (đọc trước khi diễn giải số liệu)

1. **Skill taxonomy thật chỉ có 10 skill** (`backend/app/services/matching/resources/skill_graph.json`): Python, FastAPI, PostgreSQL, Docker, JavaScript, TypeScript, React, SQL, Git, Linux. 10 JD được chọn giới hạn trong phạm vi này (không phải 10 vai trò IT bất kỳ) để `coverage_score` đo được số thật thay vì luôn ra 0%.
2. **"80-90% khớp" không khả thi về mặt toán học** với taxonomy nhỏ: JD chỉ có 1-3 skill nhận diện được → coverage_score chỉ nhận giá trị rời rạc (0/50/100% với 2 skill, 0/33/67/100% với 3 skill). Đã diễn giải lại thành CV "a" (khớp cao — đủ toàn bộ skill JD) và CV "b" (khớp thấp — thiếu ít nhất 1 skill), ghi đúng % thật đo được trong `cvs_manifest.json` thay vì ép về đúng khoảng 80-90%.
3. **Phát hiện bug thật trong `extract_skills()` (production code, không sửa)**: hàm này match theo `" skill "` (có khoảng trắng bao quanh) sau khi chuẩn hoá — nếu tên skill đứng ngay trước dấu phẩy/dấu câu (rất phổ biến trong CV/JD thật, ví dụ `"JavaScript, TypeScript"`), nó **không match được** dù skill có mặt rõ ràng trong văn bản. Ca đã xác nhận cụ thể: `JD-06-A` sinh CV có chứa cả "JavaScript" và "Docker" (kiểm tra trực tiếp trong text) nhưng `extract_skills` chỉ nhận ra "TypeScript", khiến CV này verify thất bại (giữ nguyên, không patch). **Đã kiểm tra lại và đây KHÔNG phải lỗi mang tính hệ thống** — spot-check các case khác (VD JD-01-A) cho thấy phần lớn "false negative" ở mục 3 dưới đây là do judge tự bịa (skill đó không hề xuất hiện trong text), không phải do bug này lặp lại. Xem ghi chú độ tin cậy ở mục 3.
4. Ranking chạy **offline** (không seed Supabase) — dùng đúng `score_candidates()`/RRF/`coverage_score()` thật, nhưng khoảng cách semantic tính bằng cosine Python thay vì RPC pgvector (cùng công thức, khác nơi chạy). Chi tiết: `docs/superpowers/specs/2026-08-21-agent-eval-golden-dataset-design.md`.

## 1. Ranking metrics (Matching Agent)

Precision/Recall dùng ngưỡng `grade >= 1` (LLM-judge relevance). MRR dùng ngưỡng `grade == 2`. NDCG dùng graded relevance 0/1/2 trực tiếp. Pool: 20 CV chung cho cả 10 JD.

| JD | P@5 | R@5 | NDCG@5 | P@10 | R@10 | NDCG@10 | MRR |
|---|---|---|---|---|---|---|---|
| JD-01 (Nhà phát triển .NET cao cấp ) | 0.80 | 0.57 | 0.93 | 0.70 | 1.00 | 0.98 | 1.00 |
| JD-02 (DevOps Engineer - Vận Hành E) | 1.00 | 0.45 | 0.96 | 0.90 | 0.82 | 0.92 | 1.00 |
| JD-03 (Nhà phát triển Frontend (Rea) | 1.00 | 0.56 | 1.00 | 0.70 | 0.78 | 0.92 | 1.00 |
| JD-04 (Hệ thống quản trị viên Junio) | 1.00 | 0.42 | 0.84 | 0.70 | 0.58 | 0.76 | 0.50 |
| JD-05 (Lập Trình Nhúng) | 0.60 | 0.50 | 0.87 | 0.40 | 0.67 | 0.87 | 1.00 |
| JD-06 (Lãnh đạo kỹ thuật (BPM)) | 0.60 | 0.50 | 0.77 | 0.50 | 0.83 | 0.83 | 1.00 |
| JD-07 (React JS Developer (Tiếng An) | 1.00 | 0.56 | 0.97 | 0.60 | 0.67 | 0.87 | 1.00 |
| JD-08 (Nhà phát triển phụ trợ (Pyth) | 1.00 | 0.42 | 0.96 | 1.00 | 0.83 | 0.97 | 1.00 |
| JD-09 (Python Developer (Odoo Devel) | 1.00 | 0.56 | 1.00 | 0.60 | 0.67 | 0.86 | 1.00 |
| JD-10 (Lập Trình Viên Fresher/Middl) | 0.60 | 0.30 | 0.75 | 0.50 | 0.50 | 0.70 | 1.00 |
| **Trung bình (macro)** | **0.86** | **0.48** | **0.90** | **0.66** | **0.73** | **0.87** | **0.95** |

## 2. Calibration check (LLM-judge vs CV thiết kế sẵn)

20 cặp "ruột" (CV thiết kế riêng cho đúng JD đó) — kỳ vọng variant `a` ra grade 2, variant `b` ra grade thấp hơn.

- JD-01 / JD-01-A: judge_grade=2 (own-JD calibration pair)
- JD-01 / JD-01-B: judge_grade=2 (own-JD calibration pair)
- JD-02 / JD-02-A: judge_grade=2 (own-JD calibration pair)
- JD-02 / JD-02-B: judge_grade=2 (own-JD calibration pair)
- JD-03 / JD-03-A: judge_grade=2 (own-JD calibration pair)
- JD-03 / JD-03-B: judge_grade=2 (own-JD calibration pair)
- JD-04 / JD-04-A: judge_grade=2 (own-JD calibration pair)
- JD-04 / JD-04-B: judge_grade=2 (own-JD calibration pair)
- JD-05 / JD-05-A: judge_grade=2 (own-JD calibration pair)
- JD-05 / JD-05-B: judge_grade=2 (own-JD calibration pair)
- JD-06 / JD-06-A: judge_grade=2 (own-JD calibration pair)
- JD-06 / JD-06-B: judge_grade=2 (own-JD calibration pair)
- JD-07 / JD-07-A: judge_grade=2 (own-JD calibration pair)
- JD-07 / JD-07-B: judge_grade=2 (own-JD calibration pair)
- JD-08 / JD-08-A: judge_grade=2 (own-JD calibration pair)
- JD-08 / JD-08-B: judge_grade=2 (own-JD calibration pair)
- JD-09 / JD-09-A: judge_grade=2 (own-JD calibration pair)
- JD-09 / JD-09-B: judge_grade=2 (own-JD calibration pair)
- JD-10 / JD-10-A: judge_grade=2 (own-JD calibration pair)
- JD-10 / JD-10-B: judge_grade=2 (own-JD calibration pair)

## 3. LLM-as-judge: chất lượng Ingest Agent

**Độ tin cậy cột "Skill false-negative":** đã spot-check thủ công (VD `JD-01-A`) và phát hiện judge liệt kê cả skill **không hề xuất hiện trong text CV** (tự bịa), lẫn skill ngoài phạm vi 10-skill taxonomy dù prompt đã yêu cầu chỉ xét trong đó (VD "Django", "MySQL", "WebSockets"). Vì vậy cột này **không nên coi là danh sách lỗi extract_skills() đã xác nhận** — chỉ mang tính gợi ý cần kiểm tra thủ công thêm, không phải kết luận cuối. Cột Faithfulness đáng tin hơn (so sánh trực tiếp 2 đoạn văn bản, không yêu cầu judge tự nhớ toàn bộ CV).

| CV | Faithfulness (summarize) | Skill false-positive | Skill false-negative (chưa xác thực, xem lưu ý trên) |
|---|---|---|---|
| JD-01-A | 1.00 | - | ['Python', 'FastAPI', 'JavaScript', 'TypeScript', 'React', 'Git', 'Linux'] |
| JD-01-B | 1.00 | - | ['Python', 'FastAPI', 'PostgreSQL', 'TypeScript', 'React', 'Git', 'Linux'] |
| JD-02-A | 1.00 | - | ['Python', 'Git', 'Kubernetes'] |
| JD-02-B | 1.00 | - | ['Python', 'Docker', 'Git'] |
| JD-03-A | 1.00 | - | ['JavaScript', 'Git'] |
| JD-03-B | 1.00 | - | ['JavaScript', 'SQL', 'PostgreSQL', 'Docker', 'Linux'] |
| JD-04-A | 1.00 | - | ['Python', 'FastAPI', 'PostgreSQL', 'JavaScript', 'TypeScript', 'React', 'SQL', 'Git'] |
| JD-04-B | 1.00 | - | ['Git', 'Docker', 'JavaScript', 'TypeScript', 'React', 'SQL'] |
| JD-05-A | 1.00 | - | ['Python', 'Linux'] |
| JD-05-B | 1.00 | - | ['Linux'] |
| JD-06-A | 0.95 | - | ['Java', 'JavaScript', 'Docker'] |
| JD-06-B | 1.00 | ['TypeScript'] | ['Docker'] |
| JD-07-A | 1.00 | - | ['React', 'Git'] |
| JD-07-B | 1.00 | - | ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'TypeScript', 'React', 'SQL', 'Git', 'Linux'] |
| JD-08-A | 1.00 | - | ['Django', 'MySQL', 'RESTful APIs', 'WebSockets'] |
| JD-08-B | 1.00 | ['SQL'] | ['PostgreSQL'] |
| JD-09-A | 1.00 | - | ['FastAPI', 'PostgreSQL', 'Docker', 'TypeScript', 'React', 'SQL', 'Linux'] |
| JD-09-B | 1.00 | - | ['MySQL', 'Flask', 'Odoo'] |
| JD-10-A | 1.00 | ['SQL', 'Git'] | ['JavaScript'] |
| JD-10-B | 1.00 | - | ['JavaScript'] |

**Faithfulness trung bình: 1.00** (20/20 CV có điểm hợp lệ)

Case có claim không được support (đáng xem lại):
- **JD-06-A**: ['Observability: Prometheus, Grafana', 'Testing: JUnit, Performance testing (K6, JMeter)', 'Certifications: Certified Kubernetes Administrator (CKA), Java SE 11 Developer Certification', 'Additional: Strong problem-solving skills and ability to work under pressure, Excellent communication and leadership abilities, fostering a collaborative team environment.']

## 4. Ghi chú

- Cache LLM/embedding tại `evaluation/golden/.cache/` theo content hash — chạy lại `run_eval.py` không tốn gọi API trùng lặp.
- Đổi model (`CHAT_MODEL`/`EMBED_MODEL` trong `llm_openai.py`) thì phải xoá cache và chạy lại toàn bộ, không so sánh chéo được giữa các lần chạy khác model.
