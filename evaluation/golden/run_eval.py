"""Orchestrator: run the real Ingest Agent + Matching Agent logic offline over
the golden dataset, compute ranking metrics, run the LLM-quality judges, and
write evaluation/golden/results/report.md.

Reuses the actual production functions (not mocks):
  - backend.app.services.matching.parse: parse_resume_bytes, clean_markdown
  - backend.app.services.matching.summarize: summarize_resume
  - backend.app.services.matching.skills: extract_skills, coverage_score, expand_query
  - backend.app.services.matching.embed: embed_text
  - backend.app.services.matching.rrf: score_candidates (real RRF fusion)
Only the LLM backend is swapped for OpenAI (see llm_openai.py) because the
configured Qwen key returned 403 Forbidden.

Usage: python -m evaluation.golden.run_eval
"""

from __future__ import annotations

import json
import math
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.app.services.matching.bm25 import bm25_document, bm25_query, bm25_scores  # noqa: E402
from backend.app.services.matching.embed import embed_text  # noqa: E402
from backend.app.services.matching.parse import clean_markdown, parse_resume_bytes, redact_pii  # noqa: E402
from backend.app.services.matching.rrf import score_candidates  # noqa: E402
from backend.app.services.matching.rrf_jobs import score_jobs_for_resume  # noqa: E402
from backend.app.services.matching.skills import expand_query, extract_skills, load_taxonomy_index  # noqa: E402
from backend.app.services.matching.retrieve_jobs import _cv_query_text  # noqa: E402
from backend.app.services.matching.summarize import grounded_titles, summarize_resume  # noqa: E402

from evaluation.golden import judge_quality  # noqa: E402
from evaluation.golden.judge_relevance import build_qrels, calibration_report  # noqa: E402
from evaluation.golden.llm_openai import CHAT_MODEL, EMBED_MODEL, chat_complete, embed_text as oai_embed  # noqa: E402
from evaluation.golden.metrics import evaluate_ranking, macro_average  # noqa: E402

GOLDEN_DIR = Path(__file__).resolve().parent
JDS_PATH = GOLDEN_DIR / "jds.json"
MANIFEST_PATH = GOLDEN_DIR / "cvs_manifest.json"
QRELS_PATH = GOLDEN_DIR / "qrels.json"
INGEST_RESULTS_PATH = GOLDEN_DIR / "ingest_results.json"
QUALITY_PATH = GOLDEN_DIR / "quality_judge.json"
REPORT_PATH = GOLDEN_DIR / "results" / "report.md"


def cosine_distance(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 1.0
    return 1.0 - dot / (na * nb)


def jd_query_text(jd: dict) -> str:
    req = (jd.get("requirements_text") or "").strip()
    if req:
        return req
    return f"{jd.get('title', '')} {jd.get('description', '')}"


def _complete_wrapper(prompt: str, **kwargs) -> str:
    return chat_complete(prompt, json_object=bool(kwargs.get("json_object")))


def ingest_all_cvs(manifest: list[dict], index: dict) -> dict:
    if INGEST_RESULTS_PATH.exists():
        print(f"(reusing cached {INGEST_RESULTS_PATH.name})")
        return json.loads(INGEST_RESULTS_PATH.read_text(encoding="utf-8"))

    all_cvs = [cv for entry in manifest for cv in entry["cvs"]]

    def ingest_one(cv: dict) -> tuple[str, dict]:
        cv_id = cv["cv_id"]
        pdf_path = ROOT / cv["pdf_path"]
        pdf_bytes = pdf_path.read_bytes()

        parsed = parse_resume_bytes(pdf_bytes, mime_type="application/pdf")
        original_markdown = clean_markdown(parsed["markdown"])

        meta = summarize_resume(original_markdown, complete=_complete_wrapper)
        summarized_body = redact_pii(meta.get("body") or "")
        text_for_skills = summarized_body or original_markdown

        skills = extract_skills(text_for_skills, index)
        embedding = embed_text(text_for_skills or " ", encode=lambda t: oai_embed(t))

        return cv_id, {
            "target_jd_id": cv["target_jd_id"],
            "original_markdown": original_markdown,
            "summarized_body": summarized_body,
            "extracted_skills": skills,
            "embedding": embedding,
            "titles": grounded_titles(list(meta.get("titles") or []), original_markdown),
            "summary": meta.get("summary") or "",
        }

    results: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(ingest_one, cv) for cv in all_cvs]
        for future in as_completed(futures):
            cv_id, row = future.result()
            results[cv_id] = row
            print(f"ingested {cv_id}: skills={row['extracted_skills']}")

    INGEST_RESULTS_PATH.write_text(json.dumps(results, ensure_ascii=False), encoding="utf-8")
    return results


