# Team Matikanefukukitaru — Recruitment Portal

> Ứng viên và nhà tuyển dụng thiếu matching thông minh + CV lặp lại → nền tảng tuyển dụng có AI matching và tái sử dụng hồ sơ.

## Vấn đề (Problem)

- Ai đang gặp vấn đề?
> Vấn đề 1: Ứng viên đi xin việc không biết thị trường việc làm hiện đang như thế nào, nhà tuyển dụng muốn tuyển ứng viên nhưng không biết thị trường nhân sự đang như thế nào.
> Vấn đề 2: Ứng viên mỗi khi tạo CV cần điền thông tin giống nhau, lặp lại.
- Vấn đề tốn bao nhiêu thời gian/tiền?
> Đối với ứng viên: phải đi tìm hiểu, hỏi chi tiết hoặc xem các thông tin rải rác của các công ty trên thị trường thông qua các kênh như TopCV, các web giới thiệu việc làm, các mạng xã hội. Đối với nhà tuyển dụng: sử dụng các nền tảng trên và chỉ thu thập được các CV được submit.
- Tại sao các giải pháp hiện tại chưa đủ?
> Hiện tại các trang như TopCV chưa có tính năng gợi ý việc làm phù hợp theo khả năng ứng viên mà chỉ đơn thuần là "việc làm tương tự" những vị trí đã submit CV.

## Giải pháp (Solution)

Sản phẩm giải quyết vấn đề như thế nào bằng AI:
- Feature 1: agent giúp gợi ý việc làm phù hợp cho ứng viên dựa trên khả năng, kinh nghiệm của ứng viên, kết hợp thuật toán matching.
- Feature 2: agent gợi ý ứng viên phù hợp với vị trí cho nhà tuyển dụng, dựa trên yêu cầu công việc, kết hợp thuật toán matching.
- Feature 3: Lưu trữ thông tin ứng viên như "feature" và cho phép tái sử dụng để tạo CV mới nhanh/đơn giản, giúp CV match yêu cầu công việc tốt hơn.

## Target User

- Primary: người tìm việc
- Secondary: nhà tuyển dụng

## Tech Stack

| Layer | Technology |
|-------|-----------|
| AI / matching | LangGraph + Qwen Cloud (DashScope) |
| Backend | FastAPI + Python 3.11+ |
| Frontend | React + Vite + TypeScript |
| Database / Auth / Storage | Supabase local (PostgreSQL) |

## Cấu trúc repo

```text
.
├── frontend/          # React (Vite), UI chạy cổng 3000
├── backend/app/       # FastAPI (api → services → repositories)
├── supabase/          # config, migrations, seed.sql
├── tests/             # pytest (unit / api / agent)
├── scripts/           # seed CV, tiện ích local
├── dev.ps1            # chạy Supabase + API + frontend (Windows)
└── requirements.txt   # Python deps (chạy từ root)
```

Luồng request mặc định:

```text
Frontend → FastAPI /api/v1 → Service → Repository → Supabase
```

Auth: Frontend đăng nhập Supabase Auth → gửi `Authorization: Bearer <access_token>` → FastAPI verify JWT.

Backend đọc env từ `.env` ở **root** hoặc `backend/.env`. Docker Compose (nếu dùng) chỉ đọc `.env` ở root.

---

## Yêu cầu môi trường

