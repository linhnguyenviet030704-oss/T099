# Thiết kế guardrail ba lớp cho P-099

> Trạng thái: Đã triển khai baseline deterministic; cần safety eval và rollout monitoring trước production  
> Ngày cập nhật: 2026-08-27  
> Phạm vi: backend AI trong `backend/app/`

## 1. Quyết định thiết kế

P-099 sử dụng ba lớp kiểm soát:

```text
Request / File / Chat
          │
          ▼
     Input Guard
          │
          ▼
    Parse / Retrieve
          │
          ▼
 Safety / Data Gate
          │
          ▼
 Agent / Matching / LLM
          │
          ▼
     Output Guard
          │
          ▼
 Response / Persistence
```

Cấu trúc code tối giản:

```text
backend/app/guardrails/
├── input.py
├── gates.py
├── output.py
└── rate_limit.py   # giữ cơ chế hiện có
```

Không tạo guardrail service, guardrail agent hoặc gọi thêm LLM để quyết định an toàn. Ba lớp đều là code deterministic, typed và có test riêng.

## 2. Ý nghĩa của ba lớp

### Input Guard

Bảo vệ dữ liệu đi vào hệ thống từ browser, API hoặc file upload. Nó chạy trước parse, routing hoặc nghiệp vụ tốn tài nguyên.

### Safety/Data Gate

Bảo vệ dữ liệu mới xuất hiện sau parse/retrieve và trước provider hoặc bước có ảnh hưởng. Đây là nơi kiểm tra chất lượng dữ liệu, scope, privacy, evidence và điều kiện để pipeline được tiếp tục.

Một pipeline có thể gọi gate nhiều lần tại các checkpoint khác nhau, nhưng tất cả dùng chung primitive trong `gates.py`.

### Output Guard

Bảo vệ kết quả do model/provider sinh ra trước khi kết quả được dùng để xếp hạng, trả response hoặc persist.

## 3. Mục tiêu và giới hạn

### Mục tiêu

- Chặn input quá lớn, sai định dạng hoặc không thể xử lý an toàn.
- Không gửi PII, secret, ID nội bộ hoặc dữ liệu thừa sang provider.
- Không để instruction trong CV/JD/chat/retrieval thay đổi policy hệ thống.
- Chỉ cho dữ liệu đúng scope và đủ chất lượng đi tiếp trong pipeline.
- Không chấp nhận output sai schema, ID lạ hoặc claim thiếu evidence.
- Provider lỗi phải dùng fallback deterministic, không fail-open.
- Tích hợp dần, không viết lại toàn bộ graph.

### Ngoài phạm vi

Các cơ chế sau vẫn bắt buộc nhưng không được chuyển vào ba module mới:

| Cơ chế | Nơi chịu trách nhiệm |
|---|---|
| Xác thực JWT | `backend/app/core/security.py` và FastAPI dependency |
| Role, ownership, tenant isolation | service trước query/chạy agent |
| RLS và Storage policy | Supabase migrations |
| Rate limit | `backend/app/guardrails/rate_limit.py` |
| Tính hard constraints | `backend/app/services/matching/constraints.py` |
| Tính ranking deterministic | matching/recommend service và graph |
| Quyết định tuyển hoặc loại | human workflow trong domain/UI |
| Log/audit đã khử nhạy cảm | `backend/app/observability/` |

Guardrail không thay thế authorization. Safety/Data Gate chỉ xác nhận scope đã được thiết lập đúng và fail-safe nếu dữ liệu không khớp scope đó.

## 4. Threat model tối thiểu

### Tài sản cần bảo vệ

- PII và nội dung CV, JD, lịch sử chat.
- JWT, API key, service-role key, signed URL.
- Candidate/job/resume/application ID nội bộ.
- Match evidence, ranking và hard constraints.
- Ngân sách, token và quota provider.

### Trust boundary

```text
Browser -> FastAPI
FastAPI -> Supabase bằng service role
Database / file upload -> agent context
FastAPI -> LLM / embedding / reranker
Model output -> response / database
```

### Phân công rủi ro

