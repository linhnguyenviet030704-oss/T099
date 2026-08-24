"""Select 40 golden-eval CVs (2 per JD: variant "a" high-match, variant "b"
low/partial-match) from the two pre-existing real CV pools instead of
LLM-synthesizing CVs per JD.

Usage: python -m evaluation.golden.select_cvs
Reads evaluation/golden/jds.json (from select_jds.py)
Writes evaluation/golden/cvs_manifest.json
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
EN_CV_ROOT = ROOT / "data_find" / "generated_cv"
VI_CV_ROOT = ROOT / "data_find" / "generated_cv_vi"
METADATA_CSV_PATH = EN_CV_ROOT / "metadata.csv"
JDS_PATH = Path(__file__).resolve().parent / "jds.json"
MANIFEST_PATH = Path(__file__).resolve().parent / "cvs_manifest.json"

_CV_ID_RE = re.compile(r"^cv_id:\s*(\S+)\s*$", re.MULTILINE)


def load_metadata() -> list[dict]:
    with METADATA_CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def load_vi_cv_ids() -> set[str]:
    ids: set[str] = set()
    for md_file in VI_CV_ROOT.rglob("*.md"):
        text = md_file.read_text(encoding="utf-8")
        match = _CV_ID_RE.search(text)
        if match:
            ids.add(match.group(1).strip())
    return ids


def pick_candidate(
    metadata_rows: list[dict],
    group_id: int,
    subgroup: str,
    quality_preference: list[str],
    exclude_ids: set[str],
) -> dict | None:
    """Pick a CV row for (group_id, subgroup) preferring, in order, each
    quality_profile in `quality_preference`, first within `subgroup`, then
    (for each quality in turn) anywhere else in the same group. Deterministic:
    lowest cv_id wins ties. Returns None if nothing matches at all."""
    group_rows = [r for r in metadata_rows if int(r["group_id"]) == group_id and r["cv_id"] not in exclude_ids]

    def best(rows: list[dict]) -> dict | None:
        if not rows:
            return None
        return min(rows, key=lambda r: r["cv_id"])

    for quality in quality_preference:
        same_subgroup = [r for r in group_rows if r["subgroup"] == subgroup and r["quality_profile"] == quality]
        found = best(same_subgroup)
        if found is not None:
            return found

    for quality in quality_preference:
        other_subgroup = [r for r in group_rows if r["quality_profile"] == quality]
        found = best(other_subgroup)
        if found is not None:
            return found

    return None


def choose_vi_jd_ids(
    jd_group_ids: dict[str, int],
    jd_candidate_vi_ids: dict[str, set[str]],
    vi_cv_ids: set[str],
    target_max: int = 10,
) -> set[str]:
    """A JD is VI-eligible if any of its candidate cv_ids has a VI
    translation. Walk JDs in id order, picking one eligible JD per distinct
    group first, then allow repeats, stopping at target_max."""
    eligible = [
        jd_id
        for jd_id in sorted(jd_group_ids)
        if jd_candidate_vi_ids.get(jd_id, set()) & vi_cv_ids
    ]

    chosen: list[str] = []
    used_groups: set[int] = set()

    for jd_id in eligible:
        if len(chosen) >= target_max:
            break
        group_id = jd_group_ids[jd_id]
        if group_id in used_groups:
            continue
        chosen.append(jd_id)
        used_groups.add(group_id)

    for jd_id in eligible:
        if len(chosen) >= target_max:
            break
        if jd_id in chosen:
            continue
        chosen.append(jd_id)

    return set(chosen)


def _row_paths(row: dict, language: str) -> tuple[str, str]:
    rel_root = "data_find/generated_cv" if language == "en" else "data_find/generated_cv_vi"
    md_path = f"{rel_root}/{row['md_path']}"
    pdf_path = f"{rel_root}/{row['pdf_path']}"
    assert (ROOT / md_path).exists(), f"missing CV file: {md_path}"
    return md_path, pdf_path


def _vi_row_for(cv_id: str) -> dict | None:
    for md_file in VI_CV_ROOT.rglob("*.md"):
        text = md_file.read_text(encoding="utf-8")
        match = _CV_ID_RE.search(text)
        if match and match.group(1).strip() == cv_id:
            rel_md = md_file.relative_to(VI_CV_ROOT).as_posix()
            return {"md_path": rel_md, "pdf_path": rel_md.replace(".md", ".pdf")}
    return None


def _build_cv_entry(row: dict, jd: dict, variant: str, use_vi: bool) -> dict:
    from backend.app.services.matching.skills import coverage_score, extract_skills, load_taxonomy_index

    cv_id = row["cv_id"]
    language = "en"
    md_path, pdf_path = _row_paths(row, "en")

    if use_vi:
        vi_row = _vi_row_for(cv_id)
        if vi_row is not None:
            language = "vi"
            md_path = f"data_find/generated_cv_vi/{vi_row['md_path']}"
            pdf_path = f"data_find/generated_cv_vi/{vi_row['pdf_path']}"

    body_text = (ROOT / md_path).read_text(encoding="utf-8")
    parts = body_text.split("---", 2)
    body = parts[2].strip() if len(parts) >= 3 else body_text

    index = load_taxonomy_index()
    actual_skills = extract_skills(body, index)
    actual_pct = round(coverage_score(actual_skills, jd["taxonomy_skills"], index) * 100, 1) if jd["taxonomy_skills"] else 0.0

    return {
        "cv_id": cv_id,
        "target_jd_id": jd["jd_id"],
        "variant": variant,
        "candidate_name": row.get("candidate_name", cv_id),
        "language": language,
        "source": "real_pool_en" if language == "en" else "real_pool_vi",
        "subgroup": row["subgroup"],
        "quality_profile": row["quality_profile"],
        "md_path": md_path,
        "pdf_path": pdf_path,
        "actual_taxonomy_skills": actual_skills,
        "actual_coverage_pct": actual_pct,
    }


def build_manifest(jds: list[dict], metadata_rows: list[dict], vi_cv_ids: set[str]) -> list[dict]:
    # First pass: pick variant a/b cv rows for every JD (English identity;
    # language is decided in the second pass).
    picks: dict[str, dict[str, dict]] = {}
    used_ids: set[str] = set()
    for jd in jds:
        row_a = pick_candidate(metadata_rows, jd["group_id"], jd["cv_subgroup_hint"], ["polished"], used_ids)
        if row_a is None:
            raise RuntimeError(f"{jd['jd_id']}: no polished CV available in group {jd['group_id']}")
        used_ids.add(row_a["cv_id"])

        row_b = pick_candidate(
            metadata_rows, jd["group_id"], jd["cv_subgroup_hint"], ["sparse", "cross_domain"], used_ids
        )
        if row_b is None:
            raise RuntimeError(f"{jd['jd_id']}: no sparse/cross_domain CV available in group {jd['group_id']}")
        used_ids.add(row_b["cv_id"])

        picks[jd["jd_id"]] = {"a": row_a, "b": row_b}

    # Decide which JDs get a Vietnamese variant.
    jd_group_ids = {jd["jd_id"]: jd["group_id"] for jd in jds}
    jd_candidate_vi_ids = {
        jd_id: {picks[jd_id]["a"]["cv_id"], picks[jd_id]["b"]["cv_id"]} for jd_id in picks
    }
    vi_jd_ids = choose_vi_jd_ids(jd_group_ids, jd_candidate_vi_ids, vi_cv_ids, target_max=10)

    manifest: list[dict] = []
    for jd in jds:
        row_a, row_b = picks[jd["jd_id"]]["a"], picks[jd["jd_id"]]["b"]
        use_vi_a = jd["jd_id"] in vi_jd_ids and row_a["cv_id"] in vi_cv_ids
        use_vi_b = (
            jd["jd_id"] in vi_jd_ids
            and not use_vi_a
            and row_b["cv_id"] in vi_cv_ids
        )
        cv_a = _build_cv_entry(row_a, jd, "a", use_vi_a)
        cv_b = _build_cv_entry(row_b, jd, "b", use_vi_b)
        manifest.append(
            {
                "jd_id": jd["jd_id"],
                "jd_title": jd["title"],
                "jd_taxonomy_skills": jd["taxonomy_skills"],
                "cvs": [cv_a, cv_b],
            }
        )

    return manifest


def main() -> int:
    if not JDS_PATH.exists():
        print(f"missing {JDS_PATH} -- run select_jds.py first", file=sys.stderr)
        return 1

    jds = json.loads(JDS_PATH.read_text(encoding="utf-8"))
    metadata_rows = load_metadata()
    vi_cv_ids = load_vi_cv_ids()

    manifest = build_manifest(jds, metadata_rows, vi_cv_ids)

    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    total_cvs = sum(len(entry["cvs"]) for entry in manifest)
    vi_count = sum(1 for entry in manifest for cv in entry["cvs"] if cv["language"] == "vi")
    print(f"{total_cvs} CV(s) -> {MANIFEST_PATH} ({vi_count} Vietnamese)")
    for entry in manifest:
        a, b = entry["cvs"]
        print(
            f"  {entry['jd_id']}: a={a['cv_id']}({a['language']},{a['quality_profile']}) "
            f"b={b['cv_id']}({b['language']},{b['quality_profile']})"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
