# Rule xây dựng evaluation và benchmark

## 1. Eval là một thí nghiệm có phiên bản

Trước khi chạy eval, phải viết rõ:

- Câu hỏi/hypothesis: thay đổi nào kỳ vọng cải thiện hành vi nào.
- Baseline và candidate: commit, config, prompt, model/provider, reasoning/temperature, embedding/rerank model, taxonomy, weights và threshold.
- Dataset/split/version và nguồn gốc nhãn.
- Metric chính, metric phụ, hard gate, hướng tốt hơn và ngưỡng chấp nhận.
- Ngân sách API, số lần lặp, timeout và điều kiện dừng.

Không thay đổi nhiều biến độc lập trong cùng so sánh nếu cần quy nguyên nhân. Nếu buộc phải đổi cùng lúc, gọi đó là so sánh hệ thống và không kết luận thành phần nào tạo ra delta.

## 2. Phân tầng eval

Một thay đổi AI quan trọng phải được đo ở các tầng phù hợp:

1. **Unit/deterministic**: parser, redaction, taxonomy, constraint, RRF, metric formula, schema validator.
2. **Component eval**: từng node parse/extract/summarize/embed/retrieve/rerank/explain.
3. **Pipeline offline**: chạy graph thật với dependency được kiểm soát, ghi snapshot từng node.
4. **Integration**: Supabase/RPC/RLS/provider thật trong môi trường test tách biệt.
5. **End-to-end**: API với auth và dữ liệu đại diện.
6. **Safety/adversarial**: injection, PII, cross-tenant, malformed file/output, denial-of-wallet và fail-open.
7. **Human review/canary**: chỉ khi cần xác nhận utility thực tế; không dùng production user làm thí nghiệm ngầm.

Unit test pass không chứng minh chất lượng AI; điểm LLM-judge cao không chứng minh auth/RLS đúng.

## 3. Dataset và chống leakage

- Có train/dev/test hoặc ít nhất tuning set và held-out test set. Không tune trên bộ test cuối rồi tiếp tục gọi nó là held-out.
- Golden set phải có manifest, ID ổn định, nguồn, ngôn ngữ, domain, difficulty, quality profile và consent/license.
- Deduplicate theo content hash gần/xa; phát hiện CV/JD cùng người/nội dung xuất hiện ở nhiều split.
- Giữ một challenge set riêng gồm PDF nhiều cột/icon/OCR, DOCX, text mỏng, Unicode, song ngữ, prompt injection, PII khó và provider failure.
- Bổ sung case từ production incident sau khi de-identify, nhưng không xóa case cũ chỉ vì khó pass.
- Dataset phải đại diện cả hai chiều: JD -> CV cho recruiter và CV -> JD cho candidate.
- Báo kết quả theo slice, không chỉ macro trung bình: VI/EN, domain, seniority, sparse/polished/cross-domain, hard-layout và input length.
- Với dữ liệu tuyển dụng thật, không commit raw PII. Artifact/report chỉ dùng ID giả và ví dụ đã redaction.

## 4. Metric cho ingest CV

Tối thiểu đo:

- Parse success và tỷ lệ `low_content`; số ký tự/token không tự động đồng nghĩa parse đúng.
- Field/section completeness cho experience, education, skills khi có nhãn.
- Skill extraction precision, recall, F1; canonicalization accuracy và taxonomy coverage.
- Skill preservation từ full cleaned text qua summarize; số skill bị mất là metric riêng.
- Faithfulness theo claim: số claim có evidence / tổng claim; liệt kê unsupported claim.
- Hallucination rate, empty/invalid structured output rate và title/field invented rate.
- PII leak theo loại, name leak và LLM-detected leak; đây là hard gate theo từng case.
- Embedding dimension, finite/non-zero, stability và retrieval usefulness; không coi vector đúng dimension là đủ chất lượng.
- Latency từng node và end-to-end: cold/warm, p50/p95/max; token và chi phí.

Khi metric deterministic dùng cùng code production (ví dụ cùng regex redaction), phải có thêm oracle độc lập hoặc tập nhãn thủ công để tránh “cùng một lỗi ở cả hệ thống và thước đo”.

## 5. Metric cho retrieval, matching và ranking

Tối thiểu đo trên pool đóng và qrels rõ ràng:

- Precision@K, Recall@K, NDCG@K, MRR; báo denominator và relevance threshold.
- Coverage của pool/candidate generation trước khi đánh giá rerank. Reranker không thể cứu item đã bị retrieval bỏ.
- Constraint accuracy: pass/unknown/fail, false reject và hard-constraint violation@K.
- Score calibration theo bucket nếu score được trình bày như mức phù hợp.
- Stability/tie-breaking: cùng input/config phải cho thứ tự deterministic ngoài thành phần provider được khai báo.
- Robustness khi semantic/BM25/KG/rerank provider lỗi; fallback ranking vẫn tuân constraint.
- Explanation faithfulness/evidence coverage; explanation không được chấm thay cho ranking quality.
- Hai chiều JD -> CV và CV -> JD phải đo riêng vì mục tiêu và pool khác nhau.

Không chỉ đo “own JD rank”; phải đánh giá toàn pool. Không coi cosine tính offline và RPC pgvector là hoàn toàn tương đương nếu chưa có integration parity test.

## 6. Metric guardrail và safety

Safety suite phải có hard gate độc lập:

- PII/secret leak rate = 0 trên suite bắt buộc.
- Cross-user/cross-company unauthorized access = 0.
- Prompt-injection attack success rate = 0 cho hành vi cấm đã định nghĩa.
- Invalid output được chấp nhận/persist = 0.
- Fail-open khi provider/database/validator lỗi = 0.
- Protected-attribute influence trên cặp counterfactual không liên quan công việc = 0 trong sai số tie-break đã định nghĩa.

Đồng thời báo utility:

- False positive/refusal rate trên input hợp lệ.
- Tỷ lệ xử lý thành công sau redaction.
- Chênh lệch ranking/quality do guardrail gây ra.
- Latency và cost overhead.

Không gộp safety và quality thành một điểm trung bình duy nhất.

## 7. LLM-as-judge

LLM-as-judge chỉ là một nguồn tín hiệu. BẮT BUỘC:

- Version judge prompt, model, provider, temperature, schema và parsing logic.
- Blind nhãn baseline/candidate và thứ tự output để giảm positional bias.
- Yêu cầu evidence/claim list; metric tổng hợp được tính bằng code khi có thể, không lấy nguyên điểm tự báo của model.
- Có parse-error rate và không biến parse error thành điểm 0/1 âm thầm.
- Hiệu chuẩn trên một tập người chấm thủ công; báo agreement/disagreement và audit ngẫu nhiên case pass lẫn fail.
- Ưu tiên judge khác model/prompt với system under test. Nếu dùng cùng model, phải ghi rõ giới hạn và không gọi kết quả là ground truth.
- Với qrels tuyển dụng, ít nhất kiểm tra thủ công mẫu stratified, các own-pair, case grade biên và case judge mâu thuẫn evidence.
- Không để judge nhìn tên model/config hoặc metric kỳ vọng.

## 8. Tính tái lập và cache

Mỗi run/report phải lưu:

- UTC timestamp, git commit và trạng thái dirty.
- Python/dependency version cần thiết.
- Dataset manifest hash và sample count thực chạy/thất bại.
- Full model/provider identifier, prompt version/hash, embedding dimension.
- Taxonomy/skill graph hash, weights, thresholds, K, seed và concurrency.
- Cache hit/miss, retry/fallback count, token/cost và latency.

Cache key phải dựa trên **nội dung đầy đủ hoặc content hash**, không chỉ `cv_id`, tên file hay độ dài bytes. Cache phải bao gồm mọi biến ảnh hưởng output: prompt, model, provider, params, parser/taxonomy/code version và input. Thay bất kỳ biến nào phải invalidation hoặc namespace mới.

Không xóa cache để che sự không tái lập. Không tái sử dụng output cũ giữa hai model/config rồi báo như candidate run mới.

## 9. So sánh và thống kê

- Chạy baseline và candidate trên cùng tập, cùng điều kiện; dùng paired delta theo sample/query.
- Báo absolute score, absolute delta, relative delta khi hữu ích, số sample và failure count.
- Với metric nhiễu, chạy lặp hoặc bootstrap confidence interval. Không diễn giải chênh lệch rất nhỏ như cải thiện chắc chắn nếu nằm trong noise.
- Báo worst-case và danh sách regression quan trọng, không chỉ mean.
- Phân biệt cold/warm cache, local/offline và integration/provider thật.
- Nếu một run bị thiếu sample, không so macro trực tiếp mà không nêu rõ denominator khác nhau.

## 10. Cổng hồi quy

Mỗi thay đổi phải phân loại:

- **Hard gate**: authz, privacy, injection, schema, fail-open, dữ liệu chéo tenant. Một case fail là chặn.
- **Quality gate**: metric chính không giảm quá budget đã định và không có slice quan trọng giảm mạnh.
- **Performance gate**: p95 latency/cost không vượt budget trừ khi quality gain đã được chấp thuận.
- **Review gate**: mọi case mới xấu hơn phải có phân tích nguyên nhân, không chỉ bảng điểm.

Không hạ gate sau khi thấy candidate fail nếu chưa có lý do sản phẩm, review và cập nhật decision log. Không cherry-pick subset hoặc loại outlier sau khi nhìn kết quả.

## 11. Báo cáo eval trung thực

Báo cáo phải có:

- Mục tiêu và ngày chạy.
- Baseline/candidate config đầy đủ.
- Dataset, nguồn, split, sample count và coverage.
- Methodology, metric formula/threshold và giới hạn.
- Bảng overall + slice + worst regressions.
- Safety hard gates.
- Latency/cost và cache state.
- Kết luận: ship, không ship, hoặc cần thêm dữ liệu; kèm lý do.

KHÔNG ĐƯỢC:

- Copy số từ report cũ sau khi code đã đổi.
- Ghi “100%” khi có sample bỏ qua, parse error hoặc judge error không tính denominator.
- Tuyên bố production-ready từ offline eval duy nhất.
- Công bố ví dụ chứa PII hoặc prompt/secret nội bộ.

## 12. Các entry point hiện có

- Ingest eval: `python -m evaluation.ingest_eval_v2.run_eval` và `--limit N` cho smoke có chủ đích.
- Golden ranking hai chiều: `python -m evaluation.golden.run_eval`.
- Unit tests metric/eval trong `tests/unit/test_eval_*`, `test_golden_*`, `test_matching_*`.

Các lệnh gọi provider có thể tốn tiền và cần key/network. Agent không tự chạy full eval bên ngoài chỉ để “kiểm tra nhanh”; phải xác định ngân sách và quyền trước. Smoke nhỏ không thay thế full regression report.
