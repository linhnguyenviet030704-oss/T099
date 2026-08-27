# Evaluation Report — Matching Agent (Golden Dataset)

> Báo cáo đánh giá chất lượng sản phẩm theo tiêu chí BTC.

**Phạm vi:** đánh giá offline chất lượng ghép nối JD ↔ CV của hệ thống, dựa trên bộ dữ liệu golden gồm 20 JD (chọn từ VietJobs, trải trên 15 nhóm ngành CNTT) và 40 CV thật (từ `data_find/generated_cv` và bản dịch tiếng Việt `data_find/generated_cv_vi`).

**Nguồn số liệu:** `evaluation/golden/results/report.md` (chạy bằng `evaluation/golden/run_eval.py`), quy ra từ `evaluation/golden/qrels.json` (800 cặp JD×CV được LLM-judge chấm điểm quan hệ) và `evaluation/golden/ingest_results.json`/`quality_judge.json` (kết quả Ingest Agent).

> **Cập nhật 2026-08-27 (sau báo cáo gốc):** phát hiện `evaluation/golden/run_eval.py` không tính `bm25_score`
> khi ranking (bỏ trống ở chiều JD→CV, set cứng `0.0` ở chiều CV→JD) — nên các số liệu "Actual" gốc dưới đây
> thực chất đo một pipeline **dense-only**, dù code RAG agent thật (`backend/app/services/matching/*`) đã
> implement hybrid BM25+dense đầy đủ ở cả 2 chiều. Đã sửa harness để tính BM25 thật khớp production và chạy
> lại. Bảng gốc bên dưới **giữ nguyên** để đối chiếu lịch sử; mục 1 có thêm bảng "trước/sau" ngay sau bảng
> gốc. Chi tiết điều tra đầy đủ: [`eval/results/report2.md`](report2.md).

---

## 1. Metrics

| Metric | Target | Actual | Status |
|---|---|---|---|
| Precision@5 (JD→CV) | — | 0.73 | — |
| Precision@10 (JD→CV) | — | 0.68 | — |
| Recall@5 (JD→CV) | — | 0.35 | — |
| Recall@10 (JD→CV) | — | 0.61 | ✅ |
| NDCG@5 (JD→CV) | — | 0.58 | — |
| NDCG@10 (JD→CV) | — | 0.66 | — |
| MRR grade=2 (JD→CV) | — | 0.32 | ⚠️ |
| Precision@5 (CV→JD) | — | 0.62 | — |
| Precision@10 (CV→JD) | — | 0.49 | — |
| Recall@5 (CV→JD) | — | 0.57 | — |
| Recall@10 (CV→JD) | — | 0.81 | ✅ |
| NDCG@5 (CV→JD) | — | 0.74 | — |
| NDCG@10 (CV→JD) | — | 0.80 | — |
| MRR grade=2 (CV→JD) | — | 0.44 | — |
| Ingest Faithfulness (trung bình) | — | 0.97 / 1.00 | ✅ |
| Calibration (JD phân biệt đúng CV khớp cao/thấp) | — | 19/20 | ✅ |

*Cột "Target" chưa có ngưỡng BTC cụ thể cho các metric ranking này; Status chỉ đánh dấu các điểm được nêu rõ là điểm mạnh (✅) hoặc điểm cần lưu ý (⚠️) ở mục 4 của báo cáo gốc.*

### 1.1. Trước/sau fix BM25 golden eval

Cùng golden dataset, cùng qrels đã cache (800 cặp LLM-judge không đổi) — chỉ đổi cách harness tính ranking.

| Metric | Trước (dense-only, bug) | Sau (hybrid BM25+dense) | Sau fix `bm25_query` CV→JD | Chênh lệch |
|---|---|---|---|---|
| Precision@5 (JD→CV) | 0.73 | 0.83 | 0.83 | +0.10 |
| Precision@10 (JD→CV) | 0.68 | 0.73 | 0.73 | +0.05 |
| Recall@5 (JD→CV) | 0.35 | 0.41 | 0.41 | +0.06 |
| Recall@10 (JD→CV) | 0.61 | 0.65 | 0.65 | +0.04 |
| NDCG@5 (JD→CV) | 0.58 | 0.72 | 0.72 | +0.14 |
| NDCG@10 (JD→CV) | 0.66 | 0.78 | 0.78 | +0.12 |
| MRR grade=2 (JD→CV) | 0.32 | 0.49 | 0.49 | +0.17 |
| Precision@5 (CV→JD) | 0.62 | 0.64 | **0.65** | +0.03 |
| Precision@10 (CV→JD) | 0.49 | 0.51 | **0.51** | +0.02 |
| Recall@5 (CV→JD) | 0.57 | 0.61 | **0.61** | +0.04 |
| Recall@10 (CV→JD) | 0.81 | 0.85 | **0.84** | +0.03 |
| NDCG@5 (CV→JD) | 0.74 | 0.72 | **0.78** | +0.04 |
| NDCG@10 (CV→JD) | 0.80 | 0.78 | **0.84** | +0.04 |
| MRR grade=2 (CV→JD) | 0.44 | 0.38 | **0.46** | +0.02 |
| Ingest Faithfulness / Calibration | 0.97/1.00, 19/20 | không đổi | không đổi | — |

