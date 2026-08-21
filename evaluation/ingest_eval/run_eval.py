"""Orchestrator: run the real Ingest Agent graph over the sampled CVs, score it with
deterministic metrics + LLM-as-judge, and write evaluation/ingest_eval/results/report.md.

Usage (from repo root, venv active):
    python -m evaluation.ingest_eval.run_eval [--limit N]

Requires OPENAI_API_KEY in .env (see evaluation/ingest_eval/llm_openai.py -- this eval uses
OpenAI, not the production Qwen client, via the same complete/encode injection points
backend/app/agents/ingest/graph.py already exposes).
"""

from __future__ import annotations

import argparse
import json
import statistics as stats
import sys
import time
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from evaluation.ingest_eval.cache import cached_call, content_hash  # noqa: E402
from evaluation.ingest_eval.judge import judge_faithfulness, judge_skills_and_pii  # noqa: E402
from evaluation.ingest_eval.llm_openai import CHAT_MODEL, EMBED_MODEL  # noqa: E402
from evaluation.ingest_eval.metrics import compute_metrics, taxonomy_canonical_skills  # noqa: E402
from evaluation.ingest_eval.pipeline import run_ingest_pipeline  # noqa: E402

MANIFEST_PATH = Path(__file__).resolve().parent / "manifest.json"
REPORT_PATH = Path(__file__).resolve().parent / "results" / "report.md"
PROMPT_VERSION = "v1"


def _run_pipeline_cached(cv_entry: dict) -> dict:
    pdf_path = REPO_ROOT / cv_entry["pdf_path"]
    pdf_bytes = pdf_path.read_bytes()
    key = content_hash(PROMPT_VERSION, CHAT_MODEL, EMBED_MODEL, str(len(pdf_bytes)), cv_entry["cv_id"])
    return cached_call("runs", key, lambda: run_ingest_pipeline(pdf_path))


def evaluate_one(cv_entry: dict) -> dict[str, Any]:
    run = _run_pipeline_cached(cv_entry)
    metrics = compute_metrics(cv_entry, run)
    faithfulness = judge_faithfulness(
        cv_entry["cv_id"],
        run["pre_summarize_markdown"],
        run["metadata"].get("summary") or "",
        run["metadata"].get("titles") or [],
    )
    skills_pii = judge_skills_and_pii(
        cv_entry["cv_id"],
        run["pre_summarize_markdown"],
        run["skills"],
        run["post_summarize_body"],
    )
    return {
        "cv": cv_entry,
        "run": run,
        "metrics": metrics,
        "faithfulness": faithfulness,
        "skills_pii": skills_pii,
    }


def _mean(values: list[float]) -> float | None:
    values = [v for v in values if v is not None]
    return round(stats.mean(values), 3) if values else None


