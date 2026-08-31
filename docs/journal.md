# Nhật Ký Kỹ Thuật & Bài Học Kiến Trúc (Engineering Journal)

> **Mục đích**: Ghi lại các quyết định thiết kế cốt lõi, bài học thực tế rút ra từ quá trình xây dựng, tối ưu hóa và đánh giá hệ thống Multi-Agent Tuyển dụng Thông minh (**NextJob**).

---

## 🎯 Quyết định #1: Thiết kế Ingest Agent theo Kiến trúc Extract-First (`extract` trước `summarize`) để Bảo toàn 100% Kỹ năng

### 1. Bối cảnh & Vấn đề phát sinh
Trong phiên bản kiến trúc ban đầu, Ingest Agent được xây dựng tuần tự theo luồng: `parse -> clean -> summarize -> extract -> embed`. 
Khi thực hiện bước `summarize`, LLM được giao nhiệm vụ viết lại CV thành một bản tóm tắt súc tích để làm gọn ngữ cảnh. Tuy nhiên, trong quá trình tóm tắt, LLM thường có xu hướng bỏ qua các kỹ năng ngách, công cụ phụ trợ hoặc thuật ngữ kỹ thuật chi tiết (ví dụ: các thư viện `FastAPI`, `Pandas`, `Docker Compose`, `GitLab CI`). Khi node `extract` chạy trên văn bản tóm tắt này, các kỹ năng trên bị thất thoát vĩnh viễn (đo lường thực tế mất trung bình 20 kỹ năng trên 41 CV trong phiên bản v1).

### 2. Giải pháp Kỹ thuật
Nhóm quyết định tái cấu trúc toàn bộ Ingest Graph (`backend/app/agents/ingest/graph.py`) sang luồng **Extract-First**:
`parse -> clean -> extract -> summarize -> embed`.

- **Node `extract`**: Quét trực tiếp trên toàn bộ văn bản Markdown gốc đã được làm sạch (`clean_markdown`) bằng bộ từ điển chuẩn hóa 186 kỹ năng kết hợp thuật toán so khớp mờ (`rapidfuzz`).
- **Node `summarize`**: Tiếp nhận tập kỹ năng đã trích xuất, chỉ thực hiện đối chiếu xem kỹ năng nào tiếp tục xuất hiện trong bản tóm tắt để gắn nhãn `verified_skills` và `inferred_skills`, **tuyệt đối không ghi đè hay làm mất tập `metadata.skills` ban đầu**.

### 3. Kết quả & Bài học
- Số lượng kỹ năng bị mất do summarization giảm từ **20 xuống đúng 0** (đạt $100\%$ Skill Preservation trên toàn bộ 77 CV kiểm thử).
- **Bài học**: Không bao giờ trích xuất dữ liệu có cấu trúc (Structured Metadata) từ một bản tóm tắt mất mát thông tin (Lossy Summary). Hãy trích xuất dữ liệu xác định (Deterministic Extraction) từ nguồn gốc trước khi cho LLM tóm tắt.

---

## 🔒 Quyết định #2: Lớp Bảo vệ Dữ liệu Cá nhân Đa tầng (PII Protection & Anonymization)

### 1. Bối cảnh & Vấn đề phát sinh
Hồ sơ ứng viên chứa các thông tin định danh cá nhân nhạy cảm: Họ tên, Số điện thoại cá nhân, Địa chỉ nhà, Email, Ngày sinh (DOB), Số CCCD/Passport và đường link mạng xã hội cá nhân. Việc đưa trực tiếp các thông tin này vào Vector Database hoặc gửi lên các dịch vụ LLM Cloud bên thứ ba tiềm ẩn rủi ro vi phạm quy định bảo vệ dữ liệu (GDPR, Nghị định 13/2023/NĐ-CP) và có thể gây thiên kiến (bias) trong quá trình tuyển dụng.

### 2. Giải pháp Kỹ thuật
Thiết kế cơ chế bảo vệ PII theo chiều sâu ở cả hai tầng:

1. **Tầng Ingest (`backend/app/services/matching/parse.py` - `redact_pii`)**:
   - **Header Scoping**: Bỏ qua toàn bộ nội dung trong section `## Contact`, `## Personal Information`. Thiết lập giới hạn an toàn 15 dòng (`_CONTACT_SKIP_LINE_CAP = 15`) để tránh lỗi nuốt toàn bộ CV nếu heading tiếp theo bị lỗi format.
   - **Name Heuristic Redaction**: Nhận diện dòng tên ứng viên ở đầu trang và dòng chữ rớt từ (name continuation).
   - **Regex Filtering**: Loại bỏ triệt để Email, SĐT (định dạng Việt Nam `+84` / `09x...`), Ngày sinh, CCCD, và URL không scheme (`twitter.com/abc`, `facebook.com/xyz`).
2. **Tầng Prompting (`backend/app/services/matching/anonymize.py`)**:
   - Trước khi đưa danh sách ứng viên vào LLM để giải thích độ phù hợp (`explain_matches`), toàn bộ `application_id` thật được chuyển đổi thành mã ẩn danh: `CAND_001`, `CAND_002`...
   - Sau khi LLM trả về JSON giải thích, hệ thống tự động ánh xạ ngược lại `application_id` gốc để trả về cho người dùng.

### 3. Kết quả & Bài học
- Đạt tỷ lệ sạch PII tuyệt đối qua Regex scan (**0/77 CV vi phạm**).
- LLM hoàn toàn không biết danh tính thật của ứng viên, ngăn chặn triệt để rủi ro rò rỉ dữ liệu qua prompt logs.
- **Bài học**: Bảo vệ quyền riêng tư phải được thực thi tại ranh giới dữ liệu (Data Ingestion Boundary) trước khi vector hóa, kết hợp ẩn danh hóa định danh tại tầng giao tiếp LLM.

---

## ⚖️ Quyết định #3: Áp dụng Reciprocal Rank Fusion (RRF) Kết hợp Semantic Search và Skill Taxonomy Coverage

### 1. Bối cảnh & Vấn đề phát sinh
- **Pure Semantic Search (Vector Embedding)**: Nắm bắt tốt ngữ cảnh tổng quát nhưng dễ gặp hiện tượng "ảo giác tương đồng" — ví dụ: một CV văn phong mượt mà nói về lập trình web nhưng thiếu hẳn kỹ năng cốt lõi `PostgreSQL` vẫn có thể đạt điểm cosine similarity cao.
- **Exact Keyword Matching (BM25 / Boolean)**: Bắt chính xác từ khóa nhưng lại quá cứng nhắc, bỏ sót các từ đồng nghĩa (VD: `NodeJS` vs `Node.js`, `AWS` vs `Amazon Web Services`) hoặc không hiểu được mức độ liên quan giữa các công nghệ.

### 2. Giải pháp Kỹ thuật
Xây dựng thuật toán xếp hạng lai (Hybrid Ranking) thông qua **Reciprocal Rank Fusion (RRF)** tại `backend/app/services/matching/rrf.py`:

$$\text{RRF\_Score}(d) = \sum_{m \in M} \frac{w_m}{k + r_m(d)}$$

- $M$: Tập các bảng xếp hạng độc lập gồm **Dense Semantic Retrieval** (pgvector Cosine Distance với JD mở rộng) và **Sparse Retrieval / BM25**.
- $k = 60$: Hằng số làm mượt chuẩn công nghiệp (Smoothing Constant).
- **Skill Taxonomy Score**: Tính toán tỷ lệ bao phủ kỹ năng yêu cầu từ Đồ thị kỹ năng (`skill_graph.json`) và độ lệch kỹ năng thiếu (`soft_delta`).
- **Must-have Constraints Gating**: Tự động phân tách các ứng viên đáp ứng đủ điều kiện bắt buộc lên nhóm ưu tiên trước khi xếp hạng chi tiết.

