# Requirement → summarized-CV retrieve eval

## Goal

Đo semantic retrieve khi **query = requirements** (giọng JD) và **document = `body` sau summarize** (đúng production embed). Nghi vấn: `body` không đủ gần requirements nên CV nguồn tụt rank.

Eval offline, không đổi ingest/matching, không ghi pgvector.

## Review changelog (2026-08-19)

Khóa determinism: decoy line sampling, `extract_skills` contract, skill replace literal `re.I`, RNG consume decoy kể cả khi cache hit, quota recompute sau mirror fail, unique remove/add, query embedding `text_hash`, fingerprint tách khỏi `run_meta`, cosine/P90/worst/limit-cv/exit codes.

## Decisions (locked)

- Gold: **chỉ CV nguồn** sinh query đó. Decoy không bao giờ là gold.
- Document embed: **chỉ `body`** trong `parsed_CV/*.json`. Không so `summary` / `skills` / markdown trước summarize.
- Query gen **A**: 1 LLM mirror / CV (mirror **tính trong quota**), rồi rule bớt/thêm.
- Corpus = CV thật (body non-empty) + **270 decoy** (default). Decoy không LLM.
- Embedding: `embed_text` / `qwen3.7-text-embedding` 1536-d. Rank cosine similarity; distance report = `1 - cos`.
- Seed: `20260819`. Một `random.Random(seed)` xuyên suốt.
- Không fail CI theo ngưỡng metric. Pytest chỉ cover hàm thuần (không gọi Qwen).

## Out of scope

- Sửa prompt summarize, ingest graph, `/match_job`, `/match_candidates`.
- Ghi `embedded_resumes` / `match_job` / `match_resume`.
- Ablation `summary` vs `skills` vs parse-clean.
- LLM-as-judge hoặc cluster skill làm gold.
- Rerank, RRF, skill coverage trong điểm số eval (pure embedding retrieve). `extract_skills` chỉ dùng để swap/filter decoy + distractor.

---

## 1. Inputs

`data/test_CV_parse/parsed_CV/{stem}.json`

- `cv_id` = `stem`.
- Bỏ file không parse được JSON, không phải object, hoặc `body` blank sau strip.
- `_batch_report.json` không phải CV.

```text
valid = [cv có body]
real_cvs = sorted(valid, key=lambda c: c.cv_id)
if limit_cv is not None:
    real_cvs = real_cvs[:limit_cv]
```

`--limit-cv` cắt **sau** filter + sort. Smoke luôn cùng 2 CV đầu theo `cv_id`.

0 CV hợp lệ → exit 1.

---

## 2. `extract_skills` contract

Hàm: `backend.app.services.matching.skills.extract_skills`.

- Input: raw string (`body`, spliced decoy, distractor line).
- Match: taxonomy hiện có; synonym **dài hơn trước**; haystack + needle qua `_normalize_text` (lowercase, bỏ dấu, collapse space); boundary = token bọc space (`" {variant} "` trong `" {haystack} "`). Không phải regex word-boundary Unicode.
- Output: `list[str]` canonical (`"PostgreSQL"`, `"Spring Boot"`, …). Trùng canonical: giữ lần đầu. Thứ tự list = thứ tự duyệt synonym dài→ngắn, **không** phải thứ tự xuất hiện trong document.

**Canonical sort** khi iterate skill-swap:

```python
sorted(extract_skills(text), key=str.casefold)
```

Không sort thường (`SAP` vs `sap` phụ thuộc locale).

**Skill replace** (decoy text, **không** dùng boundary của `extract_skills`):

```python
re.sub(re.escape(skill), replacement, text, flags=re.IGNORECASE)
```

Literal substring, không `\b`. `Redis` có thể dính `Redistribute`. Không tự “sửa” thành whole-word.

---

## 3. RNG + cache

Một `rng = random.Random(seed)`. Thứ tự consume:

1. Decoy `0 … N-1` (kể cả khi `decoy_docs.json` đã có).
2. Query mutation theo `cv_id` sort (chỉ khi **sinh** query, không khi reuse `queries.json`).

**Luôn chạy thuật toán decoy** để consume RNG. Cache decoy chỉ để persist/đối chiếu, **không** skip bước 1.

- Generate `decoys_mem` bằng `rng`.
- Nếu `decoy_docs.json` thiếu: ghi `decoys_mem`.
- Nếu có và nội dung `(id, text, source_cv_ids)` khác `decoys_mem`: `--refresh-decoys` → ghi đè; không flag → exit 1.
- Nếu trùng: giữ file, tiếp tục với `decoys_mem` (bằng file).