| Rủi ro | Lớp chính | Hành vi an toàn |
|---|---|---|
| Request/file quá lớn | Input Guard | reject |
| MIME không khớp magic bytes | Input Guard | reject |
| Unicode/encoding gây bypass | Input Guard | normalize rồi kiểm tra |
| CV parse rỗng hoặc chất lượng thấp | Data Gate | block hoặc degrade |
| PII/secret sắp đi provider | Safety Gate | sanitize; không sạch thì block |
| Injection trong CV/JD/chunk | Safety Gate | cô lập dữ liệu, bỏ instruction |
| Retrieval sai scope hoặc ID lạ | Safety Gate | block |
| Evidence không đủ | Data Gate | degrade, không gọi explanation/rerank nếu không cần |
| Output JSON/schema sai | Output Guard | fallback hoặc reject |
| ID model trả ngoài allowlist | Output Guard | fallback toàn output |
| Narrative chứa PII/secret | Output Guard | sanitize hoặc fallback |
| Claim không grounded | Output Guard | bỏ claim hoặc fallback |
| Rerank vi phạm constraint | Output Guard | khôi phục ranking deterministic |

AuthZ/ownership và query scope vẫn là lớp chính chống cross-tenant leak. ID allowlist ở gate/output là phòng thủ bổ sung.

## 5. Input Guard

### Trách nhiệm

`backend/app/guardrails/input.py` thực hiện:

1. Chuẩn hóa Unicode NFC, encoding và newline.
2. Kiểm tra empty/min/max length theo từng flow.
3. Kiểm tra kích thước file bằng bytes thực.
4. So MIME khai báo với magic bytes.
5. Chỉ cho phép loại file đã định nghĩa.
6. Trả mã lỗi ổn định, không log raw input.

PII redaction và indirect injection trên nội dung đã parse thuộc Safety/Data Gate vì dữ liệu đó chưa tồn tại ở thời điểm HTTP request đầu tiên.

### API dự kiến

```python
@dataclass(frozen=True)
class ValidatedText:
    text: str
    source: Literal["chat", "cv_text", "jd_text"]


def validate_text(
    text: str,
    *,
    source: Literal["chat", "cv_text", "jd_text"],
    max_chars: int,
) -> ValidatedText: ...


@dataclass(frozen=True)
class ValidatedFile:
    data: bytes
    detected_mime: str


def validate_file(
    data: bytes,
    *,
    declared_mime: str,
    max_bytes: int,
) -> ValidatedFile: ...
```

Không tạo hàm `guard_input(payload: Any)` vì khó type-check và dễ bỏ sót policy theo loại dữ liệu.

### Giới hạn ban đầu

- Chat: giữ giới hạn schema hiện tại 5.000 ký tự.
- Evaluation CV/JD: giữ giới hạn hiện tại 50.000 ký tự cho mỗi trường.
- CV upload: Storage đang giới hạn 10 MB; backend phải kiểm lại bytes sau download.
- MIME CV chính: PDF, DOC và DOCX theo bucket hiện tại.
- Không thêm environment variable mới nếu giới hạn đã có nguồn sự thật rõ ràng.

## 6. Safety/Data Gate

### Trách nhiệm

`backend/app/guardrails/gates.py` cung cấp các checkpoint deterministic:

1. **Data quality:** text có đủ nội dung, parse có lỗi, `low_content`, embedding finite/non-zero.
2. **Privacy:** redact PII/secret trước LLM, embedding, reranker và log.
3. **Untrusted context:** đánh dấu CV/JD/chunk là dữ liệu, không phải instruction.
4. **Injection signal:** phát hiện direct/indirect injection để cô lập hoặc degrade; không dựa vào một regex để tuyên bố an toàn.
5. **Scope:** đối chiếu row/ID với tập đã được service authorize và retrieve.
6. **Evidence readiness:** chỉ gọi rerank/explain khi có evidence phù hợp.
7. **Constraint readiness:** giữ `unknown` khác `fail`; chỉ gate theo constraint đã được xác nhận.
8. **Budget:** giới hạn số item, độ dài context và số provider call.

### Quyết định chuẩn

```text
PASS       tiếp tục
SANITIZE   làm sạch rồi tiếp tục
DEGRADE    bỏ bước LLM/reranker, dùng deterministic fallback
BLOCK      dừng pipeline, không gọi provider hoặc persist
```

### API dự kiến

```python
GateAction = Literal["pass", "sanitize", "degrade", "block"]


@dataclass(frozen=True)
class GateDecision:
    action: GateAction
    value: Any
    codes: tuple[str, ...]


def gate_context(
    text: str,
    *,
    source: Literal["cv", "jd", "retrieval", "chat_history"],
    max_chars: int,
    redact_pii: bool = True,
) -> GateDecision: ...


def gate_records(
    records: Sequence[Mapping[str, Any]],
    *,
    id_field: str,
    allowed_ids: set[str],
    max_items: int,
) -> GateDecision: ...


def gate_evidence(
    evidence: Sequence[Mapping[str, Any]],
    *,
    minimum_items: int = 1,
) -> GateDecision: ...
```

Không tạo một gate cho mỗi agent. Các agent truyền policy và dữ liệu typed vào cùng primitive.

