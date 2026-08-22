# Ingest CV — Trước / Sau redesign (2026-08-22)

## Bối cảnh

User báo "ingest CV không ổn". Phân tích thuật toán cũ đối chiếu với dữ liệu eval sẵn có cho thấy đây
không phải cảm tính. Approach đã chọn: **Hướng A** (đồng bộ, tự chứa trong LangGraph hiện có, không
thêm hạ tầng queue/worker) — reorder graph để sửa lỗi mất skill, mở rộng taxonomy tĩnh mạnh, parser
layout-aware, giữ backward-compatible với schema `embedded_resumes` mà Matching Agent đang đọc.

**Số liệu dưới đây là kết quả eval thật** (không phải ước lượng): chạy lại đúng bộ 41 CV
(`data_find/generated_cv/` + `evaluation/cv_hard/`) qua pipeline thật, dùng OpenAI (`gpt-4o-mini` +
`text-embedding-3-small`) làm LLM/embedding và LLM-as-judge để chấm điểm — cùng phương pháp với báo
cáo v1 gốc, để so sánh táo với táo.

- **v1 (trước redesign)**: report gốc `evaluation/ingest_eval/results/report.md` — đã gộp vào
  `evaluation/ingest_eval_v2/` và xoá sau khi số liệu so sánh được chốt lại trong bảng dưới đây.
- **v2 (sau redesign)**: `evaluation/ingest_eval_v2/results/report.md`

Toàn bộ thay đổi nằm trong **19 file** (17 file code/test + 2 file harness eval), có **98 unit test
pass** (trước: 84). Không đổi schema `embedded_resumes` — Matching Agent không cần sửa.

## Số liệu tổng quan: v1 vs v2 (41 CV)

| Metric | v1 (trước) | v2 (sau) |
|---|---|---|
| Taxonomy skill | 10 | **185** (+108 relation) |
| Recall trích skill (LLM-judge) | 0.11 | **0.64** |
| Recall skill so với text đầy đủ (đo bằng code) | 0.77 | **1.00** |
| Tổng skill bị mất do summarization (đo bằng code) | 20 | **0** |
| Precision trích skill (LLM-judge) | 1.00 | 0.90 |
| Faithfulness `summarize` (RAGAS-style) | 1.00 | 0.99 |
| CV bị lộ token tên trong text cuối | 4/41 | 2/41 |
| CV bị LLM-judge gắn cờ còn PII | 2/41 | 3/41 |
| Latency trung bình toàn pipeline | 10744 ms | **8531 ms** |
| Parse yield bộ CV Hard (5 CV thật TopCV.vn) | 2356 ký tự (TB) | **2721 ký tự** (TB) |
| Case cực đoan nhất (`HARD-PHI-NGOC-THIEN`, PDF 541KB) | **710 ký tự** | **2681 ký tự** |

Precision giảm nhẹ (1.00→0.90) là đánh đổi hợp lý: taxonomy lớn hơn nhận nhiều skill thật hơn, đồng
nghĩa cũng có vài false-positive (vd. gán nhầm `TestNG`/`Go` khi không có trong CV) — nhưng đổi lại
recall tăng gấp gần 6 lần. PII-judge-flag tăng nhẹ (2→3) là hạn chế còn tồn đọng, nói ở mục cuối.

## Phát hiện quan trọng phát sinh trong lúc chạy eval

Khi chạy eval để lấy số liệu "sau" thật, phát hiện và phải xử lý 3 vấn đề ngoài dự kiến:

1. **Cache eval cũ + eval harness hardcode thứ tự node cũ**: lần chạy đầu tiên vô tình đọc cache kết
   quả từ *trước* redesign (cache key không tính đến thay đổi code) và `evaluation/ingest_eval/pipeline.py`
   hardcode `NODE_ORDER=[parse,clean,summarize,extract,embed]` (thứ tự cũ) — nếu không phát hiện sẽ báo
   cáo sai. Đã sửa `pipeline.py` khớp graph mới, xoá cache liên quan, tạo `evaluation/ingest_eval_v2/`
   riêng để không đụng vào `evaluation/ingest_eval/report.md` gốc (giữ làm baseline). Sau khi số liệu
   v2 đã chốt, `evaluation/ingest_eval/` được gộp hẳn vào `ingest_eval_v2/` (di chuyển các module dùng
   chung, xoá report v1) để chỉ còn một harness eval duy nhất — số liệu v1 vẫn giữ nguyên trong bảng
   trên vì đã đo và ghi lại trước khi gộp.