Reuse `queries.json` **không** replay mutation RNG (không cần). Fresh query gen sau decoy consume sẽ ra cùng mutation như run không cache query.

`n_mirror_llm_calls` = số HTTP chat **trong current run**. Cache hit mirror → 0.

---

## 4. Corpus

### Real

`id=cv_id`, `text=body` (đã strip khi accept).

### Decoy (default 270, `--decoys`)

`id=decoy_{i:03d}` cho `i=0..N-1`. Không trùng `cv_id` thật. `N=0` hợp lệ (corpus chỉ real).

**Tách dòng** cho một `body`:

```text
lines = [ln.strip() for ln in body.splitlines() if ln.strip()]
if len(lines) < 4:
    lines = [p.strip() for p in re.split(r"(?<=[.。])\s+", body.strip()) if p.strip()]
```

**Một decoy `i`:**

1. `ids = rng.sample(real_cv_ids, k=2)` nếu `len(real) >= 2`. Nếu 1 CV thật: `ids = [that_id, that_id]`.
2. `lines_a`, `lines_b` từ body của hai id (cùng CV nếu chỉ 1).
3. `a_take = ceil(len(lines_a) / 2)`, `b_take = floor(len(lines_b) / 2)`. `len` là số dòng **của đúng CV đó**. `ceil(0/2)=0`, `floor(1/2)=0`.
4. Chọn dòng = **random sample theo index, giữ original order**:
   - `idx_a = sorted(rng.sample(range(len(lines_a)), k=a_take))` nếu `a_take > 0` và `len(lines_a) > 0`; else `[]`. `a_take` luôn `<= len(lines_a)` nên sample hợp lệ.
   - tương tự `idx_b` với `b_take`, `lines_b`.
   - **Không** lấy N dòng đầu, **không** contiguous slice.
5. `spliced_lines = [lines_a[i] for i in idx_a] + [lines_b[j] for j in idx_b]`.
6. `spliced = "\n".join(spliced_lines)`.
7. Skill-swap trên `spliced` (dưới). Nếu kết quả strip rỗng: text = `decoy_{i:03d} placeholder`.

**Skill-swap**

```text
found = sorted(extract_skills(spliced), key=str.casefold)
blocked = set(found)
used_replacements = set()
text = spliced
for skill in found:
    if rng.random() >= 0.5:
        continue
    candidates = [t for t in SWAP_POOL if t not in blocked and t not in used_replacements]
    if not candidates:
        continue
    replacement = rng.choice(candidates)
    used_replacements.add(replacement)
    text = re.sub(re.escape(skill), replacement, text, flags=re.IGNORECASE)
```

`SWAP_POOL` (thứ tự cố định, `rng.choice` trên list đã lọc, không shuffle pool):

`SAP`, `Kubernetes`, `Salesforce`, `Unreal Engine`, `COBOL`, `Verilog`, `Unity`, `SwiftUI`, `Flutter`, `Laravel`, `Django`, `Spring Boot`, `FastAPI`, `Redis`, `GraphQL`, `Terraform`, `Ansible`.

`source_cv_ids` = list 2 id theo thứ tự sample (không sort).

Cache: `eval/decoy_docs.json` = `[{id, text, source_cv_ids}]`.

---

## 5. Queries (`--queries` default 1000)

Chỉ từ CV thật **mirror thành công**. Decoy không sinh query.

### 5.1 Mirror (LLM)

`chat_complete(..., json_object=True, temperature=0)`:

```text
Rewrite this resume as a job posting Requirements section.

Return ONLY JSON: {"requirements": ["...", "..."]}
- 6 to 10 short bullets
- Facts from the source only. Do not invent skills or years of experience.
- Employer voice ("Required: ...", "Yêu cầu biết ..."), not first person
- Same language as the source
- No names, phones, emails, URLs, dates of birth

SOURCE:
{body}
```

Parse `requirements`: list non-empty stripped. String → split newline / `- ` / `* ` / `•`.

Fail (HTTP, JSON, 0 bullet): CV không có mirror; **vẫn trong corpus**. Không fallback bọc `body`.

`eval/mirrors.json` = `{cv_id: [bullet, ...]}`. Hit → không gọi LLM. `--refresh-mirrors` gọi lại và ghi đè.

0 mirror thành công → exit 1.

### 5.2 Quota (recompute sau mirror)

Bỏ quota tính trên mọi real CV lúc đầu. Sau mirror:

```text
successful = sorted(cv_id có mirror bullets)
n = len(successful)
per = queries // n
extra = queries % n
# i = 0 .. n-1 trên successful đã sort
quota[i] = per + (1 if i < extra else 0)
```

**Mirror nằm trong quota:** `quota` = tổng query của CV đó.

