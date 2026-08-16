# Match Job + Match Candidates

## Routes

- `/match_job` — ứng viên: gợi ý việc (trước đây `/match`). `/match` redirect tới đây.
- `/match_candidates` — recruiter/admin: gợi ý ứng viên **theo từng vị trí**.

## Pool

Candidate match: `job_posts` `published` (như hiện tại, `mock_recommend`).

HR match: chỉ `applications` của `job_id` đã chọn, `withdrawn_at IS NULL`. Không lấy CV ngoài vị trí đó. `mock_recommend_candidates` gắn score giả, tối đa 5.

## API

`POST /api/v1/chat`

```json
{ "message": "...", "job_id": "uuid | null" }
```

- Không `job_id` → `{ response, jobs }` (match việc).
- Có `job_id` → kiểm tra actor là admin hoặc `company_members` active owner/recruiter của công ty sở hữu tin. Sai → 403. Đúng → `{ response, candidates }`.

Candidate card: `application_id`, `applicant_user_id`, `full_name`, `email`, `resume_title`, `resume_storage_path`, `current_status`, `score`.

Chưa có đơn: `candidates=[]`, response “Chưa có CV nộp cho vị trí này.”

## UI

`/match_job`: giữ chat hybrid hiện tại.

`/match_candidates`: RoleRoute recruiter/admin. Dropdown job từ memberships. Đổi job reset chat. Chip “Gợi ý ứng viên phù hợp”. Thẻ ứng viên + mở CV signed URL. Chưa chọn job thì disable gửi.
