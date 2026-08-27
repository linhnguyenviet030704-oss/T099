# Nhật Ký Thực Thi AI & Reasoning Traces (AI Execution Logs)

> **Tài liệu tham chiếu**: Trích xuất từ luồng thực thi thực tế của **Ingest Agent** (`backend/app/agents/ingest/graph.py`) và **Matching Agent** (`backend/app/agents/matching/graph.py`) trên nền tảng LangGraph StateGraph.
> **Mục đích**: Minh họa chi tiết từng bước tư duy, biến đổi trạng thái (State Transformation), payload giao tiếp với LLM/Embedding API và cấu trúc dữ liệu lưu trữ.

---

## 1. Kiến trúc Quản lý Trạng thái Agent (LangGraph AgentState)

Toàn bộ quá trình thực thi của Ingest và Matching Agent vận hành dựa trên TypedDict `AgentState` (`backend/app/agents/state.py`):

```python
class AgentState(TypedDict, total=False):
    # Ingest State fields
    resume_id: str
    file_bytes: bytes
    mime_type: str
    markdown: str
    skills: list[str]
    metadata: dict[str, Any]
    embedding: list[float]

    # Matching & Recommend State fields
    job_id: str
    job_description: str
    jd_skills: list[str]
    jd_query: str
    candidates: list[dict[str, Any]]
    skill_constraints: dict[str, Any]
    constraints_confirmed: bool
    response: str
```

---

## 2. Ingest Agent: Chi tiết Luồng Thực thi & Reasoning Trace

*Mẫu thực nghiệm*: Xử lý tập tin CV định dạng PDF (`CV_Backend_Developer.pdf`) nộp vào hệ thống.

```
[START] ──> (1. parse) ──> (2. clean) ──> (3. extract) ──> (4. summarize) ──> (5. embed) ──> [END / pgvector]
```

### Bước 1: Node `parse` (Trích xuất văn bản & Quality Gate)
- **Đầu vào (Input)**:
  - `file_bytes`: `b"%PDF-1.5 ... 245KB"`
  - `mime_type`: `"application/pdf"`
  - `source_name`: `"CV_Backend_Developer.pdf"`
- **Hành động (Action)**:
  - Gọi `pymupdf4llm.to_markdown()` trích xuất nội dung có cấu trúc.
  - Đo lường số lượng ký tự thu được: `content_chars = 3254`.
  - So sánh với ngưỡng chất lượng `LOW_CONTENT_CHAR_THRESHOLD = 600`: `low_content = False` (Không cần fallback `pdfplumber`).
- **Trạng thái xuất ra (State Output)**:
  ```json
  {
    "markdown": "# NGUYEN VAN AN\nEmail: an.nguyen@email.com | Phone: 0912345678\n\n## KINH NGHIỆM LÀM VIỆC\nBackend Developer tại Tech Corp (2022 - 2024)\n- Xây dựng hệ thống RESTful API bằng Python và FastAPI phục vụ 500k DAU.\n- Thiết kế kiến trúc cơ sở dữ liệu PostgreSQL, tối ưu truy vấn đánh index.\n- Triển khai dịch vụ bằng Docker và thiết lập CI/CD trên GitLab CI.\n\n## KỸ NĂNG CHUYÊN MÔN\n- Ngôn ngữ: Python, SQL, TypeScript\n- Frameworks: FastAPI, Django\n- Cơ sở dữ liệu: PostgreSQL, Redis\n- DevOps & Tools: Docker, Git, Linux",
    "metadata": {
      "content_chars": 3254,
      "low_content": false,
      "source_name": "CV_Backend_Developer.pdf"
    }
  }
  ```

---

### Bước 2: Node `clean` (Chuẩn hóa Markdown)
- **Hành động (Action)**:
  - Chuẩn hóa khoảng trắng thừa, xóa bỏ ký tự rác OCR (`\x00`, `\ufeff`).
  - Chuẩn hóa các đề mục theo quy tắc `SECTION_NAMES` (`## Experience`, `## Skills`, `## Education`).
- **Trạng thái xuất ra (State Output)**:
  ```markdown
  # CV

  # NGUYEN VAN AN
  Email: an.nguyen@email.com | Phone: 0912345678

  ## Experience
  Backend Developer tại Tech Corp (2022 - 2024)
  - Xây dựng hệ thống RESTful API bằng Python và FastAPI phục vụ 500k DAU.
  - Thiết kế kiến trúc cơ sở dữ liệu PostgreSQL, tối ưu truy vấn đánh index.
  - Triển khai dịch vụ bằng Docker và thiết lập CI/CD trên GitLab CI.

  ## Skills
  - Ngôn ngữ: Python, SQL, TypeScript
  - Frameworks: FastAPI, Django
  - Cơ sở dữ liệu: PostgreSQL, Redis
  - DevOps & Tools: Docker, Git, Linux
  ```

