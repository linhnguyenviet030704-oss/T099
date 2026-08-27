# Recommend Agent (CV→JD) — Per-node Latency Benchmark

- Chạy lúc: 2026-08-26T18:39:11.798399+00:00
- Git commit: `6e38c5e`
- CV mẫu: G1-FS-02, G1-FE-02, G2-DO-02, G2-PE-02, G1-FS-01 (5/40 CV trong golden dataset), 1 lần lặp/CV/path
- LLM backend: OpenAI `gpt-4o-mini` qua cache `evaluation/golden/.cache/`

## Score path ("Gợi ý công việc...") — router → retrieve → kg_retrieval → score → rerank → explain → respond

| Node | Mean (ms) | Median (ms) | Max (ms) | Tỷ trọng |
|---|---|---|---|---|
| `router` | 10.4 | 1.3 | 46.8 | ~0.6% |
| `retrieve` | 0.4 | 0.4 | 0.5 | ~0.0% |
| `kg_retrieval` | 40.6 | 41.1 | 94.9 | ~2.4% |
| `score` | 1.7 | 1.8 | 2.2 | ~0.1% |
| `rerank` | 0.4 | 0.5 | 0.5 | ~0.0% |
| `explain` | 1642.3 | 1.3 | 8189.8 | ~96.8% |
| `respond` | 0.3 | 0.3 | 0.4 | ~0.0% |

**Tổng latency trung bình: 1696.3 ms**

## Advice path ("Tôi cần bổ sung kỹ năng...") — router → retrieve → kg_retrieval → advice

| Node | Mean (ms) | Median (ms) | Max (ms) | Tỷ trọng |
|---|---|---|---|---|
| `router` | 1.0 | 1.0 | 1.2 | ~0.1% |
| `retrieve` | 0.2 | 0.2 | 0.3 | ~0.0% |
| `kg_retrieval` | 0.9 | 0.9 | 1.0 | ~0.1% |
| `advice` | 1721.5 | 0.8 | 8589.6 | ~99.9% |

**Tổng latency trung bình: 1723.7 ms**
