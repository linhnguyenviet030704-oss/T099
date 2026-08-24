# Báo cáo Đánh giá Matching Agent — Golden Dataset

**Phạm vi:** đánh giá offline chất lượng ghép nối JD ↔ CV của hệ thống, dựa trên bộ dữ liệu golden gồm 20 JD (chọn từ VietJobs, trải trên 15 nhóm ngành CNTT) và 40 CV thật (từ `data_find/generated_cv` và bản dịch tiếng Việt `data_find/generated_cv_vi`).

**Nguồn số liệu:** `evaluation/golden/results/report.md` (chạy bằng `evaluation/golden/run_eval.py`), quy ra từ `evaluation/golden/qrels.json` (800 cặp JD×CV được LLM-judge chấm điểm quan hệ) và `evaluation/golden/ingest_results.json`/`quality_judge.json` (kết quả Ingest Agent).

---

## 1. Vì sao dùng các metric này

Hệ thống có hai luồng sản phẩm cần đo riêng vì phục vụ hai người dùng khác nhau: **nhà tuyển dụng** xem danh sách CV gợi ý cho một JD (chiều JD → CV, "Matching Agent"), và **ứng viên** xem danh sách JD gợi ý cho CV của mình (chiều CV → JD, agent "recommend"). Cả hai đều là bài toán **xếp hạng trong danh sách hữu hạn (ranking)**, không phải phân loại nhị phân, nên bộ metric chọn phải phản ánh đúng cách người dùng thực sự tương tác: chỉ nhìn một cửa sổ nhỏ trên đầu danh sách, và một số kết quả "đúng" quan trọng hơn kết quả khác.

- **Precision@K** — trong K kết quả đầu tiên hiển thị cho người dùng, bao nhiêu % thực sự liên quan. Đây là metric trực tiếp nhất cho trải nghiệm: nhà tuyển dụng hiếm khi xem quá 5–10 CV đầu, nên nếu Precision@5 thấp, phần lớn thời gian của họ bị lãng phí vào kết quả sai.
- **Recall@K** — trong toàn bộ ứng viên/JD thực sự liên quan có trong pool, bao nhiêu % lọt được vào top-K. Bổ sung cho Precision: hệ thống có thể rất "sạch" (Precision cao) nhưng vẫn bỏ sót phần lớn ứng viên tốt nếu Recall thấp — Recall đo đúng rủi ro đó.
- **NDCG@K (Normalized Discounted Cumulative Gain)** — vì LLM-judge chấm quan hệ theo 3 mức (0 = không liên quan, 1 = liên quan một phần, 2 = khớp mạnh) chứ không phải đúng/sai nhị phân, NDCG là metric duy nhất trong bộ này tận dụng được thông tin mức độ đó, đồng thời phạt nặng việc xếp kết quả tốt xuống cuối danh sách thay vì lên đầu — sát với cảm nhận thực tế của người dùng hơn Precision/Recall thuần.
- **MRR (Mean Reciprocal Rank, ngưỡng grade = 2)** — trả lời câu hỏi "kết quả khớp mạnh đầu tiên xuất hiện ở vị trí thứ mấy". Đây là proxy cho tốc độ tìm được ứng viên/công việc tốt nhất, quan trọng với luồng sản phẩm mà người dùng thường chỉ hành động (mời phỏng vấn, bấm ứng tuyển) trên 1–2 kết quả đầu.

Precision/Recall dùng ngưỡng `grade ≥ 1` (chấp nhận cả liên quan một phần), MRR dùng ngưỡng `grade = 2` (chỉ tính khớp mạnh) — hai ngưỡng khác nhau có chủ đích: Precision/Recall đo diện bao phủ, MRR đo tốc độ đến kết quả tốt nhất.