### 3. Kết quả & Bài học
- Điểm **NDCG@5 đạt 0.90**, **MRR đạt 0.95**, **Precision@5 đạt 86%** trên tập Golden Dataset.
- Kết quả xếp hạng vừa đảm bảo tính khái quát ngữ nghĩa, vừa bảo đảm ứng viên có đúng các kỹ năng kỹ thuật bắt buộc.
- **Bài học**: Không có mô hình tìm kiếm đơn lẻ nào là hoàn hảo. RRF là phương pháp hợp nhất không tham số (Non-parametric Fusion) cực kỳ mạnh mẽ để kết hợp ưu thế của cả Vector Search và Keyword Search.

---

## 📄 Quyết định #4: Chiến lược Parsing Phân tầng & Layout-Aware Fallback (PyMuPDF4LLM + PDFPlumber Column-Aware)

### 1. Bối cảnh & Vấn đề phát sinh
Khi chạy benchmark trên tập CV thực tế từ TopCV.vn (`evaluation/cv_hard/`), hệ thống gặp vấn đề nghiêm trọng: Các mẫu CV có layout 2 cột (sidebar chứa thông tin liên hệ/kỹ năng, main column chứa kinh nghiệm) và nhiều icon trang trí. Bộ parser PyMuPDF4LLM đọc theo thứ tự tuyến tính dẫn đến việc câu chữ hai cột bị trộn lẫn vào nhau, thậm chí lỗi nhận diện khiến văn bản parse được chỉ vỏn vẹn **710 ký tự** (dưới ngưỡng tối thiểu 600 ký tự).

### 2. Giải pháp Kỹ thuật
1. Ban đầu nhóm thử nghiệm tích hợp thư viện deep learning layout (`docling`), nhưng thời gian cài đặt quá lâu (>3 phút), kéo theo thư viện PyTorch cồng kềnh, không phù hợp cho môi trường backend gọn nhẹ.
2. Nhóm chuyển sang giải pháp phân tầng thực dụng (`backend/app/services/matching/parse.py`):
   - **Tầng 1 (Mặc định)**: Dùng `pymupdf4llm` tốc độ cao (<700ms) để parse văn bản layout chuẩn.
   - **Tầng 2 (Quality Gate)**: Kiểm tra độ dài `content_chars`. Nếu $< 600$ ký tự, tự động kích hoạt **Fallback `pdfplumber`**.
   - **Thuật toán Phân tách Cột theo Tọa độ**: Phân tích tọa độ ngang ($x_0, x_1$) của các từ trong trang, tìm khoảng trống (gutter) ở khoảng giữa $20\% - 80\%$ chiều rộng trang để chia thành Cột Trái và Cột Phải, sau đó đọc từng cột từ trên xuống dưới.
   - Hỗ trợ định dạng `.docx` chuẩn thông qua `python-docx` (đọc bảng và danh sách).

### 3. Kết quả & Bài học
- Sản lượng trích xuất trung bình trên bộ CV Hard tăng mạnh từ 710 lên **2595.20 ký tự/CV**.
- 100% CV thực tế đều vượt qua ngưỡng kiểm tra chất lượng không bị đánh cờ `low_content`.
- **Bài học**: Luôn thiết kế cơ chế Quality Gate kèm Fallback phân tầng cho bài toán xử lý tài liệu không có cấu trúc cố định.

---

## 🛡️ Quyết định #5: Kiến trúc Phòng vệ Chiều sâu & Quản lý Truy cập (Defense-in-Depth Security & Rate Limiting)

### 1. Bối cảnh & Vấn đề phát sinh
Hệ thống sử dụng FastAPI làm backend kết nối với Supabase qua `service_role` key (để có quyền ghi vào bảng nội bộ `embedded_resumes` và `embedded_jobs`). Tuy nhiên, quyền `service_role` sẽ bypass hoàn toàn cơ chế RLS của PostgreSQL. Nếu không có cơ chế bảo vệ nghiêm ngặt ở tầng ứng dụng, người dùng có thể khai thác lỗ hổng IDOR để truy cập hoặc thực hiện matching trên tin tuyển dụng của công ty khác. Đồng thời, việc gọi API LLM tốn kém có thể bị lạm dụng nếu không có rate limit.