```text
rest = quota - 1          # 1 mirror
n_remove = rest // 2
n_add = rest - n_remove
```

`quota == 0` không xảy ra khi `queries >= n`. Nếu `queries < n` (smoke): CV `i < queries` có `quota=1` (chỉ mirror), còn lại `quota=0` **bỏ** (không emit query). `queries=0` → exit 1.

Target: đủ `--queries` trừ khi không đủ unique remove (dồn add) hoặc `quota=0`. Add luôn điền được nhờ fallback `n` không chặn 12 (mục 5.4) → không infinite loop: mỗi bước thêm đúng 1 variant mới, dừng khi `len(add_list)==n_add`.

### 5.3 Remove

`bullets` = mirror list (giữ thứ tự LLM).

`len(bullets) < 2`: `n_remove = 0`, cộng phần đó vào `n_add`.

Không thì: drop `d` bullet, `d ∈ [1, max(1, len(bullets)//2)]`. Combination **theo index**, không theo text:

```text
candidates = []
for d in range(1, max(1, len(bullets)//2) + 1):
    for combo in itertools.combinations(range(len(bullets)), d):
        remaining = tuple(bullets[i] for i in range(len(bullets)) if i not in combo)
        dropped = [bullets[i] for i in combo]
        candidates.append((remaining, dropped))
rng.shuffle(candidates)
```

Uniqueness key = `tuple(remaining_bullets)` **giữ original order** (không `set`, không sort). Bỏ candidate trùng key. Lấy đến `n_remove`. Text = `"\n".join("- " + b for b in remaining)`.

Không đủ unique → phần thiếu dồn `n_add`.

### 5.4 Add

Eligible distractor: **không** nếu `set(extract_skills(line)) & set(extract_skills(body))` hoặc `line.casefold() in body.casefold()`.

Pool cố định (thứ tự này):

- `Yêu cầu kinh nghiệm SAP ERP`
- `Yêu cầu vận hành Kubernetes production`
- `Yêu cầu 5 năm kinh nghiệm thương mại điện tử`
- `Yêu cầu Salesforce administrator`
- `Yêu cầu Unreal Engine 5`
- `Yêu cầu IELTS 7.0`
- `Yêu cầu chứng chỉ CPA / kế toán trưởng`
- `Yêu cầu COBOL trên mainframe`
- `Yêu cầu Verilog / FPGA`
- `Yêu cầu Unity game client`
- `Yêu cầu Terraform + Ansible cho on-prem`
- `Yêu cầu {n} năm kinh nghiệm ngành dầu khí` với `n = 3,4,…,12` (10 dòng)

Sinh combo 1 hoặc 2 dòng từ eligible pool. Uniqueness key = `tuple(sorted(added_lines))` — `{A,B}` và `{B,A}` trùng. **Render** `added` và suffix text đúng `sorted(added_lines)` (sort mặc định Python).

`rng.shuffle` danh sách combo unique rồi lấy `n_add`.

Hết combo: `n = 13, 14, 15, …` không trần; dòng `Yêu cầu {n} năm kinh nghiệm ngành dầu khí` nếu key chưa dùng và line vẫn eligible (thường yes). Mỗi `n` một variant 1 dòng. Dừng khi đủ `n_add`.

Text add = mirror text (mỗi bullet `"- " + b` join newline) + newline + cùng format cho `added`.

### 5.5 Records + query cache

```json
{
  "id": "q_00000",
  "cv_id": "<stem>",
  "type": "mirror" | "remove" | "add",
  "text": "...",
  "dropped": [],
  "added": []
}
```

`id` = `q_` + 5 số, thứ tự emit: `successful` sort, trong CV: mirror, rồi remove, rồi add. Gold `cv_id` phải ∈ real corpus; không → exit 1.

`eval/queries.json`:

```json
{ "fingerprint": { ...config fingerprint... }, "items": [ ... ] }
```

Reuse khi `fingerprint` == fingerprint run hiện tại. `--refresh-queries` sinh lại (mirrors tái dùng trừ `--refresh-mirrors`). Fingerprint khác (kể cả `--limit-cv`) → không reuse; sinh mới, ghi đè.

---

## 6. Fingerprints (không dùng `run_meta` để invalidate)

**config fingerprint** (canonical JSON keys sort, `limit_cv: null` nếu không truyền):

`seed`, `decoys`, `queries`, `model`, `dim`, `limit_cv`

**doc_hash:** `sha256` UTF-8 của các dòng `id + "\t" + text + "\n"` sort theo `id` (real + decoy).

**query_hash:** `sha256` UTF-8 các dòng `id + "\t" + cv_id + "\t" + type + "\t" + text + "\n"` sort theo `id`.

