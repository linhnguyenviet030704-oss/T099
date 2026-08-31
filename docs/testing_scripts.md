Tôi không có khả năng tạo file để bạn tải về trực tiếp. Tuy nhiên, tôi sẽ viết **toàn bộ kịch bản test đầy đủ** ngay bên dưới. Bạn có thể copy toàn bộ nội dung và lưu thành file `.md`.

---

# KỊCH BẢN TEST SÂU - HỆ THỐNG TUYỂN DỤNG
## Cập nhật trạng thái đơn ứng tuyển, Thông báo & Hệ thống uy tín

**Version**: 1.0  
**Date**: 2026-08-30  
**Status**: Ready for Execution  
**Total Test Cases**: 287

---

## MỤC LỤC

| # | Module | Số TC | Priority |
|---|--------|-------|----------|
| 1 | Database - Reputation Core | 25 | P0 |
| 2 | Database - Application Deadline | 18 | P0 |
| 3 | Database - Notifications | 22 | P0 |
| 4 | Database - Auto-Reject | 20 | P0 |
| 5 | Database - Candidate Violation | 15 | P0 |
| 6 | Database - Interview Invitations | 12 | P1 |
| 7 | Database - Email Outbox | 10 | P1 |
| 8 | Backend API - Application Status | 35 | P0 |
| 9 | Backend API - Notifications | 28 | P0 |
| 10 | Backend API - Reputation | 15 | P0 |
| 11 | Backend API - Cron Endpoint | 12 | P0 |
| 12 | Frontend - NotificationBell | 22 | P0 |
| 13 | Frontend - ApplicationStatusModal | 18 | P0 |
| 14 | Frontend - ReputationBadge | 10 | P1 |
| 15 | Security Tests | 25 | P0 |
| 16 | Concurrency & Race Condition | 15 | P0 |
| 17 | Integration / E2E | 20 | P0 |
| 18 | Performance | 10 | P1 |
| **TOTAL** | | **287** | |

---

## 1. DATABASE - REPUTATION CORE

### 1.1 Schema Validation

| TC ID | Tên Test | Precondition | Steps | Expected Result | Priority |
|-------|----------|--------------|-------|-----------------|----------|
| TC-DB-REP-001 | Cột recruiter_reputation_score tồn tại | Migration 1.1 đã chạy | Query `information_schema.columns` | Cột tồn tại, type = integer, default = 100 | P0 |
| TC-DB-REP-002 | Cột candidate_reputation_score tồn tại | Migration 1.1 đã chạy | Query `information_schema.columns` | Cột tồn tại, type = integer, default = 100 | P0 |
| TC-DB-REP-003 | CHECK constraint ngăn score < 0 | Profile tồn tại | `UPDATE profiles SET recruiter_reputation_score = -1` | Raise exception `check constraint violated` | P0 |
| TC-DB-REP-004 | CHECK constraint ngăn score > 100 | Profile tồn tại | `UPDATE profiles SET candidate_reputation_score = 101` | Raise exception | P0 |
| TC-DB-REP-005 | Score = 0 được chấp nhận | Profile tồn tại | `UPDATE profiles SET recruiter_reputation_score = 0` (service_role) | Success | P0 |
| TC-DB-REP-006 | Score = 100 được chấp nhận | Profile tồn tại | `UPDATE profiles SET candidate_reputation_score = 100` (service_role) | Success | P0 |
| TC-DB-REP-007 | Bảng reputation_events tồn tại | Migration 1.1 đã chạy | Query `information_schema.tables` | Bảng tồn tại với đầy đủ columns | P0 |
| TC-DB-REP-008 | Unique constraint trên idempotency_key | reputation_events trống | Insert 2 rows cùng idempotency_key | Row thứ 2 raise unique violation | P0 |
| TC-DB-REP-009 | Index profiles_recruiter_reputation_idx tồn tại | Migration đã chạy | Query `pg_indexes` | Index tồn tại, sort DESC | P1 |
| TC-DB-REP-010 | Index profiles_candidate_reputation_idx tồn tại | Migration đã chạy | Query `pg_indexes` | Index tồn tại, sort DESC | P1 |

### 1.2 Function adjust_reputation()

| TC ID | Tên Test | Precondition | Steps | Expected Result | Priority |
|-------|----------|--------------|-------|-----------------|----------|
| TC-DB-REP-011 | Trừ điểm recruiter cơ bản | Profile score=100 | `SELECT adjust_reputation(user_id, 'recruiter', -5, 'test', ...)` | Score = 95, event created | P0 |
| TC-DB-REP-012 | Cộng điểm candidate cơ bản | Profile score=80 | `SELECT adjust_reputation(user_id, 'candidate', 5, 'bonus', ...)` | Score = 85 | P0 |
| TC-DB-REP-013 | Clamp tại 0 khi trừ quá | Profile score=3 | `adjust_reputation(user_id, 'recruiter', -10, ...)` | Score = 0 (không âm) | P0 |
| TC-DB-REP-014 | Clamp tại 100 khi cộng quá | Profile score=98 | `adjust_reputation(user_id, 'candidate', 5, ...)` | Score = 100 (không vượt) | P0 |
| TC-DB-REP-015 | Idempotency - gọi 2 lần cùng key | Profile score=100 | Gọi 2 lần với cùng `idempotency_key='key-1'` | Score = 95 (chỉ trừ 1 lần), 1 event | P0 |
| TC-DB-REP-016 | Idempotency - key khác nhau | Profile score=100 | Gọi 2 lần với key khác nhau | Score = 90 (trừ 2 lần), 2 events | P0 |
| TC-DB-REP-017 | Invalid role | Profile tồn tại | `adjust_reputation(user_id, 'admin', -5, ...)` | Raise exception 'p_role must be recruiter or candidate' | P0 |
| TC-DB-REP-018 | User không tồn tại | Không có profile | `adjust_reputation('non-existent-uuid', 'recruiter', -5, ...)` | Raise exception 'User not found' | P0 |
| TC-DB-REP-019 | Tách role - trừ recruiter không ảnh hưởng candidate | Profile recruiter=100, candidate=100 | Trừ recruiter -10 | Recruiter=90, Candidate=100 | P0 |
| TC-DB-REP-020 | Tách role - trừ candidate không ảnh hưởng recruiter | Profile recruiter=100, candidate=100 | Trừ candidate -10 | Recruiter=100, Candidate=90 | P0 |
| TC-DB-REP-021 | Audit trail đầy đủ | Profile tồn tại | Gọi với application_id, job_post_id | Event có đầy đủ fields | P0 |
| TC-DB-REP-022 | Return JSON đúng format | Profile score=100 | Gọi function | Return `{success: true, old_score: 100, new_score: 95, event_id: uuid}` | P1 |
| TC-DB-REP-023 | Idempotent return đúng | Đã gọi 1 lần | Gọi lại cùng key | Return `{success: true, idempotent: true, ...}` | P1 |
| TC-DB-REP-024 | points_delta = 0 | Profile score=100 | `adjust_reputation(user_id, 'recruiter', 0, ...)` | Score = 100, event created với delta=0 | P2 |
| TC-DB-REP-025 | Concurrent calls (2 sessions) | Profile score=100 | 2 sessions gọi đồng thời -5 | Score = 90 (cả 2 đều apply) | P0 |

### 1.3 Trigger protect_reputation_scores()

| TC ID | Tên Test | Precondition | Steps | Expected Result | Priority |
|-------|----------|--------------|-------|-----------------|----------|
| TC-DB-REP-026 | Authenticated user sửa recruiter_score | Set role=authenticated | `UPDATE profiles SET recruiter_reputation_score = 0` | Raise exception | P0 |
| TC-DB-REP-027 | Authenticated user sửa candidate_score | Set role=authenticated | `UPDATE profiles SET candidate_reputation_score = 0` | Raise exception | P0 |
| TC-DB-REP-028 | Service role sửa được | Set role=service_role | `UPDATE profiles SET recruiter_reputation_score = 50` | Success | P0 |
| TC-DB-REP-029 | Authenticated sửa cột khác OK | Set role=authenticated | `UPDATE profiles SET full_name = 'New'` | Success | P0 |
| TC-DB-REP-030 | Authenticated sửa cả reputation + cột khác | Set role=authenticated | `UPDATE profiles SET full_name='X', recruiter_reputation_score=0` | Raise exception (toàn bộ rollback) | P0 |

---

## 2. DATABASE - APPLICATION DEADLINE

### 2.1 Trigger handle_application_deadline()

| TC ID | Tên Test | Precondition | Steps | Expected Result | Priority |
|-------|----------|--------------|-------|-----------------|----------|
| TC-DB-DL-001 | Deadline set khi INSERT application | Job có timeout=5 days | INSERT application | `response_deadline_at = applied_at + 5 days` | P0 |
| TC-DB-DL-002 | Default timeout 3 ngày | Job không set timeout | INSERT application | `response_deadline_at = applied_at + 3 days` | P0 |
| TC-DB-DL-003 | Deadline clear khi status pending -> screening | Application pending có deadline | UPDATE status='screening' | `response_deadline_at = NULL` | P0 |
| TC-DB-DL-004 | Deadline clear khi status pending -> interview | Application pending có deadline | UPDATE status='interview' | `response_deadline_at = NULL` | P0 |
| TC-DB-DL-005 | Deadline clear khi status pending -> rejected | Application pending có deadline | UPDATE status='rejected' | `response_deadline_at = NULL` | P0 |
| TC-DB-DL-006 | Deadline clear khi reviewed_at được set | Application pending, reviewed_at=NULL | UPDATE reviewed_at=now() | `response_deadline_at = NULL` | P0 |
| TC-DB-DL-007 | Deadline KHÔNG clear khi status screening -> interview | Application screening (deadline đã NULL) | UPDATE status='interview' | `response_deadline_at` vẫn NULL | P1 |
| TC-DB-DL-008 | applied_at tự set nếu NULL | INSERT không có applied_at | INSERT application | `applied_at = now()` | P1 |
| TC-DB-DL-009 | Custom timeout 7 ngày | Job timeout=7 days | INSERT application | Deadline = applied_at + 7 days | P0 |
| TC-DB-DL-010 | Custom timeout 1 ngày | Job timeout=1 day | INSERT application | Deadline = applied_at + 1 day | P0 |
| TC-DB-DL-011 | Timeout 0 (edge case) | Job timeout=0 | INSERT application | Deadline = applied_at (ngay lập tức) | P2 |
| TC-DB-DL-012 | Backfill existing applications | Applications pending không có deadline | Chạy migration | Tất cả pending apps có deadline | P0 |
| TC-DB-DL-013 | Index applications_pending_deadline_idx tồn tại | Migration đã chạy | Query pg_indexes | Index tồn tại với WHERE clause | P1 |
| TC-DB-DL-014 | Deadline không thay đổi khi update cột khác | Application pending có deadline | UPDATE cover_letter='new' | Deadline giữ nguyên | P1 |
| TC-DB-DL-015 | Multiple applications cùng job | Job timeout=3 days | INSERT 3 applications | Mỗi app có deadline riêng dựa trên applied_at | P0 |
| TC-DB-DL-016 | Job bị xóa (FK cascade) | Application tồn tại | DELETE job_post | Application bị cascade delete | P2 |
| TC-DB-DL-017 | Deadline chính xác theo timezone | applied_at = '2026-08-30 23:00:00+07' | INSERT application | Deadline tính đúng theo timestamptz | P1 |
| TC-DB-DL-018 | Update job timeout không ảnh hưởng applications cũ | App đã có deadline | UPDATE job timeout=7 days | App deadline giữ nguyên | P1 |