---

### Bước 3: Node `extract` (Trích xuất Kỹ năng Xác định - Extract-First)
- **Hành động (Action)**:
  - Chạy `extract_skills()` trên toàn bộ Markdown gốc.
  - Quét danh mục từ điển 186 kỹ năng chuẩn hóa + Fuzzy matching (ngưỡng 88%).
  - Bắt các kỹ năng có trong text: `python`, `fastapi`, `django`, `postgresql`, `redis`, `docker`, `git`, `linux`, `sql`, `typescript`.
- **Trạng thái xuất ra (State Output)**:
  ```json
  {
    "skills": [
      "django",
      "docker",
      "fastapi",
      "git",
      "linux",
      "postgresql",
      "python",
      "redis",
      "sql",
      "typescript"
    ]
  }
  ```

---

### Bước 4: Node `summarize` (LLM Tóm tắt, Grounding & Redact PII)
- **Giao tiếp LLM (Prompt Payload)**:
  - *System Prompt*: `backend/app/prompts/system/summarize.txt` (Yêu cầu trích xuất JSON thuần, cấm bịa đặt thông tin ngoài nguồn).
  - *User Input*: Toàn bộ nội dung CV sau bước `clean`.
- **Kết quả LLM Trả về (Raw JSON)**:
  ```json
  {
    "summary": "Backend Developer với hơn 2 năm kinh nghiệm phát triển hệ thống API hiệu năng cao bằng Python và FastAPI. Có chuyên môn sâu về cơ sở dữ liệu PostgreSQL, Redis và đóng gói container Docker.",
    "body": "## Experience\n- Backend Developer tại Tech Corp: Phát triển hệ thống RESTful API bằng Python và FastAPI, tối ưu hóa cơ sở dữ liệu PostgreSQL và Redis.\n- Đóng gói triển khai hệ thống microservices bằng Docker trên nền tảng Linux.\n\n## Skills\n- Python, FastAPI, Django, PostgreSQL, Redis, Docker, Git, Linux, SQL, TypeScript",
    "skills": ["python", "fastapi", "django", "postgresql", "redis", "docker", "git", "linux", "sql", "typescript"],
    "major_field": "web",
    "sub_field": ["backend", "database", "devops"]
  }
  ```
- **Hậu xử lý (Post-processing & Guardrails)**:
  - Gọi `redact_pii(body)`: Cắt bỏ hoàn toàn Email, SĐT, Tên riêng, URL cá nhân.
  - Kiểm tra `grounded_titles()`: Xác nhận chức danh *"Backend Developer"* thực sự xuất hiện trong nguồn gốc.
  - Hợp nhất kỹ năng: Phân định `verified_skills` (tiếp tục có mặt trong tóm tắt) và `inferred_skills`.
- **Trạng thái xuất ra (State Output)**:
  ```json
  {
    "markdown": "## Experience\n- Backend Developer: Phát triển hệ thống RESTful API bằng Python và FastAPI, tối ưu hóa cơ sở dữ liệu PostgreSQL và Redis.\n- Đóng gói triển khai hệ thống microservices bằng Docker trên nền tảng Linux.\n\n## Skills\n- Python, FastAPI, Django, PostgreSQL, Redis, Docker, Git, Linux, SQL, TypeScript",
    "metadata": {
      "summary": "Backend Developer với hơn 2 năm kinh nghiệm phát triển hệ thống API hiệu năng cao bằng Python và FastAPI. Có chuyên môn sâu về cơ sở dữ liệu PostgreSQL, Redis và đóng gói container Docker.",
      "skills": ["django", "docker", "fastapi", "git", "linux", "postgresql", "python", "redis", "sql", "typescript"],
      "verified_skills": ["django", "docker", "fastapi", "git", "linux", "postgresql", "python", "redis", "sql", "typescript"],
      "inferred_skills": [],
      "major_field": "web",
      "sub_field": ["backend", "database", "devops"],
      "taxonomy_version": "2026-08-22",
      "ingest_status": "ok"
    }
  }
  ```

---

### Bước 5: Node `embed` (Sinh Vector & Ghi cơ sở dữ liệu)
- **Hành động (Action)**:
  - Ghép chuỗi văn bản làm giàu: `text_to_embed = metadata["summary"] + "\n\n" + markdown`.
  - Gọi mô hình `qwen3.7-text-embedding` sinh vector 1536 chiều.
  - Thực hiện câu lệnh SQL Upsert vào bảng `public.embedded_resumes`.
