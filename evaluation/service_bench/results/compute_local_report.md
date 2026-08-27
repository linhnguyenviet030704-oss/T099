# Compute-local Service Micro-benchmark

- Chạy lúc: 2026-08-26T18:37:30.059336+00:00
- Git commit: `14ab8ff`
- Không gọi API ngoài; input lấy từ 40 CV + JD-01 trong golden dataset để có kích thước thực tế.

| Hàm | Mean (ms) | Median (ms) | Stddev (ms) | Max (ms) |
|---|---|---|---|---|
| `bm25_scores (40 docs)` | 1375.8126 | 1229.1931 | 306.0852 | 2490.8300 |
| `score_candidates (40 rows, RRF fusion)` | 1.4575 | 1.4589 | 0.0640 | 1.7027 |
| `semantic_score (single distance)` | 0.0002 | 0.0002 | 0.0001 | 0.0011 |
| `coverage_score (single CV)` | 0.0331 | 0.0324 | 0.0038 | 0.0799 |
