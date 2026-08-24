"""Pick 20 diverse, concrete IT job descriptions from the VietJobs dataset,
spread across all 15 IT-role groups that data_find/generated_cv has real CVs
for (groups 16-20 in it-job-categories.md have no CV pool and are excluded).

Usage: python -m evaluation.golden.select_jds
Writes evaluation/golden/jds.json
"""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
csv.field_size_limit(10_000_000)

ROOT = Path(__file__).resolve().parents[2]
VIETJOBS_CSV_PATH = ROOT / "data_find" / "data" / "vietjobs" / "VietJobs_full.csv"
METADATA_CSV_PATH = ROOT / "data_find" / "generated_cv" / "metadata.csv"
OUT_PATH = Path(__file__).resolve().parent / "jds.json"

CATEGORIES = {"công_nghệ_thông_tin_kỹ_thuật_số", "kỹ_thuật_điện_điện_tử_viễn_thông"}
MIN_TAXONOMY_HITS = 1
N_JDS = 20

EXCLUDE_TITLE_KEYWORDS = [
    "thiết kế", "designer", "kinh doanh", "sales", "sale", "tư vấn bán", "cnc",
    "cơ khí", "tiếp nhận", "content", "marketing", "biên tập",
    "trợ lý", "kế hoạch", "pmo", "điều hành", "thư ký", "hỗ trợ khách hàng",
]


def compute_group_quota(group_counts: dict[int, int], total: int = 20) -> dict[int, int]:
    """Largest-remainder apportionment of `total` seats over `group_counts`,
    with a floor of 1 seat per group (extra seats go to the largest pools)."""
    groups = sorted(group_counts)
    if total < len(groups):
        raise ValueError(f"total={total} must be >= number of groups={len(groups)}")

    quota = {g: 1 for g in groups}
    remaining = total - len(groups)
    ranked = sorted(groups, key=lambda g: group_counts[g], reverse=True)
    for g in ranked[:remaining]:
        quota[g] += 1
    return quota


def load_metadata_rows() -> list[dict]:
    with METADATA_CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def guess_subgroup(jd_title: str, group_id: int, metadata_rows: list[dict]) -> str:
    """Best-effort keyword match between `jd_title` and the `subgroup` /
    `target_role` values of `group_id` rows in metadata.csv. Falls back to
    the subgroup with the most CVs in the group."""
    title_n = jd_title.casefold()
    group_rows = [r for r in metadata_rows if int(r["group_id"]) == group_id]
    if not group_rows:
        raise ValueError(f"no metadata rows for group_id={group_id}")

    for subgroup in sorted({r["subgroup"] for r in group_rows}):
        if subgroup.casefold() in title_n:
            return subgroup

    for row in group_rows:
        if row["target_role"].casefold() in title_n:
            return row["subgroup"]

    counts = Counter(row["subgroup"] for row in group_rows)
    return counts.most_common(1)[0][0]


def _classify_module():
    scripts_dir = str(ROOT / "scripts")
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    import build_vietjobs_it_seed as module

    return module


def select_jds(
    vietjobs_csv_path: Path,
    metadata_rows: list[dict],
    taxonomy_index: dict,
    n: int = 20,
) -> list[dict]:
    from backend.app.services.matching.skills import extract_skills

    seed_module = _classify_module()
    classify = seed_module.classify

    group_counts = Counter(int(r["group_id"]) for r in metadata_rows)
    quota = compute_group_quota(dict(group_counts), total=n)

    candidates_by_group: dict[int, list[dict]] = {g: [] for g in quota}
    seen_title_keys: set[str] = set()

    with vietjobs_csv_path.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("category") not in CATEGORIES:
                continue
            desc = (row.get("description") or "").strip()
            skills = (row.get("technical_skills") or "").strip()
            title = (row.get("job_title") or "").strip()
            if len(desc) < 250 or len(skills) < 10:
                continue
            title_n = title.casefold()
            if any(bad in title_n for bad in EXCLUDE_TITLE_KEYWORDS):
                continue
            key = title_n[:24]
            if key in seen_title_keys:
                continue

            hits = [g for g in classify(title) if g in quota]
            if not hits:
                continue

            probe_text = f"{title} {skills} {desc[:800]}"
            matched = extract_skills(probe_text, taxonomy_index)
            if len(matched) < MIN_TAXONOMY_HITS:
                continue

            seen_title_keys.add(key)
            candidate = {
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
            for g in hits:
                candidates_by_group[g].append(candidate)

    jds: list[dict] = []
    for group_id in sorted(quota):
        rows = sorted(candidates_by_group[group_id], key=lambda r: -r["_score"])
        group_name = next(
            (r["group_name"] for r in metadata_rows if int(r["group_id"]) == group_id),
            f"Group {group_id}",
        )

        picked: list[tuple[dict, str]] = []
        used_ids: set[int] = set()

        # Pass 1: prefer candidates that land in a subgroup not picked yet.
        picked_subgroups: set[str] = set()
        for row in rows:
            if len(picked) >= quota[group_id]:
                break
            subgroup = guess_subgroup(row["title"], group_id, metadata_rows)
            if subgroup in picked_subgroups:
                continue
            picked_subgroups.add(subgroup)
            picked.append((row, subgroup))
            used_ids.add(id(row))

        # Pass 2: fill any remaining slots, subgroup repeats allowed.
        for row in rows:
            if len(picked) >= quota[group_id]:
                break
            if id(row) in used_ids:
                continue
            subgroup = guess_subgroup(row["title"], group_id, metadata_rows)
            picked.append((row, subgroup))
            used_ids.add(id(row))

        for row, subgroup in picked:
            matched = row.pop("_matched_taxonomy")
            row.pop("_score", None)
            jd_id = f"JD-{len(jds) + 1:02d}"
            jds.append(
                {
                    **row,
                    "jd_id": jd_id,
                    "group_id": group_id,
                    "group_name": group_name,
                    "cv_subgroup_hint": subgroup,
                    "taxonomy_skills": matched,
                }
            )

    return jds


def main() -> int:
    from backend.app.services.matching.skills import load_taxonomy_index

    if not VIETJOBS_CSV_PATH.exists():
        print(f"missing {VIETJOBS_CSV_PATH}", file=sys.stderr)
        return 1
    if not METADATA_CSV_PATH.exists():
        print(f"missing {METADATA_CSV_PATH}", file=sys.stderr)
        return 1

    index = load_taxonomy_index()
    metadata_rows = load_metadata_rows()
    jds = select_jds(VIETJOBS_CSV_PATH, metadata_rows, index, n=N_JDS)

    OUT_PATH.write_text(json.dumps(jds, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(jds)} JD(s) -> {OUT_PATH}")
    for jd in jds:
        print(
            f"  {jd['jd_id']} (group {jd['group_id']} {jd['group_name']} / "
            f"{jd['cv_subgroup_hint']}): {jd['title']!r} taxonomy={jd['taxonomy_skills']}"
        )
    return 0 if len(jds) == N_JDS else 1


if __name__ == "__main__":
    raise SystemExit(main())