### Quy tắc PII

- Redact trước summarize, embed, rerank, explanation và report.
- Không gửi `user_id`, `resume_id`, `application_id`, storage path hoặc signed URL sang provider.
- Nếu model cần tham chiếu item, dùng ID giả theo request và map ngược qua allowlist.
- Chuyển `redact_pii()` hiện có sang `gates.py`, hoặc giữ compatibility wrapper trong `services/matching/parse.py` trong giai đoạn chuyển tiếp.
- Không log raw context hoặc bản chưa redaction.

### Quy tắc injection

- Chat có direct injection yêu cầu hành vi cấm có thể bị block.
- Injection nằm trong CV/JD/chunk không làm mất toàn bộ dữ kiện tuyển dụng hợp lệ.
- Context được serialize/đóng gói tách khỏi system instruction và gắn nguồn rõ ràng.
- Detection chỉ tạo signal; hành vi cuối được kiểm bằng output và side effect thực tế.

## 7. Output Guard

### Trách nhiệm

`backend/app/guardrails/output.py` thực hiện:

1. Validate structured output bằng Pydantic/schema.
2. Kiểm enum, range, độ dài, số item, duplicate, NaN và infinity.
3. Chỉ chấp nhận ID thuộc allowlist của request hiện tại.
4. Quét PII/secret trong narrative do model sinh.
5. Kiểm explanation chỉ dùng evidence đã cấp.
6. Xác nhận rerank không đảo partition hard constraint.
7. Trả fallback deterministic nếu output không hợp lệ.
8. Không cho output lỗi đi vào persistence.

### API dự kiến

```python
@dataclass(frozen=True)
class GuardedOutput:
    value: Any
    action: Literal["allow", "sanitize", "fallback", "block"]
    codes: tuple[str, ...]


def validate_generated_text(
    text: str,
    *,
    evidence: Sequence[str] = (),
    max_chars: int,
    fallback: str,
) -> GuardedOutput: ...


def validate_ranked_items(
    items: Sequence[Mapping[str, Any]],
    *,
    allowed_ids: set[str],
    max_items: int,
    deterministic_fallback: Sequence[Mapping[str, Any]],
) -> GuardedOutput: ...
```

Output Guard không tự tính ranking; nó chỉ kiểm invariant và trả ranking fallback mà service đã tính.

### PII trong response

- Narrative do model sinh không được chứa tên, email, điện thoại, storage path hoặc ID nội bộ.
- Trường cấu trúc như `RecommendedCandidate.full_name` và `email` có thể được trả cho recruiter đã được authorize vì dữ liệu đến trực tiếp từ database.
- Không quét mù toàn bộ `ChatResponse` rồi xóa dữ liệu mà người dùng có quyền xem.
- Chỉ persist narrative đã qua guard và recommendation fields đã qua AuthZ/allowlist.

## 8. Mã decision/error

```text
INPUT_TOO_LARGE
INPUT_EMPTY
UNSUPPORTED_FILE_TYPE
FILE_SIGNATURE_MISMATCH
DATA_LOW_CONTENT
DATA_PII_REDACTED
DATA_SECRET_DETECTED
DATA_INJECTION_SIGNAL
DATA_SCOPE_MISMATCH
DATA_EVIDENCE_INSUFFICIENT
DATA_BUDGET_EXCEEDED
OUTPUT_INVALID_SCHEMA
OUTPUT_ID_NOT_ALLOWED
OUTPUT_PII_DETECTED
OUTPUT_UNGROUNDED
OUTPUT_CONSTRAINT_VIOLATION
OUTPUT_PROMPT_LEAKAGE
OUTPUT_SECRET_DETECTED
OUTPUT_INTERNAL_ERROR_LEAK
OUTPUT_INTENT_MISMATCH
```

HTTP error dùng `AppError` hiện có. `SANITIZE` và `DEGRADE` chỉ log code, request ID, agent/node và latency; không log raw content.

## 9. Điểm gắn vào từng pipeline

### Ingest Agent

```text
ownership
-> Input Guard: bytes/MIME/size
-> parse/clean/extract
-> Data Gate: quality + PII + injection
-> summarize
-> Output Guard: JSON summary/metadata
-> Data Gate: text an toàn trước embedding
-> embed
-> Output Guard: vector finite/dimension
-> save
```

File dự kiến chạm:

- `backend/app/services/matching/ingest.py`
- `backend/app/agents/ingest/nodes/summarize.py`
- `backend/app/agents/ingest/nodes/embed.py`
- `backend/app/services/matching/parse.py`

### Matching Agent