- Python **3.11+**
- Node.js **18+** và npm
- Docker Desktop (Supabase local chạy trên Docker)
- [Supabase CLI](https://supabase.com/docs/guides/cli) — dùng `npx supabase` cũng được, không cần cài global

---

## Cài đặt lần đầu

Làm từ **thư mục root** của repo.

### 1. Python backend

Windows (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
pip install -r requirements.txt
copy backend\.env.example .env
```

macOS / Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
pip install -r requirements.txt
cp backend/.env.example .env
```

### 2. Frontend

```powershell
cd frontend
copy .env.example .env
npm install
cd ..
```

macOS / Linux: `cp .env.example .env` rồi `npm install`.

### 3. Supabase local

Cần Docker Desktop đang chạy.

```powershell
npx supabase start
npx supabase db reset
npx supabase status
```

`db reset` chạy migration trong `supabase/migrations/` và seed `supabase/seed.sql`.

Từ `npx supabase status`, điền vào **`.env` (root)**:

| Env var | Lấy từ |
|---------|--------|
| `SUPABASE_URL` | API URL (`http://127.0.0.1:54321`) |
| `SUPABASE_ANON_KEY` | `anon` / `Publishable` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` / `Secret` key |
| `SUPABASE_JWT_SECRET` | JWT secret — local mặc định đã có trong `backend/.env.example` |

Cùng `SUPABASE_URL` và `SUPABASE_ANON_KEY` điền vào `frontend/.env` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). `VITE_API_BASE_URL` giữ `http://localhost:8000`.

**Không commit** file `.env` / secret thật.

### 4. LLM (matching / ingest CV)

Đặt `QWEN_API_KEY` trong `.env` (root). Không có key thì UI, auth và CRUD vẫn chạy; gợi ý matching và ingest embedding sẽ không gọi được Qwen.

`OPENAI_API_KEY` là leftover, không cần cho luồng hiện tại.

---

## Chạy local

Windows — một lệnh (cần đã có `.venv` và `frontend/node_modules`):

```powershell
.\dev.ps1
```

Hoặc chạy từng phần:

```powershell
npx supabase start
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

Terminal khác:

```powershell
cd frontend
npm run dev
```

| Dịch vụ | URL |
|---------|-----|
| UI | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| Health | http://localhost:8000/health |
| Supabase Studio | http://127.0.0.1:54323 |

Tài khoản seed (mật khẩu `password123`):

| Email | Role |
|-------|------|
| `candidate@example.com` | candidate |
| `recruiter@example.com` | recruiter |
| `admin@example.com` | admin |

SQL seed tạo row CV nhưng **chưa** upload file PDF lên Storage. Để có file CV mock (và ingest embedding nếu đã có `QWEN_API_KEY`):

```powershell
.\.venv\Scripts\python.exe scripts\seed_mock_cvs.py
```

API chính (`/api/v1`, Bearer JWT trừ health):

| Method | Path |
|--------|------|
| `GET` | `/health` và `/api/v1/health` (không cần auth) |
| `GET` / `PATCH` | `/api/v1/profiles/me` |
| `POST` | `/api/v1/chat` (rate limited) |
| `POST` | `/api/v1/resumes/{resume_id}/ingest` |
| `PATCH` | `/api/v1/admin/profiles/{id}` (admin) |
| `POST` | `/api/v1/admin/recruiter-forms/{id}/review` (admin) |

---

## Tests

Từ root, với `.venv` đã kích hoạt (hoặc gọi python trong `.venv`):

```powershell
.\.venv\Scripts\python.exe -m pytest tests -v
```

Lint Python:

```powershell
.\.venv\Scripts\python.exe -m ruff check backend/ agent/ tests/
```

Typecheck frontend:

```powershell
cd frontend
npm run lint
```

---

## Deliverables Checklist

- [x] Source code
- [x] README.md
- [x] Architecture Diagram (`docs/architecture_diagram.md`)
- [ ] AI Logs (auto-collected)
- [ ] Video Demo
- [ ] Pitch Deck (`presentation/`)
- [x] Weekly Journal (`JOURNAL.md`)
- [x] Worklog (`WORKLOG.md`)
- [ ] Evaluation Evidence (`eval/results/`)

## Team

| Member | Role | Student ID |
|--------|------|-----------|
| Nguyễn Việt Linh | Product owner / Product manager | 2A202601211 |
| Nguyễn Văn Dương | Fullstack developer | 2A202601400 |
| Trần Duy Khánh | AI engineer | 2A202601696 |
| Ngô Trọng Bảo | Fullstack developer | 2A202601024 |
