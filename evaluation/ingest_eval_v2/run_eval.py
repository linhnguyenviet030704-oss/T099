"""Orchestrator: run the real Ingest Agent graph over a 41-CV sample (generated_cv + cv_hard),
score it, and write evaluation/ingest_eval_v2/results/report.md.

Usage (from repo root, venv active):
    python -m evaluation.ingest_eval_v2.run_eval [--limit N]

Requires OPENAI_API_KEY in .env (see evaluation/ingest_eval_v2/llm_openai.py).
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

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

from evaluation.ingest_eval_v2.cache import cached_call, content_hash  # noqa: E402
from evaluation.ingest_eval_v2.judge import judge_faithfulness, judge_skills_and_pii  # noqa: E402
from evaluation.ingest_eval_v2.llm_openai import CHAT_MODEL, EMBED_MODEL  # noqa: E402
from evaluation.ingest_eval_v2.metrics import compute_metrics, taxonomy_canonical_skills  # noqa: E402
from evaluation.ingest_eval_v2.pipeline import run_ingest_pipeline  # noqa: E402

MANIFEST_PATH = Path(__file__).resolve().parent / "manifest.json"
REPORT_PATH = Path(__file__).resolve().parent / "results" / "report.md"
PROMPT_VERSION = "v2-redesign"


def _run_pipeline_cached(cv_entry: dict) -> dict:
    pdf_path = REPO_ROOT / cv_entry["pdf_path"]
    pdf_bytes = pdf_path.read_bytes()
    key = content_hash(PROMPT_VERSION, CHAT_MODEL, EMBED_MODEL, str(len(pdf_bytes)), cv_entry["cv_id"])
    return cached_call("runs_v2", key, lambda: run_ingest_pipeline(pdf_path))


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
    low_content_cvs = [r for r in results if r["run"]["metadata"].get("low_content")]

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
    lines.append("- Ngày chạy: 2026-08-22")
    n_hard = sum(1 for r in results if r["cv"]["quality_profile"] == "hard_real_world")
    lines.append(
        f"- Mẫu: {n} CV (xem `evaluation/ingest_eval_v2/manifest.json`) — "
        f"{n - n_hard} CV tổng hợp từ `data_find/generated_cv/` + {n_hard} CV thật cấu trúc khó từ "
        "`evaluation/cv_hard/`"
    )
    lines.append(f"- Chat model: `{CHAT_MODEL}` (OpenAI) — LLM-judge cũng dùng model này")
    lines.append(f"- Embedding model: `{EMBED_MODEL}` (OpenAI, dim=1536)")
    lines.append(
        "- Pipeline: chạy `build_ingest_graph()` thật (đã redesign) từ "
        "`backend/app/agents/ingest/graph.py`, thứ tự node hiện tại là "
        "`parse -> clean -> extract -> summarize -> embed` (extract chuyển lên trước summarize), "
        "qua `graph.astream(..., stream_mode=\"values\")`, inject `complete`/`encode` bằng OpenAI "
        "(production dùng Qwen)."
    )
    lines.append("")

    lines.append("## 1. Tổng quan")
    lines.append("")
    lines.append("| Metric | Giá trị |")
    lines.append("|---|---|")
    lines.append(f"| Tỷ lệ parse thành công | {parse_success}/{n} |")
    lines.append(f"| CV bị gắn cờ `low_content` (parse quá ít nội dung) | {len(low_content_cvs)}/{n} |")
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
    lines.append(
        f"| Tổng số skill bị mất do summarization trong cả mẫu (đo bằng code — kỳ vọng ~0 sau khi đổi thứ tự node) | {total_lost_skills} |"
    )
    lines.append(f"| Latency trung bình toàn pipeline | {_fmt(_mean(total_ms))} ms |")
    lines.append("")

    lines.append("## 2. Latency theo từng node (ms)")
    lines.append("")
    lines.append("| Node | Trung bình | Trung vị | Max |")
    lines.append("|---|---|---|---|")
    for node in ["parse", "clean", "extract", "summarize", "embed"]:
        vals = node_ms.get(node, [])
        if not vals:
            continue
        lines.append(f"| {node} | {_fmt(_mean(vals))} | {_fmt(round(stats.median(vals), 1))} | {_fmt(max(vals))} |")
    lines.append("")

    taxonomy = taxonomy_canonical_skills()
    lines.append("## 3. Độ phủ taxonomy skill")
    lines.append("")
    lines.append(
        f"`extract_skills()` hiện nhận diện **{len(taxonomy)} skill chuẩn hoá** trong "
        "`backend/app/services/matching/resources/skill_graph.json`, "
        "cộng thêm một lớp fuzzy-match (rapidfuzz, ngưỡng 88) cho lỗi chính tả/spacing nhẹ. Phủ thêm "
        "các domain trước đây bị bỏ sót: ML/AI, embedded/firmware, data infra, "
        "blockchain, robotics, networking, mobile, DevOps. Bảng mục 6 bên dưới cho recall/precision "
        "thực đo trên từng CV."
    )
    lines.append("")

    lines.append("## 4. Thứ tự extract/summarize (bug đã sửa, đo lại ở đây)")
    lines.append("")
    lines.append(
        "Trước redesign, `extract_skills()` chạy trên `state[\"markdown\"]` **sau khi** node "
        "`summarize` ghi đè key này bằng bản LLM viết lại, nên skill bị bản tóm tắt bỏ sót sẽ mất "
        "vĩnh viễn. Từ redesign này, graph chạy `extract` **trước** `summarize` "
        "(`backend/app/agents/ingest/graph.py`), nên `lost_to_summarization` ở mục 1 kỳ vọng gần 0 "
        "cho toàn bộ mẫu. Bảng dưới liệt kê case nào (nếu có) vẫn còn mất skill, để soi lại nếu số "
        "khác 0."
    )
    lines.append("")
    worst_loss = sorted(
        results, key=lambda r: len(r["metrics"]["skills"]["lost_to_summarization"]), reverse=True
    )[:10]
    has_loss = any(r["metrics"]["skills"]["lost_to_summarization"] for r in worst_loss)
    if not has_loss:
        lines.append("Không có CV nào trong mẫu bị mất skill do summarization — đúng như kỳ vọng sau khi đổi thứ tự node.")
    else:
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
        "gốc trước summarize, sau đó tổng hợp bằng code (không lấy điểm tự chấm của model). Prompt "
        "`summarize.txt` có chỉ dẫn chống bịa đặt (anti-hallucination)."
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
        "`redact_pii()` có pattern domain/path tổng quát (bắt được mention kiểu "
        "`twitter.com/handle` không có scheme) và phát hiện tên bị \"wrap\" xuống dòng."
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
        "| CV | Nhóm ngành | Chất lượng | Số ký tự parse | low_content | Faithfulness | Skill P/R | Skill mất | PII hits | Total ms |"
    )
    lines.append("|---|---|---|---|---|---|---|---|---|---|")
    for r in sorted(results, key=lambda r: r["cv"]["cv_id"]):
        cv = r["cv"]
        m = r["metrics"]
        f = r["faithfulness"]
        sp = r["skills_pii"]
        low_content = r["run"]["metadata"].get("low_content")
        lines.append(
            f"| {cv['cv_id']} | {cv['group_name']} | {cv['quality_profile']} | "
            f"{m['parse']['chars']} | {'có' if low_content else 'không'} | {_fmt(f['score'])} | "
            f"{_fmt(sp['precision_est'])}/{_fmt(sp['recall_est'])} | "
            f"{len(m['skills']['lost_to_summarization'])} | {m['pii']['regex_hits_total']} | "
            f"{_fmt(m['total_ms'])} |"
        )
    lines.append("")

    hard_results = [r for r in results if r["cv"]["quality_profile"] == "hard_real_world"]
    if hard_results:
        rest_results = [r for r in results if r["cv"]["quality_profile"] != "hard_real_world"]
        hard_chars = [r["metrics"]["parse"]["chars"] for r in hard_results]
        rest_chars = [r["metrics"]["parse"]["chars"] for r in rest_results]
        lines.append("## 9. Bộ CV Hard (cấu trúc khó, dữ liệu thật từ TopCV.vn)")
        lines.append("")
        lines.append(
            f"{len(hard_results)} CV thật (export từ TopCV.vn), layout nhiều cột/icon. Parser có "
            "fallback `pdfplumber` (tách cột theo vị trí x) khi `pymupdf4llm`+OCR vẫn cho nội "
            "dung dưới ngưỡng `LOW_CONTENT_CHAR_THRESHOLD` (600 ký tự)."
        )
        lines.append("")
        lines.append(
            f"Parse yield trung bình bộ Hard ở lần chạy này: **{_fmt(_mean(hard_chars))} ký tự**, "
            f"so với **{_fmt(_mean(rest_chars))} ký tự** ở bộ CV tổng hợp ({len(rest_results)} CV còn "
            "lại)."
        )
        lines.append("")
        lines.append("| CV | Số ký tự parse | low_content | Faithfulness | Skill P/R | PII hits (regex/LLM-judge) |")
        lines.append("|---|---|---|---|---|---|")
        for r in sorted(hard_results, key=lambda r: r["metrics"]["parse"]["chars"]):
            cv, m, f, sp = r["cv"], r["metrics"], r["faithfulness"], r["skills_pii"]
            low_content = r["run"]["metadata"].get("low_content")
            pii = f"{m['pii']['regex_hits_total']}/{'có' if sp['pii_leak_found'] else 'không'}"
            lines.append(
                f"| {cv['candidate_name'] or cv['cv_id']} | {m['parse']['chars']} | "
                f"{'có' if low_content else 'không'} | {_fmt(f['score'])} | "
                f"{_fmt(sp['precision_est'])}/{_fmt(sp['recall_est'])} | {pii} |"
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
