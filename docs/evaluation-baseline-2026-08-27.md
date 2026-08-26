# RAG Agent System — Full Performance & Quality Baseline (2026-08-27)

> Baseline mốc so sánh cho các đợt tối ưu sau này. Mỗi lần tối ưu, chạy lại đúng các
> script liệt kê dưới đây và so sánh thủ công với bảng số liệu trong file này.

- Git commit tại thời điểm baseline: `46ead5b`
- Thay thế vai trò mốc tham chiếu của [`docs/evaluation.md`](evaluation.md) (giữ nguyên file cũ để đối chiếu lịch sử — lưu ý file cũ dùng golden dataset **v1** 10 JD × 20 CV, còn baseline này dùng golden dataset **v2** 20 JD × 40 CV, nên số liệu quality hai file **không so sánh trực tiếp được**, xem mục 6).
- Tài liệu nguồn: [spec](superpowers/specs/2026-08-27-rag-full-benchmark-design.md), [plan](superpowers/plans/2026-08-27-rag-full-benchmark.md).

## 1. Ingest Agent

Nguồn: [`evaluation/ingest_eval_v2/results/report.md`](../evaluation/ingest_eval_v2/results/report.md) (77 CV, chạy lại toàn bộ ngày 2026-08-27).

| Node | Mean (ms) | Median (ms) | Max (ms) | Tỷ trọng |
|---|---|---|---|---|
| `parse` | 731.05 | 715.30 | 3392.30 | ~8.6% |
| `clean` | 1.75 | — | — | <0.1% |
| `extract` | 40.47 | — | — | ~0.5% |
| `summarize` | 7093.36 | 6597.60 | 22122.60 | ~83.6% |
| `embed` | 620.01 | — | — | ~7.3% |

**Tổng latency trung bình: 8486.64 ms** (so với 7124.68 ms ngày 2026-08-24, +19.1%). Toàn bộ chênh lệch nằm ở `summarize` (LLM call, +22.2% mean, max tăng gần 3 lần 8.3s→22.1s); các node compute-local (`parse`/`clean`/`extract`/`embed`) lệch trong biên độ nhiễu bình thường (≤10%). Đã kiểm tra: không có commit nào trong khoảng 2026-08-24→27 đụng vào node `summarize` hay prompt của nó — chênh lệch nhiều khả năng là biến động phía OpenAI API giữa 2 lần gọi, không phải regression do code. Cần theo dõi tiếp ở lần benchmark sau để xác nhận.

Quality: faithfulness 0.99 (so với 1.00), skill precision 0.91 (không đổi), skill recall 0.61 (so với 0.62) — đều trong biên độ nhiễu, không đổi có ý nghĩa.

## 2. Matching Agent (JD→CV)

**Latency per-node** — [`evaluation/matching_perf/results/report.md`](../evaluation/matching_perf/results/report.md) (5/20 JD, 1 lần lặp):

| Node | Mean (ms) | Median (ms) | Max (ms) | Tỷ trọng |
|---|---|---|---|---|
| `retrieve` | 1.7 | 1.1 | 4.2 | ~0.1% |
| `skill` | 1.4 | 1.3 | 1.7 | ~0.1% |
| `rrf` | 0.7 | 0.5 | 1.4 | ~0.0% |
| `rerank` | 0.3 | 0.3 | 0.3 | ~0.0% |
| `explain` | 1510.9 | 0.9 | 7537.0 | ~99.7% |
| `respond` | 0.3 | 0.3 | 0.3 | ~0.0% |

⚠️ **Số liệu `explain` không đáng tin cậy như vẽ ra** — xem mục 7.1.

**Quality** (P/R/NDCG/MRR) — mục "1. Ranking metrics" trong [`evaluation/golden/results/report.md`](../evaluation/golden/results/report.md), macro trung bình 20 JD:

| P@5 | R@5 | NDCG@5 | P@10 | R@10 | NDCG@10 | MRR |
|---|---|---|---|---|---|---|
| 0.73 | 0.35 | 0.57 | 0.68 | 0.60 | 0.66 | 0.32 |

## 3. Recommend Agent (CV→JD)

**Latency per-node** (score-path và advice-path) — [`evaluation/recommend_perf/results/report.md`](../evaluation/recommend_perf/results/report.md) (5/40 CV, 1 lần lặp/path):

Score path (`router → retrieve → kg_retrieval → score → rerank → explain → respond`):