`text_hash(text)` = `sha256` UTF-8 của đúng `text` query/doc.

`run_meta.json` chỉ audit (counts, `n_mirror_llm_calls`, hashes **sau** khi xong). Không đọc `run_meta` để quyết định cache hit.

---

## 7. Embed + rank

Mọi vector: finite, `len == dim`. Vi phạm → exit 1. Không ghi cache vector xấu.

**Docs** `eval/cv_embeddings.json`:

```json
{ "doc_hash": "...", "model": "...", "dim": 1536, "vectors": { "<id>": [float, ...] } }
```

Hit khi `doc_hash` + `model` + `dim` khớp và mọi id corpus có vector.

**Queries** `eval/query_embeddings.json`:

```json
{
  "query_hash": "...",
  "model": "...",
  "dim": 1536,
  "vectors": {
    "q_00000": { "text_hash": "...", "embedding": [float, ...] }
  }
}
```

Hit khi `query_hash` + `model` + `dim` khớp **và** mỗi query id: `text_hash` == `text_hash(current text)`. Sai hash / thiếu id → không reuse id đó (embed lại). `--skip-embed`: bất kỳ miss, malformed JSON, dim sai, non-finite → exit 1.

Rank: cosine giảm dần; tie-break `id` lexicographic tăng. Full corpus (không cắt k trước khi lấy rank gold).

**cosine(a, b):**

```text
n = ||a|| * ||b||
n == 0 hoặc a/b non-finite → raise ValueError
return dot(a,b) / n
```

---

## 8. Metrics

`k ∈ {1, 5, 10}`. Gold rank `r` 1-based.

- `recall@k` = `1` iff `r <= k` else `0`
- `context_precision@k` = `1/r` iff `r <= k` else `0`

Macro-average overall và theo `type`.

`ranks = sorted(r của mọi query)` (`n >= 1` vì 0 query không report):

- median = `ranks[ceil(0.5 * n) - 1]`
- P90 = `ranks[ceil(0.9 * n) - 1]`

Integer, không interpolate NumPy.

`random_recall@k` = `k / corpus_size`.

**worst:** 20 query `r` cao nhất; tie-break `r` desc, `id` asc. Field: `id`, `cv_id`, `type`, `r`, `text` cắt 200 chars.

---

## 9. CLI + artifacts

`python scripts/eval_requirement_retrieve.py`

| Flag | Default |
|---|---|
| `--parsed-dir` | `data/test_CV_parse/parsed_CV` |
| `--out-dir` | `data/test_CV_parse/eval` |
| `--decoys` | `270` |
| `--queries` | `1000` |
| `--seed` | `20260819` |
| `--limit-cv` | none |
| `--refresh-mirrors` | false |
| `--refresh-queries` | false |
| `--refresh-decoys` | false |
| `--skip-embed` | false |

`data/` gitignore. Không commit cache/report.

`eval/run_meta.json` (audit): config fingerprint, `n_real`, `n_decoy`, `n_query`, `n_mirror_llm_calls`, `doc_hash`, `query_hash`.

Stdout: counts + metrics, không dump 1000 hàng.

### Exit 1

- 0 valid CV; `--queries < 1`; 0 mirror thành công
- thiếu `QWEN_API_KEY` khi cần LLM hoặc embed
- decoy cache mismatch, không `--refresh-decoys`
- `--skip-embed` mà cache malformed / miss / `text_hash` sai / dim sai / non-finite
- embedding mới non-finite hoặc `len != dim`
- query `cv_id` không có trong real corpus
- cosine `ValueError` khi rank (không nuốt)

Exit 0 khi số query thực tế `< --queries` vì unique remove thiếu (đã dồn add) hoặc `queries < n` smoke — report `n_query` thật.

---

## 10. Code layout

- `backend/app/services/matching/eval_retrieve.py` — thuần: split lines, splice, skill-swap, quota, remove/add variants, hashes, cosine, rank, recall, context_precision, median/P90, worst. Không httpx.
- `scripts/eval_requirement_retrieve.py` — I/O, LLM, embed, cache, CLI, report.
- `tests/unit/test_eval_retrieve.py` — bullets/vector giả; không gọi Qwen.

`MIRROR_PROMPT_TEMPLATE` một hằng (script hoặc `eval_retrieve.py`).

---

## 11. Verification

```text
pytest tests/unit/test_eval_retrieve.py -v
python scripts/eval_requirement_retrieve.py --limit-cv 2 --decoys 8 --queries 20
```

Smoke: 2 CV đầu sau sort; fingerprint có `limit_cv=2` nên không đụng cache full run. Full: không `--limit-cv`, decoys 270, queries 1000.