---

## 3. DATABASE - NOTIFICATIONS

### 3.1 Function create_notification()

| TC ID | Tên Test | Precondition | Steps | Expected Result | Priority |
|-------|----------|--------------|-------|-----------------|----------|
| TC-DB-NTF-001 | Tạo notification cơ bản | Profile tồn tại | `SELECT create_notification(user_id, 'application_submitted', 'Title', 'Msg', ...)` | Notification created, return UUID | P0 |
| TC-DB-NTF-002 | Idempotency - gọi 2 lần cùng key | Profile tồn tại | Gọi 2 lần cùng idempotency_key | Chỉ 1 notification, cùng UUID returned | P0 |
| TC-DB-NTF-003 | Không có idempotency key - tạo nhiều | Profile tồn tại | Gọi 2 lần không có key | 2 notifications khác nhau | P0 |
| TC-DB-NTF-004 | Metadata JSON lưu đúng | - | Tạo với metadata `{"app_id": "123"}` | metadata->>'app_id' = '123' | P1 |
| TC-DB-NTF-005 | link_url NULL | - | Tạo với link_url=NULL | Notification created, link_url IS NULL | P1 |
| TC-DB-NTF-006 | Tất cả notification types | - | Tạo với mỗi type trong enum | Tất cả thành công | P0 |
| TC-DB-NTF-007 | Invalid type | - | Tạo với type không tồn tại | Raise exception | P0 |
| TC-DB-NTF-008 | User không tồn tại | - | Tạo với user_id không tồn tại | Raise FK violation | P0 |
| TC-DB-NTF-009 | is_read default false | - | Tạo notification | is_read = false, read_at = NULL | P0 |
| TC-DB-NTF-010 | created_at tự set | - | Tạo notification | created_at ≈ now() | P1 |

### 3.2 Trigger set_notification_read_at()

| TC ID | Tên Test | Precondition | Steps | Expected Result | Priority |
|-------|----------|--------------|-------|-----------------|----------|
| TC-DB-NTF-011 | read_at set khi is_read=true | Notification unread | `UPDATE SET is_read=true` | read_at ≈ now() | P0 |
| TC-DB-NTF-012 | read_at clear khi is_read=false | Notification read | `UPDATE SET is_read=false` | read_at = NULL | P0 |
| TC-DB-NTF-013 | read_at không đổi khi đã read | Notification đã read | `UPDATE SET title='new'` | read_at giữ nguyên | P1 |
| TC-DB-NTF-014 | read_at set chỉ lần đầu | Notification unread | UPDATE is_read=true 2 lần | read_at = thời gian lần đầu | P1 |

### 3.3 RLS Policies

| TC ID | Tên Test | Precondition | Steps | Expected Result | Priority |
|-------|----------|--------------|-------|-----------------|----------|
| TC-DB-NTF-015 | User xem được notifications của mình | User A có 3 notifications | SELECT as User A | Trả về 3 rows | P0 |
| TC-DB-NTF-016 | User KHÔNG xem được notifications người khác | User A có 3, User B có 2 | SELECT as User A | Chỉ thấy 3 của A | P0 |
| TC-DB-NTF-017 | User update được notification của mình | User A có notification | UPDATE is_read=true as User A | Success | P0 |
| TC-DB-NTF-018 | User KHÔNG update được notification người khác | User B có notification | UPDATE as User A | 0 rows affected | P0 |
| TC-DB-NTF-019 | User KHÔNG insert được notification | Authenticated user | INSERT directly | Denied by RLS | P0 |
| TC-DB-NTF-020 | User KHÔNG delete được notification | User A có notification | DELETE as User A | Denied by RLS | P0 |
| TC-DB-NTF-021 | Service role bypass RLS | - | SELECT all as service_role | Thấy tất cả | P0 |
| TC-DB-NTF-022 | Realtime publication enabled | Migration đã chạy | `SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime'` | notifications table listed | P0 |

---

## 4. DATABASE - AUTO-REJECT

### 4.1 Function auto_reject_expired_applications()

| TC ID | Tên Test | Precondition | Steps | Expected Result | Priority |
|-------|----------|--------------|-------|-----------------|----------|
| TC-DB-AR-001 | Reject application quá hạn | App pending, deadline < now() | Gọi function | Status='rejected', deadline=NULL | P0 |
| TC-DB-AR-002 | KHÔNG reject app chưa quá hạn | App pending, deadline > now() | Gọi function | Status giữ 'pending' | P0 |
| TC-DB-AR-003 | KHÔNG reject app không phải pending | App screening, deadline < now() | Gọi function | Status giữ 'screening' | P0 |
| TC-DB-AR-004 | Trừ điểm recruiter | Recruiter score=100 | Auto-reject app của recruiter | Score=95 (-5) | P0 |
| TC-DB-AR-005 | Notify candidate | App quá hạn | Gọi function | Notification type='application_auto_rejected' cho candidate | P0 |
| TC-DB-AR-006 | Notify recruiter bị trừ điểm | App quá hạn | Gọi function | Notification type='reputation_decreased' cho recruiter | P0 |
| TC-DB-AR-007 | Reputation event logged | App quá hạn | Gọi function | reputation_events có reason='recruiter_timeout' | P0 |
| TC-DB-AR-008 | application_stage record created | App quá hạn | Gọi function | application_stages có is_system_generated=true | P0 |
| TC-DB-AR-009 | Idempotent - chạy 2 lần | App quá hạn | Gọi function 2 lần | Score chỉ trừ 1 lần, 1 event | P0 |
| TC-DB-AR-010 | Batch size limit | 5 apps quá hạn | Gọi với batch_size=2 | Chỉ 2 apps bị reject | P0 |
| TC-DB-AR-011 | Batch size = 0 | Apps quá hạn | Gọi với batch_size=0 | Không reject app nào | P2 |
| TC-DB-AR-012 | Không có app nào quá hạn | Tất cả apps còn hạn | Gọi function | Return empty, không lỗi | P0 |
| TC-DB-AR-013 | Advisory lock prevents concurrent | 2 sessions gọi đồng thời | Session 2 | Session 2 skip (notice) | P0 |
| TC-DB-AR-014 | FOR UPDATE SKIP LOCKED | 2 apps, 1 đã locked | Gọi function | Chỉ xử lý app không locked | P0 |
| TC-DB-AR-015 | Conditional update re-check | App pending -> screening giữa lúc xử lý | Gọi function | Skip app đã thay đổi | P0 |
| TC-DB-AR-016 | Return table đúng format | App quá hạn | Gọi function | Return columns: application_id, job_post_id, recruiter_user_id, expired_at, new_reputation | P1 |
| TC-DB-AR-017 | reviewed_at được set | App quá hạn | Gọi function | reviewed_at ≈ now() | P0 |
| TC-DB-AR-018 | Multiple apps cùng recruiter | 3 apps quá hạn cùng recruiter | Gọi function | Score trừ 15 (3×5), 3 events | P0 |
| TC-DB-AR-019 | Recruiter score clamp tại 0 | Recruiter score=3, app quá hạn | Gọi function | Score=0 (không âm) | P0 |
| TC-DB-AR-020 | Only service_role can execute | Authenticated user | Gọi function | Permission denied | P0 |

---

## 5. DATABASE - CANDIDATE VIOLATION

### 5.1 Trigger penalize_candidate_withdrawal()

| TC ID | Tên Test | Precondition | Steps | Expected Result | Priority |
|-------|----------|--------------|-------|-----------------|----------|
| TC-DB-CV-001 | Withdraw từ interview trừ 10 điểm | App status='interview', candidate score=100 | UPDATE status='withdrawn' | Score=90 | P0 |
| TC-DB-CV-002 | Withdraw từ offer trừ 10 điểm | App status='offer', candidate score=100 | UPDATE status='withdrawn' | Score=90 | P0 |
| TC-DB-CV-003 | Withdraw từ pending KHÔNG trừ | App status='pending' | UPDATE status='withdrawn' | Score giữ 100 | P0 |
| TC-DB-CV-004 | Withdraw từ screening KHÔNG trừ | App status='screening' | UPDATE status='withdrawn' | Score giữ 100 | P0 |
| TC-DB-CV-005 | Withdraw từ rejected KHÔNG trừ | App status='rejected' | UPDATE status='withdrawn' | Score giữ nguyên (invalid transition anyway) | P1 |
| TC-DB-CV-006 | Notification tạo cho candidate | Withdraw từ interview | UPDATE | Notification type='reputation_decreased' | P0 |
| TC-DB-CV-007 | Reputation event logged | Withdraw từ interview | UPDATE | Event reason='interview_withdrawal', delta=-10 | P0 |
| TC-DB-CV-008 | Idempotent - update cùng status 2 lần | App interview | UPDATE withdrawn 2 lần | Chỉ trừ 1 lần (trigger không fire lần 2 vì old=new) | P0 |
| TC-DB-CV-009 | Score clamp tại 0 | Candidate score=5 | Withdraw từ interview | Score=0 | P0 |
| TC-DB-CV-010 | Multiple withdrawals | Candidate có 2 apps interview | Withdraw cả 2 | Score giảm 20 (2×10) | P0 |

