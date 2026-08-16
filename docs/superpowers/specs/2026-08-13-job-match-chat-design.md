# Job Match Chat (mock recommend)

## Goal

Ứng viên đã login có trang `/match`: chat hybrid (ô nhập + nút nhanh) gọi backend, nhận gợi ý việc làm. Matching thật chưa làm — `mock_recommend` lấy tin `published` và gắn score giả.

## Approved choices

- UI: hybrid C (ô chat + chip “Gợi ý việc phù hợp”).
- Data: job published thật trong DB, score giả.
- API: tái sử dụng `POST /api/v1/chat` (auth + rate limit sẵn). Không endpoint mới.
- Agent graph stub không đổi. `ChatService` gọi `mock_recommend`, không `agent.ainvoke`.

## Flow

```text
/match → POST /api/v1/chat { "message": "..." }
       → JWT + 20 req/phút
       → ChatService.chat()
       → list published job_posts (limit 5, newest first)
       → mock_recommend(rows) gắn score 0.95, 0.88, 0.81, 0.74, 0.67
       → { response, analysis: "", jobs: [...] }
```

Nút nhanh gửi đúng `"Gợi ý việc phù hợp"`. Tin nhắn gõ tay cùng endpoint. Mock **bỏ qua nội dung** `message`.

## API

`ChatRequest` giữ nguyên (`message` 1–5000 ký tự).

`ChatResponse`:

```json
{
  "response": "Gợi ý 3 việc làm phù hợp (mock matching).",
  "analysis": "",
  "jobs": [
    {
      "id": "uuid",
      "title": "Backend Engineer",
      "company_name": "Acme",
      "location": "Hà Nội",
      "employment_type": "full_time",
      "salary_min": 20000000,
      "salary_max": 35000000,
      "currency": "VND",
      "score": 0.95
    }
  ]
}
```

`jobs` mặc định `[]` nếu không có tin published. Khi đó `response` = `"Hiện chưa có tin tuyển dụng đang mở."`

Query DB lỗi → `502` `{ "detail": "Không lấy được danh sách việc làm", "code": "JOBS_UNAVAILABLE" }`.

Không auth → `401` như hiện tại.

## Backend units

- `mock_recommend(rows) -> list[RecommendedJob]`: thuần mapping + score giả; không LLM.
- `list_published_jobs(client)`: Supabase `job_posts` `status=published`, join `companies(name)`, `order published_at desc`, `limit 5`.
- `ChatService` nhận Supabase client, gọi hai hàm trên.

## Frontend

- Route `/match` trong `ProtectedRoute` (chưa login → `/auth/sign-in`).
- Nav “Gợi ý việc” (Sparkles) khi đã login.
- Trang chat: welcome, chip nút, bubble user/assistant, thẻ job (score %, title, company, location, salary, link `/jobs/:id`).
- Style slate/emerald như Jobs. Gọi `apiJson('/chat', token, { method: 'POST', body })`.

## Tests

- Unit: `mock_recommend` gán score đúng thứ tự; `[]` khi không có row; `ChatService` map jobs và empty/502.
- API: `/chat` vẫn 401 không token; có token + fake service → `jobs` là list.
- Frontend: không test runner — không thêm E2E.

## Out of scope

Matching theo profile, LLM, recruiter-side candidate recommend, streaming, lịch sử chat, persist conversation.
