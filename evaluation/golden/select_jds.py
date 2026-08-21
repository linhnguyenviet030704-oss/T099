"""Pick 10 diverse, concrete IT job descriptions from the VietJobs dataset.

Constraint: the real skill taxonomy the Matching Agent uses
(backend/app/services/matching/resources/skill_graph.json) only recognizes 10
terms today (Python, FastAPI, PostgreSQL, Docker, JavaScript, TypeScript,
React, SQL, Git, Linux). JD selection is restricted to that scope so
coverage_score() (used later to verify CV match %) produces real, non-zero
numbers instead of silently scoring everything 0.

Usage: python -m evaluation.golden.select_jds
Writes evaluation/golden/jds.json
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
csv.field_size_limit(10_000_000)

ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = ROOT / "data_find" / "data" / "vietjobs" / "VietJobs_full.csv"
OUT_PATH = Path(__file__).resolve().parent / "jds.json"

CATEGORY = "công_nghệ_thông_tin_kỹ_thuật_số"
MIN_TAXONOMY_HITS = 1
N_JDS = 10

EXCLUDE_TITLE_KEYWORDS = [
    "thiết kế", "designer", "kinh doanh", "sales", "sale", "tư vấn bán", "cnc",
    "cơ khí", "tiếp nhận", "content", "marketing", "biên tập",
    "trợ lý", "kế hoạch", "pmo", "điều hành", "thư ký", "hỗ trợ khách hàng",
]


def normalize(s: str) -> str:
    return (s or "").casefold()


def main() -> int:
    from backend.app.services.matching.skills import extract_skills, load_taxonomy_index

    if not CSV_PATH.exists():
        print(f"missing {CSV_PATH}", file=sys.stderr)
        return 1

    index = load_taxonomy_index()
    candidates = []
    with CSV_PATH.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("category") != CATEGORY:
                continue
            desc = (row.get("description") or "").strip()
            skills = (row.get("technical_skills") or "").strip()
            title = (row.get("job_title") or "").strip()
            if len(desc) < 250 or len(skills) < 10:
                continue
            title_n = normalize(title)
            if any(bad in title_n for bad in EXCLUDE_TITLE_KEYWORDS):
                continue

            probe_text = f"{title} {skills} {desc[:800]}"
            matched = extract_skills(probe_text, index)
            if len(matched) < MIN_TAXONOMY_HITS:
                continue

            candidates.append(
                {
                    "title": title,
                    "location": row.get("location", ""),
                    "experience_required": row.get("experience_required", ""),
                    "qualifications": row.get("qualifications", ""),
                    "technical_skills": skills,
                    "description": desc,
                    "requirements_text": row.get("requirements_text", ""),
                    "_matched_taxonomy": matched,
                    "_score": len(matched) * 100_000 + len(desc),
                }
            )

    candidates.sort(key=lambda r: -r["_score"])

    picked: list[dict] = []
    seen_titles_norm: set[str] = set()
    for row in candidates:
        title_norm = normalize(row["title"])[:24]
        if title_norm in seen_titles_norm:
            continue
        seen_titles_norm.add(title_norm)
        picked.append(row)
        if len(picked) >= N_JDS:
            break

    jds = []
    for i, row in enumerate(picked, start=1):
        matched = row.pop("_matched_taxonomy")
        row.pop("_score", None)
        row["jd_id"] = f"JD-{i:02d}"
        row["taxonomy_skills"] = matched
        jds.append(row)

    OUT_PATH.write_text(json.dumps(jds, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(jds)} JD(s) -> {OUT_PATH}")
    for jd in jds:
        print(f"  {jd['jd_id']}: {jd['title']!r} ({jd['location']}) taxonomy={jd['taxonomy_skills']}")
    return 0 if len(jds) == N_JDS else 1


if __name__ == "__main__":
    raise SystemExit(main())