### 5.2 Function penalize_interview_no_show()

| TC ID | Tên Test | Precondition | Steps | Expected Result | Priority |
|-------|----------|--------------|-------|-----------------|----------|
| TC-DB-CV-011 | No-show trừ 15 điểm | Invitation status='no_show', candidate score=100 | Gọi function | Score=85 | P0 |
| TC-DB-CV-012 | Status != no_show không trừ | Invitation status='confirmed' | Gọi function | Return {success: false}, score giữ | P0 |
| TC-DB-CV-013 | Invitation không tồn tại | - | Gọi với UUID random | Raise exception 'not found' | P0 |
| TC-DB-CV-014 | Notification tạo cho candidate | No-show | Gọi function | Notification type='reputation_decreased' | P0 |
| TC-DB-CV-015 | Idempotent | No-show invitation | Gọi 2 lần | Score chỉ trừ 1 lần | P0 |

---

## 6. DATABASE - INTERVIEW INVITATIONS

| TC ID | Tên Test | Precondition | Steps | Expected Result | Priority |
|-------|----------|--------------|-------|-----------------|----------|
| TC-DB-II-001 | Tạo invitation cơ bản | Application tồn tại | INSERT invitation | Created với status='pending' | P0 |
| TC-DB-II-002 | responded_at set khi confirm | Invitation pending | UPDATE status='confirmed' | responded_at ≈ now() | P0 |
| TC-DB-II-003 | responded_at set khi decline | Invitation pending | UPDATE status='declined' | responded_at ≈ now() | P0 |
| TC-DB-II-004 | responded_at KHÔNG set khi no_show | Invitation pending | UPDATE status='no_show' | responded_at = NULL (trigger chỉ set cho confirmed/declined) | P1 |
| TC-DB-II-005 | Candidate xem được invitation của mình | Candidate có application | SELECT as candidate | Thấy invitation | P0 |
| TC-DB-II-006 | Candidate KHÔNG xem invitation người khác | Candidate khác | SELECT | 0 rows | P0 |
| TC-DB-II-007 | Candidate chỉ set confirmed/declined | Invitation pending | UPDATE status='no_show' as candidate | Denied by RLS with check | P0 |
| TC-DB-II-008 | Recruiter tạo invitation | Recruiter thuộc company | INSERT as service_role | Success | P0 |
| TC-DB-II-009 | Multiple invitations cho 1 application | Application tồn tại | INSERT 2 invitations | Cả 2 tồn tại | P1 |
| TC-DB-II-010 | Index pending_deadline tồn tại | Migration đã chạy | Query pg_indexes | Index tồn tại | P1 |
| TC-DB-II-011 | scheduled_at bắt buộc | - | INSERT không có scheduled_at | Raise NOT NULL violation | P0 |
| TC-DB-II-012 | Cascade delete khi application xóa | Invitation tồn tại | DELETE application | Invitation bị xóa | P1 |

---

## 7. DATABASE - EMAIL OUTBOX

| TC ID | Tên Test | Precondition | Steps | Expected Result | Priority |
|-------|----------|--------------|-------|-----------------|----------|
| TC-DB-EO-001 | Enqueue email cơ bản | Profile tồn tại | `SELECT enqueue_email(user_id, 'template', '{}')` | Email created, status='pending' | P0 |
| TC-DB-EO-002 | Idempotency | - | Enqueue 2 lần cùng key | Chỉ 1 email | P0 |
| TC-DB-EO-003 | next_retry_at set | - | Enqueue | next_retry_at ≈ now() | P1 |
| TC-DB-EO-004 | attempts default 0 | - | Enqueue | attempts = 0 | P1 |
| TC-DB-EO-005 | max_attempts default 3 | - | Enqueue | max_attempts = 3 | P1 |
| TC-DB-EO-006 | RLS - authenticated không access | Authenticated user | SELECT from email_outbox | Denied | P0 |
| TC-DB-EO-007 | Service role access | Service role | SELECT | Success | P0 |
| TC-DB-EO-008 | Index pending_idx tồn tại | Migration đã chạy | Query pg_indexes | Index với WHERE clause đúng | P1 |
| TC-DB-EO-009 | Payload JSON lưu đúng | - | Enqueue với payload phức tạp | Payload intact | P1 |
| TC-DB-EO-010 | User bị xóa cascade | Email tồn tại | DELETE profile | Email bị xóa | P2 |

---

## 8. BACKEND API - APPLICATION STATUS

### 8.1 Happy Path

| TC ID | Tên Test | Method | Endpoint | Request | Expected | Priority |
|-------|----------|--------|----------|---------|----------|----------|
| TC-API-APP-001 | pending -> screening | PATCH | `/applications/{id}/status` | `{"new_status": "screening"}` | 200, status='screening' | P0 |
| TC-API-APP-002 | pending -> interview | PATCH | `/applications/{id}/status` | `{"new_status": "interview"}` | 200, status='interview' | P0 |
| TC-API-APP-003 | pending -> rejected | PATCH | `/applications/{id}/status` | `{"new_status": "rejected"}` | 200, status='rejected' | P0 |
| TC-API-APP-004 | screening -> interview | PATCH | `/applications/{id}/status` | `{"new_status": "interview"}` | 200 | P0 |
| TC-API-APP-005 | screening -> rejected | PATCH | `/applications/{id}/status` | `{"new_status": "rejected"}` | 200 | P0 |
| TC-API-APP-006 | interview -> offer | PATCH | `/applications/{id}/status` | `{"new_status": "offer"}` | 200 | P0 |
| TC-API-APP-007 | interview -> rejected | PATCH | `/applications/{id}/status` | `{"new_status": "rejected"}` | 200 | P0 |
| TC-API-APP-008 | offer -> accepted | PATCH | `/applications/{id}/status` | `{"new_status": "accepted"}` | 200 | P0 |
| TC-API-APP-009 | offer -> rejected | PATCH | `/applications/{id}/status` | `{"new_status": "rejected"}` | 200 | P0 |
| TC-API-APP-010 | Với note | PATCH | `/applications/{id}/status` | `{"new_status": "screening", "note": "Good CV"}` | 200, note saved | P1 |

### 8.2 Invalid Transitions

| TC ID | Tên Test | Request | Expected | Priority |
|-------|----------|---------|----------|----------|
| TC-API-APP-011 | pending -> offer | `{"new_status": "offer"}` | 400 "Invalid transition" | P0 |
| TC-API-APP-012 | pending -> accepted | `{"new_status": "accepted"}` | 400 | P0 |
| TC-API-APP-013 | screening -> offer | `{"new_status": "offer"}` | 400 | P0 |
| TC-API-APP-014 | screening -> accepted | `{"new_status": "accepted"}` | 400 | P0 |
| TC-API-APP-015 | interview -> accepted (skip offer) | `{"new_status": "accepted"}` | 400 | P0 |
| TC-API-APP-016 | accepted -> bất kỳ | `{"new_status": "rejected"}` | 400 (terminal) | P0 |
| TC-API-APP-017 | rejected -> bất kỳ | `{"new_status": "interview"}` | 400 (terminal) | P0 |
| TC-API-APP-018 | withdrawn -> bất kỳ | `{"new_status": "pending"}` | 400 (terminal) | P0 |
| TC-API-APP-019 | Cùng status | `{"new_status": "pending"}` (đang pending) | 400 | P0 |
| TC-API-APP-020 | Invalid status value | `{"new_status": "hired"}` | 422 validation error | P0 |

### 8.3 Authorization

| TC ID | Tên Test | Auth | Expected | Priority |
|-------|----------|------|----------|----------|
| TC-API-APP-021 | Không có token | None | 401 Unauthorized | P0 |
| TC-API-APP-022 | Token hết hạn | Expired JWT | 401 | P0 |
| TC-API-APP-023 | Candidate cố đổi status | Candidate token | 403 Forbidden | P0 |
| TC-API-APP-024 | Recruiter khác company | Recruiter token (company B) | 403 | P0 |
| TC-API-APP-025 | Recruiter đã deactivated | Inactive member token | 403 | P0 |
| TC-API-APP-026 | Recruiter role='viewer' | Viewer token | 403 | P1 |
| TC-API-APP-027 | Application không tồn tại | Valid recruiter | 404 | P0 |

### 8.4 Email Integration

| TC ID | Tên Test | Request | Expected | Priority |
|-------|----------|---------|----------|----------|
| TC-API-APP-028 | send_email=true | `{"new_status": "interview", "send_email": true}` | Email trong outbox | P0 |
| TC-API-APP-029 | send_email=false | `{"new_status": "screening", "send_email": false}` | Không có email | P0 |
| TC-API-APP-030 | send_email mặc định false | `{"new_status": "screening"}` | Không có email | P1 |
| TC-API-APP-031 | Email idempotent | Gọi 2 lần cùng app+status | Chỉ 1 email | P0 |

### 8.5 Side Effects

| TC ID | Tên Test | Expected | Priority |
|-------|----------|----------|----------|
| TC-API-APP-032 | Notification tạo cho candidate | Notification type='application_status_changed' | P0 |
| TC-API-APP-033 | reviewed_at set | reviewed_at ≈ now() | P0 |
| TC-API-APP-034 | response_deadline_at clear | NULL sau khi đổi khỏi pending | P0 |
| TC-API-APP-035 | application_stage record | Stage record created | P1 |

---

## 9. BACKEND API - NOTIFICATIONS

### 9.1 GET /notifications

| TC ID | Tên Test | Expected | Priority |
|-------|----------|----------|----------|
| TC-API-NTF-001 | Lấy notifications của mình | 200, chỉ notifications của user | P0 |
| TC-API-NTF-002 | Pagination - page 1 | 200, đúng page_size items | P0 |
| TC-API-NTF-003 | Pagination - page 2 | 200, items tiếp theo | P0 |
| TC-API-NTF-004 | Order by created_at DESC | Mới nhất trước | P0 |
| TC-API-NTF-005 | Filter unread only | `?unread=true` chỉ trả unread | P1 |
| TC-API-NTF-006 | Empty result | 200, items=[] | P0 |
| TC-API-NTF-007 | Unauthenticated | 401 | P0 |
| TC-API-NTF-008 | Không thấy notifications người khác | Chỉ của mình | P0 |
| TC-API-NTF-009 | page_size max limit | page_size=1000 -> clamp to max | P2 |
| TC-API-NTF-010 | page_size = 0 | 422 hoặc default | P2 |