- **Vector thu được (Trích đoạn 5 chiều đầu)**:
  `[0.01482, -0.03819, 0.00941, 0.05210, -0.01874, ...]` *(Tổng 1536 floats)*.

---

## 3. Matching Agent: Chi tiết Luồng Thực thi & Reasoning Trace

*Mẫu thực nghiệm*: Nhà tuyển dụng yêu cầu tìm ứng viên phù hợp cho vị trí:
`job_id = "8f2c3e1a-5b4d-4e92-9c10-2f8a7e4d6b3c"`
**Tiêu đề**: *Senior Python Backend Engineer*
**Yêu cầu cốt lõi**: `['python', 'fastapi', 'postgresql', 'docker', 'kubernetes']`

```
[START] ──> retrieve ──> skill ──> rrf ──> rerank ──> explain ──> respond ──> [END]
```

### Bước 1: Node `retrieve` (Semantic Search pgvector)
- **Hành động (Action)**:
  - Load nội dung JD và danh sách 5 ứng viên đã ứng tuyển (`job_submits`).
  - Sinh 2 câu truy vấn embedding (Truy vấn gốc + Truy vấn mở rộng đồng nghĩa).
  - Gọi hàm PostgreSQL RPC `match_resumes_for_job`:
- **Kết quả thu được (Dense Distance)**:
  - Ứng viên `app_01` (Nguyễn Văn An): Cosine Distance = `0.142` (Độ tương đồng cao)
  - Ứng viên `app_02` (Trần Minh Tuấn): Cosine Distance = `0.285`
  - Ứng viên `app_03` (Lê Hoàng Nam): Cosine Distance = `0.410`

---

### Bước 2: Node `skill` (Tính toán Độ phủ Kỹ năng)
- **Hành động (Action)**:
  - Đối chiếu kỹ năng ứng viên với JD yêu cầu: `['python', 'fastapi', 'postgresql', 'docker', 'kubernetes']`.
- **Kết quả phân tích từng ứng viên**:
  ```json
  [
    {
      "application_id": "app_01",
      "skills": ["python", "fastapi", "postgresql", "docker", "redis", "git"],
      "matched_skills": ["python", "fastapi", "postgresql", "docker"],
      "missing_skills": ["kubernetes"],
      "skill_score": 0.80,
      "semantic_score": 0.858,
      "bm25_score": 14.82
    },
    {
      "application_id": "app_02",
      "skills": ["python", "django", "postgresql", "mysql"],
      "matched_skills": ["python", "postgresql"],
      "missing_skills": ["fastapi", "docker", "kubernetes"],
      "skill_score": 0.40,
      "semantic_score": 0.715,
      "bm25_score": 8.45
    },
    {
      "application_id": "app_03",
      "skills": ["react", "typescript", "nodejs"],
      "matched_skills": [],
      "missing_skills": ["python", "fastapi", "postgresql", "docker", "kubernetes"],
      "skill_score": 0.00,
      "semantic_score": 0.590,
      "bm25_score": 1.20
    }
  ]
  ```

---

### Bước 3: Node `rrf` (Reciprocal Rank Fusion k=60)
- **Hành động (Action)**:
  - Hợp nhất bảng xếp hạng Dense Search ($r_{\text{dense}}$) và BM25 ($r_{\text{bm25}}$):
    - `app_01`: Dense Rank 1, BM25 Rank 1 $\rightarrow \text{RRF Raw} = \frac{1}{60+1} + \frac{1}{60+1} = 0.03278 \rightarrow \text{Score} = 1.00$
    - `app_02`: Dense Rank 2, BM25 Rank 2 $\rightarrow \text{RRF Raw} = \frac{1}{60+2} + \frac{1}{60+2} = 0.03225 \rightarrow \text{Score} = 0.98$
    - `app_03`: Dense Rank 3, BM25 Rank 3 $\rightarrow \text{RRF Raw} = \frac{1}{60+3} + \frac{1}{60+3} = 0.03174 \rightarrow \text{Score} = 0.96$
- **Trạng thái xếp hạng**: `app_01` (Hạng 1) $\rightarrow$ `app_02` (Hạng 2) $\rightarrow$ `app_03` (Hạng 3).

---

### Bước 4: Node `explain` (Anonymization & LLM Relative Reasoning)
- **Ẩn danh hóa Dữ liệu (Anonymization Step)**:
  - `app_01` $\rightarrow$ `CAND_001`
  - `app_02` $\rightarrow$ `CAND_002`
  - `app_03` $\rightarrow$ `CAND_003`

