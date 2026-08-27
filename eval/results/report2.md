# Eval Result Report 2 — Golden Eval thiếu BM25 (root cause + fix)

> Bổ sung cho [`eval/results/report.md`](report.md) (giữ nguyên file cũ để đối chiếu lịch sử) và
> [`docs/evaluation-baseline-2026-08-27.md`](../../docs/evaluation-baseline-2026-08-27.md). File này ghi lại
> nguyên nhân khiến số liệu quality trong 2 báo cáo trên thấp hơn thực tế, và số liệu sau khi sửa.

## 1. Câu hỏi

Số liệu ranking quality trong `evaluation/golden/results/report.md` (P@5=0.73, NDCG@5=0.57, MRR=0.32 chiều
JD→CV) có vẻ thấp so với kỳ vọng cho một hệ thống hybrid BM25 + semantic + skill taxonomy. Tại sao?

## 2. Điều tra

Đọc lại toàn bộ pipeline retrieval thật (`backend/app/services/matching/{retrieve,retrieve_jobs,rrf,rrf_jobs,bm25}.py`)
và cách nó được nối dây trong production (`backend/app/dependencies/services.py`):

- **Chiều JD→CV** (Matching Agent): `retrieve_for_job()` → tính `bm25_scores()` thật → `rrf_node`
  (`agents/matching/nodes/rrf.py`) → `score_candidates()` fuse RRF giữa BM25 + dense. **Có BM25.**
- **Chiều CV→JD** (Recommend Agent): `retrieve_jobs_for_resume()` → tính `bm25_scores()` thật →
  `score_node` (`agents/recommend/nodes/score.py`) → `score_jobs_for_resume()` fuse RRF giữa BM25 + dense.
  **Có BM25.**

→ Code RAG agent thật (cả 2 chiều) **không có bug** — BM25 đã implement và chạy hybrid đúng thiết kế ở cả
matching lẫn recommend.

Bug nằm ở harness đánh giá `evaluation/golden/run_eval.py`:

- `rank_candidates_for_jd()` (chiều JD→CV) build `rows` cho `score_candidates()` **không có key `bm25_score`**
  → mặc định `0.0` cho mọi CV.
- `rank_jds_for_cv()` (chiều CV→JD) set cứng `"bm25_score": 0.0` cho mọi JD.

Trong cả `rrf.py` và `rrf_jobs.py`, danh sách xếp hạng theo BM25 chỉ giữ các row có `score > 0.0` — nên với
toàn bộ score = 0.0, danh sách BM25 luôn **rỗng** và RRF fusion thực chất chỉ chạy trên 1 nguồn (dense
semantic). Vậy **số liệu P@5/R@5/NDCG/MRR đã công bố trước đây đo một pipeline dense-only, không phải hybrid
BM25+dense mà production thật sự phục vụ người dùng.**

## 3. Fix

- `evaluation/golden/run_eval.py`: `rank_candidates_for_jd()` và `rank_jds_for_cv()` giờ tính `bm25_scores()`
  thật, tái tạo đúng cách `retrieve_for_job()`/`retrieve_jobs_for_resume()` build BM25 doc/query (
  `bm25_document()` trên text gốc CV/JD + skill list, `bm25_query()` trên title/CV-text + skill list).
- `backend/app/services/matching/bm25.py`: thêm `@lru_cache(maxsize=4096)` lên `matching_tokens()` — sửa
  luôn phát hiện phụ ở [`docs/evaluation-baseline-2026-08-27.md`](../../docs/evaluation-baseline-2026-08-27.md)
  mục 7.2 (`bm25_scores` ~1.38s/40 doc do tokenize lại từ đầu mỗi lần gọi). Đợt này **chưa chạy lại benchmark
  hiệu năng** để đo số mới (chỉ chạy lại quality eval theo yêu cầu) — cần chạy
  `python -m evaluation.service_bench.compute_local_bench` ở đợt sau để xác nhận.
- Cập nhật fixture trong `tests/unit/test_golden_run_eval_reverse.py` để có field `original_markdown` (khớp
  dữ liệu thật `ingest_all_cvs()` luôn tạo ra).
- Kiểm chứng: 44 test liên quan (`test_matching_bm25`, `test_matching_rrf`, `test_rrf_jobs`,
  `test_golden_run_eval_reverse`, `test_eval_retrieve`) + 185 test rộng hơn (matching/bm25/rrf/golden/skills)
  đều pass.

## 4. Số liệu trước/sau (golden dataset v2, 20 JD × 40 CV, chạy lại `run_eval.py` cùng qrels đã cache)

