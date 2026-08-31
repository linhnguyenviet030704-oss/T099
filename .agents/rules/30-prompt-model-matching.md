# Rule cho prompt, model, agent graph và matching

## 1. Thay đổi prompt

- Prompt là code có version: lưu trong `backend/app/prompts/system/`, review diff và có test/eval.
- Tách policy/instruction khỏi dữ liệu bằng placeholder rõ; coi mọi placeholder chứa CV/JD/chat là untrusted.
- Yêu cầu output schema, ngôn ngữ, giới hạn độ dài, grounding, PII và hành vi khi thiếu bằng chứng.
- Không lặp instruction ở nhiều lớp nếu không cần; một policy quan trọng nên có một nguồn sự thật và enforcement deterministic riêng.
- Không dựa vào các câu như “hãy an toàn” hoặc “đừng hallucinate” mà thiếu validator/evidence check.
- Khi đổi prompt, bump `PROMPT_VERSION` hoặc đưa prompt hash vào cache key; thêm case regression đã thúc đẩy thay đổi.
- So sánh prompt candidate với baseline trên cùng model/params trước khi đổi model.

## 2. Thay đổi model/provider/embedding/reranker

- Không đổi default model chỉ vì model mới hơn. Cần eval đại diện về quality, safety, latency, cost và fallback.
- Ghi chính xác model ID/provider/base URL phù hợp; không dùng alias mơ hồ trong report nếu alias có thể đổi.
- Xác nhận structured output, context limit, embedding dimension, timeout, error semantics và data handling.
- Embedding model/dimension thay đổi cần migration/re-index plan, compatibility gate và rollback. Không trộn vector của hai model trong cùng index nếu không có version/filter rõ.
- Provider abstraction không được làm mất guardrail: mọi provider phải qua cùng validation/redaction/output policy.
- Test provider failure 429/5xx/timeout/invalid JSON và bảo đảm retry/fallback bounded.
- Không log request/response nhạy cảm để debug provider.

## 3. Agent graph và tool

- Node phải có input/output state typed, trách nhiệm đơn và test riêng.
- Routing quan trọng nên deterministic trước; LLM router chỉ dùng khi heuristic không đủ và output phải validate.
- Mỗi tool có allowlist input, timeout, giới hạn kết quả và không nhận instruction từ content để tự gọi tool khác.
- State không được mang PII sang node/provider không cần thiết.
- Không thêm side effect vào node vốn chỉ đọc/score nếu không cập nhật quyền, idempotency, retry và audit.
- Retry node có side effect phải có idempotency key. Không lặp insert/update hoặc gửi thông báo khi stream/retry.
- Đường fallback phải được biểu diễn/test rõ; không bắt exception rộng rồi trả “thành công” giả.
- Graph change phải có test thứ tự node, branch, state preservation và failure path.

## 4. Deterministic-first trong matching

Thứ tự ưu tiên:

```text
candidate generation
-> lexical/semantic/skill retrieval
-> RRF hoặc score deterministic
-> constraint partition
-> rerank có kiểm soát
-> explanation grounded
```

- LLM không phải nguồn sự thật cho score cuối nếu cùng kết quả có thể tính deterministic.
- RRF weight, semantic baseline, K, candidate window, soft weight và threshold phải là config có version, không magic number rải rác.
- Tie-break phải ổn định và không dùng PII/protected attribute.
- Rerank không được đưa item `fail` lên trên `pass` khi hard constraint đã xác nhận.
- `unknown` phải được giữ khác `fail`; thiếu evidence không đồng nghĩa không đạt.
- Nếu rerank output thiếu item, duplicate, score không hữu hạn hoặc index ngoài window, dùng fallback deterministic cho toàn window hoặc policy rõ; không ghép nửa đúng nửa lỗi tùy tiện.
- Candidate generation và rerank phải được eval tách để biết lỗi do recall hay ordering.

## 5. Evidence và explanation

- Mỗi lý do match phải liên kết tới skill/experience/constraint evidence đã khử PII.
- Không nêu skill chỉ vì có liên quan taxonomy nếu CV không có evidence trực tiếp; phân biệt `verified`, `inferred`, `expanded`.
- Không biến similarity score thành xác suất tuyển dụng.
- Không viết lý do tiêu cực dựa trên thông tin không được cung cấp; dùng “chưa thấy bằng chứng” thay vì khẳng định ứng viên không có kỹ năng.
- Explanation không được lộ full CV, ID nội bộ hoặc candidate khác.
- Nếu không đủ evidence, trả trạng thái không đủ dữ liệu và hướng thu thập thêm, không hallucinate.

## 6. Nội dung tuyển dụng có ảnh hưởng cao

- Không tự động thay đổi trạng thái application, reject/hire hoặc liên hệ ứng viên.
- Mọi filter có khả năng loại ứng viên cần recruiter xác nhận và audit.
- Không tối ưu metric theo việc giống quyết định lịch sử nếu dữ liệu lịch sử có bias mà chưa audit.
- Khi thêm feature ranking, ghi rõ tính liên quan công việc, nguy cơ proxy protected attribute và eval counterfactual/slice.
- Luôn cung cấp cơ chế người dùng xem lý do và người tuyển dụng có thể review, không trình bày AI như quyết định khách quan tuyệt đối.