```text
AuthZ recruiter/job
-> Input Guard: chat
-> retrieve đúng scope
-> Data Gate: candidate IDs + JD/evidence + budget
-> deterministic score/RRF/constraints
-> rerank/explain
-> Output Guard: IDs + grounding + constraint invariant
-> persist
-> response
```

Allowed IDs được tạo từ rows sau ownership-scoped retrieval, không lấy từ model.

### Recommend Agent

```text
AuthZ candidate/default resume
-> Input Guard: chat
-> retrieve CV + published jobs
-> Data Gate: job IDs + CV/evidence + budget
-> deterministic score/constraints
-> rerank/explain/advice
-> Output Guard: IDs + grounding
-> persist
-> response
```

### Evaluation Agent

```text
AuthZ resume_id/job_id
-> Input Guard: text/file
-> parse/retrieve
-> Data Gate: quality + privacy + scope + evidence
-> score/report
-> Output Guard: schema + score range + narrative
-> response
```

Route `/evaluate/file` phải dùng file guard/parser giống ingest, không decode PDF/DOCX trực tiếp như UTF-8.

### Routing Agent và ChatService

- Input Guard normalize/limit trước `classify_intent()`.
- Routing chỉ phân loại, không phải security boundary.
- Intent không nhận diện được là `UNKNOWN`; nội dung ngoài tuyển dụng là `OUT_OF_SCOPE`. Không loại nào được fail-open sang recommendation.
- `ChatService` chỉ dispatch các intent nằm trong allowlist và không gọi DB/provider cho `UNKNOWN`, `OUT_OF_SCOPE` hoặc chitchat.
- Context lấy từ DB vẫn phải qua Safety/Data Gate trước provider.
- Output chat phải khớp loại intent: text-only, jobs hoặc candidates; mismatch bị bỏ toàn bộ recommendations.

## 10. Fallback policy

| Lỗi | Quyết định |
|---|---|
| File/text không hợp lệ | `BLOCK` trước provider |
| Parse `low_content` | `DEGRADE` hoặc yêu cầu CV tốt hơn |
| PII được redact thành công | `SANITIZE` và tiếp tục |
| Secret không thể loại chắc chắn | `BLOCK` |
| Injection trong CV/JD | cô lập context; `SANITIZE` hoặc `DEGRADE` |
| Record sai scope | `BLOCK` |
| Evidence thiếu | `DEGRADE`, không sinh claim tự do |
| LLM summary sai schema | dùng metadata deterministic |
| Reranker trả ID lạ/duplicate | dùng toàn bộ ranking deterministic |
| Explanation có PII/claim lạ | dùng explanation deterministic |
| Evaluation report lỗi | trả breakdown deterministic nếu hợp lệ |

Không ghép tùy tiện một phần output model lỗi với một phần hợp lệ nếu kết quả không còn tái hiện được.

## 11. Kế hoạch triển khai

### Giai đoạn 1 — Contract và primitive

- Tạo `input.py`, `gates.py`, `output.py`.
- Định nghĩa decision/action và error code typed.
- Tái sử dụng dependency hiện có.
- Viết unit test cho từng primitive trước khi tích hợp graph.
- Giữ compatibility wrapper cho `redact_pii()`.

### Giai đoạn 2 — Ingest end-to-end

- Gắn Input Guard sau download, trước parse.
- Gắn Data Gate sau extract và trước summarize/embed.
- Gắn Output Guard trước save.
- Test PDF/DOCX, giả MIME, file hỏng, low-content, PII và injection.

Đây là flow đầu tiên vì có cả file, parse, PII, LLM, embedding và persistence; nó kiểm chứng đầy đủ kiến trúc ba lớp.

### Giai đoạn 3 — Matching và Recommend

- Tạo allowlist từ retrieval đã scope quyền.
- Gắn Data Gate trước rerank/explain/advice.
- Gắn Output Guard trước persistence và response.
- Dùng ranking/explanation deterministic làm fallback.
- Test cross-tenant, ID lạ, duplicate, evidence thiếu và constraint violation.

### Giai đoạn 4 — Evaluation và Routing

- Dùng Input Guard chung cho chat/CV/JD/file.
- Bổ sung AuthZ trước khi Evaluation tải dữ liệu theo ID.
- Gắn Data Gate sau parse/retrieve.
- Validate score, report và narrative bằng Output Guard.
- Dùng cùng normalization cho ChatService và Routing Agent.

### Giai đoạn 5 — Safety eval và rollout

