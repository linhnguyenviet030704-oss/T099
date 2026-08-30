# Hướng Dẫn Deploy (Vercel, AWS EC2 / Render & Supabase Cloud) & CI/CD

Tài liệu này hướng dẫn chi tiết quy trình triển khai và lý do lựa chọn hạ tầng cho hệ thống **NextJob Recruitment Platform**:
- **Database, Auth & Storage (Supabase Cloud)**: PostgreSQL 15+ tích hợp `pgvector` HNSW, Supabase Auth (JWT RS256) và Supabase Storage (Signed URLs). Tự động push migrations qua GitHub Actions.
- **Frontend (React 19 + Vite)**: Triển khai trên **Vercel** (nhanh, nhẹ, dễ dùng, Global Edge CDN, auto-build).
- **Backend (FastAPI & LangGraph)**: Triển khai trên **AWS EC2 (t4 family)** cho môi trường Production (đảm bảo đủ RAM 1GB - 2GB+, tránh lỗi OOM 500MB RAM và giới hạn traffic của Render; Render có thể dùng cho Quick PoC).

---

## 🎯 Lý Do Lựa Chọn Hạ Tầng Triển Khai

| Nền Tảng | Thành Phần | Lý Do Lựa Chọn |
|---|---|---|
| **Vercel** | Frontend (React 19 SPA) | Nhanh, nhẹ, dễ dùng, zero-config CI/CD với GitHub, tự động cấp SSL & preview link, Global Edge Network tối ưu độ trễ. |
| **AWS EC2 (t4)** | Backend API & AI Agents | Cung cấp tài nguyên RAM dồi dào (1-2GB+), CPU Burstable, băng thông mạng cao. Tránh tình trạng **OOM crash (500MB RAM limit)** và **Cold start / Traffic throttle** của Render khi chạy LangGraph & Ingest PDF/DOCX. |
| **Supabase Cloud** | Database, Auth & Storage | Dễ tích hợp trực tiếp vào Agent & Backend (qua `service_role` và Postgres pool), hỗ trợ native `pgvector` HNSW index, File Storage an toàn với Signed URLs, tích hợp sẵn Auth & RLS. |

---

## 1. Cấu Hình Supabase Cloud & CI/CD Migrations