- **Prompt gửi tới LLM (`qwen3.7-flash`)**:
  ```text
  THÔNG TIN VỊ TRÍ TUYỂN DỤNG:
  Senior Python Backend Engineer: Yêu cầu thành thạo Python, FastAPI, PostgreSQL, Docker, Kubernetes.

  KẾT QUẢ MATCHING ỨNG VIÊN:
  - id=CAND_001: skills=python, fastapi, postgresql, docker, redis; summary=Backend Developer với 2 năm kinh nghiệm FastAPI...; rrf=1.00
  - id=CAND_002: skills=python, django, postgresql; summary=Lập trình viên Python Django...; rrf=0.98
  - id=CAND_003: skills=react, typescript, nodejs; summary=Frontend Developer...; rrf=0.96

  Hãy giải thích ngắn gọn, súc tích (1-2 câu tiếng Việt) cho từng ứng viên về lý do đạt điểm phù hợp.
  ```

- **Phản hồi từ LLM (Raw JSON Response)**:
  ```json
  {
    "CAND_001": "Ứng viên đạt độ phù hợp xuất sắc nhất (100%) nhờ đáp ứng 4/5 kỹ năng cốt lõi gồm Python, FastAPI, PostgreSQL và Docker, có kinh nghiệm thực tế xây dựng RESTful API.",
    "CAND_002": "Ứng viên phù hợp ở mức khá nhờ có nền tảng vững chắc về Python và PostgreSQL, tuy nhiên còn thiếu kinh nghiệm thực tế với framework FastAPI và công nghệ đóng gói Docker.",
    "CAND_003": "Ứng viên có hồ sơ chuyên về Frontend (React, TypeScript), không đáp ứng các yêu cầu kỹ thuật trọng tâm về Backend Python của vị trí tuyển dụng."
  }
  ```

- **Giải ẩn danh (De-anonymization)**:
  - Map `CAND_001` $\rightarrow$ `app_01`
  - Map `CAND_002` $\rightarrow$ `app_02`
  - Map `CAND_003` $\rightarrow$ `app_03`

---

### Bước 5: Node `respond` & Persistence
- **Hành động (Action)**:
  - Tổng hợp câu trả lời giao diện cho Nhà tuyển dụng.
  - Ghi lịch sử khớp hồ sơ vào `public.match_resume` và bằng chứng chi tiết vào `public.match_evidence`.
- **Câu trả lời trả về cho Recruiter**:
  > **Hệ thống NextJob AI đã phân tích và xếp hạng 3 ứng viên ứng tuyển:**
  > 
  > 1. 🥇 **Ứng viên #1** *(Điểm phù hợp: 100%)*
  >    - **Đánh giá**: Ứng viên đạt độ phù hợp xuất sắc nhất nhờ đáp ứng 4/5 kỹ năng cốt lõi gồm **Python**, **FastAPI**, **PostgreSQL** và **Docker**, có kinh nghiệm thực tế xây dựng RESTful API.
  >    - **Kỹ năng đáp ứng**: `Python`, `FastAPI`, `PostgreSQL`, `Docker`, `Redis`
  > 
  > 2. 🥈 **Ứng viên #2** *(Điểm phù hợp: 75%)*
  >    - **Đánh giá**: Phù hợp ở mức khá nhờ có nền tảng vững chắc về Python và PostgreSQL, tuy nhiên còn thiếu kinh nghiệm với FastAPI và Docker.
  >    - **Kỹ năng đáp ứng**: `Python`, `PostgreSQL`
  > 
  > 3. 🥉 **Ứng viên #3** *(Điểm phù hợp: 20%)*
  >    - **Đánh giá**: Hồ sơ chuyên sâu về Frontend, chưa phù hợp với vị trí Backend yêu cầu.

---

## 4. Kiểm thử Cơ chế Fallback Tất định (Deterministic Fallback Trace)

Khi mô hình LLM bị ngắt kết nối hoặc vượt ngưỡng Timeout ($>5000\text{ms}$), hàm `deterministic_reason()` trong `backend/app/services/matching/explain.py` tự động kích hoạt để bảo toàn trải nghiệm người dùng:

```
[LLM Call Failed / Timeout] ──> [Trigger deterministic_reason()]
```

- **Input**:
  - `row`: `{"application_id": "app_01", "skills": ["python", "fastapi", "docker"], "rrf_score": 0.88}`
  - `jd_skills`: `["python", "fastapi", "postgresql"]`
  - `rank`: 1, `total`: 3
- **Trace Output tất định sinh ra**:
  `"Đạt điểm phù hợp (88%) nhờ đáp ứng các kỹ năng cốt lõi: python, fastapi, xếp thứ 1/3 trong shortlist."`
- **Kết quả**: Không có bất kỳ ứng viên nào bị hiển thị `null` hoặc để trống lý do xếp hạng.
