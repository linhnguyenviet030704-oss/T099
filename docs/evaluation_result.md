# Báo Cáo Kết Quả Đánh Giá Hệ Thống Khớp Nối Hai Chiều (Evaluation Results)
### NextJob — AI-Powered Two-Way Recruitment Platform
### Đồ án Chuyên ngành P-099 | Team Matikanefukukitaru

---

## 🎯 1. Tổng Quan Phạm Vi & Phương Pháp Đánh Giá

Báo cáo này tổng hợp kết quả đánh giá thực nghiệm độc lập về chất lượng khớp nối hai chiều (**JD &harr; CV**) và chất lượng xử lý hồ sơ của **Ingest Agent** và **Matching/Recommend Agent** trên nền tảng **NextJob**.

- **Tập dữ liệu Golden Dataset**:
  - **20 Tin tuyển dụng (JD)**: Được chọn lọc đa dạng từ hệ thống VietJobs, trải dài trên 15 nhóm ngành Công nghệ Thông tin (Backend, Frontend, DevOps, AI/ML, Data Engineering, Cybersecurity, Cloud, Mobile, QA/QC, System Admin, v.v.).
  - **40 Hồ sơ Ứng viên (CV)**: Bao gồm CV tiếng Anh chuẩn và các bản dịch đối ứng tiếng Việt 1-1 từ `data_find/generated_cv/` và `data_find/generated_cv_vi/`.
  - **800 Cặp tương quan JD &times; CV**: Được đánh giá và gán nhãn ground-truth khách quan bởi **LLM-as-a-Judge (`gpt-4o-mini`)** theo thang điểm 3 mức: `0` (Không liên quan), `1` (Liên quan một phần), `2` (Khớp mạnh).
- **Độ khó của bộ dữ liệu kiểm thử**:
  - **68%** cặp JD &times; CV là hoàn toàn không liên quan (nhiễu).
  - **26%** cặp liên quan một phần.
  - Chỉ **6%** cặp là khớp mạnh tuyệt đối.
  - *Ý nghĩa*: Dữ liệu có độ phân hóa cao, phản ánh chính xác năng lực lọc nhiễu và độ tin cậy của thuật toán trong môi trường thực tế.

---

## 📊 2. Bảng Tổng Hợp Chỉ Số Đánh Giá Đạt Được (Evaluation Metrics)

Hệ thống đo lường riêng biệt theo 2 chiều tương tác thực tế của sản phẩm:
1. **Chiều JD &rarr; CV (Matching Agent)**: Nhà tuyển dụng tìm kiếm và xếp hạng ứng viên cho tin tuyển dụng.
2. **Chiều CV &rarr; JD (Recommend Agent)**: Ứng viên nhận danh sách gợi ý việc làm phù hợp nhất với hồ sơ cá nhân.

| Nhóm Chỉ Số (Metric) | Chiều JD &rarr; CV (Matching) | Chiều CV &rarr; JD (Recommend) | Ý Nghĩa Kỹ Thuật |
|---|:---:|:---:|---|
| **Precision@5 (P@5)** | **0.83 (83%)** | **0.65 (65%)** | Tỷ lệ hồ sơ thực sự phù hợp trong Top 5 kết quả đầu tiên |
| **Precision@10 (P@10)** | **0.73 (73%)** | **0.51 (51%)** | Tỷ lệ phù hợp trong Top 10 kết quả hiển thị |
| **Recall@5 (R@5)** | **0.41 (41%)** | **0.61 (61%)** | Độ bao phủ các ứng viên/JD phù hợp ngay tại trang đầu |
| **Recall@10 (R@10)** | **0.65 (65%)** | **0.84 (84%)** | Tỷ lệ gom đủ phần lớn ứng viên/công việc tiềm năng |
| **NDCG@5** | **0.72** | **0.78** | Điểm xếp hạng chuẩn hóa giảm dần theo mức độ phù hợp Top 5 |
| **NDCG@10** | **0.78** | **0.84** | Điểm xếp hạng chất lượng tổng thể trong Top 10 |
| **MRR (Mean Reciprocal Rank)** | **0.49** | **0.46** | Tốc độ xuất hiện ứng viên/việc làm khớp mạnh đầu tiên (Grade 2) |
| **Ingest Faithfulness** | **0.97 / 1.00** | **0.97 / 1.00** | Độ trung thực của bản tóm tắt CV (Anti-hallucination) |
| **Calibration Accuracy** | **19/20 (95%)** | **30/40 (75%)** | Tỷ lệ phân biệt chính xác hồ sơ khớp cao vượt trội hơn hồ sơ khớp thấp |

---

## 🔬 3. Phân Tích Hiệu Quả Thuật Toán Hybrid Ranking (BM25 + pgvector Dense + Skill Graph)

Quá trình đo lường thực nghiệm đã chứng minh sức mạnh vượt trội của mô hình **Hybrid Ranking thông qua Reciprocal Rank Fusion (RRF k=60)** so với mô hình Dense-Only truyền thống:

```
                  ┌───────────────────────────────────────────────────────────┐
                  │                 HYBRID RETRIEVAL ENGINE                   │
                  └─────────────────────────────┬─────────────────────────────┘
                                                │
                    ┌───────────────────────────┴───────────────────────────┐
                    ▼                                                       ▼
        ┌───────────────────────┐                               ┌───────────────────────┐
        │ Dense Semantic Search │                               │ Keyword Search (BM25) │
        │ pgvector Cosine (1536)│                               │ Tokenized Skill Match │
        └───────────┬───────────┘                               └───────────┬───────────┘
                    │                                                       │
                    └───────────────────────────┬───────────────────────────┘
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │ RRF Fusion Engine     │
                                    │ Score = Σ w / (k + r) │
                                    └───────────┬───────────┘
                                                │
                                                ▼
                                    ┌───────────────────────┐
                                    │ Final Ranked Results  │
                                    └───────────────────────┘
```

### 3.1. So Sánh Trước & Sau Khi Tích Hợp Đầy Đủ Hybrid Fusion

| Chỉ số đo lường | Mô hình Cũ (Dense-Only) | Mô hình Lai (Hybrid BM25 + Dense RRF) | Mức độ Cải Thiện |
|---|:---:|:---:|:---:|
| **Precision@5 (JD &rarr; CV)** | 0.73 | **0.83** | 🟢 **+10%** |
| **NDCG@5 (JD &rarr; CV)** | 0.58 | **0.72** | 🟢 **+24.1%** |
| **NDCG@10 (JD &rarr; CV)** | 0.66 | **0.78** | 🟢 **+18.2%** |
| **MRR (JD &rarr; CV)** | 0.32 | **0.49** | 🟢 **+53.1%** |
| **NDCG@10 (CV &rarr; JD)** | 0.80 | **0.84** | 🟢 **+5.0%** |
| **Calibration Top-3 (CV &rarr; JD)** | 26/40 | **30/40** | 🟢 **+15.4%** |

### 3.2. Nhận xét & Bài học Kỹ thuật:
1. **Khắc phục điểm mù của Dense Embedding**: Tín hiệu từ khóa chính xác từ BM25 (tên công nghệ, thư viện, chức danh như `FastAPI`, `PostgreSQL`, `Kubernetes`) đã bù đắp hoàn hảo cho các trường hợp Dense Vector bị pha loãng ngữ nghĩa khi văn bản quá dài.
2. **Tối ưu hóa Truy vấn BM25 Chiều CV &rarr; JD (`_cv_query_text`)**:
   - Việc sử dụng toàn văn CV dài làm câu truy vấn BM25 từng gây nhiễu và làm giảm nhẹ MRR.
   - Khi áp dụng cơ chế lọc ưu tiên: `CV Titles (đã grounded) ➔ CV Summary ➔ Toàn văn CV`, điểm **NDCG@10 đạt 0.84** và **MRR đạt 0.46**, vượt trội hơn tất cả các phương án thử nghiệm trước đó.

---

## 🛡️ 4. Đánh Giá Độ Tin Cậy & Chống Ảo Giác (Ingest Faithfulness)

- **Điểm Faithfulness trung bình**: Đạt **0.97 / 1.00** trên toàn bộ 40 CVs trong Golden Dataset (và đạt **1.00 tuyệt đối** trên 76/77 CVs trong Ingest Eval v2).
- **Phân tích chi tiết**:
  - $100\%$ bản tóm tắt CV giữ nguyên sự thật lịch sử làm việc, không xuất hiện hiện tượng tự bịa đặt kỹ năng (Zero Skill Fabrication).
  - Các sai lệch nhỏ ($<0.03$) xuất phát từ việc LLM tóm lược ngắn gọn số liệu định lượng, hoàn toàn không làm sai lệch năng lực chuyên môn của ứng viên.
  - Hàm `grounded_titles` kiểm tra chéo loại bỏ $100\%$ chức danh ảo không có căn cứ từ văn bản gốc.

---

## 📈 5. Kết Luận & Đánh Giá Tổng Thể

1. **Hiệu năng Khớp nối Đạt Chuẩn Doanh Nghiệp**: Với độ chính xác **P@5 đạt 83%** ở chiều nhà tuyển dụng và **NDCG@10 đạt 0.84** ở chiều ứng viên, hệ thống NextJob hoàn toàn sẵn sàng phục vụ nhu cầu tuyển dụng thực tế với độ tin cậy cao.
2. **Kiến trúc Vững chắc**: Việc kết hợp pgvector HNSW, BM25 Tokenizer, Đồ thị 186 Skill Taxonomy và RRF Fusion k=60 mang lại sự cân bằng tối ưu giữa khả năng nắm bắt ngữ nghĩa sâu và độ chính xác từ khóa kỹ thuật.
