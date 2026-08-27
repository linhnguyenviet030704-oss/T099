# Matching Agent (JD→CV) — Per-node Latency Benchmark

- Chạy lúc: 2026-08-26T18:37:15.175579+00:00
- Git commit: `e404754`
- JD mẫu: JD-01, JD-02, JD-03, JD-04, JD-05 (5/20 JD trong golden dataset), 1 lần lặp/JD
- LLM backend: OpenAI `gpt-4o-mini` qua cache `evaluation/golden/.cache/` — xem lưu ý ở đầu `run_bench.py` về số đo node `explain`

| Node | Mean (ms) | Median (ms) | Max (ms) | Tỷ trọng |
|---|---|---|---|---|
| `retrieve` | 1.7 | 1.1 | 4.2 | ~0.1% |
| `skill` | 1.4 | 1.3 | 1.7 | ~0.1% |
| `rrf` | 0.7 | 0.5 | 1.4 | ~0.0% |
| `rerank` | 0.3 | 0.3 | 0.3 | ~0.0% |
| `explain` | 1510.9 | 0.9 | 7537.0 | ~99.7% |
| `respond` | 0.3 | 0.3 | 0.3 | ~0.0% |

**Tổng latency trung bình/JD: 1515.2 ms**