| Node | Mean (ms) | Median (ms) | Max (ms) | Tỷ trọng |
|---|---|---|---|---|
| `router` | 10.4 | 1.3 | 46.8 | ~0.6% |
| `retrieve` | 0.4 | 0.4 | 0.5 | ~0.0% |
| `kg_retrieval` | 40.6 | 41.1 | 94.9 | ~2.4% |
| `score` | 1.7 | 1.8 | 2.2 | ~0.1% |
| `rerank` | 0.4 | 0.5 | 0.5 | ~0.0% |
| `explain` | 1642.3 | 1.3 | 8189.8 | ~96.8% |
| `respond` | 0.3 | 0.3 | 0.4 | ~0.0% |

Advice path (`router → retrieve → kg_retrieval → advice`, khi intent là SKILL_GAP_ADVICE/CHITCHAT — bỏ qua score/rerank/explain/respond hoàn toàn):

| Node | Mean (ms) | Median (ms) | Max (ms) | Tỷ trọng |
|---|---|---|---|---|
| `router` | 1.0 | 1.0 | 1.2 | ~0.1% |
| `retrieve` | 0.2 | 0.2 | 0.3 | ~0.0% |
| `kg_retrieval` | 0.9 | 0.9 | 1.0 | ~0.1% |
| `advice` | 1721.5 | 0.8 | 8589.6 | ~99.9% |

⚠️ `explain`/`advice` cũng dính vấn đề cache như Matching — xem mục 7.1.

`router` không gọi LLM (xác nhận qua đọc code `backend/app/agents/nodes/router.py`: thuần regex/keyword classification) — latency của nó chỉ là compute-local, phù hợp với con số đo được. `kg_retrieval` cũng thuần lookup tĩnh (`backend/app/services/kg/client.py`, 71 dòng), không gọi network — ~40ms cho score-path là compute-local overhead thực sự, có thể là điểm tối ưu nhỏ nếu cần.

**Quality** — mục "1b. Reverse ranking metrics" trong [`evaluation/golden/results/report.md`](../evaluation/golden/results/report.md), macro trung bình 40 CV:

| P@5 | R@5 | NDCG@5 | P@10 | R@10 | NDCG@10 | MRR |
|---|---|---|---|---|---|---|
| 0.62 | 0.57 | 0.74 | 0.49 | 0.81 | 0.80 | 0.44 |

Calibration: 26/40 CV có JD gốc lọt top-3 trong xếp hạng 20 JD.

## 4. Service RAG lõi

**Compute-local** — [`evaluation/service_bench/results/compute_local_report.md`](../evaluation/service_bench/results/compute_local_report.md) (input: 40 CV + JD-01 golden dataset):

| Hàm | Mean (ms) | Median (ms) | Stddev (ms) | Max (ms) |
|---|---|---|---|---|
| `bm25_scores` (40 docs) | **1375.81** | 1229.19 | 306.09 | 2490.83 |
| `score_candidates` (40 rows, RRF fusion) | 1.4575 | 1.4589 | 0.0640 | 1.7027 |
| `semantic_score` (1 distance) | 0.0002 | 0.0002 | 0.0001 | 0.0011 |
| `coverage_score` (1 CV) | 0.0331 | 0.0324 | 0.0038 | 0.0799 |

🔴 **Phát hiện đáng chú ý:** `bm25_scores` trên 40 tài liệu ngắn mất trung bình **~1.38 giây**, cao hơn `score_candidates` (toàn bộ pipeline RRF fusion, bao gồm cả `coverage_score`/`semantic_score`) gần **1000 lần**. Đây là bất thường cho một hàm BM25 thuần Python trên 40 văn bản ngắn — không nên mất hơn vài mili-giây. Nhiều khả năng có tính toán lặp lại không cần thiết (re-tokenize/re-compute IDF mỗi lần gọi thay vì cache). Đây là ứng viên tối ưu compute-local ưu tiên cao nhất trong toàn hệ thống — xem mục 7.2.

**Network-call** — Task 4 không thể chạy: `evaluation/service_bench/results/network_call_report.md` **chưa tồn tại**. `QWEN_API_KEY` trong `.env` hiện tại không hợp lệ (401 Unauthorized khi gọi `embed_query` qua production Qwen client) — đây là gap thật của baseline này, cần key hợp lệ để đo latency `embed_query`/`chat_complete`/`rerank_query` thật trước khi tối ưu các phần network-call.

## 5. Concurrency check

[`evaluation/concurrency_bench/results/report.md`](../evaluation/concurrency_bench/results/report.md), 5 request song song/graph:

| Graph | Wall time song song | Tổng tuần tự | Speedup | Lỗi |
|---|---|---|---|---|
| Matching | 13245.1 ms | 33056.7 ms | ~2.5x | 0/5 |
| Recommend | 8452.7 ms | 40359.1 ms | ~4.8x | 0/5 |

Không phát hiện lỗi/race condition ở quy mô 5 request đồng thời cho cả 2 graph.

