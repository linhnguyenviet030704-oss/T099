# Rule kiểm thử và Definition of Done

## 1. Nguyên tắc chung

- Chạy test nhỏ nhất có liên quan trước, sau đó mở rộng theo rủi ro.
- Mọi bug fix phải có regression test fail trước hoặc ít nhất chứng minh test mới chạm đúng lỗi.
- Mock ở boundary provider/network; không mock mất phần logic đang cần kiểm tra.
- Test không phụ thuộc thứ tự, thời gian thật, network thật hoặc secret trừ suite integration được gắn nhãn rõ.
- Không sửa/xóa test ngoài phạm vi chỉ để suite xanh.
- Không coi linter/compile pass là bằng chứng guardrail/eval đúng.

## 2. Ma trận theo loại thay đổi

### Backend thuần deterministic

Chạy test file/module liên quan, rồi tối thiểu:

```powershell
.\.venv\Scripts\python.exe -m pytest tests backend/tests -q
.\.venv\Scripts\python.exe -m ruff check backend tests evaluation
```

Nếu repo đang có lỗi nền ngoài phạm vi, ghi chính xác lỗi và vẫn chạy targeted tests của thay đổi.

### Frontend

Tuân thủ thêm `frontend/AGENTS.md`, rồi chạy:

```powershell
Set-Location frontend
pnpm lint
pnpm build
```

Thay đổi auth/permission/error handling cần test hoặc manual verification cho 401/403/429/5xx và không lộ dữ liệu.

### Supabase migration/RLS

- Review SQL, policy allow/deny, function security definer/search path, grants và rollback/forward fix.
- Chạy reset trên database local/ephemeral khi an toàn; không reset database có dữ liệu người dùng mà chưa được phép.
- Test candidate/recruiter/admin, đúng owner/sai owner, đúng company/sai company và anonymous.
- Kiểm tra frontend anon key không đọc được bảng nội bộ như embeddings/match evidence nhạy cảm.

### Prompt/model/agent/retrieval/ranking

- Unit test schema, routing, node, fallback và deterministic components.
- Chạy smoke eval nhỏ để bắt lỗi kỹ thuật nếu có key/ngân sách.
- Chạy full representative eval trước khi kết luận chất lượng hoặc merge thay đổi hành vi lớn.
- So sánh baseline/candidate và kiểm tra hard gate tại `20-evaluation-va-benchmark.md`.

### Guardrail

- Test positive, negative, boundary, adversarial, cross-tenant và failure injection.
- Đo false positive/refusal trên input hợp lệ.
- Test guardrail ở đúng boundary thật: trước provider, sau output và trước persistence.
- Chứng minh log/error/report không chứa secret/PII.

### Eval framework/metric

- Unit test metric bằng ví dụ nhỏ tính tay, gồm empty list, k lớn hơn pool, no relevant, ties, NaN/inf và missing sample.
- Test manifest/hash/cache invalidation.
- Test parse error/judge error không bị tính âm thầm thành pass.
- Golden-file test chỉ dùng cho format ổn định; không cập nhật snapshot mà chưa review semantic diff.
- Khi sửa thước đo, chạy lại cả baseline và candidate bằng thước đo mới; không so điểm metric phiên bản cũ với mới.

## 3. Definition of Done cho guardrail

Một thay đổi guardrail chỉ hoàn thành khi:

- Threat/risk và trust boundary được mô tả.
- Enforcement nằm ở layer đúng và fail-safe.
- Có error/decision code ổn định, quan sát được nhưng không lộ PII.
- Có test efficacy và utility preservation.
- Cross-tenant, retry, fallback và concurrency được xem xét.
- Safety suite đạt hard gate.
- Tài liệu/config/runbook được cập nhật nếu vận hành thay đổi.
- Nêu giới hạn còn lại; không dùng từ “an toàn tuyệt đối”.

## 4. Definition of Done cho eval

Một thay đổi eval chỉ hoàn thành khi:

- Dataset manifest và nhãn có nguồn gốc/version.
- Metric formula, threshold, direction và denominator được ghi rõ.
- Metric có unit test và được kiểm tra bằng case tính tay.
- Run có metadata tái lập và cache key đúng.
- Baseline/candidate chạy cùng điều kiện.
- Có overall, slices, worst failures, safety gates, latency/cost và limitations.
- Không chứa PII/secret trong cache/report được commit.
- Kết luận dựa trên số thực chạy, có đường dẫn artifact và commit/config tương ứng.

## 5. Definition of Done cho thay đổi matching

- Không phá authz/RLS hoặc lộ CV ứng viên ngoài phạm vi recruiter được phép.
- Constraint partition và tie-break deterministic.
- Không dùng protected attribute/proxy không được phê duyệt.
- Retrieval recall và ranking quality được đo riêng ở cả chiều liên quan.
- Explanation grounded, không thay score và có fallback.
- Config/threshold/weight được version hóa và audit được.
- Regression budget đạt, không có slice quan trọng suy giảm chưa giải thích.

## 6. Nội dung bàn giao của agent

Khi hoàn tất, agent phải báo ngắn gọn:

- File/hành vi đã thay đổi.
- Guardrail/eval rule nào ảnh hưởng quyết định thiết kế.
- Test/eval đã chạy và kết quả thực tế.
- Test/eval chưa chạy vì key, network, chi phí hoặc môi trường.
- Rủi ro/giới hạn còn lại và bước tiếp theo cần thiết.

Không nói “đã kiểm tra đầy đủ”, “production-ready” hoặc “không có regression” nếu chưa chạy suite tương ứng.