### 1.1 Khởi Tạo Dự Án Trực Tuyến
1. Truy cập [database.new](https://database.new) để tạo dự án Supabase Cloud mới.
2. Lưu lại các thông tin từ **Project Settings -> API** và **Database**:
   - **Project Reference ID** (`SUPABASE_PROJECT_ID` - Ví dụ: `xyzprojectid`)
   - **Database Password** (`SUPABASE_DB_PASSWORD` - Mật khẩu DB bạn đặt khi tạo project)
   - **Project URL** (`SUPABASE_URL`)
   - **anon / public key** (`SUPABASE_ANON_KEY`)
   - **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`)
   - **JWT Secret** (trong phần **Project Settings -> API -> JWT Settings**)

### 1.2 Tạo Supabase Access Token Cho CI/CD
1. Truy cập [Supabase Account Tokens](https://supabase.com/dashboard/account/tokens).
2. Click **Generate New Token**.
3. Đặt tên (ví dụ `github-actions-token`) và copy mã token (`SUPABASE_ACCESS_TOKEN`).

### 1.3 Cấu Hình GitHub Secrets Cho Supabase CI/CD
Vào GitHub Repository -> **Settings** -> **Secrets and variables** -> **Actions** -> Thêm 3 secret:
- **`SUPABASE_ACCESS_TOKEN`**: Token vừa tạo ở bước trên.
- **`SUPABASE_PROJECT_ID`**: Reference ID dự án Supabase Cloud.
- **`SUPABASE_DB_PASSWORD`**: Mật khẩu database Supabase Cloud.

> **Cơ chế hoạt động**: Mỗi khi bạn tạo file SQL mới trong `supabase/migrations/` và merge vào nhánh `main`, GitHub Action sẽ tự động gọi `supabase db push` để nâng cấp Database Schema trên Supabase Cloud mà không cần thao tác thủ công.

---

## 2. Triển Khai Backend Trên Render

### Sử dụng Render Blueprint (`render.yaml`)

1. Đăng nhập vào [Render Dashboard](https://dashboard.render.com/).
2. Chọn **Blueprints** -> Click **New Blueprint Instance**.
3. Kết nối repository GitHub của bạn.
4. Render sẽ tự động phát hiện file [`render.yaml`](file:///c:/Users/Admin/AI%20IA/team-Matikanefukukitaru/render.yaml).
5. Cấu hình các biến môi trường (Environment Variables) trong phần Environment:

| Biến Môi Trường | Giá Trị Ví Dụ / Mô Tả |
| :--- | :--- |
| `APP_ENV` | `production` |
| `LOG_LEVEL` | `INFO` |
| `CORS_ORIGINS` | `https://your-frontend.vercel.app` (URL Frontend Vercel) |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Key `service_role` từ Supabase Cloud |
| `SUPABASE_ANON_KEY` | Key `anon` từ Supabase Cloud |
| `SUPABASE_JWT_SECRET` | Secret JWT từ Supabase Cloud Settings |
| `QWEN_API_KEY` | DashScope / Qwen API Key cho tính năng AI Matching |

---

## 3. Triển Khai Frontend Trên Vercel

1. Đăng nhập vào [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New...** -> **Project** -> Import Repository GitHub.
3. **Framework Preset**: Chọn **Vite**.
4. **Root Directory**: Để trống (hoặc `frontend/`).
5. Thêm các **Environment Variables**:
   - `VITE_API_BASE_URL`: `https://recruitment-portal-backend.onrender.com`
   - `VITE_SUPABASE_URL`: `https://xxxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: Key `anon` từ Supabase Cloud

---

## 4. Tổng Hợp Tất Cả GitHub Secrets Cho CI/CD Pipeline (ECR + EC2)

Dưới đây là danh sách toàn bộ GitHub Secrets bạn có thể cấu hình trong GitHub Repository (**Settings -> Secrets and variables -> Actions**):

### Nhóm AWS ECR & EC2 (Backend Deploy)
| GitHub Secret Name | Bắt buộc | Mục Đích |
| :--- | :--- | :--- |
| `AWS_ACCESS_KEY_ID` | **Có (ECR)** | AWS Access Key ID của tài khoản / IAM User |
| `AWS_SECRET_ACCESS_KEY` | **Có (ECR)** | AWS Secret Access Key tương ứng |
| `AWS_REGION` | Tùy chọn | AWS Region chứa ECR & EC2 (mặc định: `ap-southeast-1` hoặc `us-east-1`) |
| `ECR_REPOSITORY` | **Có (ECR)** | Tên repository trên Amazon ECR (ví dụ: `recruitment-backend`) |
| `EC2_HOST` | **Có (EC2)** | Địa chỉ IP Public hoặc DNS của máy chủ AWS EC2 (ví dụ: `54.254.xxx.xxx`) |
| `EC2_USER` | Tùy chọn | Tên người dùng SSH (mặc định: `ubuntu` hoặc `ec2-user`) |
| `EC2_SSH_KEY` | **Có (EC2)** | Toàn bộ nội dung private key file `.pem` (kèm header `-----BEGIN RSA PRIVATE KEY-----`) |

### Nhóm Supabase & Vercel
| GitHub Secret Name | Bắt buộc | Mục Đích |
| :--- | :--- | :--- |
| `SUPABASE_ACCESS_TOKEN` | Tùy chọn | Tự động push SQL migrations lên Supabase Cloud |
| `SUPABASE_PROJECT_ID` | Tùy chọn | Project Reference ID trên Supabase Cloud |
| `SUPABASE_DB_PASSWORD` | Tùy chọn | Mật khẩu database trên Supabase Cloud |
| `VERCEL_TOKEN` | Tùy chọn | Deploy Frontend tự động lên Vercel Production |
| `VERCEL_ORG_ID` | Tùy chọn | Vercel Organization ID |
| `VERCEL_PROJECT_ID` | Tùy chọn | Vercel Project ID |


