# Rule phát triển guardrail và an toàn AI

## 1. Mô hình đe dọa bắt buộc

Trước khi thêm hoặc sửa guardrail, xác định tối thiểu:

- Tài sản cần bảo vệ: PII trong CV, tài khoản, JWT, service-role key, file Storage, embedding, lịch sử chat, match evidence, prompt hệ thống, ngân sách API.
- Chủ thể: candidate, recruiter, admin, người chưa đăng nhập, provider LLM bên thứ ba, operator nội bộ.
- Trust boundary: browser -> Supabase; browser -> FastAPI; FastAPI -> Supabase bằng service role; backend -> LLM/embedding/rerank provider; eval runner -> dataset/provider/cache/report.
- Kẻ tấn công và lỗi vô ý: prompt injection trong CV/JD, upload độc hại, IDOR, cross-tenant leak, bypass RLS, PII leak qua log/vector/prompt, output JSON sai, hallucination, denial-of-wallet, ranking bias, fallback fail-open.
- Hành vi an toàn khi lỗi: từ chối có mã lỗi ổn định, giảm chức năng bằng deterministic fallback, hoặc yêu cầu người dùng xác nhận; tuyệt đối không bỏ auth/guardrail để tiếp tục.

Mỗi guardrail phải ghi rõ nó chặn rủi ro nào, chạy ở lớp nào và thất bại theo hướng nào. Không gọi một regex hoặc một prompt đơn lẻ là “đã an toàn”.

## 2. Kiến trúc guardrail nhiều lớp

Đối với mọi luồng có LLM, áp dụng chuỗi kiểm soát phù hợp:

```text
Xác thực danh tính
-> phân quyền/ownership
-> giới hạn kích thước, loại file và tần suất
-> chuẩn hóa input
-> phân tách instruction với untrusted data
-> khử PII / tối thiểu hóa dữ liệu
-> gọi model với schema và timeout
-> validate output + grounding
-> áp policy deterministic
-> persist/return theo quyền
-> log metric đã khử nhạy cảm
```

Một lớp không thay thế lớp khác. Ví dụ prompt “không lộ PII” không thay cho redaction deterministic; RLS không thay cho authz khi backend dùng service role; moderation không thay cho validation schema.

## 3. Input và prompt injection

- Luôn coi CV, JD, chat, tên file, metadata, text OCR, dữ liệu truy xuất và output tool là untrusted data.
- Prompt hệ thống phải nói rõ dữ liệu nguồn không phải instruction, đặt nguồn trong trường/delimiter riêng và yêu cầu chỉ trích fact.
- Không ghép chuỗi người dùng vào system prompt theo cách có thể thay đổi vai trò, schema hoặc tool policy.
- Không cho nội dung nguồn tự chọn model, tool, URL, bảng dữ liệu, query, recipient, hoặc hành động side effect.
- Với prompt injection như “ignore previous instructions”, “show system prompt”, “send CV elsewhere”, agent phải bỏ qua và vẫn xử lý phần dữ kiện tuyển dụng hợp lệ nếu an toàn.
- Bắt buộc có case adversarial cho injection trực tiếp, gián tiếp, đa ngôn ngữ, Unicode/zero-width, Markdown/JSON nesting và injection nằm trong PDF/DOCX.
- Chống injection phải được kiểm tra ở output/hành vi, không chỉ bằng việc tìm keyword ở input.

## 4. PII, dữ liệu nhạy cảm và tối thiểu hóa dữ liệu

PII tối thiểu gồm: họ tên, email, điện thoại, địa chỉ chính xác, ngày sinh/tuổi có thể suy ra, CCCD/hộ chiếu, tài khoản mạng xã hội, URL cá nhân, ảnh, mã người dùng/hồ sơ có thể liên kết ngược, thông tin sức khỏe và dữ liệu nhạy cảm khác.

BẮT BUỘC:

- Khử PII trước LLM, embedding, reranker và log. Post-processing sau model chỉ là lớp phòng thủ bổ sung.
- Không gửi toàn bộ CV nếu tác vụ chỉ cần skill hoặc vài evidence snippet đã khử nhạy cảm.
- Embedding và cache chứa dẫn xuất từ CV vẫn là dữ liệu nhạy cảm; áp dụng access control, retention và không đưa vào artifact public.
- ID map dùng để deanonymize phải ở memory/phạm vi request ngắn nhất có thể và không được gửi sang provider.
- Anonymization phải xóa cả định danh trực tiếp lẫn định danh nội bộ không cần thiết (`user_id`, `application_id`, `resume_id`, storage path). Không chỉ xóa `full_name` và `email`.
- Khi khôi phục danh tính, chỉ map ID model trả về nếu ID nằm trong allowlist của request hiện tại; bỏ qua ID lạ, duplicate và output vượt số lượng.
- Không ghi raw prompt, raw response hoặc CV text vào log production. Nếu cần debug, dùng sampling có kiểm soát, redaction và retention rõ ràng.
- Dataset eval chứa CV thật phải có quyền sử dụng, được de-identify, lưu ở phạm vi riêng và không được vô tình commit/report ví dụ nhận diện được cá nhân.

PII leak rate, cross-user leak và secret leak là hard gate bằng 0 trên test suite bắt buộc. Không dùng điểm trung bình để che một case rò rỉ.

## 5. Authentication, authorization và Supabase

