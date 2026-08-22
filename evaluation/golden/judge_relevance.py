"""LLM-as-judge relevance grading for the 20-CV x 10-JD pool -> qrels.json.

Grade scale: 0 = not relevant, 1 = partially relevant (adjacent skills/role),
2 = strongly relevant. The 20 "own JD" pairs (each CV's target_jd_id) already
have a ground-truth coverage_score from generate_cvs.py's verify loop and are
used only as a calibration sanity check, not fed into the judge prompt.

Usage: python -m evaluation.golden.judge_relevance
Writes evaluation/golden/qrels.json
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
JDS_PATH = GOLDEN_DIR / "jds.json"
MANIFEST_PATH = GOLDEN_DIR / "cvs_manifest.json"
QRELS_PATH = GOLDEN_DIR / "qrels.json"

JUDGE_PROMPT = """Bạn là giám khảo tuyển dụng IT. Chấm mức độ phù hợp giữa 1 CV ứng viên và 1 JD (job description).
Trả lời DUY NHẤT bằng JSON hợp lệ, không kèm giải thích ngoài JSON: {{"grade": <0|1|2>, "reason": "<1 câu ngắn>"}}

grade 2 = ứng viên đáp ứng tốt hầu hết yêu cầu kỹ thuật cốt lõi của JD (đúng vai trò, đúng công nghệ chính).
grade 1 = liên quan một phần (cùng mảng CNTT / vài công nghệ trùng / vai trò gần nhưng không phải trọng tâm JD).
grade 0 = không liên quan (khác hẳn mảng công nghệ / vai trò).

=== JD ===
Title: {title}
Description: {description}
Requirements: {requirements}

=== CV ===
{cv_body}
"""


def load_cv_body(md_path: str) -> str:
    text = (GOLDEN_DIR / md_path).read_text(encoding="utf-8")
    parts = text.split("---", 2)
    return parts[2].strip() if len(parts) >= 3 else text


def judge_pair(jd: dict, cv_body: str, *, cache_key: str) -> tuple[int, str]:
    prompt = JUDGE_PROMPT.format(
        title=jd["title"],
        description=jd["description"][:1500],
        requirements=jd["requirements_text"][:1500],
        cv_body=cv_body[:3500],
    )
    raw = chat_complete(prompt, json_object=True, cache_key=cache_key)
    try:
        data = json.loads(raw)
        grade = int(data.get("grade", 0))
        grade = max(0, min(2, grade))
        return grade, str(data.get("reason", ""))
    except (json.JSONDecodeError, ValueError, TypeError):
        m = re.search(r"[0-2]", raw)
        return (int(m.group()) if m else 0), f"(parse fallback) {raw[:120]}"


def build_qrels() -> dict:
    jds = json.loads(JDS_PATH.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    all_cvs = []
    for entry in manifest:
        for cv in entry["cvs"]:
            all_cvs.append(cv)

    qrels: dict[str, dict[str, dict]] = {}
    for jd in jds:
        jd_id = jd["jd_id"]
        qrels[jd_id] = {}
        for cv in all_cvs:
            cv_id = cv["cv_id"]
            cv_body = load_cv_body(cv["md_path"])
            cache_key = f"judge_rel|{jd_id}|{cv_id}"
            grade, reason = judge_pair(jd, cv_body, cache_key=cache_key)
            qrels[jd_id][cv_id] = {"grade": grade, "reason": reason, "is_own_jd": cv["target_jd_id"] == jd_id}
        print(f"{jd_id}: graded {len(qrels[jd_id])} CVs")

    return qrels


def calibration_report(qrels: dict) -> list[str]:
    lines = []
    for jd_id, cv_grades in qrels.items():
        for cv_id, row in cv_grades.items():
            if row["is_own_jd"]:
                lines.append(f"{jd_id} / {cv_id}: judge_grade={row['grade']} (own-JD calibration pair)")
    return lines


def main() -> int:
    qrels = build_qrels()
    QRELS_PATH.write_text(json.dumps(qrels, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nqrels -> {QRELS_PATH}")
    print("\nCalibration (own-JD pairs, expect grade 2 for variant a, 0-1 for variant b):")
    for line in calibration_report(qrels):
        print(" ", line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