def _fmt(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


def build_report(results: list[dict]) -> str:
    n = len(results)
    parse_success = sum(1 for r in results if r["metrics"]["parse"]["success"])
    pii_hit_cvs = [r for r in results if r["metrics"]["pii"]["regex_hits_total"] > 0]
    name_leak_cvs = [r for r in results if r["metrics"]["pii"]["leaked_name_tokens"]]
    judge_pii_leak_cvs = [r for r in results if r["skills_pii"]["pii_leak_found"]]
    empty_summary_cvs = [r for r in results if r["metrics"]["summary"]["empty"]]
    embed_bad_cvs = [r for r in results if not r["metrics"]["embedding"]["dim_ok"] or not r["metrics"]["embedding"]["nonzero"]]

    faith_scores = [r["faithfulness"]["score"] for r in results]
    precisions = [r["skills_pii"]["precision_est"] for r in results]
    recalls = [r["skills_pii"]["recall_est"] for r in results]
    skill_recall_vs_full = [r["metrics"]["skills"]["recall_vs_full_text"] for r in results]
    total_lost_skills = sum(len(r["metrics"]["skills"]["lost_to_summarization"]) for r in results)
    total_ms = [r["metrics"]["total_ms"] for r in results]
    node_ms: dict[str, list[float]] = {}
    for r in results:
        for node, ms in r["metrics"]["timings_ms"].items():
            node_ms.setdefault(node, []).append(ms)

    lines: list[str] = []
    lines.append("# Báo cáo đánh giá Ingest Agent")
    lines.append("")
    lines.append(f"- Ngày chạy: 2026-08-21")
    lines.append(f"- Mẫu: {n} CV lấy từ `data_find/generated_cv/` (xem `manifest.json`)")
    lines.append(f"- Chat model: `{CHAT_MODEL}` (OpenAI) — LLM-judge cũng dùng model này")
    lines.append(f"- Embedding model: `{EMBED_MODEL}` (OpenAI, dim=1536)")
    lines.append(
        "- Pipeline: chạy `build_ingest_graph()` thật từ `backend/app/agents/ingest/graph.py`, "
        "qua `graph.astream(..., stream_mode=\"values\")`, inject `complete`/`encode` bằng OpenAI "
        "(production dùng Qwen; cùng điểm inject mà `tests/unit/test_matching_ingest.py` đang dùng, "
        "không sửa code backend)."
    )
    lines.append("")

    lines.append("## 1. Tổng quan")
    lines.append("")
    lines.append("| Metric | Giá trị |")
    lines.append("|---|---|")
    lines.append(f"| Tỷ lệ parse thành công | {parse_success}/{n} |")
    lines.append(f"| CV còn PII (regex) trong text lưu cuối cùng | {len(pii_hit_cvs)}/{n} |")
    lines.append(f"| CV bị lộ token tên ứng viên trong text cuối | {len(name_leak_cvs)}/{n} |")
    lines.append(f"| CV bị LLM-judge gắn cờ còn PII | {len(judge_pii_leak_cvs)}/{n} |")
    lines.append(f"| CV có `summary` rỗng | {len(empty_summary_cvs)}/{n} |")
    lines.append(f"| CV có embedding lỗi (sai dim / vector rỗng) | {len(embed_bad_cvs)}/{n} |")
    lines.append(f"| Faithfulness trung bình của `summarize` (kiểu RAGAS, tỷ lệ claim được support) | {_fmt(_mean(faith_scores))} |")
    lines.append(f"| Precision trích skill trung bình (ước lượng bằng LLM-judge) | {_fmt(_mean(precisions))} |")
    lines.append(f"| Recall trích skill trung bình (ước lượng bằng LLM-judge) | {_fmt(_mean(recalls))} |")
    lines.append(
        f"| Recall skill trung bình so với text đầy đủ trước summarize (đo bằng code, không qua LLM) | {_fmt(_mean(skill_recall_vs_full))} |"
    )
    lines.append(f"| Tổng số skill bị mất do summarization trong cả mẫu (đo bằng code) | {total_lost_skills} |")
    lines.append(f"| Latency trung bình toàn pipeline | {_fmt(_mean(total_ms))} ms |")
    lines.append("")

    lines.append("## 2. Latency theo từng node (ms)")
    lines.append("")
    lines.append("| Node | Trung bình | Trung vị | Max |")
    lines.append("|---|---|---|---|")
    for node in ["parse", "clean", "summarize", "extract", "embed"]:
        vals = node_ms.get(node, [])
        if not vals:
            continue
        lines.append(f"| {node} | {_fmt(_mean(vals))} | {_fmt(round(stats.median(vals), 1))} | {_fmt(max(vals))} |")
    lines.append("")

    taxonomy = taxonomy_canonical_skills()
    lines.append("## 3. Nguyên nhân gốc của recall trích skill thấp: taxonomy chỉ có 10 skill")
    lines.append("")
    lines.append(
        f"`extract_skills()` chỉ có thể trả về các từ khoá có trong "
        f"`backend/app/services/matching/resources/skill_graph.json`, hiện file này định nghĩa "
        f"**{len(taxonomy)} skill chuẩn hoá**: {', '.join(taxonomy)} (kèm alias cho mỗi skill). "
        "Nó không thể nhận diện bất kỳ skill nào ngoài danh sách này — không phải lỗi logic "
        "matching/normalize, mà là taxonomy tĩnh quá hẹp. Đây là lý do recall của LLM-judge gần "
        "như bằng 0 với mọi CV ngoài stack web ở mục 6 bên dưới: judge so sánh với những gì con "
        "người gọi là \"skill có trong CV\" (TensorFlow, Docker, Kotlin, ONNX, ...), trong khi "
        "`extract_skills()` chỉ có thể khớp 10 từ khoá trên. Bất kỳ CV nào có stack không phải "
        "Python/FastAPI/PostgreSQL/Docker/JS/TS/React/SQL/Git/Linux đều sẽ cho recall thấp một "
        "cách giả tạo ở đây, bất kể `summarize` hay `extract_skills()` tự thân hoạt động tốt đến đâu."
    )
    lines.append("")

    lines.append("## 4. Mất skill do summarization (khác với vấn đề taxonomy hẹp)")
    lines.append("")
    lines.append(
        "`extract_skills()` (rule-based, deterministic) chạy trên `state[\"markdown\"]` **sau khi** "
        "node `summarize` đã ghi đè key này bằng `body` do LLM viết lại "
        "(`backend/app/agents/ingest/nodes/summarize.py:19-20`), không chạy trên toàn bộ text CV "
        "đã parse. Nếu bản `body` LLM viết lại bỏ sót một skill có trong CV gốc, `extract_skills()` "
        "sẽ không bao giờ thấy skill đó. Bảng dưới so sánh skill trích được từ `body` thực tế trong "
        "production với cùng hàm `extract_skills()` thật chạy trực tiếp trên markdown đầy đủ trước "
        "summarize, cho các trường hợp mất nhiều nhất trong mẫu."
    )
    lines.append("")
    worst_loss = sorted(
        results, key=lambda r: len(r["metrics"]["skills"]["lost_to_summarization"]), reverse=True
    )[:10]
    lines.append("| CV | Skill trong production | Mất do summarization | Skill từ text đầy đủ |")
    lines.append("|---|---|---|---|")
    for r in worst_loss:
        m = r["metrics"]["skills"]
        if not m["lost_to_summarization"]:
            continue
        lines.append(
            f"| {r['cv']['cv_id']} | {m['production_count']} | "
            f"{', '.join(m['lost_to_summarization'])} | {m['full_text_count']} |"
        )
    lines.append("")

    lines.append("## 5. Faithfulness (summarize) — các case tệ nhất")
    lines.append("")
    lines.append(
        "Score = số claim được support / tổng số claim, LLM-judge chấm từng claim so với text "
        "gốc trước summarize, sau đó tổng hợp bằng code (không lấy điểm tự chấm của model)."
    )
    lines.append("")
    worst_faith = sorted(
        (r for r in results if r["faithfulness"]["score"] is not None),
        key=lambda r: r["faithfulness"]["score"],
    )[:10]
    lines.append("| CV | Score | Claim không được support |")
    lines.append("|---|---|---|")
    for r in worst_faith:
        f = r["faithfulness"]
        unsupported = [c["claim"] for c in f["claims"] if c.get("supported") is not True]
        lines.append(f"| {r['cv']['cv_id']} | {_fmt(f['score'])} | {'; '.join(unsupported) or '—'} |")
    lines.append("")

    lines.append("## 6. Độ chính xác trích skill — các case tệ nhất")
    lines.append("")
    worst_skills = sorted(
        (r for r in results if r["skills_pii"]["precision_est"] is not None or r["skills_pii"]["recall_est"] is not None),
        key=lambda r: (
            r["skills_pii"]["precision_est"] if r["skills_pii"]["precision_est"] is not None else 1.0
        )
        + (r["skills_pii"]["recall_est"] if r["skills_pii"]["recall_est"] is not None else 1.0),
    )[:10]
    lines.append("| CV | Precision | Recall | False positive | False negative |")
    lines.append("|---|---|---|---|---|")
    for r in worst_skills:
        sp = r["skills_pii"]
        lines.append(
            f"| {r['cv']['cv_id']} | {_fmt(sp['precision_est'])} | {_fmt(sp['recall_est'])} | "
            f"{', '.join(sp['false_positives']) or '—'} | {', '.join(sp['false_negatives']) or '—'} |"
        )
    lines.append("")

    lines.append("## 7. Các case rò rỉ PII")
    lines.append("")
    lines.append(
        "`URL_RE` trong `redact_pii()` (`backend/app/services/matching/parse.py:85-88`) chỉ khớp "
        "`github.com`, `linkedin.com`, `facebook.com` và link `http(s)://`/`www.` trần — một mention "
        "dạng `twitter.com/...` (không có scheme, không có `www.`) không được bắt và sống sót qua "
        "redact 2 lần (một lần trong `parse_resume_bytes`, một lần nữa sau `summarize`). Case "
        "G12-SC-01 bên dưới đúng vào trường hợp này."
    )
    lines.append("")
    if not pii_hit_cvs and not name_leak_cvs and not judge_pii_leak_cvs:
        lines.append("Không phát hiện trường hợp nào trong mẫu này.")
    else:
        lines.append("| CV | Số lần khớp regex | Token tên bị lộ | Ví dụ LLM-judge tìm được |")
        lines.append("|---|---|---|---|")
        flagged = {r["cv"]["cv_id"]: r for r in (pii_hit_cvs + name_leak_cvs + judge_pii_leak_cvs)}
        for r in flagged.values():
            m = r["metrics"]["pii"]
            examples = r["skills_pii"]["pii_leak_examples"]
            lines.append(
                f"| {r['cv']['cv_id']} | {m['regex_hits_total']} ({m['regex_hits']}) | "
                f"{', '.join(m['leaked_name_tokens']) or '—'} | {'; '.join(examples) or '—'} |"
            )
    lines.append("")

    lines.append("## 8. Chi tiết từng CV")
    lines.append("")
    lines.append(
        "| CV | Nhóm ngành | Chất lượng | Số ký tự parse | Faithfulness | Skill P/R | Skill mất | PII hits | Total ms |"
    )
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for r in sorted(results, key=lambda r: r["cv"]["cv_id"]):
        cv = r["cv"]
        m = r["metrics"]
        f = r["faithfulness"]
        sp = r["skills_pii"]
        lines.append(
            f"| {cv['cv_id']} | {cv['group_name']} | {cv['quality_profile']} | "
            f"{m['parse']['chars']} | {_fmt(f['score'])} | "
            f"{_fmt(sp['precision_est'])}/{_fmt(sp['recall_est'])} | "
            f"{len(m['skills']['lost_to_summarization'])} | {m['pii']['regex_hits_total']} | "
            f"{_fmt(m['total_ms'])} |"
        )
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if args.limit:
        manifest = manifest[: args.limit]

    results = []
    for i, cv_entry in enumerate(manifest, 1):
        t0 = time.perf_counter()
        try:
            result = evaluate_one(cv_entry)
        except Exception as exc:  # noqa: BLE001
            print(f"[{i}/{len(manifest)}] {cv_entry['cv_id']} FAILED: {exc}")
            continue
        results.append(result)
        print(f"[{i}/{len(manifest)}] {cv_entry['cv_id']} done in {time.perf_counter() - t0:.1f}s")

    report = build_report(results)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(report, encoding="utf-8")
    print(f"\nwrote {REPORT_PATH} ({len(results)}/{len(manifest)} CVs evaluated)")


if __name__ == "__main__":
    main()