def rank_candidates_for_jd(jd: dict, ingest_results: dict, index: dict) -> list[str]:
    text = jd_query_text(jd)
    jd_skills = extract_skills(text, index)
    expanded = expand_query(text, extracted=jd_skills)

    jd_emb = oai_embed(text)
    jd_emb_expanded = oai_embed(expanded)

    # Mirror retrieve_for_job(): BM25 over each CV's original text with its
    # extracted skills injected, scored against title + JD skills (unconfirmed
    # constraints path, same as _bm25_skill_ids' `not confirmed` branch).
    cv_ids = list(ingest_results.keys())
    docs = [
        bm25_document(ingest_results[cv_id]["original_markdown"], ingest_results[cv_id]["extracted_skills"])
        for cv_id in cv_ids
    ]
    bm25_q = bm25_query(str(jd.get("title") or ""), jd_skills)
    bm25_vals = bm25_scores(docs, bm25_q) if docs else []

    rows = []
    for cv_id, bm25_val in zip(cv_ids, bm25_vals, strict=True):
        row = ingest_results[cv_id]
        emb = row["embedding"]
        rows.append(
            {
                "application_id": cv_id,
                "resume_id": cv_id,
                "skills": row["extracted_skills"],
                "distance_original": cosine_distance(jd_emb, emb),
                "distance_expanded": cosine_distance(jd_emb_expanded, emb),
                "bm25_score": bm25_val,
            }
        )

    ranked = score_candidates(rows, jd_skills, index)
    return [row["resume_id"] for row in ranked]


def rank_jds_for_cv(
    cv_id: str,
    ingest_results: dict,
    jd_embeddings_expanded: dict[str, list[float]],
    jds_by_id: dict[str, dict],
    index: dict,
) -> list[str]:
    cv_row = ingest_results[cv_id]
    cv_skills = cv_row["extracted_skills"]
    cv_emb = cv_row["embedding"]
    cv_text = cv_row["original_markdown"]

    # Mirror retrieve_jobs_for_resume(): BM25 over each JD's text with its
    # taxonomy skills injected, scored against a short CV query text (titles,
    # falling back to summary, falling back to the full CV) via the shared
    # _cv_query_text() helper — see eval/results/report2.md section 4.2 for
    # why using the full CV text as the query hurt MRR/NDCG.
    jd_ids = list(jd_embeddings_expanded.keys())
    docs = [bm25_document(jd_query_text(jds_by_id[jd_id]), jds_by_id[jd_id]["taxonomy_skills"]) for jd_id in jd_ids]
    bm25_q = bm25_query(_cv_query_text(cv_row, cv_text), cv_skills)
    bm25_vals = bm25_scores(docs, bm25_q) if docs else []

    rows = []
    for jd_id, bm25_val in zip(jd_ids, bm25_vals, strict=True):
        jd_emb = jd_embeddings_expanded[jd_id]
        jd = jds_by_id[jd_id]
        rows.append(
            {
                "job_id": jd_id,
                "skills": jd["taxonomy_skills"],
                "distance_expanded": cosine_distance(cv_emb, jd_emb),
                "bm25_score": bm25_val,
            }
        )

    ranked = score_jobs_for_resume(
        rows, cv_skills, cv_verified=cv_skills, cv_has_evidence=True, taxonomy_index=index
    )
    return [str(row["job_id"]) for row in ranked]


def transpose_qrels(qrels: dict) -> dict[str, dict[str, int]]:
    """Flip qrels[jd_id][cv_id] = {"grade": ...} into by_cv[cv_id][jd_id] = grade."""
    by_cv: dict[str, dict[str, int]] = {}
    for jd_id, cv_grades in qrels.items():
        for cv_id, row in cv_grades.items():
            by_cv.setdefault(cv_id, {})[jd_id] = row["grade"]
    return by_cv


