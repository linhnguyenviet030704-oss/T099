# Báo Cáo An Toàn & Bảo Mật Hệ Thống (Enterprise Security Report)
### NextJob — AI-Powered Two-Way Recruitment Platform
### Đồ án Chuyên ngành P-099 | Team Matikanefukukitaru

---

## 🛡️ 1. Tổng Quan Kiến Trúc Bảo Mật (Defense-in-Depth)

Hệ thống Tuyển dụng Thông minh **NextJob** tuân thủ nghiêm ngặt mô hình **Phòng vệ theo chiều sâu (Defense-in-Depth)** và nguyên tắc **Đặc quyền tối thiểu (Least Privilege)** nhằm đảm bảo an toàn tuyệt đối cho dữ liệu người dùng, ngăn chặn rò rỉ dữ liệu cá nhân nhạy cảm (PII) và triệt tiêu các vector tấn công phổ biến trên môi trường đám mây.

```
                    ┌────────────────────────────────────────────────────────┐
                    │ 1. EDGE / NETWORK LAYER                                │
                    │ • HTTPS / TLS Termination (Vercel Global Edge & Nginx) │
                    │ • Strict CORS Whitelisting (No Wildcard in Prod)       │
                    │ • Security Headers (CSP, X-Frame-Options, HSTS)        │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                    ┌───────────────────────────▼────────────────────────────┐
                    │ 2. APPLICATION / GATEWAY LAYER                         │
                    │ • Supabase JWT Multi-Algorithm Verification (HS256/RS) │
                    │ • Fail-Fast Configuration Integrity Validation         │
                    │ • Token Bucket Rate Limiting (20 req/60s)              │
                    │ • Role-Based Access Control (Candidate/Recruiter/Admin)│
                    └───────────────────────────┬────────────────────────────┘
                                                │
                    ┌───────────────────────────▼────────────────────────────┐
                    │ 3. AI ORCHESTRATION & GUARDRAILS LAYER                 │
                    │ • Extract-First PII Scrubbing (Regex + Heuristic)      │
                    │ • Candidate Anonymization (CAND_001 in LLM Prompts)    │
                    │ • Anti-Hallucination Grounded Titles Verification      │
                    │ • Deterministic Fallback Mechanisms                    │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                    ┌───────────────────────────▼────────────────────────────┐
                    │ 4. PERSISTENCE & DATA ACCESS LAYER                     │
                    │ • PostgreSQL Row Level Security (RLS) Active Policies  │
                    │ • In-Memory Application IDOR Prevention Verification   │
                    │ • Internal Tables Isolation (No Public Data API)       │
                    │ • Supabase Signed URLs for File Storage Access         │
                    └────────────────────────────────────────────────────────┘
```

---

## 🔒 2. Xác Thực & Kiểm Soát Truy Cập (Authentication & Authorization)

### 2.1. Xác thực Đa thuật toán (JWT Verification)
- **Cơ chế**: Mọi truy vấn vào backend FastAPI (ngoại trừ endpoint `/health`) bắt buộc mang theo token tại header `Authorization: Bearer <token>`.
- **Môi trường Phát triển (Local)**: Giải mã chữ ký token bằng thuật toán **HS256** với `SUPABASE_JWT_SECRET`.
- **Môi trường Sản xuất (Cloud Production)**: Tự động nạp public keys từ endpoint JWKS của Supabase Cloud (`/auth/v1/.well-known/jwks.json`) để xác thực chữ ký bất đối xứng chuẩn **RS256 / ES256**.
- **Cơ chế Khởi động An toàn (Fail-Fast Verification)**: Tại `backend/app/config/env.py`, server sẽ **từ chối khởi động** nếu phát hiện:
  - Môi trường `production` nhưng `SUPABASE_JWT_SECRET` mang giá trị mặc định của development.
  - Cấu hình `CORS_ORIGINS` chứa ký tự đại diện (`*`).
  - Thiếu `SUPABASE_SERVICE_ROLE_KEY` hoặc các API key cần thiết.

### 2.2. Kiểm soát Quyền hạn & Chống Lỗ hổng IDOR (Insecure Direct Object References)
- Backend vận hành với `service_role` key để phục vụ các tác vụ quản trị và ghi bảng nội bộ `embedded_resumes`. Do `service_role` bypass RLS của Postgres, **Service Layer của Backend đóng vai trò là bức tường kiểm soát phân quyền bắt buộc**:
  - Endpoint Matching/Chat của Recruiter kiểm tra quyền sở hữu `job_id` (`recruiter_id == current_user.id`) trước khi thực hiện truy vấn.
  - Endpoint Ingest CV xác minh quyền sở hữu `resume_id` (`user_id == current_user.id`).
  - Các thao tác Admin (`/admin/*`) yêu cầu dependency `get_current_admin` kiểm tra role `admin` trực tiếp từ database.

---

## 🥷 3. Bảo Vệ Dữ Liệu Cá Nhân (PII Redaction & Anonymization)