### 2. Giải pháp Kỹ thuật
1. **Kiểm tra Quyền tại Tầng Truy xuất Dữ liệu (Data Access Layer)**:
   - Trong `backend/app/repositories/` và `services/`, mọi thao tác Matching hay Ingest đều bắt buộc xác minh `recruiter_id` có thực sự sở hữu `job_id` được yêu cầu hay không trước khi thực thi truy vấn.
2. **Khởi động An toàn (Fail-Fast Checks)**:
   - Trong `backend/app/config/env.py`, hệ thống tự động crash ngay khi khởi động nếu phát hiện môi trường `production` nhưng `SUPABASE_JWT_SECRET` mang giá trị mặc định hoặc `CORS_ORIGINS` cấu hình wildcard (`*`).
3. **Giới hạn Tần suất Gọi (Rate Limiter)**:
   - Triển khai `InMemoryRateLimiter` tại `backend/app/guardrails/rate_limit.py`, giới hạn 20 request/60s cho mỗi người dùng đối với các endpoint tốn tài nguyên (`/chat`, `/ingest`).

### 3. Kết quả & Bài học
- Loại bỏ hoàn toàn nguy cơ rò rỉ dữ liệu chéo giữa các nhà tuyển dụng.
- Bảo vệ ngân sách LLM và chống tấn công từ chối dịch vụ (DoS) cấp ứng dụng.
- **Bài học**: Khi sử dụng quyền quản trị (Admin/Service Role) ở backend, backend phải tự nhận trách nhiệm làm bức tường kiểm soát phân quyền (Authorization Wall).

---

## 📊 Quyết định #6: Đánh giá Chất lượng Agent bằng LLM-as-a-Judge & Grounded Faithfulness

### 1. Bối cảnh & Vấn đề phát sinh
Trong các hệ thống AI Agent phức tạp, Unit Test truyền thống chỉ kiểm tra được tính đúng đắn của code (code chạy không lỗi, đúng kiểu dữ liệu), nhưng không thể đo lường được chất lượng ngữ nghĩa: LLM có bịa đặt kinh nghiệm không? Tỷ lệ bắt đúng kỹ năng là bao nhiêu? Hệ thống hoạt động trên tiếng Việt có tốt bằng tiếng Anh không?

### 2. Giải pháp Kỹ thuật
Xây dựng hệ thống harness đánh giá tự động (`evaluation/ingest_eval_v2/` và `evaluation/golden/`):
1. **Faithfulness Scoring (RAGAS-style)**: LLM-Judge (`gpt-4o-mini`) phân tách bản tóm tắt thành từng tuyên bố (claims) độc lập, sau đó đối chiếu từng claim với văn bản gốc để tính tỷ lệ tuyên bố có căn cứ.
2. **Prompt Grounding & Anti-Hallucination**: Thiết lập hướng dẫn nghiêm ngặt trong `backend/app/prompts/system/summarize.txt` (cấm suy diễn ngoài văn bản). Áp dụng hàm `grounded_titles` kiểm tra chéo chức danh.
3. **Cross-Lingual Evaluation (36 Cặp EN-VI đối ứng 1-1)**: Đánh giá song song trên cùng một nội dung nhưng khác ngôn ngữ để đo độ lệch chất lượng.
4. **Content-Hash Caching**: Cache kết quả gọi LLM tại `evaluation/.cache/` theo mã hash nội dung, giúp chạy lại benchmark tức thì mà không tốn chi phí API trùng lặp.

### 3. Kết quả & Bài học
- Điểm Faithfulness đạt **1.00 tuyệt đối** trên 76/77 CV.
- Chứng minh hệ thống xử lý tiếng Việt có độ chính xác ($92\%$) và độ bao phủ ($65\%$) thậm chí vượt trội hơn tiếng Anh ($90\%$ và $59\%$).
- **Bài học**: Phải xây dựng hạ tầng Evaluation ngay từ giai đoạn đầu phát triển để mọi quyết định refactor kiến trúc đều có số liệu thực nghiệm định lượng rõ ràng làm căn cứ.

---

## 💡 Quyết định #7: Cơ chế Giải thích Kết quả (Explainability) với Fallback Tất định

