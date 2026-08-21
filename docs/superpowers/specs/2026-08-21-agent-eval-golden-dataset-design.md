# Golden Dataset & Evaluation Pipeline cho Ingest Agent + Matching Agent

## 1. Bối cảnh & mục tiêu

`backend/app/agents/ingest/` và `backend/app/agents/matching/` (mô tả trong [`docs/architecture-agent-backend.md`](../../architecture-agent-backend.md) mục 3-4) hiện chưa có cách đo chất lượng định lượng. `evaluation/` cũ chỉ còn cache rỗng (script gốc đã mất), `eval/results/report.md` là template chưa điền.

Mục tiêu: xây một **golden dataset** (JD thật + CV synthetic có nhãn quan hệ) và **eval pipeline** chạy lại được, đo:
- Chất lượng ranking của Matching Agent: Precision@K, Recall@K, NDCG@K, MRR.
- Chất lượng 2 bước có LLM của Ingest Agent (`summarize`, `extract`) bằng LLM-as-judge, gồm cả Faithfulness.

Không thuộc phạm vi: sửa logic scoring/ranking hiện tại, thêm bước "LLM explanation" cho node `respond` (chưa tồn tại — xem `docs/ai_agent_matching_system_spec.md` mục 17, phase 6), tích hợp CI tự động chạy eval (tốn LLM call thật, chạy thủ công).

## 2. Kiến trúc: offline, tái dùng logic thật, không seed Supabase

Chạy toàn bộ pipeline **offline** bằng cách gọi thẳng các hàm lõi mà Ingest/Matching Agent dùng thật, thay vì seed `job_posts`/`job_submits`/`embedded_resumes` vào Supabase local:

- `embed_text()` (`backend/app/services/matching/embed.py`, gọi Qwen thật) sinh embedding cho JD-query và từng CV.
- Retrieval distance tính bằng cosine similarity thuần Python (numpy), **cùng công thức** với RPC `match_resumes_for_job` (pgvector cosine) mà `retrieve_for_job` gọi trong production — chỉ khác nơi thực thi (Python thay vì Postgres).
- `skill_node`, `rrf_node` (`backend/app/agents/matching/nodes/`) và `coverage_score`/`extract_skills` (`backend/app/services/matching/skills.py`) được **import và gọi trực tiếp**, không mock — đây là phần logic quyết định thứ hạng cuối, cần đo đúng bản thật.
- `build_ingest_graph()` chạy thật trên PDF đã render, để `summarize`/`extract`/`embed` là output LLM thật, không giả lập.

Lý do chọn offline thay vì seed Supabase: seed 20 CV × 10 JD (200 `job_submits`) vào DB local nặng, khó lặp lại nhiều lần khi chỉnh dataset, và không cần thiết vì phần schema/DB đã có test riêng (`tests/api/`, `tests/unit/test_matching_ingest.py`). Phần cần đo ở đây là **chất lượng thuật toán ranking + LLM**, không phải tầng lưu trữ.

Kết quả trung gian (JD embedding, CV embedding, judge output) được cache theo content hash, tương tự `evaluation/.cache/` cũ, để chạy lại không tốn LLM call trùng lặp.

## 3. Chọn 10 JD từ VietJobs

Nguồn: `data_find/data/vietjobs/VietJobs_full.csv` (48,092 dòng, cột `job_title, technical_skills, description, requirements_text, category, location`).

Quy trình:
1. Lọc `category == "công_nghệ_thông_tin_kỹ_thuật_số"` (~1900 dòng) — lưu ý category này lẫn cả vai trò không phải kỹ thuật (thiết kế đồ hoạ, sales phần mềm, CNC...), nên lọc tiếp theo từ khoá `technical_skills`/`job_title` để giữ vai trò kỹ thuật thật (backend, frontend, fullstack, devops, QA, sysadmin, blockchain, ERP, data, mobile...).
2. Loại JD có `description`/`technical_skills` quá ngắn hoặc rỗng (JD phải đủ chi tiết để CV "80-90% khớp" có ý nghĩa).
3. Chọn 10 JD **đa dạng vai trò** (không trùng lặp lĩnh vực), ưu tiên JD có danh sách kỹ năng cụ thể, rõ ràng.
4. Ghi ra `evaluation/golden/jds.json`: mỗi JD gồm `jd_id` (tự đặt, ví dụ `JD-01`), `title`, `description`, `requirements_text`, `technical_skills` (list), `location`, nguồn dòng gốc trong CSV (để truy vết).