def render_report(
    jds: list[dict],
    per_jd_metrics: dict,
    macro: dict,
    qrels: dict,
    calibration_lines: list[str],
    quality: dict,
    ingest_results: dict,
    reverse_rankings: dict[str, list[str]],
    per_cv_metrics: dict[str, dict],
    macro_cv: dict,
) -> str:
    lines = []
    lines.append("# Golden Dataset Eval Report — Ingest Agent + Matching Agent")
    lines.append("")
    lines.append(f"- Chạy lúc: {datetime.now(timezone.utc).isoformat()}")
    lines.append(f"- LLM backend dùng cho eval: OpenAI `{CHAT_MODEL}` (chat) + `{EMBED_MODEL}` (embedding, 1536-dim)")
    lines.append("  - **Không phải Qwen** (`QWEN_API_KEY` trong `.env` trả về 403 Forbidden khi test) — theo yêu cầu, đổi sang OpenAI cho riêng pipeline eval này. Code production (`backend/app/clients/llm.py`) không bị đổi, vẫn gọi Qwen.")
    lines.append(f"- Nguồn JD: `data_find/data/vietjobs/VietJobs_full.csv` (VietJobs dataset), 20 JD chọn trong `evaluation/golden/jds.json`, trải trên 15 nhóm ngành IT")
    lines.append(f"- CV: 40 CV thật (2/JD) lấy từ `data_find/generated_cv` (EN) + `data_find/generated_cv_vi` (VI), không LLM-sinh riêng — `evaluation/golden/cvs_manifest.json`")
    lines.append("")

    lines.append("## Giới hạn phương pháp (đọc trước khi diễn giải số liệu)")
    lines.append("")
    lines.append(
        "1. **20 JD trải trên 15 nhóm ngành IT** (`data_find/data/it-job-categories.md` nhóm 1-15 — "
        "nhóm 16-20 chưa có CV nên không chọn JD từ đó), quota theo cỡ pool CV mỗi nhóm trong "
        "`data_find/generated_cv/metadata.csv`: nhóm 1-5 (Software Dev, DevOps/Infra, SysAdmin, "
        "Cybersecurity, Data) 2 JD/nhóm, nhóm 6-15 còn lại 1 JD/nhóm. Skill taxonomy dùng để chọn JD "
        "và tính `coverage_score` giờ có 186 skill / 9 nhóm domain (`skill_graph.json`), không còn giới "
        "hạn 10 skill như phiên bản golden set trước."
    )
    lines.append(
        "2. **CV lấy từ 2 pool có sẵn, không LLM-sinh riêng theo JD**: `data_find/generated_cv` (432 CV "
        "tiếng Anh, gắn nhãn sẵn `quality_profile` polished/sparse/cross_domain) và "
        "`data_find/generated_cv_vi` (34 bản dịch tiếng Việt của các CV cụ thể trong pool trên). Variant "
        "\"a\" = CV `polished` đúng subgroup của JD; variant \"b\" = CV `sparse` (hoặc `cross_domain` nếu "
        "subgroup không có `sparse`) cùng subgroup — độ khớp phản ánh chất lượng hồ sơ thật có sẵn, không "
        "bị ép về đúng % mong muốn như thiết kế cũ."
    )
    lines.append(
        "3. **8-10/20 JD có 1 trong 2 variant là bản tiếng Việt** (khi CV được chọn có sẵn bản dịch), trải "
        "trên nhiều nhóm khác nhau — kiểm thử khả năng Ingest Agent parse/match CV tiếng Việt, không chỉ "
        "tiếng Anh như phiên bản trước."
    )
    lines.append(
        "4. Ranking chạy **offline** (không seed Supabase) — dùng đúng `score_candidates()`/RRF/"
        "`coverage_score()` thật, nhưng khoảng cách semantic tính bằng cosine Python thay vì RPC pgvector "
        "(cùng công thức, khác nơi chạy). Pool chấm điểm quan hệ (LLM-judge) đóng đầy đủ: 40 CV × 20 JD = "
        "800 cặp."
    )
    lines.append(
        "5. **Test cả 2 chiều matching**: mục 1 ở trên là chiều JD -> CV (`score_candidates`, "
        "`rrf.py`). Mục 1b dưới đây là chiều ngược CV -> JD (`score_jobs_for_resume`, `rrf_jobs.py`) — "
        "logic RRF thật đứng sau agent recommend (`backend/app/agents/recommend/graph.py`, "
        "`POST /api/v1/chat` chiều candidate). Cùng pool 40 CV × 20 JD, cùng qrels 800 cặp, chỉ đảo trục "
        "so sánh. JD embedding dùng cho chiều CV -> JD được tính qua `expand_query()` một lần (giống hệt "
        "cách `ingest_job()` production nhúng job tại thời điểm ingest), so khớp với embedding CV gốc "
        "(không expand) — đúng bất đối xứng thật của hệ thống, không phải giản lược riêng cho eval."
    )
    lines.append("")

    lines.append("## 1. Ranking metrics (Matching Agent, chiều JD -> CV)")
    lines.append("")
    lines.append("Precision/Recall dùng ngưỡng `grade >= 1` (LLM-judge relevance). MRR dùng ngưỡng `grade == 2`. NDCG dùng graded relevance 0/1/2 trực tiếp. Pool: 40 CV chung cho cả 20 JD.")
    lines.append("")
    header = "| JD | P@5 | R@5 | NDCG@5 | P@10 | R@10 | NDCG@10 | MRR |"
    sep = "|---|---|---|---|---|---|---|---|"
    lines.append(header)
    lines.append(sep)
    for jd in jds:
        jd_id = jd["jd_id"]
        m = per_jd_metrics[jd_id]
        lines.append(
            f"| {jd_id} ({jd['title'][:28]}) | {m['precision_at_5']:.2f} | {m['recall_at_5']:.2f} | "
            f"{m['ndcg_at_5']:.2f} | {m['precision_at_10']:.2f} | {m['recall_at_10']:.2f} | "
            f"{m['ndcg_at_10']:.2f} | {m['mrr']:.2f} |"
        )
    lines.append(
        f"| **Trung bình (macro)** | **{macro['precision_at_5']:.2f}** | **{macro['recall_at_5']:.2f}** | "
        f"**{macro['ndcg_at_5']:.2f}** | **{macro['precision_at_10']:.2f}** | **{macro['recall_at_10']:.2f}** | "
        f"**{macro['ndcg_at_10']:.2f}** | **{macro['mrr']:.2f}** |"
    )
    lines.append("")

    lines.append("## 1b. Reverse ranking metrics (Matching Agent, chiều CV -> JD / recommend)")
    lines.append("")
    lines.append(
        "Cùng pool 40 CV × 20 JD và qrels ở trên, xếp hạng theo chiều ngược: với mỗi CV, dùng "
        "`score_jobs_for_resume()` (`backend/app/services/matching/rrf_jobs.py`) — logic RRF thật "
        "đứng sau agent recommend (`POST /api/v1/chat`, chiều candidate, không truyền `job_id`) — "
        "để xếp hạng toàn bộ 20 JD. \"own-JD rank\" = vị trí JD gốc của CV đó trong danh sách 20 JD "
        "đã xếp hạng (kỳ vọng gần hạng 1); \"own-JD grade\" = điểm LLM-judge đã chấm cho đúng cặp đó."
    )
    lines.append("")
    header_cv = "| CV | own JD | own-JD rank | own-JD grade | P@5 | R@5 | NDCG@5 | P@10 | R@10 | NDCG@10 | MRR |"
    sep_cv = "|---|---|---|---|---|---|---|---|---|---|---|"
    lines.append(header_cv)
    lines.append(sep_cv)
    own_ranks: list[int] = []
    for cv_id in sorted(per_cv_metrics):
        m = per_cv_metrics[cv_id]
        own_jd = ingest_results[cv_id]["target_jd_id"]
        ranking = reverse_rankings[cv_id]
        own_rank = ranking.index(own_jd) + 1 if own_jd in ranking else None
        if own_rank is not None:
            own_ranks.append(own_rank)
        own_grade = qrels.get(own_jd, {}).get(cv_id, {}).get("grade")
        lines.append(
            f"| {cv_id} | {own_jd} | {own_rank if own_rank is not None else 'n/a'} | "
            f"{own_grade if own_grade is not None else 'n/a'} | "
            f"{m['precision_at_5']:.2f} | {m['recall_at_5']:.2f} | {m['ndcg_at_5']:.2f} | "
            f"{m['precision_at_10']:.2f} | {m['recall_at_10']:.2f} | {m['ndcg_at_10']:.2f} | {m['mrr']:.2f} |"
        )
    lines.append(
        f"| **Trung bình (macro)** | | | | **{macro_cv['precision_at_5']:.2f}** | "
        f"**{macro_cv['recall_at_5']:.2f}** | **{macro_cv['ndcg_at_5']:.2f}** | "
        f"**{macro_cv['precision_at_10']:.2f}** | **{macro_cv['recall_at_10']:.2f}** | "
        f"**{macro_cv['ndcg_at_10']:.2f}** | **{macro_cv['mrr']:.2f}** |"
    )
    lines.append("")
    top3 = sum(1 for r in own_ranks if r <= 3)
    lines.append(
        f"**Calibration (CV -> JD):** {top3}/{len(own_ranks)} CV có JD gốc lọt top-3 "
        f"trong xếp hạng 20 JD."
    )
    lines.append("")

    lines.append("## 2. Calibration check (LLM-judge vs CV thiết kế sẵn, chiều JD -> CV)")
    lines.append("")
    lines.append("40 cặp \"ruột\" (mỗi CV so với đúng JD gốc của nó) — kỳ vọng variant `a` ra grade 2, variant `b` ra grade thấp hơn.")
    lines.append("")
    for line in calibration_lines:
        lines.append(f"- {line}")
    lines.append("")

    lines.append("## 3. LLM-as-judge: chất lượng Ingest Agent")
    lines.append("")
    lines.append("**Độ tin cậy cột \"Skill false-negative\":** đã spot-check thủ công (VD `JD-01-A`) và phát hiện judge liệt kê cả skill **không hề xuất hiện trong text CV** (tự bịa), lẫn skill ngoài phạm vi 10-skill taxonomy dù prompt đã yêu cầu chỉ xét trong đó (VD \"Django\", \"MySQL\", \"WebSockets\"). Vì vậy cột này **không nên coi là danh sách lỗi extract_skills() đã xác nhận** — chỉ mang tính gợi ý cần kiểm tra thủ công thêm, không phải kết luận cuối. Cột Faithfulness đáng tin hơn (so sánh trực tiếp 2 đoạn văn bản, không yêu cầu judge tự nhớ toàn bộ CV).")
    lines.append("")
    lines.append("| CV | Faithfulness (summarize) | Skill false-positive | Skill false-negative (chưa xác thực, xem lưu ý trên) |")
    lines.append("|---|---|---|---|")
    for cv_id, row in quality.items():
        f = row["faithfulness"]["faithfulness_score"]
        f_str = f"{f:.2f}" if f is not None else "n/a"
        fp = row["skill_accuracy"]["false_positives"]
        fn = row["skill_accuracy"]["false_negatives"]
        lines.append(f"| {cv_id} | {f_str} | {fp or '-'} | {fn or '-'} |")
    scored = [row["faithfulness"]["faithfulness_score"] for row in quality.values() if row["faithfulness"]["faithfulness_score"] is not None]
    avg_faith = sum(scored) / len(scored) if scored else 0.0
    lines.append("")
    lines.append(f"**Faithfulness trung bình: {avg_faith:.2f}** ({len(scored)}/{len(quality)} CV có điểm hợp lệ)")
    lines.append("")

    unsupported = [(cid, row["faithfulness"]["unsupported_claims"]) for cid, row in quality.items() if row["faithfulness"]["unsupported_claims"]]
    if unsupported:
        lines.append("Case có claim không được support (đáng xem lại):")
        for cid, claims in unsupported[:8]:
            lines.append(f"- **{cid}**: {claims}")
        lines.append("")

    lines.append("## 4. Ghi chú")
    lines.append("")
    lines.append("- Cache LLM/embedding tại `evaluation/golden/.cache/` theo content hash — chạy lại `run_eval.py` không tốn gọi API trùng lặp.")
    lines.append("- Đổi model (`CHAT_MODEL`/`EMBED_MODEL` trong `llm_openai.py`) thì phải xoá cache và chạy lại toàn bộ, không so sánh chéo được giữa các lần chạy khác model.")
    lines.append("")

    return "\n".join(lines)


