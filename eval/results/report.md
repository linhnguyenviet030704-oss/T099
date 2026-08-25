# Evaluation Report — Matching Agent (Golden Dataset)

> Báo cáo đánh giá chất lượng sản phẩm theo tiêu chí BTC.

**Phạm vi:** đánh giá offline chất lượng ghép nối JD ↔ CV của hệ thống, dựa trên bộ dữ liệu golden gồm 20 JD (chọn từ VietJobs, trải trên 15 nhóm ngành CNTT) và 40 CV thật (từ `data_find/generated_cv` và bản dịch tiếng Việt `data_find/generated_cv_vi`).

**Nguồn số liệu:** `evaluation/golden/results/report.md` (chạy bằng `evaluation/golden/run_eval.py`), quy ra từ `evaluation/golden/qrels.json` (800 cặp JD×CV được LLM-judge chấm điểm quan hệ) và `evaluation/golden/ingest_results.json`/`quality_judge.json` (kết quả Ingest Agent).

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

- [ ] Cải thiện MRR chiều JD→CV (hiện **0.32**, thấp hơn khá nhiều so với NDCG@5 cùng chiều là **0.58**) — CV khớp mạnh nhất chưa luôn nằm ở vị trí đầu, ảnh hưởng trực tiếp đến trải nghiệm nhà tuyển dụng (thường chỉ hành động trên 1–2 kết quả đầu).
- [ ] Theo dõi thêm Precision/Recall@5 hai chiều để xác định ngưỡng mục tiêu (target) chính thức cho các metric ranking, hiện chưa có tiêu chí BTC cụ thể để đối chiếu.

---

*Chi tiết đầy đủ theo từng JD/CV (bảng 20 dòng, 40 dòng, calibration từng cặp, skill accuracy) xem tại `evaluation/golden/results/report.md`.*