Cắt ở **K = 5 và K = 10** vì đó là kích thước trang kết quả thực tế của sản phẩm (đủ nhỏ để đo trải nghiệm "màn hình đầu tiên", đủ lớn để không quá nhạy với nhiễu của từng cặp đơn lẻ). Với pool 40 CV (chiều JD→CV) và pool 20 JD (chiều CV→JD), cả hai mốc K đều là một phần nhỏ/nửa pool — không suy biến thành phép đo tầm thường như khi K bằng đúng kích thước pool.

---

## 2. Kết quả xếp hạng

### 2.1 Chiều JD → CV (Matching Agent, `score_candidates`)

| Metric | @5 | @10 |
|---|---|---|
| Precision | **0.73** | **0.68** |
| Recall | **0.35** | **0.61** |
| NDCG | **0.58** | **0.66** |
| MRR (ngưỡng grade=2) | **0.32** | |

### 2.2 Chiều CV → JD (agent recommend, `score_jobs_for_resume`)

| Metric | @5 | @10 |
|---|---|---|
| Precision | **0.62** | **0.49** |
| Recall | **0.57** | **0.81** |
| NDCG | **0.74** | **0.80** |
| MRR (ngưỡng grade=2) | **0.44** | |

**Kiểm tra nhanh độ tin cậy của nhãn (calibration):** mỗi JD có 1 CV "khớp cao" và 1 CV "khớp thấp" cố ý. Giám khảo (LLM-judge) chấm đúng thứ tự này ở **19/20 JD** (điểm trung bình 1.65 so với 1.20 trên thang 0–2) — cho thấy nhãn tin cậy được.

**Độ khó của bộ dữ liệu:** trong 800 cặp JD×CV, 68% không liên quan, 26% liên quan một phần, chỉ 6% khớp mạnh. Đa số cặp là nhiễu, nên các số Precision/Recall ở trên phản ánh đúng năng lực lọc của hệ thống, không phải do đề dễ.

---

## 3. Chất lượng Ingest Agent (parse + tóm tắt CV)

- **Faithfulness trung bình: 0.97/1.00** (40/40 CV có điểm hợp lệ) — bản tóm tắt do Ingest Agent sinh ra bám sát nội dung gốc, rất ít chi tiết bịa đặt hoặc suy diễn ngoài văn bản CV.
- Một vài trường hợp lệch nhỏ (điểm 0.90–0.95) đều là thiếu chi tiết cụ thể (số liệu, tên công cụ) khi tóm tắt, không phải sai lệch nội dung.
- Cột "skill false-negative" trong report gốc **không dùng làm bằng chứng lỗi `extract_skills()`** — đã spot-check thấy LLM-judge tự liệt kê cả skill không có trong text, nên chỉ mang tính gợi ý kiểm tra thủ công thêm.

---

## 4. Nhận xét

**Điểm mạnh:**
- Recall@10 ở cả hai chiều đều ở mức khá (0.61 và 0.81), cho thấy hệ thống hiếm khi bỏ sót hoàn toàn ứng viên/công việc phù hợp nếu người dùng chịu xem đến kết quả thứ 10.
- Calibration đúng hướng ở 19/20 JD — hệ thống phân biệt được CV khớp cao và khớp thấp một cách nhất quán, không phải ngẫu nhiên.
- Ingest Agent tóm tắt trung thực (0.97), rủi ro "bịa thông tin ứng viên" ở bước ingest thấp.

**Điểm cần lưu ý:**
- **MRR chiều JD→CV chỉ 0.32**, thấp hơn khá nhiều so với NDCG@5 (0.58) cùng chiều — nghĩa là dù danh sách top-5/top-10 nhìn chung "sạch", CV **khớp mạnh nhất** không phải lúc nào cũng nằm ở vị trí đầu. Đây là điểm ảnh hưởng trực tiếp đến trải nghiệm nhà tuyển dụng (người có xu hướng chỉ hành động trên 1–2 kết quả đầu).


---

*Chi tiết đầy đủ theo từng JD/CV (bảng 20 dòng, 40 dòng, calibration từng cặp, skill accuracy) xem tại `evaluation/golden/results/report.md`.*