### 9.2 POST /notifications/mark-read

| TC ID | Tên Test | Expected | Priority |
|-------|----------|----------|----------|
| TC-API-NTF-011 | Mark 1 notification | 200, marked_count=1 | P0 |
| TC-API-NTF-012 | Mark nhiều notifications | 200, marked_count=N | P0 |
| TC-API-NTF-013 | Mark notification người khác | marked_count=0 | P0 |
| TC-API-NTF-014 | Mark notification không tồn tại | marked_count=0 | P0 |
| TC-API-NTF-015 | Mark notification đã read | 200, không lỗi | P1 |
| TC-API-NTF-016 | Empty array | 422 hoặc marked_count=0 | P1 |
| TC-API-NTF-017 | read_at được set | read_at ≈ now() trong DB | P0 |
| TC-API-NTF-018 | Unauthenticated | 401 | P0 |
| TC-API-NTF-019 | Mixed own + other's | Chỉ mark own, count đúng | P0 |
| TC-API-NTF-020 | Large batch (100 ids) | 200, hoạt động bình thường | P1 |

### 9.3 GET /notifications/unread-count

| TC ID | Tên Test | Expected | Priority |
|-------|----------|----------|----------|
| TC-API-NTF-021 | Count đúng | 200, count = số unread | P0 |
| TC-API-NTF-022 | Count = 0 | 200, count=0 | P0 |
| TC-API-NTF-023 | Không đếm người khác | Chỉ của mình | P0 |
| TC-API-NTF-024 | Unauthenticated | 401 | P0 |

### 9.4 Realtime Integration

| TC ID | Tên Test | Expected | Priority |
|-------|----------|----------|----------|
| TC-API-NTF-025 | INSERT trigger realtime event | Client nhận được INSERT event | P0 |
| TC-API-NTF-026 | UPDATE trigger realtime event | Client nhận được UPDATE event | P0 |
| TC-API-NTF-027 | Filter by user_id | Chỉ nhận events của mình | P0 |
| TC-API-NTF-028 | Connection drop reconnect | Tự reconnect, không mất data | P1 |

---

## 10. BACKEND API - REPUTATION

| TC ID | Tên Test | Endpoint | Expected | Priority |
|-------|----------|----------|----------|----------|
| TC-API-REP-001 | Lấy reputation của mình | GET `/profiles/me/reputation` | 200, cả 2 scores | P0 |
| TC-API-REP-002 | Score trong khoảng 0-100 | GET | 0 <= score <= 100 | P0 |
| TC-API-REP-003 | Lấy reputation events | GET `/profiles/me/reputation/events` | 200, list events | P0 |
| TC-API-REP-004 | Events pagination | GET `?page=1&page_size=10` | Đúng pagination | P1 |
| TC-API-REP-005 | Events order DESC | GET | Mới nhất trước | P0 |
| TC-API-REP-006 | Không lấy events người khác | GET `/profiles/{other_id}/reputation/events` | 403 | P0 |
| TC-API-REP-007 | Unauthenticated | GET | 401 | P0 |
| TC-API-REP-008 | User không tự sửa reputation | PATCH `/profiles/me` với score | 403 hoặc ignored | P0 |
| TC-API-REP-009 | Recruiter reputation hiển thị đúng | GET | recruiter_reputation_score đúng | P0 |
| TC-API-REP-010 | Candidate reputation hiển thị đúng | GET | candidate_reputation_score đúng | P0 |
| TC-API-REP-011 | Dual role user | GET | Cả 2 scores độc lập | P0 |
| TC-API-REP-012 | Event có đầy đủ fields | GET events | points_delta, reason, created_at | P0 |
| TC-API-REP-013 | Filter events by role | GET `?role=recruiter` | Chỉ recruiter events | P1 |
| TC-API-REP-014 | Filter events by reason | GET `?reason=recruiter_timeout` | Chỉ matching events | P2 |
| TC-API-REP-015 | Empty events | GET | 200, items=[] | P0 |

---

## 11. BACKEND API - CRON ENDPOINT

| TC ID | Tên Test | Expected | Priority |
|-------|----------|----------|----------|
| TC-API-CRON-001 | Valid secret | 200, success=true | P0 |
| TC-API-CRON-002 | Invalid secret | 403 | P0 |
| TC-API-CRON-003 | Missing secret header | 422 | P0 |
| TC-API-CRON-004 | Dùng Bearer token thay vì X-Cron-Secret | 403/422 | P0 |
| TC-API-CRON-005 | Xử lý expired apps | rejected_count > 0 | P0 |
| TC-API-CRON-006 | Không có expired apps | rejected_count = 0 | P0 |
| TC-API-CRON-007 | Response format đúng | {success, rejected_count, applications} | P1 |
| TC-API-CRON-008 | Timeout handling | Không hang nếu DB slow | P1 |
| TC-API-CRON-009 | Error handling | 500 nếu DB error | P0 |
| TC-API-CRON-010 | Concurrent calls | Chỉ 1 xử lý (advisory lock) | P0 |
| TC-API-CRON-011 | Logging | Structured log với count | P1 |
| TC-API-CRON-012 | Rate limiting | Không bị spam (nếu có) | P2 |

---

## 12. FRONTEND - NOTIFICATION BELL

### 12.1 Rendering

| TC ID | Tên Test | Precondition | Steps | Expected | Priority |
|-------|----------|--------------|-------|----------|----------|
| TC-FE-NB-001 | Không render khi chưa login | user=null | Render component | Container rỗng | P0 |
| TC-FE-NB-002 | Render bell icon khi login | user authenticated | Render | Bell icon hiển thị | P0 |
| TC-FE-NB-003 | Badge hiển thị unread count | 5 unread | Render | Badge "5" | P0 |
| TC-FE-NB-004 | Badge "9+" khi > 9 | 15 unread | Render | Badge "9+" | P0 |
| TC-FE-NB-005 | Không badge khi count=0 | 0 unread | Render | Không có badge | P0 |
| TC-FE-NB-006 | Badge color đỏ | Unread > 0 | Render | bg-red-500 | P1 |
| TC-FE-NB-007 | Aria-label đúng | 3 unread | Inspect | `aria-label="Thông báo (3 chưa đọc)"` | P1 |

### 12.2 Dropdown

| TC ID | Tên Test | Steps | Expected | Priority |
|-------|----------|--------|----------|----------|
| TC-FE-NB-008 | Mở dropdown khi click | Click bell | Dropdown hiển thị | P0 |
| TC-FE-NB-009 | Đóng khi click backdrop | Click ngoài | Dropdown đóng | P0 |
| TC-FE-NB-010 | Fetch notifications khi mở | Click bell | API call GET /notifications | P0 |
| TC-FE-NB-011 | Hiển thị list notifications | Có 5 notifications | 5 items trong dropdown | P0 |
| TC-FE-NB-012 | Empty state | Không có notification | "Không có thông báo mới" | P0 |
| TC-FE-NB-013 | Unread highlight | 2 unread, 3 read | Unread có bg-blue-50 | P1 |
| TC-FE-NB-014 | Dot indicator cho unread | Unread notification | Blue dot hiển thị | P1 |
| TC-FE-NB-015 | Timestamp format | Notification created | Hiển thị dạng vi-VN | P1 |

### 12.3 Actions

| TC ID | Tên Test | Steps | Expected | Priority |
|-------|----------|--------|----------|----------|
| TC-FE-NB-016 | Click notification -> navigate | Click notification có link_url | Router.push(link_url) | P0 |
| TC-FE-NB-017 | Click notification -> mark read | Click notification | API mark-read called | P0 |
| TC-FE-NB-018 | Validate link_url relative | link_url='https://evil.com' | KHÔNG navigate | P0 |
| TC-FE-NB-019 | "Đánh dấu tất cả đã đọc" | Click button | Tất cả marked read | P0 |
| TC-FE-NB-020 | Unread count giảm sau mark read | Mark 1 read | Badge giảm 1 | P0 |

### 12.4 Realtime

| TC ID | Tên Test | Steps | Expected | Priority |
|-------|----------|--------|----------|----------|
| TC-FE-NB-021 | Realtime INSERT tăng count | Insert notification trong DB | Badge tăng 1 | P0 |
| TC-FE-NB-022 | Cleanup channel khi unmount | Unmount component | supabase.removeChannel called | P0 |

---

## 13. FRONTEND - APPLICATION STATUS MODAL

### 13.1 Rendering

| TC ID | Tên Test | Precondition | Expected | Priority |
|-------|----------|--------------|----------|----------|
| TC-FE-ASM-001 | Không render khi isOpen=false | isOpen=false | Null | P0 |
| TC-FE-ASM-002 | Render khi isOpen=true | isOpen=true | Modal hiển thị | P0 |
| TC-FE-ASM-003 | Hiển thị candidate name | candidateName="Nguyen Van A" | Text chứa tên | P0 |
| TC-FE-ASM-004 | Hiển thị previous status | previousStatus="pending" | Text "pending" | P0 |
| TC-FE-ASM-005 | Hiển thị new status text | newStatus="interview" | Text "mời phỏng vấn" | P0 |
| TC-FE-ASM-006 | 2 checkboxes hiển thị | isOpen=true | 2 checkbox inputs | P0 |

### 13.2 Validation

| TC ID | Tên Test | Steps | Expected | Priority |
|-------|----------|--------|----------|----------|
| TC-FE-ASM-007 | Chưa check confirm -> lỗi | Click "Xác nhận" không check | Error "Vui lòng xác nhận" | P0 |
| TC-FE-ASM-008 | Check confirm -> submit OK | Check checkbox 1, click confirm | onConfirm called | P0 |
| TC-FE-ASM-009 | Button disabled khi chưa check | confirmed=false | Button disabled | P0 |
| TC-FE-ASM-010 | Button disabled khi loading | loading=true | Button disabled + "Đang xử lý..." | P0 |

### 13.3 Actions