Chiều JD→CV cải thiện đều trên toàn bộ metric (BM25 bù cho những chỗ dense embedding bỏ sót/pha loãng khớp
từ khoá cứng). Chiều CV→JD lúc đầu không cải thiện đều — precision/recall nhích lên nhưng NDCG/MRR giảm nhẹ,
đúng như nghi ngờ ban đầu là do `bm25_query()` chiều này dùng nguyên văn CV (dài, nhiều nhiễu) làm query thay
vì title+skills ngắn gọn như chiều JD→CV. Đã sửa bằng `_cv_query_text()` (ưu tiên CV titles, fallback summary,
fallback cuối mới là toàn văn CV) ở cả production (`retrieve_jobs.py`) và harness (`run_eval.py`) — cột thứ 3
ở trên là kết quả sau fix: MRR và NDCG chiều CV→JD không chỉ phục hồi mà còn vượt cả baseline gốc trước khi có
bug BM25. Xem [`eval/results/report2.md`](report2.md) mục 4 để có phân tích đầy đủ.

**Vì sao dùng các metric này:** hệ thống có hai luồng cần đo riêng — nhà tuyển dụng xem CV gợi ý cho một JD (JD→CV, Matching Agent) và ứng viên xem JD gợi ý cho CV (CV→JD, agent recommend). Cả hai là bài toán xếp hạng (ranking) trong danh sách hữu hạn, nên Precision@K/Recall@K đo độ chính xác và độ bao phủ trong cửa sổ người dùng thực sự xem, NDCG@K tận dụng thang điểm 3 mức (0/1/2) của LLM-judge thay vì nhị phân, và MRR (ngưỡng grade=2) đo tốc độ tìm được kết quả khớp mạnh đầu tiên. Cắt ở K=5 và K=10 vì đó là kích thước trang kết quả thực tế của sản phẩm.

---

## 2. Test Results

### 2.1 Đánh giá Matching Agent (JD↔CV, LLM-judge trên golden dataset)

**Kiểm tra độ tin cậy của nhãn (calibration):** mỗi JD có 1 CV "khớp cao" và 1 CV "khớp thấp" cố ý. LLM-judge chấm đúng thứ tự này ở **19/20 JD** (điểm trung bình 1.65 so với 1.20 trên thang 0–2) — nhãn tin cậy được.

**Độ khó bộ dữ liệu:** trong 800 cặp JD×CV, 68% không liên quan, 26% liên quan một phần, chỉ 6% khớp mạnh — đa số cặp là nhiễu, nên Precision/Recall ở mục 1 phản ánh đúng năng lực lọc của hệ thống, không phải do đề dễ.

### 2.2 Đánh giá Ingest Agent (parse + tóm tắt CV)

- Faithfulness trung bình **0.97/1.00** (40/40 CV có điểm hợp lệ) — bản tóm tắt bám sát nội dung gốc, rất ít chi tiết bịa đặt.
- Một vài trường hợp lệch nhỏ (0.90–0.95) đều là thiếu chi tiết cụ thể (số liệu, tên công cụ), không phải sai lệch nội dung.
- Cột "skill false-negative" trong report gốc **không dùng làm bằng chứng lỗi** `extract_skills()` — đã spot-check thấy LLM-judge tự liệt kê cả skill không có trong text, chỉ mang tính gợi ý kiểm tra thủ công thêm.

---

## 3. Action Items

- [x] ~~Cải thiện MRR chiều JD→CV (hiện **0.32**...)~~ — nguyên nhân hoá ra là bug đo lường (harness thiếu
  BM25, xem mục 1.1), không phải hạn chế thật của thuật toán ranking. Sau khi sửa harness, MRR JD→CV
  **0.32 → 0.49**. Không cần thay đổi thuật toán ranking cho mục này.
- [x] ~~Điều tra MRR/NDCG chiều CV→JD giảm nhẹ sau khi BM25 tham gia fusion (0.44→0.38, 0.74→0.72 — mục 1.1)~~
  — xác nhận đúng nghi ngờ ban đầu: `bm25_query()` chiều này dùng nguyên văn CV (dài, nhiều nhiễu) làm query.
  Đã sửa bằng `_cv_query_text()` (ưu tiên CV titles, fallback summary, fallback cuối là toàn văn CV) ở cả
  production và harness eval. MRR CV→JD **0.38 → 0.46**, NDCG@10 **0.78 → 0.84** — vượt cả baseline gốc trước
  bug BM25. Xem [`eval/results/report2.md`](report2.md) mục 4.2.
- [ ] Theo dõi thêm Precision/Recall@5 hai chiều để xác định ngưỡng mục tiêu (target) chính thức cho các metric ranking, hiện chưa có tiêu chí BTC cụ thể để đối chiếu.

---

*Chi tiết đầy đủ theo từng JD/CV (bảng 20 dòng, 40 dòng, calibration từng cặp, skill accuracy) xem tại `evaluation/golden/results/report.md`.*
