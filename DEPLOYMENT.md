# Hướng Dẫn Deploy (Vercel, Render & Supabase Cloud) & Cấu Hình CI/CD

Tài liệu này hướng dẫn chi tiết quy trình triển khai hệ thống **Recruitment Portal**:
- **Database & Auth (Supabase Cloud)**: Tự động push migrations qua GitHub Actions.
- **Frontend (React + Vite)**: Triển khai trên **Vercel** qua GitHub Actions.
- **Backend (FastAPI)**: Triển khai trên **Render** qua GitHub Actions.

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

## 4. Tổng Hợp Tất Cả GitHub Secrets Cho CI/CD Pipeline

Dưới đây là danh sách toàn bộ GitHub Secrets cần thiết trong repository của bạn:

| GitHub Secret Name | Mục Đích |
| :--- | :--- |
| `SUPABASE_ACCESS_TOKEN` | Tự động push SQL migrations lên Supabase Cloud |
| `SUPABASE_PROJECT_ID` | Project Reference ID trên Supabase Cloud |
| `SUPABASE_DB_PASSWORD` | Mật khẩu database trên Supabase Cloud |
| `RENDER_DEPLOY_HOOK_URL` | Trigger Render tự động rebuild & deploy Backend |
| `VERCEL_TOKEN` | Deploy Frontend tự động lên Vercel Production |
| `VERCEL_ORG_ID` | Vercel Organization ID |
| `VERCEL_PROJECT_ID` | Vercel Project ID |