| TC ID | Tên Test | Steps | Expected | Priority |
|-------|----------|--------|----------|----------|
| TC-FE-ASM-011 | onConfirm(sendEmail=true) | Check cả 2, click confirm | onConfirm(true) | P0 |
| TC-FE-ASM-012 | onConfirm(sendEmail=false) | Check 1, click confirm | onConfirm(false) | P0 |
| TC-FE-ASM-013 | Reset state sau success | onConfirm resolves | Checkboxes reset | P0 |
| TC-FE-ASM-014 | Hiển thị error từ API | onConfirm rejects | Error message hiển thị | P0 |
| TC-FE-ASM-015 | Close khi click backdrop | Click backdrop | onClose called | P0 |
| TC-FE-ASM-016 | Close khi click "Hủy" | Click Hủy | onClose called | P0 |
| TC-FE-ASM-017 | Checkboxes disabled khi loading | loading=true | Checkboxes disabled | P1 |
| TC-FE-ASM-018 | Keyboard accessibility | Tab + Enter | Hoạt động đúng | P2 |

---

## 14. FRONTEND - REPUTATION BADGE

| TC ID | Tên Test | Precondition | Expected | Priority |
|-------|----------|--------------|----------|----------|
| TC-FE-RB-001 | Hiển thị score | score=85 | "85" hiển thị | P0 |
| TC-FE-RB-002 | Color green khi >= 80 | score=90 | Green badge | P1 |
| TC-FE-RB-003 | Color yellow khi 50-79 | score=65 | Yellow badge | P1 |
| TC-FE-RB-004 | Color red khi < 50 | score=30 | Red badge | P1 |
| TC-FE-RB-005 | Score = 0 | score=0 | "0" + red | P0 |
| TC-FE-RB-006 | Score = 100 | score=100 | "100" + green | P0 |
| TC-FE-RB-007 | Tooltip giải thích | Hover | Tooltip hiển thị | P2 |
| TC-FE-RB-008 | Recruiter badge | role='recruiter' | Hiển thị recruiter score | P0 |
| TC-FE-RB-009 | Candidate badge | role='candidate' | Hiển thị candidate score | P0 |
| TC-FE-RB-010 | Loading state | Data loading | Skeleton/spinner | P1 |

---

## 15. SECURITY TESTS

### 15.1 SQL Injection

| TC ID | Tên Test | Input | Expected | Priority |
|-------|----------|-------|----------|----------|
| TC-SEC-001 | SQL injection trong status | `{"new_status": "'; DROP TABLE applications; --"}` | 422 validation | P0 |
| TC-SEC-002 | SQL injection trong note | `{"note": "'; DELETE FROM profiles; --"}` | Stored as literal text | P0 |
| TC-SEC-003 | SQL injection trong notification_ids | `["1; DROP TABLE notifications"]` | 422 | P0 |
| TC-SEC-004 | SQL injection trong link_url (DB) | Insert link_url='javascript:alert(1)' | Stored but not executed | P0 |

### 15.2 Authorization Bypass

| TC ID | Tên Test | Steps | Expected | Priority |
|-------|----------|-------|----------|----------|
| TC-SEC-005 | Direct DB update reputation (authenticated) | `UPDATE profiles SET recruiter_reputation_score=100` | Trigger blocks | P0 |
| TC-SEC-006 | Call create_notification as authenticated | `SELECT create_notification(...)` | Permission denied | P0 |
| TC-SEC-007 | Call adjust_reputation as authenticated | `SELECT adjust_reputation(...)` | Permission denied | P0 |
| TC-SEC-008 | Call auto_reject as authenticated | `SELECT auto_reject_expired_applications()` | Permission denied | P0 |
| TC-SEC-009 | Call enqueue_email as authenticated | `SELECT enqueue_email(...)` | Permission denied | P0 |
| TC-SEC-010 | Read other user's notifications via API | GET /notifications | Only own | P0 |
| TC-SEC-011 | Mark other user's notification read | POST mark-read with other's ID | marked_count=0 | P0 |
| TC-SEC-012 | Update application without company membership | PATCH status | 403 | P0 |
| TC-SEC-013 | Access email_outbox as authenticated | SELECT from email_outbox | RLS denies | P0 |
| TC-SEC-014 | Insert notification directly | INSERT into notifications | RLS denies | P0 |

### 15.3 XSS Prevention

| TC ID | Tên Test | Input | Expected | Priority |
|-------|----------|-------|----------|----------|
| TC-SEC-015 | XSS trong notification title | `<script>alert(1)</script>` | Rendered as text, not executed | P0 |
| TC-SEC-016 | XSS trong notification message | `<img onerror=alert(1)>` | Escaped | P0 |
| TC-SEC-017 | XSS trong link_url | `javascript:alert(1)` | Không navigate (validate starts with '/') | P0 |
| TC-SEC-018 | XSS trong candidate name | `<b onmouseover=alert(1)>Name</b>` | Escaped in UI | P0 |

### 15.4 Authentication

| TC ID | Tên Test | Steps | Expected | Priority |
|-------|----------|-------|----------|----------|
| TC-SEC-019 | Expired JWT | Dùng token hết hạn | 401 | P0 |
| TC-SEC-020 | Malformed JWT | `Authorization: Bearer abc123` | 401 | P0 |
| TC-SEC-021 | Missing Authorization header | Không gửi header | 401 | P0 |
| TC-SEC-022 | Cron secret brute force | Gửi nhiều secrets khác nhau | 403 mỗi lần | P1 |
| TC-SEC-023 | Session hijacking | Dùng token của user khác | Chỉ thấy data của token owner | P0 |
| TC-SEC-024 | CSRF protection | POST từ origin khác | Blocked (nếu có CSRF protection) | P1 |
| TC-SEC-025 | Rate limiting | Gửi 1000 requests/giây | 429 sau threshold | P1 |

---

## 16. CONCURRENCY & RACE CONDITION

| TC ID | Tên Test | Setup | Steps | Expected | Priority |
|-------|----------|-------|-------|----------|----------|
| TC-CONC-001 | 2 recruiters update cùng application | App pending | Cả 2 PATCH đồng thời | Chỉ 1 thành công, 1 conflict | P0 |
| TC-CONC-002 | Auto-reject + manual update đồng thời | App pending, deadline qua | Cron chạy + recruiter update | Không double reject/penalty | P0 |
| TC-CONC-003 | 2 cron instances chạy đồng thời | Apps quá hạn | 2 instances gọi cùng lúc | Advisory lock, chỉ 1 xử lý | P0 |
| TC-CONC-004 | Concurrent reputation updates | Score=100 | 2 sessions adjust -5 đồng thời | Score=90 (cả 2 apply) | P0 |
| TC-CONC-005 | Concurrent notification creation | Cùng idempotency_key | 2 sessions insert đồng thời | Chỉ 1 notification | P0 |
| TC-CONC-006 | Mark read + delete đồng thời | Notification tồn tại | Mark read + delete cùng lúc | Không crash | P1 |
| TC-CONC-007 | Candidate withdraw + recruiter update | App interview | Candidate withdraw + recruiter offer đồng thời | 1 thành công, 1 conflict | P0 |
| TC-CONC-008 | FOR UPDATE SKIP LOCKED | 3 apps, 1 locked | Auto-reject | Xử lý 2, skip 1 | P0 |
| TC-CONC-009 | Deadlock detection | 2 transactions lock chéo | Chạy đồng thời | 1 bị abort, không hang | P1 |
| TC-CONC-010 | Realtime + DB update đồng thời | Notification insert | Client subscribe + insert | Client nhận đúng 1 event | P0 |
| TC-CONC-011 | Email outbox concurrent processing | 2 workers | Process cùng email | Chỉ 1 gửi (idempotency) | P0 |
| TC-CONC-012 | Interview invitation confirm + cancel | Invitation pending | Candidate confirm + recruiter cancel đồng thời | 1 thắng | P1 |
| TC-CONC-013 | High volume auto-reject | 1000 apps quá hạn | Cron batch_size=100 | Xử lý đúng 100, không timeout | P1 |
| TC-CONC-014 | Reputation score consistency | Score=100 | 10 concurrent -1 | Score=90 | P0 |
| TC-CONC-015 | Notification count accuracy | 5 notifications | Mark 3 read + insert 2 đồng thời | Count chính xác | P1 |

---

## 17. INTEGRATION / E2E TESTS

### 17.1 Flow: Recruiter chốt ứng viên

| TC ID | Tên Test | Steps | Expected | Priority |
|-------|----------|-------|----------|----------|
| TC-E2E-001 | Full flow: pending -> interview + email | 1. Recruiter mở app detail 2. Click "Mời phỏng vấn" 3. Modal hiện 4. Check cả 2 checkboxes 5. Click Confirm | Status=interview, notification created, email queued | P0 |
| TC-E2E-002 | Candidate nhận notification realtime | Sau TC-E2E-001 | Candidate thấy notification trong bell | P0 |
| TC-E2E-003 | Candidate nhận email | Sau TC-E2E-001, worker chạy | Email gửi thành công | P0 |
| TC-E2E-004 | Recruiter không check confirm | Click Confirm không check | Error hiển thị, không submit | P0 |
| TC-E2E-005 | Recruiter check confirm, không check email | Check 1, Confirm | Status đổi, không có email | P0 |

### 17.2 Flow: Auto-reject + Reputation

| TC ID | Tên Test | Steps | Expected | Priority |
|-------|----------|-------|----------|----------|
| TC-E2E-006 | Full flow: CV quá hạn -> auto reject | 1. Candidate nộp CV 2. Chờ quá deadline 3. Cron chạy | App rejected, recruiter -5, candidate notified | P0 |
| TC-E2E-007 | Recruiter thấy notification bị trừ điểm | Sau TC-E2E-006 | Notification trong bell recruiter | P0 |
| TC-E2E-008 | Candidate thấy notification auto-reject | Sau TC-E2E-006 | Notification trong bell candidate | P0 |
| TC-E2E-009 | Reputation badge cập nhật | Sau TC-E2E-006 | Badge recruiter giảm | P1 |
| TC-E2E-010 | Recruiter phản hồi trước deadline | Recruiter update status trước deadline | Không auto-reject, deadline clear | P0 |

### 17.3 Flow: Candidate Violation

| TC ID | Tên Test | Steps | Expected | Priority |
|-------|----------|-------|----------|----------|
| TC-E2E-011 | Candidate withdraw sau interview | 1. App interview 2. Candidate withdraw | Score -10, notification | P0 |
| TC-E2E-012 | Candidate no-show interview | 1. Invitation confirmed 2. Recruiter mark no-show 3. Penalize function | Score -15, notification | P0 |
| TC-E2E-013 | Candidate confirm interview | 1. Invitation pending 2. Candidate confirm | Status=confirmed, responded_at set | P0 |
| TC-E2E-014 | Candidate decline interview | 1. Invitation pending 2. Candidate decline | Status=declined, không penalty | P0 |
| TC-E2E-015 | Recruiter cancel interview | 1. Invitation confirmed 2. Recruiter cancel | Status=cancelled, không penalty candidate | P0 |

