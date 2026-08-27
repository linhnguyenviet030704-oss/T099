# Bối cảnh dự án và quy ước kiến trúc

## 1. Hệ thống đang chạy

P-099 là nền tảng tuyển dụng cho ứng viên và nhà tuyển dụng, gồm:

- Frontend React 19 + Vite + TypeScript trong `frontend/`.
- Backend FastAPI trong `backend/app/`.
- Agent workflow LangGraph trong `backend/app/agents/`.
- Supabase PostgreSQL/Auth/Storage, migration trong `supabase/migrations/`.
- Shared Brain hỗ trợ Qwen, OpenAI, Gemini và Ollama trong `backend/app/shared_brain/`.
- Matching hybrid gồm lexical/BM25, semantic embedding/pgvector, skill graph/taxonomy, hard constraints, RRF và rerank.
- Eval hiện có hai nhánh chính: `evaluation/ingest_eval_v2/` cho ingest CV và `evaluation/golden/` cho ranking hai chiều cùng chất lượng ingest.

`backend/app/agents/` là agent code đang dùng. Không tạo hoặc sửa agent ở thư mục scaffold/tàn dư khác nếu chưa chứng minh có import/runtime path thật.

## 2. Nguồn sự thật

Khi tài liệu mâu thuẫn, áp dụng thứ tự kiểm chứng sau:

1. Test đang chạy và call graph/import thực tế.
2. Code production trong `backend/app/`, `frontend/src/`, migration Supabase.
3. `docs/architecture-agent-backend.md` vì tài liệu này mô tả code thật.
4. `README.md` và `docs/architecture.md`.
5. `docs/ai_agent_matching_system_spec.md` là hướng kiến trúc mục tiêu, không phải bằng chứng đã triển khai.
6. Báo cáo eval là ảnh chụp tại một commit/cấu hình cụ thể; không coi số cũ là trạng thái hiện tại.

Không sao chép lại giả định cũ như “provider hiện tại”, “số test”, “kích thước taxonomy”, “model mặc định” nếu chưa kiểm tra code/config tương ứng.

## 3. Ranh giới layer backend

Giữ hướng phụ thuộc:

```text
api/routes + api/schemas  -> HTTP, validate, auth dependency, response model
agents/                   -> orchestration LangGraph, state và node
services/                 -> nghiệp vụ và policy domain
repositories/             -> persistence/query Supabase
clients/ + shared_brain/  -> provider LLM/embedding/rerank bên ngoài
config/ + core/ + guardrails/ + observability/
```

BẮT BUỘC:

- Route không chứa thuật toán matching, prompt, query Supabase phức tạp hoặc policy phân quyền.
- Repository không raise `HTTPException` và không tự quyết định policy nghiệp vụ.
- Dùng `settings` từ `backend/app/config/env.py`; không rải `os.getenv()`.
- Mọi endpoint public có Pydantic request/response model; không trả raw row hoặc stack trace.
- Mọi thao tác dùng `service_role` phải kiểm tra ownership/role ở backend service vì key này bypass RLS.
- Thay schema bằng migration mới, không sửa lịch sử migration đã áp dụng và không thao tác tay trên production dashboard.
- Không cho service-role key, JWT secret, API key hoặc nội dung CV thô vào frontend, exception response, log hay artifact eval công khai.

## 4. Luồng AI cần bảo toàn

### Ingest CV

Luồng chuẩn là:

```text
parse -> clean -> extract -> summarize -> embed
```

- Trích skill từ text đầy đủ đã làm sạch trước bước tóm tắt để tránh mất skill.
- PII phải được loại trước khi gửi nội dung tới LLM và embedding provider.
- `low_content` là tín hiệu chất lượng, không được âm thầm coi CV parse mỏng là CV hợp lệ đầy đủ.
- Metadata deterministic không được bị output LLM ghi đè khi không có bằng chứng.

### Matching/recommend

- Retrieval, constraints, score và thứ tự cuối phải có đường deterministic và test được.
- LLM chỉ giải thích hoặc rerank trong phạm vi kiểm soát; không được tạo ứng viên/job, kỹ năng hay bằng chứng không tồn tại.
- Xác nhận hard constraint phải là trạng thái rõ ràng. Không biến suy đoán từ câu chữ mơ hồ thành điều kiện loại ứng viên.
- Fallback khi provider lỗi phải bảo toàn auth, privacy và thứ tự constraint; không được fail-open.

## 5. Cách làm việc của agent lập trình

Trước khi sửa:

- Đọc file rule liên quan, file implementation, test gần nhất và caller của nó.
- Nêu giả thuyết thay đổi và tiêu chí thành công có thể đo.
- Kiểm tra `git status`; không ghi đè thay đổi chưa liên quan của người dùng.
- Với thay đổi guardrail/eval, lập threat model hoặc eval plan ngắn trước khi code.

Trong khi sửa:

- Ưu tiên thay đổi nhỏ, typed, deterministic và dễ rollback.
- Không thêm dependency hoặc dịch vụ mới chỉ để giải quyết việc có thể làm bằng thư viện hiện có.
- Không đổi đồng thời model, prompt, dataset và metric nếu mục tiêu là xác định nguyên nhân cải thiện.
- Không “sửa test để pass” bằng cách hạ ngưỡng, bỏ case xấu hoặc nới assertion mà không có căn cứ sản phẩm.

Sau khi sửa:

- Chạy test theo ma trận tại `40-kiem-thu-va-definition-of-done.md`.
- Báo rõ test đã chạy, test chưa chạy, lý do và rủi ro còn lại.
- Nếu hành vi AI thay đổi, lưu cấu hình/baseline/candidate và báo delta; không chỉ báo điểm candidate.
