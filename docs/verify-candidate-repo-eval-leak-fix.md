# Manual verification — Candidate cannot browse job applications

## Setup
- 3 test users in Supabase:
  - candidate@example.com / password (role=candidate)
  - recruiter@example.com / password (role=recruiter)
  - admin@example.com / password (role=admin)
- Backend running on http://localhost:8000
- Frontend running on http://localhost:3000

## Steps

### 1. Sign in as candidate
- Navigate to /login
- Sign in with candidate credentials
- Verify Navbar shows candidate role badge

### 2. Navigate to /repo-evaluation
Expected:
- Tab "Nghiên cứu từ CV (AI CV Repo Agent)" is active by default
- Inside the CV tab, "Kho CV cá nhân" is selected by default
- Button "1. Ứng viên nộp vào Job đã đăng" is NOT visible
- Open browser DevTools → Network tab → reload page

### 3. Network verification (candidate)
Expected requests:
- `GET /rest/v1/profiles?id=eq.<uuid>` (ProfileProvider)
- `GET /rest/v1/resumes?user_id=eq.<uuid>` (CV vault)
- `GET /api/v1/evaluations/history?user_id=<self>` (history load)

Forbidden requests:
- `GET /rest/v1/job_posts?created_by_user_id=eq.<uuid>` (loadRecruiterJobs) — MUST NOT APPEAR
- `GET /rest/v1/job_submits?job_post_id=in.(...)` (loadJobApplications) — MUST NOT APPEAR

### 4. Direct URL evaluation still works (candidate)
- In /repo-evaluation, click tab "Nhập trực tiếp URL Repository"
- Enter `https://github.com/fastapi/fastapi`
- Click "Đánh giá trực tiếp"
Expected:
- Evaluation completes normally
- Result appears in "Danh sách Repository Đã Nghiên Cứu"

### 5. Sign out, sign in as recruiter
- Navigate to /repo-evaluation

Expected:
- Button "1. Ứng viên nộp vào Job đã đăng" IS visible
- Selecting it shows the JD dropdown
- Selecting a JD shows the submitted CVs for that JD (recruiter workflow)

### 6. Sign in as admin
- Navigate to /repo-evaluation

Expected:
- Same UI as recruiter (admins can browse all job applications)

### 7. Defense-in-depth check (candidate)
- As candidate, in DevTools console run:
  ```js
  // simulate DevTools manipulation
  // this is hard to do directly; instead check API call attempts
  ```
- Alternatively: directly call `POST /api/v1/evaluations/evaluate-single` with a `candidate_id` belonging to someone else using the candidate's JWT
  - Expect 403 Forbidden

## Sign-off
- [ ] Candidate cannot see "Ứng viên nộp vào Job đã đăng" tab
- [ ] Network shows no `job_submits` calls for candidate
- [ ] Candidate can still evaluate URLs directly (research flow preserved)
- [ ] Recruiter view unchanged
- [ ] Admin view unchanged
- [ ] Defense-in-depth: backend rejects candidate evaluating other candidates