### 17.4 Flow: Notification Lifecycle

| TC ID | Tên Test | Steps | Expected | Priority |
|-------|----------|-------|----------|----------|
| TC-E2E-016 | Notification -> Read -> Count update | 1. Nhận notification 2. Click bell 3. Click notification | Badge giảm, read_at set | P0 |
| TC-E2E-017 | Mark all as read | 1. Có 5 unread 2. Click "Đánh dấu tất cả" | Badge = 0 | P0 |
| TC-E2E-018 | Navigate từ notification | Click notification có link | Chuyển đến đúng trang | P0 |
| TC-E2E-019 | Notification persistence | Logout -> Login lại | Notifications vẫn còn | P0 |
| TC-E2E-020 | Realtime notification khi đang online | User A online, system tạo notification | Badge tăng ngay lập tức | P0 |

---

## 18. PERFORMANCE TESTS

| TC ID | Tên Test | Setup | Metric | Threshold | Priority |
|-------|----------|-------|--------|-----------|----------|
| TC-PERF-001 | GET /notifications response time | 1000 notifications/user | P95 latency | < 200ms | P0 |
| TC-PERF-002 | GET unread-count response time | 1000 notifications | P95 latency | < 100ms | P0 |
| TC-PERF-003 | POST mark-read response time | Mark 50 notifications | P95 latency | < 300ms | P0 |
| TC-PERF-004 | PATCH application status response time | Single application | P95 latency | < 500ms | P0 |
| TC-PERF-005 | Auto-reject 100 apps | 100 expired apps | Total time | < 5s | P0 |
| TC-PERF-006 | Auto-reject 500 apps | 500 expired apps | Total time | < 15s | P1 |
| TC-PERF-007 | Realtime notification delivery | Insert notification | Time to client | < 1s | P0 |
| TC-PERF-008 | Concurrent users receiving notifications | 100 users online | All receive | < 2s | P1 |
| TC-PERF-009 | adjust_reputation() execution time | Single call | Latency | < 50ms | P0 |
| TC-PERF-010 | create_notification() execution time | Single call | Latency | < 30ms | P0 |

### 18.1 Load Test Scenarios

| TC ID | Tên Test | Setup | Expected | Priority |
|-------|----------|-------|----------|----------|
| TC-PERF-011 | 50 concurrent status updates | 50 recruiters update đồng thời | Tất cả success hoặc conflict graceful | P1 |
| TC-PERF-012 | 100 concurrent notification reads | 100 users mark-read đồng thời | Không deadlock | P1 |
| TC-PERF-013 | 1000 notifications insert burst | Trigger tạo 1000 notifications | Không timeout, không mất | P1 |
| TC-PERF-014 | Database connection pool under load | 200 concurrent queries | Không exhaust pool | P1 |
| TC-PERF-015 | Memory usage under sustained load | 1 giờ continuous traffic | Không memory leak | P2 |

---

## 19. TEST DATA SETUP

### 19.1 Fixtures Required