2. **Bug có sẵn từ trước, chưa từng được nhận diện đúng nguyên nhân** — đây là phát hiện quan trọng
   nhất: case `HARD-PHI-NGOC-THIEN` (710 ký tự) mà báo cáo v1 đổ lỗi cho "layout PDF nhiều icon" thực ra
   do một bug khác hẳn trong `redact_pii()`. Cơ chế "bỏ qua toàn bộ nội dung trong section `## Contact`"
   **không bao giờ đóng lại** nếu heading thật kế tiếp (`KỸ NĂNG CHUYÊN MÔN`, `💼 KINH NGHIỆM / DỰ ÁN`)
   không khớp *chính xác* với `SECTION_NAMES` (thừa từ mô tả + emoji che mất) — khiến toàn bộ phần còn
   lại của CV (kỹ năng, kinh nghiệm, dự án...) bị xoá sạch, không phải do parse mất nội dung. Đã sửa 2
   lớp:
   - Nhận diện heading khoan dung hơn (chấp nhận thừa 1-3 từ mô tả, tự strip emoji dẫn đầu), **và luôn
     giữ lại phần nội dung còn sót** thay vì âm thầm xoá (tránh lặp lại đúng loại lỗi vừa sửa).
   - Giới hạn cứng 15 dòng cho scope "bỏ qua Contact" — nếu heading kế tiếp vẫn không nhận diện được,
     dừng bỏ qua thay vì nuốt hết phần còn lại của CV. Đây là lớp phòng vệ cho những case tương tự
     chưa phát hiện được trong 41 CV mẫu.