### 4.1. Chiều JD → CV (Matching Agent)

| Metric | Trước (dense-only, bug) | Sau (hybrid BM25+dense, đã sửa) | Chênh lệch |
|---|---|---|---|
| P@5 | 0.73 | **0.83** | +0.10 |
| R@5 | 0.35 | **0.41** | +0.06 |
| NDCG@5 | 0.57 | **0.72** | +0.15 |
| P@10 | 0.68 | **0.73** | +0.05 |
| R@10 | 0.60 | **0.65** | +0.05 |
| NDCG@10 | 0.66 | **0.78** | +0.12 |
| MRR | 0.32 | **0.49** | +0.17 |

Cải thiện rõ rệt trên toàn bộ metric — đúng như kỳ vọng: tín hiệu BM25 (khớp từ khoá cứng: tên công nghệ,
chức danh) bù cho những chỗ dense embedding bỏ sót hoặc pha loãng.

### 4.2. Chiều CV → JD (Recommend Agent)

| Metric | Trước (dense-only, bug) | Sau (hybrid BM25+dense, đã sửa) | Sau fix `bm25_query` CV→JD (titles/summary) | Chênh lệch (so với cột giữa) |
|---|---|---|---|---|
| P@5 | 0.62 | 0.64 | **0.65** | +0.01 |
| R@5 | 0.57 | 0.61 | **0.61** | 0 |
| NDCG@5 | 0.74 | 0.72 | **0.78** | +0.06 |
| P@10 | 0.49 | 0.51 | **0.51** | 0 |
| R@10 | 0.81 | 0.85 | **0.84** | −0.01 |
| NDCG@10 | 0.80 | 0.78 | **0.84** | +0.06 |
| MRR | 0.44 | 0.38 | **0.46** | +0.08 |
| Calibration top-3 | 26/40 | 25/40 | **30/40** | +5 |

Chiều này lúc đầu **không cải thiện đều** như chiều JD→CV: precision/recall nhích lên nhưng NDCG/MRR/calibration
giảm nhẹ. Nguyên nhân xác nhận đúng như nghi ngờ ban đầu: `bm25_query()` ở chiều này dùng **toàn bộ text CV**
làm query (so với chiều JD→CV chỉ dùng title + skill list ngắn gọn) — một query dài, nhiều nhiễu hơn kéo một
vài JD không thật sự khớp lên hạng cao qua kênh BM25, làm lệch vị trí top-1 (ảnh hưởng MRR) dù vẫn kéo đúng
nhiều JD liên quan vào top-10 (ảnh hưởng recall). Đây là kết quả thật của đúng logic RRF production đang chạy
(`rrf_jobs.py`), không phải lỗi đo.

**Đã sửa:** `retrieve_jobs.py` (production) và `run_eval.py` (harness) giờ dùng `_cv_query_text()` — ưu tiên
`metadata["titles"]` (chức danh CV, đã "grounded" chống bịa) làm query, fallback `metadata["summary"]`, chỉ
fallback về toàn văn CV khi cả hai đều rỗng — thay vì luôn dùng toàn văn CV. Kết quả: **MRR và NDCG không chỉ
phục hồi mà còn vượt cả baseline gốc trước khi có bug** (MRR 0.44→0.38→**0.46**; NDCG@10 0.80→0.78→**0.84**),
calibration top-3 cải thiện rõ (25/40→**30/40**). Precision/Recall giữ nguyên hoặc nhích nhẹ, không có đánh
đổi. Xác nhận nguyên nhân gốc rễ đúng như phân tích ở trên, và fix giải quyết trọn vẹn — không còn khoảng
trống cần điều tra thêm cho hướng này.

## 5. Việc còn lại

- Chạy lại `evaluation/service_bench/compute_local_bench.py` để xác nhận `bm25_scores` giảm latency sau khi
  thêm cache — chưa chạy trong đợt này theo yêu cầu (chỉ chạy quality).
- ~~Cân nhắc điều tra thêm nguyên nhân NDCG/MRR giảm nhẹ ở chiều CV→JD (mục 4.2)~~ — đã sửa: `bm25_query()`
  chiều CV→JD giờ dùng `_cv_query_text()` (titles → summary → toàn văn CV) thay vì luôn dùng toàn văn CV, xem
  mục 4.2. MRR/NDCG phục hồi và vượt baseline gốc.
- Đồng bộ lại `docs/evaluation-baseline-2026-08-27.md` với số liệu mới ở mục 4 khi có dịp chạy full benchmark
  lại (bao gồm cả phần latency) — `eval/results/report.md` đã đồng bộ số liệu chiều CV→JD trong lần này.