### 1. Bối cảnh & Vấn đề phát sinh
Một trong những rào cản lớn nhất của AI trong tuyển dụng là "hộp đen" (Black Box) — nhà tuyển dụng không biết tại sao ứng viên A lại được xếp trên ứng viên B. Nếu gọi LLM $N$ lần cho $N$ ứng viên để sinh lời giải thích thì vừa tốn chi phí, vừa tăng độ trễ, và quan trọng nhất: LLM không có góc nhìn toàn cảnh về tương quan xếp hạng giữa các ứng viên trong cùng shortlist. Ngoài ra, nếu LLM gặp lỗi timeout hoặc hết quota, giao diện người dùng sẽ bị hiển thị `null` hoặc lỗi.

### 2. Giải pháp Kỹ thuật
Xây dựng Node `explain` tối ưu tại `backend/app/agents/matching/nodes/explain.py` và `services/matching/explain.py`:
1. **Single LLM Call for Entire Shortlist**: Đưa toàn bộ tóm tắt của top ứng viên (đã ẩn danh `CAND_001`, `CAND_002`...) vào **1 prompt duy nhất**. LLM hiểu được thứ tự điểm số và giải thích lý do vì sao ứng viên top 1 vượt trội hơn ứng viên top 2.
2. **Deterministic Fallback (`deterministic_reason`)**: Nếu LLM không phản hồi hoặc trả về JSON lỗi, hệ thống tự động kích hoạt bộ sinh lý giải tất định dựa trên bằng chứng kỹ thuật:
   - Liệt kê chính xác danh sách kỹ năng khớp (`matched_skills`).
   - Tỷ lệ phần trăm điểm phù hợp (`pct_score`).
   - Vị trí xếp hạng thứ hạng trong shortlist (ví dụ: *"Đạt điểm phù hợp (85%) nhờ đáp ứng các kỹ năng cốt lõi: Python, FastAPI, Docker, xếp thứ 1/5 trong shortlist"*).

### 3. Kết quả & Bài học
- Giảm số lượng gọi LLM từ $N$ cuộc gọi xuống còn **1 cuộc gọi duy nhất**, giảm 80% độ trễ sinh lời giải thích.
- Đảm bảo $100\%$ trường hợp nhà tuyển dụng và ứng viên luôn nhận được lời giải thích rõ ràng, minh bạch, không bao giờ bị đứt gãy trải nghiệm.
- **Bài học**: AI sinh nội dung (Generative AI) cần luôn đi kèm với phương án dự phòng tất định (Deterministic Fallback) để đảm bảo tính sẵn sàng cao (High Availability) cho hệ thống production.


# 1 số Journal khác:

## "Chạy được là được" không phải là 1 tiêu chí tốt.
- Đây là Linh, Linh vibe ra quả web trong 12 giây, chạy rất mượt... cho đến khi mở F12.
- Hãy luôn mở F12 và xem console ngay khi vừa bắt đầu. Có gì sai hãy sửa ngay, đừng bao giờ để 1 lỗi lặt vặt làm tốn thời gian của bạn sau này.


## AWS EC2 với ECR mới là chân ái
- Đây là Linh, Linh trước khi biết đến dịch vụ AWS thường thích dùng render/fly.io/ Railway.
- Linh đã thử học AWS và Linh thích ngay từ khi hiểu. Rất dễ dùng, dễ kiểm soát.
- Linh nhận ra mình quá nghèo để dùng AWS
- Linh quay về dùng render :))))))))

## Đồng đội là khái niệm khá mơ hồ
- Đây là Linh, Linh làm nhóm trưởng. Linh thấy mọi người không nhiệt tình với dự án, ai cũng làm kiểu hời hợt, miễn là để cho qua cho xong chuyện.
- Linh rất chán, nhưng Linh cũng kệ, vì Linh biết có nói cũng chẳng khác được gì nhiều, vì Linh từng ở vị trí của đồng đội hiện tại.
- Linh mong mọi người tìm lại được lửa đam mê, có thể không phải ở ngành này nhưng ít nhất hãy làm với 100% nỗ lực.