## 6. So sánh với báo cáo cũ (`docs/evaluation.md`, golden v1 10JD×20CV)

Số P@5/NDCG@5/MRR trong báo cáo cũ (0.86/0.90/0.95) **cao hơn nhiều** so với baseline này (0.73/0.57/0.32 chiều JD→CV). Đây **không phải regression** — đã đối chiếu trực tiếp qua git diff `evaluation/golden/results/report.md` giữa lần chạy trước Task 7 và sau Task 7 (cùng golden **v2** 20JD×40CV): macro metrics gần như y hệt (P@5 0.73→0.73, NDCG@5 0.58→0.57, MRR 0.32→0.32) — nghĩa là **các commit code gần đây (BM25 alias fix, drop dead nodes...) không làm thay đổi chất lượng ranking**. Chênh lệch lớn so với báo cáo cũ chỉ đến từ việc đổi bộ dữ liệu golden v1 (10 JD × 20 CV pool nhỏ) sang v2 (20 JD × 40 CV pool lớn hơn, nhiều distractor hơn, khó hơn) hồi 2026-08-24 — baseline v2 này khó hơn về bản chất, không phải hệ thống kém đi.

## 7. Bottleneck & hướng tối ưu đề xuất (không implement trong đợt này)

### 7.1. Lỗ hổng phương pháp cần sửa trước khi tin số liệu `explain`/`advice`

Cả `matching_perf` và `recommend_perf` cache LLM response theo `cache_key=f"...|{prompt[:120]}"` — chỉ 120 ký tự đầu prompt. Nếu phần đầu prompt (template hướng dẫn chung) giống nhau giữa các JD/CV khác nhau, các lệnh gọi `explain`/`advice` cho JD/CV #2-#5 sẽ **vô tình dùng lại cache của JD/CV #1** thay vì gọi LLM thật — giải thích tại sao median (~0.9-1.3ms) thấp bất thường so với mean (~1500-1700ms): chỉ 1/5 mẫu là cuộc gọi thật (max ~7.5-8.6s), 4/5 còn lại là cache-hit giả. **Trước khi dùng số `explain`/`advice` này để ra quyết định tối ưu, cần sửa cache key thành hash của toàn bộ prompt** (không truncate) rồi chạy lại `evaluation/matching_perf/run_bench.py` và `evaluation/recommend_perf/run_bench.py`. Số liệu đáng tin hơn tạm thời: `explain` là 1 LLM call/request — độ lớn thật nằm trong khoảng vài trăm ms đến vài giây tùy model, tham khảo `evaluation/service_bench/results/network_call_report.md` một khi có `QWEN_API_KEY` hợp lệ để chạy Task 4.

### 7.2. `bm25_scores` — ưu tiên tối ưu compute-local cao nhất

~1.38s cho 40 tài liệu ngắn là bất thường (mục 4). Hướng điều tra: có tokenize/tính IDF lại từ đầu mỗi lần gọi `bm25_scores()` không (nên cache theo corpus nếu corpus không đổi giữa các lần gọi trong 1 request), hay `_SPLIT`/`STOPWORDS` regex có đang chạy trên object lớn không cần thiết. Vì `bm25_scores` được gọi trong đường retrieve thật (`backend/app/services/matching/retrieve.py`) cho mỗi request, đây có thể là bottleneck ẩn không xuất hiện rõ trong `matching_perf`/`recommend_perf` vì 2 benchmark đó dùng fixture với `bm25_score=0.0` cố định (không thực sự gọi `bm25_scores` qua graph — xem ghi chú trong `evaluation/matching_perf/fixtures.py`).

### 7.3. `summarize` (Ingest) và `explain`/`advice` (Matching/Recommend) là LLM-call, chiếm >80-99% latency mỗi graph

Đúng như kỳ vọng cho pipeline có LLM. Hướng tối ưu khả dĩ cho vòng sau (không làm ở đây): batch nhiều candidate vào 1 prompt `explain` thay vì có khả năng gọi lặp lại, cân nhắc model nhỏ/nhanh hơn cho `explain`/`advice` (khác model dùng cho `summarize`, vốn cần chất lượng cao hơn), hoặc caching response `explain` theo cặp (JD, candidate) nếu ứng dụng cho phép.

### 7.4. Việc còn thiếu cho lần benchmark sau

- Cần `QWEN_API_KEY` hợp lệ trong `.env` để chạy `evaluation/service_bench/network_call_bench.py` — hiện tại baseline này thiếu số liệu network-call thật (embed/chat/rerank qua production client).
- Sau khi sửa cache-key ở mục 7.1, chạy lại `matching_perf`/`recommend_perf` với `--repeats` lớn hơn (3-5) để có số liệu `explain`/`advice` đáng tin cậy.