## 4. Sinh CV — tái dùng pipeline `data_find/generated_cv`

**Format**: giữ nguyên convention đã có ở `data_find/generated_cv/*/**.md` — frontmatter YAML (`cv_id, candidate_name, seniority, years_experience, language, source: synthetic_llm, ...`) + thân CV markdown viết tự nhiên (Profile/Work Experience/Education/Technical Skills...), rồi render PDF bằng `data_find/generated_cv/scripts/render_cv_pdf.py` (dùng lại nguyên script, không viết mới). Lưu vào **thư mục riêng** `evaluation/golden/cvs/` — không gộp vào `data_find/generated_cv/` để không phải sửa `metadata.csv`/`build_metadata.py` của bộ 204 CV gốc.

Frontmatter CV thêm 2 field so với schema gốc để truy vết: `target_jd_id` (JD mà CV này được thiết kế để khớp) và `intended_match_pct` (khoảng % dự định, ví dụ `"80-90"`).

**Vòng lặp sinh + verify** (script `evaluation/golden/generate_cvs.py`), cho mỗi JD × 2 CV:
1. Trích `jd_skills` từ JD bằng `extract_skills()` thật (cùng hàm Matching Agent dùng).
2. Prompt LLM (Qwen, `chat_complete`) sinh CV markdown theo format ở trên, cố ý cho ứng viên có phần lớn `jd_skills` nhưng **thiếu có chủ đích** 1-2 skill hoặc 1 yêu cầu phụ (kinh nghiệm/domain) để không đạt 100%.
3. Chạy CV vừa sinh qua `extract_skills()` + `coverage_score()` thật, so với `jd_skills` → ra % thật.
4. Nếu % ngoài khoảng 80-90%: điều chỉnh chỉ dẫn prompt (bớt/thêm đúng số skill cần) và sinh lại. Giới hạn tối đa 5 lần lặp/CV; nếu vẫn không đạt, giữ CV gần nhất và đánh dấu `verified: false` trong metadata để không âm thầm dùng số liệu sai.
5. Ghi `.md` + render `.pdf`.

Output: 20 CV (`evaluation/golden/cvs/jd01-a.md/.pdf`, `jd01-b.md/.pdf`, ... `jd10-b.md/.pdf`) + `evaluation/golden/cvs_manifest.json` ghi lại % coverage thật đo được cho mỗi CV so với JD gốc của nó.

## 5. Qrels — LLM-as-judge chấm toàn bộ pool 20×10

Pool chung: 20 CV dùng chung cho cả 10 JD (mỗi JD có 2 CV "ruột" độ khớp cao, 18 CV còn lại đóng vai trò distractor với độ liên quan khác nhau tuỳ JD).

- **Calibration set**: 20 cặp (CV, JD-ruột-của-nó) đã có % coverage thật từ bước 4 — dùng để kiểm tra LLM-judge có chấm hợp lý không (nếu judge chấm 1 cặp có coverage 85% là "không liên quan", đó là dấu hiệu prompt judge có vấn đề).
- **180 cặp còn lại** (200 cặp tổng − 20 cặp calibration): LLM-as-judge (Qwen) chấm relevance grade `{0: không liên quan, 1: liên quan một phần (kỹ năng/ngành gần), 2: khớp cao}` kèm lý do ngắn, input là JD text + CV markdown (không đưa `coverage_score` vào prompt để tránh judge chỉ lặp lại con số đã biết).
- Ghi `evaluation/golden/qrels.json`: `{jd_id: {cv_id: grade}}`.

Script: `evaluation/golden/judge_relevance.py`.

## 6. Metrics ranking

