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
| AI Agent | LangGraph + OpenAI |
| Backend | FastAPI + Python 3.11+ |
| Frontend | React + Vite + TypeScript |
| Database / Auth / Storage | Supabase (PostgreSQL) |
| DevOps | Docker + GitHub Actions |

## Cấu trúc repo

```text
project/
├── frontend/          # React (Vite)
├── backend/
│   └── app/           # FastAPI (api → services → repositories)
├── supabase/          # config, migrations, seed
├── agent/             # LangGraph agent
├── tests/             # unit / api / agent
└── docs/
```

Luồng request mặc định:

```text
Frontend → FastAPI /api/v1 → Service → Repository → Supabase
```

Auth: Frontend đăng nhập Supabase Auth → gửi `Authorization: Bearer <access_token>` → FastAPI verify JWT.

---

## Yêu cầu môi trường

- Python **3.11+** (khuyến nghị)
- Node.js **20+** và npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npx supabase` cũng được)
- Docker Desktop (để chạy Supabase local)
- Git

---

## Cài đặt & chạy local

### 1. Clone repo

```bash
git clone <URL_REPO_GITHUB>
cd team-Matikanefukukitaru
```

### 2. Python backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip
pip install -r requirements.txt
copy backend\.env.example .env
```

Trên macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
cp backend/.env.example .env
```

### 3. Supabase local

```powershell
npx supabase start
npx supabase status
npx supabase db reset
```

Từ `supabase status`, copy vào `.env` (root):

| Env var | Lấy từ |
|---------|--------|
| `SUPABASE_URL` | API URL |
| `SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `SUPABASE_JWT_SECRET` | JWT secret (local mặc định thường là giá trị trong `backend/.env.example`) |

**Không commit** file `.env` / secret thật.

### 4. Chạy API

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

Hoặc (entrypoint tương thích):

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Kiểm tra: [http://localhost:8000/health](http://localhost:8000/health)  
Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

API hiện có:

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/health` | No |
| `GET` | `/api/v1/health` | No |
| `GET` | `/api/v1/profiles/me` | Bearer JWT |
| `PATCH` | `/api/v1/profiles/me` | Bearer JWT |
| `POST` | `/api/v1/chat` | No (LLM; cần `OPENAI_API_KEY` nếu gọi thật) |

### 5. Frontend

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

Điền `frontend/.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key từ supabase status>
VITE_API_BASE_URL=http://localhost:8000
```

UI: [http://localhost:3000](http://localhost:3000)

### 6. Chạy tests

```powershell
.\.venv\Scripts\python.exe -m pytest tests -v
```

Frontend typecheck:

```powershell
cd frontend
npm run lint
```

---

## Production (Supabase Cloud)

1. Tạo project trên [Supabase](https://supabase.com).
2. Link và đẩy migration:

```powershell
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

3. Đặt env production cho backend (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `CORS_ORIGINS`).
4. Frontend chỉ dùng URL + **anon/publishable** key — **không** đưa service-role xuống browser.

---

## Đẩy lên GitHub

```powershell
git status
git add .
git commit -m "Describe your change"
git branch -M main
git remote add origin <URL_REPO_GITHUB>
git push -u origin main
```

Checklist trước khi push:

- [ ] Không có `.env`, key, token trong commit
- [ ] `pytest tests` pass
- [ ] Frontend `npm run lint` pass (nếu sửa UI)
- [ ] Migration mới nằm trong `supabase/migrations/`

---

## Deliverables Checklist

- [x] Source Code (GitHub)
- [x] README.md
- [ ] Architecture Diagram (`docs/architecture_diagram.md`)
- [ ] AI Logs (auto-collected)
- [ ] Live URL / Deploy
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