3. **Regression tự gây ra rồi tự bắt được**: bản vá đầu tiên cho vấn đề (2) dùng "khoan dung heading
   theo tiền tố" nhưng vẫn xoá luôn phần nội dung sau tiền tố — làm mất "JavaScript"/"Git" ở 2 CV mock
   khi PDF renderer dồn heading và nội dung ("Education BEng Software...", "Skills TypeScript
   JavaScript Git") vào chung 1 dòng. Phát hiện qua test suite (`test_seed_mock_cvs.py`), sửa bằng cách
   luôn giữ lại phần dư dưới dạng dòng nội dung thay vì đoán khi nào nên xoá.

Ba vấn đề trên không nằm trong kế hoạch ban đầu — được tìm ra vì đã đo bằng eval thật thay vì chỉ tin
vào test suite hoặc suy luận. `evaluation/.cache/ingest_eval/` đã được dọn cache liên quan sau mỗi lần
sửa để đảm bảo số liệu v2 cuối cùng phản ánh đúng code hiện tại.

## Tóm tắt các thay đổi khác

| # | Vấn đề | Trước | Sau |
|---|---|---|---|
| 1 | Extract skill chạy **sau** khi LLM tóm tắt cắt bớt CV | Graph: `parse→clean→summarize→extract→embed` | Graph: `parse→clean→extract→summarize→embed`; `summarize` không còn ghi đè `metadata.skills` |
| 2 | Chỉ match chuỗi con chính xác theo alias liệt kê sẵn | Không có fuzzy/typo tolerance | Fuzzy fallback (rapidfuzz, ngưỡng 88, chỉ candidate ≥4 ký tự) — bắt lỗi chính tả/spacing |
| 3 | *(bug phát hiện thêm)* dấu câu dính vào từ khiến match thất bại (`"...and Flink."`) | Không tách dấu câu cuối câu | Regex tách dấu câu cuối câu dính liền từ, không đụng `C++`/`C#`/`.NET`/`Node.js` |
| 4 | Không có tín hiệu báo CV parse tệ | Không có | `metadata.content_chars` + `metadata.low_content`, giữ nguyên qua toàn graph |
| 5 | DOCX quảng cáo hỗ trợ nhưng decode UTF-8 sai | Không có nhánh DOCX riêng | `python-docx` đọc paragraph/heading/bullet/table thật |
| 6 | URL không scheme (`twitter.com/handle`) lọt PII | `URL_RE` chỉ whitelist github/linkedin/facebook | Thêm pattern domain/path tổng quát + phát hiện tên bị "wrap" xuống dòng |
| 7 | Lỗi (LLM timeout, embedding lỗi...) bị nuốt hoàn toàn | `except Exception: log; return None` | Retry+backoff (3 lần) ở tầng HTTP và tầng orchestration; lỗi "not found" fail-fast |

**Taxonomy**: giữ nguyên 10 skill gốc, chỉ thêm mới. Cố tình **không** thêm canonical 1 ký tự như `"C"`,
`"R"` hay alias `"go"` trần — vì `load_taxonomy_index()` tự động thêm canonical name làm alias, một
skill tên `"C"` sẽ khớp mọi chữ "c" đứng một mình (false-positive cực cao). "C" vẫn phủ qua term an
toàn hơn: `"Embedded C"`.

**PDF layout-aware**: đã thử cài `docling` (model layout thật) trước, nhưng quá nặng (cài >3 phút, kéo
theo `torch`). Chuyển sang `pdfplumber` (nhẹ, không ML) làm fallback tách cột khi nội dung dưới ngưỡng
600 ký tự. Trong 41 CV mẫu, sau khi sửa bug (2) ở trên thì không CV nào còn rơi xuống dưới ngưỡng này
để kích hoạt fallback — nghĩa là phần lớn "vấn đề layout" trong dữ liệu mẫu thực ra là bug redact, không
phải parse yếu. Fallback vẫn được giữ lại và verify đúng qua test PDF 2 cột giả lập, vì layout khó hơn
41 mẫu này chắc chắn tồn tại trong thực tế.

## Những gì CHƯA làm (giới hạn phạm vi, nói thẳng)

- **`.doc` nhị phân cũ** (không phải `.docx`) vẫn không hỗ trợ — chỉ OOXML `.docx` thật hoạt động.
- **Không có bản ghi "failed" trong DB** cho resume ingest thất bại vĩnh viễn — cần schema migration,
  ngoài phạm vi lần này.
- **PII redaction vẫn regex/heuristic**, không phải NER model thật. Số liệu thật: CV bị LLM-judge gắn
  cờ còn PII tăng nhẹ 2→3/41 (case dạng "HỌ TÊN VIẾT HOA; Quận, Thành phố" — cùng dạng case đã biết từ
  v1, không phải regression do thay đổi lần này gây ra, nhưng vẫn chưa vá).
- **Faithfulness/anti-fabrication** cho `summary`/`body` tự do chỉ dựa vào prompt, không có automated
  check — chỉ `titles` có filter grounding tự động.
- Không tích hợp `docling`/model layout thật — `pdfplumber` là lựa chọn thực dụng.

## Cách verify

```bash
.venv/Scripts/python -m pytest tests/ -q
# 98 passed

.venv/Scripts/python -m evaluation.ingest_eval_v2.run_eval   # cần OPENAI_API_KEY, tốn phí thật nhỏ
```

File thay đổi chính: `backend/app/agents/ingest/graph.py`,
`backend/app/agents/ingest/nodes/{parse,summarize}.py`, `backend/app/clients/llm.py`,
`backend/app/prompts/system/summarize.txt`,
`backend/app/services/matching/{ingest,parse,skills,summarize}.py`,
`backend/app/services/matching/resources/skill_graph.json`, `requirements.txt`,
`docs/architecture-agent-backend.md`, `evaluation/ingest_eval_v2/pipeline.py` (sửa `NODE_ORDER`,
sau này gộp về đây từ `evaluation/ingest_eval/`), và test tương ứng trong `tests/unit/`.
