# Hướng dẫn Seed Data lên Production & Revert (Rollback) Ngay Lập Tức

Tài liệu này hướng dẫn cách đưa dữ liệu mẫu (mock data/local data) lên môi trường **Production/Staging** một cách an toàn và cách **khôi phục (revert/rollback)** ngay lập tức bất kỳ lúc nào mà không ảnh hưởng tới dữ liệu thật của người dùng.

---

## ⚠️ CẢNH BÁO QUAN TRỌNG VỀ AN TOÀN DỮ LIỆU

> [!CAUTION]
> **TUYỆT ĐỐI KHÔNG NGHĨ ĐẾN LỆNH `npx supabase db reset` TRÊN PRODUCTION!**
> Lệnh `db reset` sẽ **DROP (xóa sạch toàn bộ)** database và bảng dữ liệu hiện tại trên Supabase. Nếu chạy trên Production, toàn bộ dữ liệu thật sẽ bị mất vĩnh viễn.

> [!IMPORTANT]
> **Nguyên lý Revert an toàn:**
> Quá trình seed dữ liệu mẫu sẽ tạo một tệp **Manifest Tracking** (`scripts/seed_manifest.json`) lưu giữ danh sách tất cả UUID (Users, Profiles, Companies, Jobs, Resumes, Storage files) được sinh ra. Khi chạy script revert, chỉ có những dữ liệu có tên trong Manifest này mới bị xóa, đảm bảo không va chạm hay xóa nhầm dữ liệu thật.

---

## 🛠️ 1. Các bước Seed Data lên Production

### Bước 1: Chuẩn bị thông tin cấu hình Production
Cần 2 thông tin từ **Supabase Dashboard** (Project Settings -> API):
1. **`PROD_SUPABASE_URL`**: `https://<project-ref>.supabase.co`
2. **`PROD_SUPABASE_SERVICE_ROLE_KEY`**: Key secret `service_role` (có quyền admin ghi dữ liệu bypass RLS).

### Bước 2: Thao tác Seed Dữ Liệu

Từ thư mục root của dự án (kích hoạt virtual environment `.venv`):

```powershell
python scripts/seed_production.py --url "https://<your-project>.supabase.co" --key "<your-service-role-key>"
```

*Hoặc set biến môi trường trước khi chạy:*
```powershell
$env:SUPABASE_URL="https://<your-project>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<your-service-role-key>"
python scripts/seed_production.py
```

### Kết quả thu được:
- Dữ liệu mock (tài khoản demo, công ty, tin tuyển dụng, CV mẫu PDF trong Storage, vector embeddings) đã được đẩy lên Production.
- Tệp manifest **`scripts/seed_manifest.json`** được tạo tự động chứa toàn bộ danh sách ID đã seed.

---

## ↺ 2. Các bước Revert (Rollback) Seed Data Ngay Lập Tức

Khi bạn hoàn tất kiểm thử hoặc muốn dọn dẹp dữ liệu mẫu trên Production ngay lập tức:

### Thao tác Revert:

```powershell
python scripts/revert_production_seed.py --url "https://<your-project>.supabase.co" --key "<your-service-role-key>"
```

### Quá trình Revert hoạt động như thế nào?
Script sẽ đọc tệp `scripts/seed_manifest.json` và thực hiện xóa theo đúng thứ tự phụ thuộc dữ liệu:
1. Xóa file PDF trong Supabase Storage bucket (`resumes/`).
2. Xóa vector embeddings trong `embedded_resumes`.
3. Xóa hồ sơ ứng tuyển (`job_submits`).
4. Xóa CVs (`resumes`).
5. Xóa tin tuyển dụng (`job_posts`).
6. Xóa thành viên công ty (`company_members`).
7. Xóa công ty (`companies`).
8. Xóa hồ sơ cá nhân (`profiles`).
9. Xóa tài khoản đăng nhập (`auth.users` qua GoTrue Auth Admin API).
10. Đổi tên tệp manifest thành `seed_manifest_reverted_<timestamp>.json` để lưu vết audit log.

---

## 🧪 3. Kiểm tra Thử nghiệm Local (Dry Run)

Bạn có thể chạy thử quy trình Seed & Revert ngay trên Supabase Local để kiểm tra độ tin cậy:

```powershell
# 1. Seed dữ liệu
python scripts/seed_production.py

# 2. Kiểm tra dữ liệu đã tạo
python scripts/inspect_supabase.py

# 3. Revert ngay lập tức
python scripts/revert_production_seed.py

# 4. Kiểm tra lại dữ liệu đã sạch 100%
python scripts/inspect_supabase.py
```