```python
# =============================================================================
# FILE: backend/tests/conftest.py
# =============================================================================

import pytest
from uuid import uuid4
from datetime import datetime, timedelta, timezone


# =============================================================================
# USER FIXTURES
# =============================================================================

@pytest.fixture
def recruiter_user(db):
    """Recruiter thuộc company A"""
    user_id = uuid4()
    db.execute("""
        INSERT INTO profiles (id, email, full_name, role,
                              recruiter_reputation_score, candidate_reputation_score)
        VALUES (%s, 'recruiter@test.com', 'Recruiter A', 'recruiter', 100, 100)
    """, (str(user_id),))
    return {"id": str(user_id), "email": "recruiter@test.com"}


@pytest.fixture
def candidate_user(db):
    """Candidate"""
    user_id = uuid4()
    db.execute("""
        INSERT INTO profiles (id, email, full_name, role,
                              recruiter_reputation_score, candidate_reputation_score)
        VALUES (%s, 'candidate@test.com', 'Candidate A', 'candidate', 100, 100)
    """, (str(user_id),))
    return {"id": str(user_id), "email": "candidate@test.com"}


@pytest.fixture
def other_company_recruiter(db):
    """Recruiter thuộc company B (không có quyền trên company A)"""
    user_id = uuid4()
    db.execute("""
        INSERT INTO profiles (id, email, full_name, role,
                              recruiter_reputation_score, candidate_reputation_score)
        VALUES (%s, 'other_recruiter@test.com', 'Recruiter B', 'recruiter', 100, 100)
    """, (str(user_id),))
    return {"id": str(user_id), "email": "other_recruiter@test.com"}


@pytest.fixture
def inactive_recruiter(db, company_a):
    """Recruiter đã bị deactivate"""
    user_id = uuid4()
    db.execute("""
        INSERT INTO profiles (id, email, full_name, role)
        VALUES (%s, 'inactive@test.com', 'Inactive Recruiter', 'recruiter')
    """, (str(user_id),))
    db.execute("""
        INSERT INTO company_members (company_id, user_id, role, is_active)
        VALUES (%s, %s, 'recruiter', false)
    """, (company_a["id"], str(user_id)))
    return {"id": str(user_id)}


@pytest.fixture
def dual_role_user(db):
    """User vừa là recruiter vừa là candidate"""
    user_id = uuid4()
    db.execute("""
        INSERT INTO profiles (id, email, full_name, role,
                              recruiter_reputation_score, candidate_reputation_score)
        VALUES (%s, 'dual@test.com', 'Dual Role', 'recruiter', 100, 100)
    """, (str(user_id),))
    return {"id": str(user_id)}


# =============================================================================
# COMPANY & JOB FIXTURES
# =============================================================================

@pytest.fixture
def company_a(db, recruiter_user):
    """Company A"""
    company_id = uuid4()
    db.execute("""
        INSERT INTO companies (id, name) VALUES (%s, 'Company A')
    """, (str(company_id),))
    db.execute("""
        INSERT INTO company_members (company_id, user_id, role, is_active)
        VALUES (%s, %s, 'owner', true)
    """, (str(company_id), recruiter_user["id"]))
    return {"id": str(company_id), "name": "Company A"}


@pytest.fixture
def company_b(db, other_company_recruiter):
    """Company B"""
    company_id = uuid4()
    db.execute("""
        INSERT INTO companies (id, name) VALUES (%s, 'Company B')
    """, (str(company_id),))
    db.execute("""
        INSERT INTO company_members (company_id, user_id, role, is_active)
        VALUES (%s, %s, 'owner', true)
    """, (str(company_id), other_company_recruiter["id"]))
    return {"id": str(company_id), "name": "Company B"}


@pytest.fixture
def job_post_3days(db, company_a, recruiter_user):
    """Job với timeout mặc định 3 ngày"""
    job_id = uuid4()
    db.execute("""
        INSERT INTO job_posts (id, company_id, created_by_user_id, title,
                               time_max_until_response)
        VALUES (%s, %s, %s, 'Backend Developer', interval '3 days')
    """, (str(job_id), company_a["id"], recruiter_user["id"]))
    return {"id": str(job_id), "title": "Backend Developer"}


@pytest.fixture
def job_post_5days(db, company_a, recruiter_user):
    """Job với timeout 5 ngày"""
    job_id = uuid4()
    db.execute("""
        INSERT INTO job_posts (id, company_id, created_by_user_id, title,
                               time_max_until_response)
        VALUES (%s, %s, %s, 'Frontend Developer', interval '5 days')
    """, (str(job_id), company_a["id"], recruiter_user["id"]))
    return {"id": str(job_id), "title": "Frontend Developer"}


@pytest.fixture
def job_post_1day(db, company_a, recruiter_user):
    """Job với timeout 1 ngày (cho test nhanh)"""
    job_id = uuid4()
    db.execute("""
        INSERT INTO job_posts (id, company_id, created_by_user_id, title,
                               time_max_until_response)
        VALUES (%s, %s, %s, 'Urgent Position', interval '1 day')
    """, (str(job_id), company_a["id"], recruiter_user["id"]))
    return {"id": str(job_id), "title": "Urgent Position"}


# =============================================================================
# APPLICATION FIXTURES
# =============================================================================

@pytest.fixture
def resume(db, candidate_user):
    """Resume của candidate"""
    resume_id = uuid4()
    db.execute("""
        INSERT INTO resumes (id, user_id, title)
        VALUES (%s, %s, 'My Resume')
    """, (str(resume_id), candidate_user["id"]))
    return {"id": str(resume_id)}


@pytest.fixture
def app_pending(db, job_post_3days, candidate_user, resume):
    """Application status=pending, deadline trong tương lai"""
    app_id = uuid4()
    db.execute("""
        INSERT INTO applications (id, job_post_id, applicant_user_id, resume_id,
                                  current_status, applied_at, response_deadline_at)
        VALUES (%s, %s, %s, %s, 'pending', now(), now() + interval '2 days')
    """, (str(app_id), job_post_3days["id"], candidate_user["id"], resume["id"]))
    return {
        "id": str(app_id),
        "job_post_id": job_post_3days["id"],
        "applicant_user_id": candidate_user["id"],
        "current_status": "pending",
    }


@pytest.fixture
def app_pending_expired(db, job_post_3days, candidate_user, resume, recruiter_user):
    """Application status=pending, deadline ĐÃ QUA"""
    app_id = uuid4()
    db.execute("""
        INSERT INTO applications (id, job_post_id, applicant_user_id, resume_id,
                                  current_status, applied_at, response_deadline_at)
        VALUES (%s, %s, %s, %s, 'pending', now() - interval '5 days', now() - interval '2 days')
    """, (str(app_id), job_post_3days["id"], candidate_user["id"], resume["id"]))
    return {
        "id": str(app_id),
        "job_post_id": job_post_3days["id"],
        "applicant_user_id": candidate_user["id"],
        "recruiter_user_id": recruiter_user["id"],
        "current_status": "pending",
    }


@pytest.fixture
def app_screening(db, job_post_3days, candidate_user, resume):
    """Application status=screening"""
    app_id = uuid4()
    db.execute("""
        INSERT INTO applications (id, job_post_id, applicant_user_id, resume_id,
                                  current_status, applied_at, reviewed_at)
        VALUES (%s, %s, %s, %s, 'screening', now() - interval '2 days', now() - interval '1 day')
    """, (str(app_id), job_post_3days["id"], candidate_user["id"], resume["id"]))
    return {
        "id": str(app_id),
        "applicant_user_id": candidate_user["id"],
        "current_status": "screening",
    }


@pytest.fixture
def app_interview(db, job_post_3days, candidate_user, resume):
    """Application status=interview"""
    app_id = uuid4()
    db.execute("""
        INSERT INTO applications (id, job_post_id, applicant_user_id, resume_id,
                                  current_status, applied_at, reviewed_at)
        VALUES (%s, %s, %s, %s, 'interview', now() - interval '5 days', now() - interval '3 days')
    """, (str(app_id), job_post_3days["id"], candidate_user["id"], resume["id"]))
    return {
        "id": str(app_id),
        "applicant_user_id": candidate_user["id"],
        "current_status": "interview",
    }


@pytest.fixture
def app_offer(db, job_post_3days, candidate_user, resume):
    """Application status=offer"""
    app_id = uuid4()
    db.execute("""
        INSERT INTO applications (id, job_post_id, applicant_user_id, resume_id,
                                  current_status, applied_at, reviewed_at)
        VALUES (%s, %s, %s, %s, 'offer', now() - interval '7 days', now() - interval '5 days')
    """, (str(app_id), job_post_3days["id"], candidate_user["id"], resume["id"]))
    return {
        "id": str(app_id),
        "applicant_user_id": candidate_user["id"],
        "current_status": "offer",
    }


@pytest.fixture
def app_accepted(db, job_post_3days, candidate_user, resume):
    """Application status=accepted (terminal)"""
    app_id = uuid4()
    db.execute("""
        INSERT INTO applications (id, job_post_id, applicant_user_id, resume_id,
                                  current_status, applied_at, reviewed_at)
        VALUES (%s, %s, %s, %s, 'accepted', now() - interval '10 days', now() - interval '7 days')
    """, (str(app_id), job_post_3days["id"], candidate_user["id"], resume["id"]))
    return {
        "id": str(app_id),
        "applicant_user_id": candidate_user["id"],
        "current_status": "accepted",
    }


@pytest.fixture
def app_rejected(db, job_post_3days, candidate_user, resume):
    """Application status=rejected (terminal)"""
    app_id = uuid4()
    db.execute("""
        INSERT INTO applications (id, job_post_id, applicant_user_id, resume_id,
                                  current_status, applied_at, reviewed_at)
        VALUES (%s, %s, %s, %s, 'rejected', now() - interval '10 days', now() - interval '7 days')
    """, (str(app_id), job_post_3days["id"], candidate_user["id"], resume["id"]))
    return {
        "id": str(app_id),
        "applicant_user_id": candidate_user["id"],
        "current_status": "rejected",
    }


@pytest.fixture
def app_withdrawn(db, job_post_3days, candidate_user, resume):
    """Application status=withdrawn (terminal)"""
    app_id = uuid4()
    db.execute("""
        INSERT INTO applications (id, job_post_id, applicant_user_id, resume_id,
                                  current_status, applied_at, withdrawn_at)
        VALUES (%s, %s, %s, %s, 'withdrawn', now() - interval '5 days', now() - interval '1 day')
    """, (str(app_id), job_post_3days["id"], candidate_user["id"], resume["id"]))
    return {
        "id": str(app_id),
        "applicant_user_id": candidate_user["id"],
        "current_status": "withdrawn",
    }


# =============================================================================
# INTERVIEW INVITATION FIXTURES
# =============================================================================

@pytest.fixture
def interview_invitation_pending(db, app_interview, recruiter_user):
    """Interview invitation status=pending"""
    inv_id = uuid4()
    db.execute("""
        INSERT INTO interview_invitations (id, application_id, scheduled_at,
                                           status, created_by_user_id, response_deadline_at)
        VALUES (%s, %s, now() + interval '3 days', 'pending', %s, now() + interval '1 day')
    """, (str(inv_id), app_interview["id"], recruiter_user["id"]))
    return {
        "id": str(inv_id),
        "application_id": app_interview["id"],
        "status": "pending",
    }


@pytest.fixture
def interview_invitation_no_show(db, app_interview, recruiter_user):
    """Interview invitation status=no_show"""
    inv_id = uuid4()
    db.execute("""
        INSERT INTO interview_invitations (id, application_id, scheduled_at,
                                           status, created_by_user_id)
        VALUES (%s, %s, now() - interval '1 day', 'no_show', %s)
    """, (str(inv_id), app_interview["id"], recruiter_user["id"]))
    return {
        "id": str(inv_id),
        "application_id": app_interview["id"],
        "status": "no_show",
    }


# =============================================================================
# NOTIFICATION FIXTURES
# =============================================================================

@pytest.fixture
def unread_notifications(db, candidate_user):
    """5 unread notifications cho candidate"""
    notifs = []
    for i in range(5):
        notif_id = uuid4()
        db.execute("""
            INSERT INTO notifications (id, user_id, notification_type, title, message, is_read)
            VALUES (%s, %s, 'application_status_changed', %s, %s, false)
        """, (str(notif_id), candidate_user["id"], f'Title {i}', f'Message {i}'))
        notifs.append({"id": str(notif_id), "is_read": False})
    return notifs


@pytest.fixture
def mixed_notifications(db, candidate_user):
    """3 unread + 2 read notifications"""
    notifs = []
    for i in range(3):
        notif_id = uuid4()
        db.execute("""
            INSERT INTO notifications (id, user_id, notification_type, title, message, is_read)
            VALUES (%s, %s, 'application_status_changed', %s, %s, false)
        """, (str(notif_id), candidate_user["id"], f'Unread {i}', f'Msg {i}'))
        notifs.append({"id": str(notif_id), "is_read": False})
    for i in range(2):
        notif_id = uuid4()
        db.execute("""
            INSERT INTO notifications (id, user_id, notification_type, title, message, is_read, read_at)
            VALUES (%s, %s, 'application_status_changed', %s, %s, true, now())
        """, (str(notif_id), candidate_user["id"], f'Read {i}', f'Msg {i}'))
        notifs.append({"id": str(notif_id), "is_read": True})
    return notifs


# =============================================================================
# AUTH TOKEN FIXTURES
# =============================================================================

@pytest.fixture
def recruiter_token(recruiter_user):
    """JWT token cho recruiter"""
    return generate_test_jwt(user_id=recruiter_user["id"], role="authenticated")


@pytest.fixture
def candidate_token(candidate_user):
    """JWT token cho candidate"""
    return generate_test_jwt(user_id=candidate_user["id"], role="authenticated")


@pytest.fixture
def other_recruiter_token(other_company_recruiter):
    """JWT token cho recruiter company B"""
    return generate_test_jwt(user_id=other_company_recruiter["id"], role="authenticated")


@pytest.fixture
def inactive_recruiter_token(inactive_recruiter):
    """JWT token cho inactive recruiter"""
    return generate_test_jwt(user_id=inactive_recruiter["id"], role="authenticated")


@pytest.fixture
def expired_token(recruiter_user):
    """JWT token hết hạn"""
    return generate_test_jwt(
        user_id=recruiter_user["id"],
        role="authenticated",
        exp=datetime.now(timezone.utc) - timedelta(hours=1)
    )


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def generate_test_jwt(user_id: str, role: str, exp=None) -> str:
    """Generate JWT token cho testing"""
    import jwt
    payload = {
        "sub": user_id,
        "role": role,
        "exp": exp or datetime.now(timezone.utc) + timedelta(hours=24),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, "test-secret-key", algorithm="HS256")


def get_notification(db, notification_id: str) -> dict:
    """Helper: Lấy notification từ DB"""
    result = db.execute(
        "SELECT * FROM notifications WHERE id = %s", (notification_id,)
    ).fetchone()
    return dict(result) if result else None


def get_notifications_by_user(db, user_id: str) -> list:
    """Helper: Lấy tất cả notifications của user"""
    results = db.execute(
        "SELECT * FROM notifications WHERE user_id = %s ORDER BY created_at DESC",
        (user_id,)
    ).fetchall()
    return [dict(r) for r in results]


def get_profile(db, user_id: str) -> dict:
    """Helper: Lấy profile"""
    result = db.execute(
        "SELECT * FROM profiles WHERE id = %s", (user_id,)
    ).fetchone()
    return dict(result) if result else None


def get_reputation_events(db, user_id: str, reason: str = None) -> list:
    """Helper: Lấy reputation events"""
    query = "SELECT * FROM reputation_events WHERE user_id = %s"
    params = [user_id]
    if reason:
        query += " AND reason = %s"
        params.append(reason)
    query += " ORDER BY created_at DESC"
    results = db.execute(query, params).fetchall()
    return [dict(r) for r in results]


def get_email_outbox_by_key(db, idempotency_key: str) -> dict:
    """Helper: Lấy email từ outbox theo idempotency key"""
    result = db.execute(
        "SELECT * FROM email_outbox WHERE idempotency_key = %s", (idempotency_key,)
    ).fetchone()
    return dict(result) if result else None


def get_application(db, app_id: str) -> dict:
    """Helper: Lấy application"""
    result = db.execute(
        "SELECT * FROM applications WHERE id = %s", (app_id,)
    ).fetchone()
    return dict(result) if result else None
```

---

## 20. ENVIRONMENT CONFIGURATION

### 20.1 Test Environments

| Environment | Purpose | Database | Cron |
|-------------|---------|----------|------|
| Local | Unit tests | Docker Postgres | Disabled |
| CI | Integration tests | Ephemeral Supabase | Mock |
| Staging | E2E tests | Staging Supabase | Enabled (manual) |
| Production | Smoke tests | Production (read-only) | Enabled |

### 20.2 Environment Variables

```bash
# .env.test
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
CRON_SECRET=test-cron-secret-key-2026
JWT_SECRET=test-secret-key
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
```

### 20.3 Docker Compose cho Local Testing

```yaml
# docker-compose.test.yml
version: '3.8'
services:
  db:
    image: supabase/postgres:15.1.1.060
    ports:
      - "54322:5432"
    environment:
      POSTGRES_PASSWORD: postgres
    volumes:
      - ./supabase/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - SUPABASE_URL=http://db:5432
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - CRON_SECRET=${CRON_SECRET}
    depends_on:
      db:
        condition: service_healthy
```

