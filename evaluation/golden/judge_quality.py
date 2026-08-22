"""LLM-as-judge quality checks for the Ingest Agent's LLM steps.

Faithfulness: does summarize_resume()'s rewritten body stay supported by the
original (parsed + PII-redacted) CV text -- RAGAS-style claim decomposition,
implemented as a direct judge prompt (not the ragas library, see spec section
7 for why: only one metric was needed, not worth the adapter/dependency cost).

Skill-extraction accuracy: does extract_skills() (closed 10-term taxonomy)
over/under-report vs what a human-equivalent reading of the CV would say.

Usage: python -m evaluation.golden.judge_quality
Reads evaluation/golden/ingest_results.json (written by run_eval.py)
Writes evaluation/golden/quality_judge.json
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from evaluation.golden.llm_openai import chat_complete  # noqa: E402

GOLDEN_DIR = Path(__file__).resolve().parent
INGEST_RESULTS_PATH = GOLDEN_DIR / "ingest_results.json"
OUT_PATH = GOLDEN_DIR / "quality_judge.json"

FAITHFULNESS_PROMPT = """Bạn kiểm tra 1 bản tóm tắt CV có trung thực với bản gốc không (không bịa thông tin).
Trả lời DUY NHẤT JSON: {{"faithfulness_score": <0.0-1.0>, "unsupported_claims": ["..."]}}
faithfulness_score = tỉ lệ claim trong SUMMARY được support bởi ORIGINAL (1.0 = hoàn toàn trung thực, không bịa gì).
unsupported_claims = liệt kê ngắn gọn các claim trong SUMMARY không thấy trong ORIGINAL (rỗng nếu không có).

=== ORIGINAL (CV đã parse) ===
{original}

=== SUMMARY (đã qua bước summarize của Ingest Agent) ===
{summary}
"""

SKILL_ACCURACY_PROMPT = """Hệ thống chỉ nhận diện đúng 10 skill sau (không skill nào khác): {taxonomy}.
Hệ thống đã trích ra danh sách sau từ 1 CV: {extracted}.
Đọc CV bên dưới và cho biết:
- false_positives: skill nằm trong danh sách trích ra NHƯNG không thực sự được CV thể hiện.
- false_negatives: skill nằm trong 10 skill ở trên, THỰC SỰ được CV thể hiện rõ ràng, nhưng KHÔNG có trong danh sách trích ra.
Trả lời DUY NHẤT JSON: {{"false_positives": [...], "false_negatives": [...]}}

=== CV ===
{cv_text}
"""

TAXONOMY = ["Python", "FastAPI", "PostgreSQL", "Docker", "JavaScript", "TypeScript", "React", "SQL", "Git", "Linux"]


def judge_faithfulness(original: str, summary: str, *, cache_key: str) -> dict:
    if not summary.strip():
        return {"faithfulness_score": None, "unsupported_claims": ["(empty summary)"]}
    prompt = FAITHFULNESS_PROMPT.format(original=original[:4000], summary=summary[:2000])
    raw = chat_complete(prompt, json_object=True, cache_key=cache_key)
    try:
        data = json.loads(raw)
        return {
            "faithfulness_score": float(data.get("faithfulness_score", 0.0)),
            "unsupported_claims": list(data.get("unsupported_claims") or []),
        }
    except (json.JSONDecodeError, ValueError, TypeError):
        return {"faithfulness_score": None, "unsupported_claims": [f"(parse fallback) {raw[:150]}"]}


def judge_skill_accuracy(cv_text: str, extracted: list[str], *, cache_key: str) -> dict:
    prompt = SKILL_ACCURACY_PROMPT.format(taxonomy=TAXONOMY, extracted=extracted, cv_text=cv_text[:4000])
    raw = chat_complete(prompt, json_object=True, cache_key=cache_key)
    try:
        data = json.loads(raw)
        return {
            "false_positives": list(data.get("false_positives") or []),
            "false_negatives": list(data.get("false_negatives") or []),
        }
    except (json.JSONDecodeError, ValueError, TypeError):
        return {"false_positives": [], "false_negatives": [], "parse_error": raw[:150]}


def main() -> int:
    if not INGEST_RESULTS_PATH.exists():
        print(f"missing {INGEST_RESULTS_PATH} -- run run_eval.py first", file=sys.stderr)
        return 1

    results = json.loads(INGEST_RESULTS_PATH.read_text(encoding="utf-8"))
    out = {}
    for cv_id, row in results.items():
        faith = judge_faithfulness(row["original_markdown"], row["summarized_body"], cache_key=f"judge_faith|{cv_id}")
        skill_acc = judge_skill_accuracy(
            row["original_markdown"], row["extracted_skills"], cache_key=f"judge_skill|{cv_id}"
        )
        out[cv_id] = {"faithfulness": faith, "skill_accuracy": skill_acc}
        print(f"{cv_id}: faithfulness={faith['faithfulness_score']} "
              f"fp={skill_acc['false_positives']} fn={skill_acc['false_negatives']}")

    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n-> {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