Hồ sơ xin việc chứa nhiều thông tin định danh cá nhân nhạy cảm. Hệ thống thiết lập cơ chế 2 tầng bảo vệ:

### 3.1. Tầng Ingest (Data Ingestion Boundary)
Hàm `redact_pii` trong `backend/app/services/matching/parse.py` thực hiện:
- **Header Scoping**: Bỏ qua toàn bộ nội dung trong section `## Contact`, `## Thông tin liên hệ`.
- **Name Heuristic Redaction**: Nhận diện và loại bỏ dòng tên ứng viên ở đầu trang.
- **Regex Sanitization**: Loại bỏ triệt để Email, Số điện thoại (chuẩn quốc tế và Việt Nam `+84` / `09x...`), Ngày sinh (DOB), Số CCCD/CMND và các URL mạng xã hội cá nhân.
- **Kết quả Kiểm định**: Đạt tỷ lệ sạch PII **100% trên toàn bộ 77 CVs** của tập Golden Dataset.

### 3.2. Tầng Prompting (LLM Anonymization)
- Tại `backend/app/services/matching/anonymize.py`, trước khi gửi danh sách ứng viên vào LLM để sinh lời giải thích độ phù hợp (`explain_matches`), toàn bộ `application_id` thật được mã hóa thành các mã ẩn danh: `CAND_001`, `CAND_002`...
- Sau khi LLM trả về kết quả JSON, hệ thống tự động ánh xạ ngược lại ID thật để trả về cho người dùng.
- **Lợi ích**: LLM Cloud bên thứ ba hoàn toàn không biết danh tính thật của ứng viên, loại bỏ hoàn toàn nguy cơ lộ dữ liệu qua nhật ký prompt và triệt tiêu thiên kiến tuyển dụng.

---

## ⏱️ 4. Chống Lạm Dụng & Kiểm Soát Tần Suất (Rate Limiting)

- **Cơ chế Token Bucket**: Triển khai `InMemoryRateLimiter` tại `backend/app/guardrails/rate_limit.py`.
- **Ngưỡng an toàn**:
  - Giới hạn tối đa **20 requests/phút** cho các endpoint tiêu tốn tài nguyên tính toán và chi phí LLM (`/chat`, `/resumes/{id}/ingest`).
  - Phân tách bucket độc lập theo từng `user_id` và `client_ip`.
- **Phản hồi**: Khi vượt ngưỡng, hệ thống trả về mã lỗi HTTP 429 `Too Many Requests` kèm header `Retry-After`.

---

## 🗄️ 5. Bảo Mật Cơ Sở Dữ Liệu & Lưu Trữ (Supabase RLS & Storage)

### 5.1. Row Level Security (RLS)
- 100% các bảng dữ liệu công khai trên PostgreSQL (`profiles`, `resumes`, `job_posts`, `job_submits`, `companies`, `match_resume`) đều được bật RLS.
- Các hàm `SECURITY DEFINER` được cô lập trong schema nội bộ `app_private`.
- Trigger tự động ngăn chặn người dùng tự nâng quyền (self-promotion) thành `admin` hoặc tự ý duyệt trạng thái doanh nghiệp.

### 5.2. Cô lập Bảng Dữ liệu Nội bộ (Internal Tables Isolation)
- Bảng `public.embedded_resumes` (chứa vector embedding 1536 chiều và nội dung CV đã parse) và `public.embedded_jobs` **không expose qua Supabase Data API**.
- Chỉ duy nhất Backend thông qua `service_role` client mới có quyền truy xuất.

### 5.3. Supabase Storage Security
- Bucket `resumes` được cấu hình phân quyền nghiêm ngặt theo đường dẫn thư mục: `resumes/{user_id}/{resume_id}.pdf`.
- Người dùng chỉ có quyền đọc/ghi file trong thư mục mang chính `user_id` của mình.
- Mọi liên kết xem trước tài liệu được phát hành qua **Signed URL** có thời hạn ngắn (15 - 60 phút).

---

## 🚀 6. Bảo Mật Hạ Tầng & Quy Trình CI/CD (DevOps Security)

1. **Docker Container Hardening**:
   - `Dockerfile` sử dụng image cơ sở `python:3.11-slim` gọn nhẹ.
   - Ứng dụng chạy dưới người dùng không có đặc quyền root (`appuser:appuser`).
   - Tích hợp `HEALTHCHECK` định kỳ giám sát trạng thái container.
2. **Quản lý Secrets trên GitHub Actions**:
   - Toàn bộ secret triển khai (`AWS_SECRET_ACCESS_KEY`, `SUPABASE_ACCESS_TOKEN`, `EC2_SSH_KEY`) được lưu trữ tại GitHub Secrets mã hóa chuẩn ngành.
   - `.gitignore` loại trừ triệt để `.env`, `*.pem`, `*.key` khỏi source control.
3. **Automated Quality Gate**:
   - Pipeline CI tự động chạy `ruff check` và `pytest` (803 tests) trên mọi Pull Request trước khi cho phép merge vào nhánh `main`.