---

## 21. EXECUTION PLAN

### 21.1 Test Execution Order

```
Phase 1: Database Unit Tests (Chạy đầu tiên, không phụ thuộc API)
├── 1.1 Migration validation
├── 1.2 adjust_reputation()
├── 1.3 protect_reputation_scores() trigger
├── 1.4 create_notification()
├── 1.5 handle_application_deadline() trigger
├── 1.6 auto_reject_expired_applications()
├── 1.7 penalize_candidate_withdrawal() trigger
├── 1.8 penalize_interview_no_show()
└── 1.9 Notification triggers

Phase 2: Backend API Tests (Phụ thuộc Phase 1)
├── 2.1 Application status API
├── 2.2 Notification API
├── 2.3 Reputation API
├── 2.4 Cron endpoint
└── 2.5 Security tests

Phase 3: Frontend Unit Tests (Không phụ thuộc backend)
├── 3.1 NotificationBell
├── 3.2 ApplicationStatusModal
└── 3.3 ReputationBadge

Phase 4: Integration Tests (Phụ thuộc Phase 1 + 2)
├── 4.1 Recruiter confirm flow
├── 4.2 Auto-reject flow
├── 4.3 Candidate violation flow
└── 4.4 Notification lifecycle

Phase 5: Performance & Concurrency (Chạy cuối)
├── 5.1 Load tests
├── 5.2 Concurrency tests
└── 5.3 Stress tests
```

### 21.2 CI/CD Pipeline Integration

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  database-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: supabase/postgres:15.1.1.060
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 54322:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - name: Run migrations
        run: |
          for f in supabase/migrations/*.sql; do
            psql -h localhost -p 54322 -U postgres -f "$f"
          done
      - name: Run database tests
        run: |
          psql -h localhost -p 54322 -U postgres -f supabase/tests/run_all_tests.sql

  backend-tests:
    runs-on: ubuntu-latest
    needs: database-tests
    steps:
      - uses: actions/checkout@v4
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: pip install -r backend/requirements.txt -r backend/requirements-test.txt
      - name: Run pytest
        run: |
          cd backend
          pytest tests/ -v --tb=short --junitxml=results.xml \
            --cov=app --cov-report=xml --cov-fail-under=80
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: cd frontend && npm ci
      - name: Run tests
        run: cd frontend && npm test -- --coverage --watchAll=false
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    needs: [backend-tests, frontend-tests]
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - name: Start services
        run: docker-compose -f docker-compose.test.yml up -d
      - name: Wait for services
        run: sleep 10
      - name: Run E2E tests
        run: |
          cd backend
          pytest tests/integration/ -v --tb=short
      - name: Cleanup
        run: docker-compose -f docker-compose.test.yml down -v

  performance-tests:
    runs-on: ubuntu-latest
    needs: integration-tests
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Run performance tests
        run: |
          cd backend
          pytest tests/performance/ -v --tb=short
```

---

## 22. TEST COVERAGE MATRIX

### 22.1 Requirement Traceability

| Requirement | Test Cases | Coverage |
|-------------|-----------|----------|
| Recruiter đổi status pending/screening -> interview | TC-API-APP-002, TC-API-APP-004, TC-FE-ASM-* | ✅ Full |
| Dialog xác nhận 2 checkboxes | TC-FE-ASM-006 to TC-FE-ASM-012 | ✅ Full |
| Gửi email thông báo cho ứng viên | TC-API-APP-028 to TC-API-APP-031 | ✅ Full |
| Recruiter nhận thông báo CV mới | TC-DB-NTF-*, TC-NOTIF-001 | ✅ Full |
| Candidate nhận thông báo status change | TC-DB-NTF-011 to TC-DB-NTF-014, TC-NOTIF-002 | ✅ Full |
| Realtime notification | TC-FE-NB-021, TC-FE-NB-022, TC-API-NTF-025 to 028 | ✅ Full |
| Email notification | TC-DB-EO-*, TC-API-APP-028 | ✅ Full |
| Timeout tự động reject | TC-DB-AR-001 to TC-DB-AR-020 | ✅ Full |
| Trừ điểm recruiter khi timeout | TC-DB-REP-011, TC-DB-AR-004 | ✅ Full |
| Candidate vi phạm bị trừ điểm | TC-DB-CV-001 to TC-DB-CV-015 | ✅ Full |
| Điểm uy tín hiển thị trên profile | TC-FE-RB-*, TC-API-REP-001 | ✅ Full |
| Audit trail đầy đủ | TC-DB-REP-021, TC-API-REP-003, TC-API-REP-012 | ✅ Full |
| Idempotency | TC-DB-REP-015, TC-DB-NTF-002, TC-DB-AR-009, TC-DB-CV-015 | ✅ Full |
| Security (service_role only) | TC-SEC-005 to TC-SEC-014 | ✅ Full |
| Race condition handling | TC-CONC-001 to TC-CONC-015 | ✅ Full |

### 22.2 Priority Distribution

| Priority | Count | Percentage | Target Completion |
|----------|-------|------------|-------------------|
| P0 (Critical) | 198 | 69% | Sprint 1 |
| P1 (Important) | 62 | 22% | Sprint 2 |
| P2 (Nice to have) | 27 | 9% | Sprint 3 |

---

## 23. EXIT CRITERIA

### 23.1 Test Pass Criteria

| Metric | Threshold | Blocking |
|--------|-----------|----------|
| P0 tests pass rate | 100% | ✅ Yes |
| P1 tests pass rate | ≥ 95% | ✅ Yes |
| P2 tests pass rate | ≥ 80% | ❌ No |
| Code coverage (backend) | ≥ 80% | ✅ Yes |
| Code coverage (frontend) | ≥ 70% | ✅ Yes |
| Security tests pass | 100% | ✅ Yes |
| Performance tests pass | ≥ 90% | ❌ No |
| Zero critical bugs open | 0 | ✅ Yes |

### 23.2 Sign-off Checklist

- [ ] Tất cả P0 tests pass
- [ ] Tất cả security tests pass
- [ ] Không có race condition chưa xử lý
- [ ] Idempotency verified cho tất cả operations
- [ ] RLS policies verified
- [ ] Function permissions verified (service_role only)
- [ ] Trigger protection verified
- [ ] Realtime subscription hoạt động
- [ ] Email outbox hoạt động
- [ ] Cron job hoạt động đúng schedule
- [ ] Performance trong ngưỡng cho phép
- [ ] Audit trail đầy đủ
- [ ] Rollback plan tested

---

## 24. RISK & MITIGATION IN TESTING

| Risk | Impact | Mitigation |
|------|--------|------------|
| Flaky tests do timing | False failures | Dùng `waitFor` với timeout, retry logic |
| Database state leak giữa tests | Wrong assertions | Transaction rollback sau mỗi test |
| Realtime test không ổn định | False failures | Mock realtime trong unit tests, chỉ test real trong E2E |
| Cron test phụ thuộc thời gian | Timeout | Dùng time mocking / travel |
| Concurrent tests không deterministic | Race conditions | Chạy nhiều lần (≥10), dùng barriers |
| Email test cần external service | Dependency | Mock email service, chỉ test outbox |

---

## 25. APPENDIX

### A. Status Transition Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │                                             │
                    ▼                                             │
┌─────────┐   ┌───────────┐   ┌───────────┐   ┌───────┐   ┌──────────┐
│ pending │──▶│ screening │──▶│ interview │──▶│ offer │──▶│ accepted │
└────┬────┘   └─────┬─────┘   └─────┬─────┘   └───┬───┘   └──────────┘
     │              │               │              │        (terminal)
     │              │               │              │
     ▼              ▼               ▼              ▼
┌──────────┐  ┌──────────┐   ┌──────────┐  ┌──────────┐
│ rejected │  │ rejected │   │ rejected │  │ rejected │
└──────────┘  └──────────┘   └──────────┘  └──────────┘
  (terminal)    (terminal)     (terminal)    (terminal)

     ┌───────────────────────────────────────────────────────────┐
     │  Từ interview/offer: candidate có thể withdraw            │
     │  → Status = 'withdrawn' (terminal) + penalty -10          │
     └───────────────────────────────────────────────────────────┘

     ┌───────────────────────────────────────────────────────────┐
     │  Từ pending: auto-reject nếu quá deadline                 │
     │  → Status = 'rejected' + recruiter penalty -5             │
     └───────────────────────────────────────────────────────────┘
```

### B. Reputation Penalty Table

| Action | Role | Points | Idempotency Key Format |
|--------|------|--------|------------------------|
| Recruiter timeout | recruiter | -5 | `recruiter_timeout:{application_id}` |
| Candidate withdraw từ interview | candidate | -10 | `candidate_interview_withdrawal:{application_id}` |
| Candidate withdraw từ offer | candidate | -10 | `candidate_interview_withdrawal:{application_id}` |
| Candidate no-show | candidate | -15 | `candidate_no_show:{invitation_id}` |
| Admin adjustment | both | ±N | `admin_adjustment:{event_id}` |

### C. Notification Types

| Type | Recipient | Trigger |
|------|-----------|---------|
| `application_submitted` | Recruiter(s) | Candidate nộp CV |
| `application_status_changed` | Candidate | Recruiter đổi status |
| `interview_scheduled` | Candidate | Recruiter tạo invitation |
| `application_auto_rejected` | Candidate | Cron auto-reject |
| `reputation_decreased` | User | Bị trừ điểm |
| `reputation_increased` | User | Được cộng điểm |
| `interview_reminder` | Candidate | Trước giờ phỏng vấn |

### D. Idempotency Key Format Convention

```
{event_type}:{primary_entity_id}:{context}

Examples:
- application_submitted:{application_id}:recruiter:{recruiter_user_id}
- application_status_changed:{application_id}:{old_status}:{new_status}
- application_auto_rejected:{application_id}
- recruiter_timeout:{application_id}
- candidate_interview_withdrawal:{application_id}
- candidate_no_show:{invitation_id}
- reputation_decreased:{reason}:{entity_id}
- application_status_email:{application_id}:{new_status}
```

---

**END OF TEST PLAN**

---

*Document generated: 2026-08-30*  
*Total test cases: 287*  
*Estimated execution time: 3-4 ngày (manual), 45 phút (automated CI)*