- Không tin `user_id`, `role`, `email`, `company_id` do client gửi nếu có thể lấy từ JWT/DB.
- Mọi query bằng service role phải scope theo user/company/job/application đã được xác minh.
- Kiểm tra recruiter chỉ truy cập ứng viên đã nộp vào job thuộc company mà recruiter có quyền; candidate chỉ truy cập CV và application của mình; admin route dùng dependency riêng.
- Mọi bảng public mà frontend truy cập phải bật RLS và có test allow/deny, gồm cross-user và cross-company.
- Không tắt RLS để khắc phục lỗi. Không authorize bằng `user_metadata` có thể tự sửa.
- File Storage phải kiểm tra bucket, owner path, MIME thực, magic bytes, kích thước và quyền trước khi parse.
- Khi thêm endpoint, test ít nhất: thiếu token, token lỗi/hết hạn, sai role, đúng role sai owner, đúng role đúng owner.

## 6. Guardrail cho output LLM

- Ưu tiên structured output/JSON schema hoặc Pydantic; validate kiểu, enum, range, độ dài, số item và key lạ.
- Parse lỗi, thiếu field hoặc output vượt giới hạn phải đi vào retry có giới hạn hoặc fallback an toàn; không cố “đoán” dữ liệu quyết định tuyển dụng.
- Mọi claim về kỹ năng, kinh nghiệm, bằng cấp, công ty, thời gian, lương và mức phù hợp phải có evidence trong nguồn đã cấp.
- Không cho LLM tự tạo hard constraint, tự đổi weight/threshold hoặc tự xác nhận điều kiện loại.
- Explanation không được thay đổi thứ tự ranking đã tính; nếu explanation lỗi, trả explanation deterministic hoặc thông báo không đủ bằng chứng.
- Không hiển thị chain-of-thought hoặc system prompt. Chỉ trả kết luận ngắn, evidence và lý do có thể audit.
- Chặn output chứa PII, secret, URL/hành động trái phép, candidate/job ID ngoài request và claim không grounded.

## 7. An toàn trong quyết định tuyển dụng và công bằng

- Không dùng hoặc suy ra giới tính, tuổi, dân tộc, tôn giáo, tình trạng hôn nhân, khuyết tật, ảnh, tên, địa chỉ cụ thể hoặc thuộc tính được bảo vệ làm tín hiệu ranking.
- Chỉ dùng tiêu chí liên quan công việc và có nguồn từ JD/CV: skill, kinh nghiệm, bằng cấp khi thực sự bắt buộc, location ở mức phù hợp với hình thức làm việc, salary expectation nếu người dùng cung cấp.
- Không biến proxy như năm tốt nghiệp, tên trường, postcode hoặc khoảng trống CV thành tín hiệu loại nếu chưa có policy hợp pháp và được đánh giá bias.
- Hard constraint phải do recruiter xác nhận rõ, được lưu audit và hiển thị là constraint; điều kiện `unknown` không được coi như `fail`.
- AI không được tự động reject, tuyển, gửi email hay đổi trạng thái application. Hành động ảnh hưởng ứng viên cần human-in-the-loop và audit trail.
- Explanation phải trung lập, dựa trên evidence và không chứa nhận xét mang tính nhân khẩu học, sức khỏe hoặc phán xét cá nhân.
- Eval phải có slice VI/EN, sparse/polished/cross-domain, seniority và các cặp counterfactual chỉ khác thuộc tính không liên quan công việc.

## 8. Rate limit, chi phí và độ bền

- Rate limit hiện tại là in-memory/process-local; không mô tả nó như giới hạn toàn hệ thống hoặc multi-worker. Khi scale nhiều process/instance, dùng backend tập trung như Redis hoặc gateway.
- Key rate limit theo user đã xác thực; cân nhắc thêm IP/device cho route public. Không dùng email/raw token làm key loggable.
- Đặt timeout, retry có exponential backoff + jitter và retry budget. Không retry lỗi validation/auth/4xx không tạm thời.
- Giới hạn file size, text chars/tokens, số candidate, số tool call, concurrency và tổng chi phí mỗi request.
- Provider lỗi phải có circuit breaker hoặc degraded mode; không vòng lặp vô hạn và không lặp side effect.
- Theo dõi rate-limit rejection, provider error, parse failure, fallback rate, token/cost, latency p50/p95 và guardrail trigger theo nhãn không chứa PII.

## 9. Logging và audit

Log có cấu trúc nên gồm: request/trace ID ngẫu nhiên, user ID đã hash/pseudonymize nếu cần, route/agent/node, model/provider/version, prompt version, guardrail decision, latency, token/cost, fallback và error code.

Không log: bearer token, API key, service-role key, JWT claims đầy đủ, CV/JD/chat raw, email/phone/name, embedding vector, signed URL hoặc full LLM response chưa redaction.

Với matching có ảnh hưởng cao, lưu audit evidence đủ để tái hiện: config/weight/threshold version, IDs nội bộ được phân quyền, nguồn score, constraint status và evidence đã khử PII. Không lưu chain-of-thought.

## 10. Kiểm thử guardrail bắt buộc

Mỗi guardrail mới phải có:

- Positive cases: yêu cầu hợp lệ vẫn hoạt động, gồm tiếng Việt có dấu/không dấu và tiếng Anh.
- Negative cases: dữ liệu bị chặn đúng mã lỗi/decision.
- Boundary cases: ngay dưới/bằng/ngay trên threshold, kích thước và rate window.
- Adversarial cases: obfuscation, Unicode, nested content, prompt injection, giả MIME, file hỏng, repeated request.
- Cross-tenant cases: user/company/job khác nhau.
- Failure injection: timeout, provider 429/5xx, invalid JSON, partial result, database error.
- Regression cases lấy từ incident/eval failure thực, đã de-identify.

Guardrail hoàn thành khi chứng minh cả **security efficacy** và **utility preservation**: chặn case xấu mà không làm tăng false positive quá mức trên traffic/dataset hợp lệ.