Script `evaluation/golden/metrics.py` — thuần Python (không thêm dependency), input là (a) ranked list candidate theo JD từ pipeline offline mục 2, (b) `qrels.json`:

- Precision@K, Recall@K (K=5,10) — dùng ngưỡng `grade >= 1` là "relevant" cho recall/precision nhị phân.
- NDCG@K (K=5,10) — dùng graded relevance 0/1/2 trực tiếp (không nhị phân hoá), vì qrels đã có 3 mức.
- MRR — rank của candidate `grade == 2` đầu tiên xuất hiện trong danh sách xếp hạng.

Chạy cho từng JD, rồi lấy trung bình (macro) qua 10 JD.

## 7. LLM-as-judge cho chất lượng Ingest Agent

Script `evaluation/golden/judge_quality.py`, chấm trên 20 CV đã ingest qua `build_ingest_graph()` thật:

- **Faithfulness của `summarize`**: prompt judge tự viết (không dùng thư viện `ragas`) theo đúng phương pháp Faithfulness của RAGAS — tách summary thành các claim rời rạc, kiểm tra từng claim có được support bởi CV gốc (markdown trước khi summarize) không, ra tỷ lệ claim-được-support/tổng-claim. Lý do không dùng thư viện `ragas` thật: chỉ cần đúng 1 metric của nó, trong khi tích hợp `ragas` cần thêm lớp adapter (langchain LLM/embedding wrapper trỏ vào Qwen, dependency `datasets`) — chi phí tích hợp không tương xứng với lợi ích so với việc viết thẳng 1 prompt judge theo cùng phương pháp.
- **Độ chính xác `extract_skills`**: judge so sánh skill list trích ra với CV gốc, chấm precision (skill trích ra có thật trong CV không) và recall (skill có trong CV mà bị bỏ sót) theo thang định tính (LLM liệt kê false-positive/false-negative), không cần nhãn tay vì đây là so sánh trực tiếp với văn bản nguồn có sẵn.

Cả 2 chạy trên toàn bộ 20 CV, kết quả trung bình + danh sách case lệch nhiều nhất (để review thủ công).

## 8. Output

`evaluation/golden/results/report.md` (khác với `eval/results/report.md` — file đó là template cũ không đụng tới):
- Bảng Precision@K/Recall@K/NDCG@K/MRR theo từng JD + trung bình.
- Bảng Faithfulness (summarize) + độ chính xác skill-extraction, trung bình + top case lệch.
- Ghi rõ ngày chạy, model LLM dùng (`LLM_MODEL`/`EMBEDDING_MODEL` từ `.env`), để biết kết quả gắn với version model nào.

## 9. Cấu trúc file

```
evaluation/golden/
  jds.json                  # 10 JD chọn từ VietJobs (mục 3)
  cvs/                      # 20 CV .md + .pdf (mục 4)
  cvs_manifest.json         # % coverage thật đo được mỗi CV vs JD gốc
  qrels.json                # relevance grade 0/1/2 cho 200 cặp (mục 5)
  generate_cvs.py
  judge_relevance.py
  metrics.py
  judge_quality.py
  run_eval.py                # orchestrator: chạy toàn bộ, gọi các script trên theo thứ tự
  results/report.md          # output cuối (mục 8)
  .cache/                    # cache embedding/judge theo content hash (không commit)
```

## 10. Rủi ro & giới hạn đã biết

- LLM-as-judge (Qwen) chấm cả qrels lẫn quality — cùng 1 model chấm dữ liệu do chính nó tham gia sinh (bước 4 cũng dùng Qwen) có rủi ro thiên vị nhẹ; giảm thiểu bằng calibration set (mục 5) làm sanity check, không loại bỏ hoàn toàn rủi ro này.
- Kết quả phụ thuộc model `LLM_MODEL`/`EMBEDDING_MODEL` tại thời điểm chạy — đổi model phải chạy lại toàn bộ, không so sánh chéo được giữa các lần chạy khác model.
- Không chạy trong CI (chi phí + độ trễ gọi LLM thật); chạy thủ công khi cần đánh giá lại sau khi đổi model/logic scoring.
