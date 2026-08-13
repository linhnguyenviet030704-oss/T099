# Matching agent graph (recruiter)

## Goal

Recruiter chat (`POST /chat` + `job_id`) chạy LangGraph cố định `retrieve → skill → respond`. Logic matching nằm ở backend. Ứng viên `/match_job` giữ `mock_recommend`.

## Decisions

- PDF CV trong bucket Storage `resumes` (private). Parse+embed lần đầu `resume_id` được nộp; lần sau tái dùng vector (so `content_hash`).
- 1 vector / CV (toàn bộ Markdown). Metadata `skills[]` cột JSON cho Jaccard/coverage.
- pgvector 384-d (fastembed MiniLM), index HNSW `vector_cosine_ops`.
- Không embed JD. Retrieve: embed text JD lúc query, RPC lọc applications của `job_id`.
- LLM không chọn tool. `respond` là template (không gọi OpenAI).
- Ingest: `POST /api/v1/resumes/{id}/ingest` sau khi apply; retrieve cũng `ensure` nếu thiếu embedding.

## Out of scope

Recommend việc cho ứng viên, LLM re-rank, parse/embed JD, streaming chat.