- Chạy targeted unit/integration suite.
- Chạy safety suite VI/EN, Unicode, direct/indirect injection, PII và cross-tenant.
- Đo false positive trên CV/JD hợp lệ.
- Theo dõi trigger, sanitize, degrade, block, fallback rate và latency.
- Rollout từng pipeline; không bật đồng thời nếu chưa có baseline.

## 12. Ma trận kiểm thử tối thiểu

### Input Guard

- VI có dấu/không dấu và EN hợp lệ.
- Ngay dưới, bằng và trên giới hạn.
- PDF/DOC/DOCX hợp lệ.
- Extension/MIME giả, magic bytes sai, file rỗng/hỏng.
- Unicode/zero-width và encoding bất thường.

### Safety/Data Gate

- Parse tốt, `low_content`, empty và malformed.
- PII: tên, email, phone, địa chỉ, URL, ID nội bộ.
- Secret giả lập không xuất hiện trong provider payload/log.
- Direct và indirect injection, Markdown/JSON nesting.
- Record đúng/sai scope, duplicate và vượt số lượng.
- Evidence đủ/thiếu.
- Constraint `pass`, `unknown`, `fail` và confirmed/unconfirmed.
- Utility: skill/evidence hợp lệ không bị sanitize nhầm quá mức.

### Output Guard

- JSON hợp lệ/sai, thiếu field, key lạ và sai kiểu.
- Score NaN/inf/ngoài range.
- ID hợp lệ, ID lạ, duplicate và vượt `max_items`.
- Narrative có PII/secret.
- Claim có/không có evidence.
- Rerank làm `fail` vượt `pass`.
- Provider timeout, 429/5xx và invalid response.
- Output lỗi không được persist.

### Hard gate integration

- Candidate khác không đọc/ingest được resume.
- Recruiter khác company/job không retrieve được candidate.
- ID ngoài scope không xuất hiện trong response/persistence.
- PII/secret leak bằng 0 trên safety suite bắt buộc.
- Prompt-injection attack success bằng 0 cho hành vi cấm đã định nghĩa.

## 13. Tiêu chí hoàn thành

- Có test chứng minh Input Guard chạy trước parse/provider.
- Có test chứng minh Safety/Data Gate chạy sau parse/retrieve và trước provider.
- Có test chứng minh Output Guard chạy trước response/persistence.
- Invalid output hoặc scope mismatch không được persist.
- Provider failure không bỏ qua AuthZ, gate, constraint hoặc output validation.
- Safety hard gates đạt; false positive được báo riêng.
- Log/error/report không chứa raw CV, PII hoặc secret.
- Báo rõ suite/eval đã chạy, cấu hình và giới hạn còn lại.

Không gọi hệ thống là “an toàn tuyệt đối” hoặc “production-ready” chỉ từ unit test.

## 14. Trạng thái triển khai

Đã triển khai:

- Primitive dùng chung trong `backend/app/guardrails/input.py`, `gates.py` và `output.py`.
- Input Guard cho chat, routing, evaluation text/file và ingest file sau download.
- Safety/Data Gate trước summarize, embedding, rerank, explanation, advice, evaluation report và hai flow compare.
- ID giả cho provider rerank; provider payload không còn application/user/resume/storage ID thật.
- Output Guard cho embedding, narrative, explanation và tập kết quả ranking trước response/persistence.
- Evaluation tải `resume_id` theo ownership và chỉ cho đọc `job_id` published hoặc do chính actor tạo.
- Fallback deterministic khi provider trả output sai, thiếu evidence, ID lạ hoặc lỗi.
- Unit/integration test cho boundary file/text, Unicode, PII/secret, injection, scope, ID lạ, duplicate, constraint và ownership.

Baseline không thêm biến môi trường guardrail mới. Test primitive, graph và fallback chạy offline với mock provider; API key chỉ cần cho smoke test provider thật.

Chưa tuyên bố production-ready cho đến khi hoàn tất safety eval VI/EN, đo false-positive trên dữ liệu thật đã khử danh tính và có dashboard theo dõi các decision code.

## 15. Quyết định policy đã chốt

1. Backend dùng cùng trần CV 10 MB với Storage.
2. Evaluation giữ TXT để tương thích test/local; PDF, DOC và DOCX là định dạng upload chính.
3. `low_content` mặc định `DEGRADE`; empty/không parse được vẫn bị chặn tại boundary phù hợp.
4. Narrative fallback hiện dùng thông báo deterministic tiếng Việt.
5. Direct injection trong chat là `BLOCK`; indirect injection trong CV/JD là `SANITIZE`, và `DEGRADE` nếu không còn evidence dùng được.

Các lựa chọn này không thay đổi kiến trúc ba lớp; chúng xác định policy baseline để tiếp tục safety eval.