def main() -> int:
    index = load_taxonomy_index()
    jds = json.loads(JDS_PATH.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    print("== Step 1: Ingest Agent (real pipeline) over 40 CVs ==")
    ingest_results = ingest_all_cvs(manifest, index)

    print("\n== Step 2: Matching Agent ranking (real skill_node + rrf) per JD ==")
    rankings = {}
    for jd in jds:
        ranked_ids = rank_candidates_for_jd(jd, ingest_results, index)
        rankings[jd["jd_id"]] = ranked_ids
        print(f"{jd['jd_id']}: top5 = {ranked_ids[:5]}")

    print("\n== Step 2b: reverse ranking (score_jobs_for_resume, CV -> JD) ==")
    jds_by_id = {jd["jd_id"]: jd for jd in jds}
    jd_embeddings_expanded = {
        jd["jd_id"]: oai_embed(expand_query(jd_query_text(jd))) for jd in jds
    }
    reverse_rankings: dict[str, list[str]] = {}
    for cv_id in ingest_results:
        reverse_rankings[cv_id] = rank_jds_for_cv(cv_id, ingest_results, jd_embeddings_expanded, jds_by_id, index)
    print(f"  ranked {len(jds)} JDs for each of {len(reverse_rankings)} CVs")

    print("\n== Step 3: LLM-as-judge qrels (relevance grading, 800 pairs) ==")
    if QRELS_PATH.exists():
        print(f"(reusing cached {QRELS_PATH.name})")
        qrels = json.loads(QRELS_PATH.read_text(encoding="utf-8"))
    else:
        qrels = build_qrels()
        QRELS_PATH.write_text(json.dumps(qrels, ensure_ascii=False, indent=2), encoding="utf-8")
    calibration_lines = calibration_report(qrels)

    print("\n== Step 4: ranking metrics ==")
    per_jd_metrics = {}
    for jd in jds:
        jd_id = jd["jd_id"]
        grades = {cv_id: row["grade"] for cv_id, row in qrels[jd_id].items()}
        per_jd_metrics[jd_id] = evaluate_ranking(rankings[jd_id], grades)
    macro = macro_average(per_jd_metrics)
    print("macro:", macro)

    print("\n== Step 4b: reverse ranking metrics (CV -> JD) ==")
    grades_by_cv = transpose_qrels(qrels)
    per_cv_metrics: dict[str, dict] = {}
    for cv_id in ingest_results:
        per_cv_metrics[cv_id] = evaluate_ranking(reverse_rankings[cv_id], grades_by_cv[cv_id])
    macro_cv = macro_average(per_cv_metrics)
    print("macro (CV->JD):", macro_cv)

    print("\n== Step 5: LLM-as-judge Ingest Agent quality (faithfulness + skill accuracy) ==")
    if QUALITY_PATH.exists():
        print(f"(reusing cached {QUALITY_PATH.name})")
        quality = json.loads(QUALITY_PATH.read_text(encoding="utf-8"))
    else:
        all_cv_rows = list(ingest_results.items())

        def judge_one(item: tuple[str, dict]) -> tuple[str, dict]:
            cv_id, row = item
            faith = judge_quality.judge_faithfulness(
                row["original_markdown"], row["summarized_body"], cache_key=f"judge_faith|{cv_id}"
            )
            # extracted_skills was computed from summarized_body (or original_markdown as
            # fallback when summarize produced nothing) -- judge must see the SAME text,
            # otherwise "false negatives" just reflect the summarizer dropping content,
            # not an extract_skills bug.
            skill_text = row["summarized_body"] or row["original_markdown"]
            skill_acc = judge_quality.judge_skill_accuracy(
                skill_text, row["extracted_skills"], cache_key=f"judge_skill_v2|{cv_id}"
            )
            return cv_id, {"faithfulness": faith, "skill_accuracy": skill_acc}

        quality = {}
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(judge_one, item) for item in all_cv_rows]
            for future in as_completed(futures):
                cv_id, result = future.result()
                quality[cv_id] = result
                print(f"{cv_id}: faithfulness={result['faithfulness']['faithfulness_score']}")

        QUALITY_PATH.write_text(json.dumps(quality, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n== Step 6: write report ==")
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    report = render_report(
        jds, per_jd_metrics, macro, qrels, calibration_lines, quality, ingest_results,
        reverse_rankings, per_cv_metrics, macro_cv,
    )
    REPORT_PATH.write_text(report, encoding="utf-8")
    print(f"-> {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
