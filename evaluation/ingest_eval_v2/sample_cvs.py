"""Pick a stratified sample of existing synthetic CVs to evaluate the Ingest Agent on.

Reuses data_find/generated_cv/ (432 CVs across 15 role groups, already rendered to PDF
for most entries) instead of generating a new golden set -- that pool already has the
variety (roles, seniority, "polished" vs "sparse" vs "cross_domain" formatting) needed to
stress the parse/clean/summarize/extract/embed pipeline.

Output: evaluation/ingest_eval_v2/manifest.json
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
CV_ROOT = REPO_ROOT / "data_find" / "generated_cv"
HARD_CV_ROOT = REPO_ROOT / "evaluation" / "cv_hard"
MANIFEST_PATH = Path(__file__).resolve().parent / "manifest.json"

SEED = 20260821
PER_GROUP = 2
EXTRA_SPARSE_TARGET = 6

# Real-world CVs (TopCV.vn exports etc.) with harder layouts than the synthetic set:
# multi-column, out-of-order sections after PDF text extraction, some pages needing OCR.
# No frontmatter, so candidate_name is hand-verified once from the raw parsed text (see
# conversation) rather than re-derived from the pipeline itself, to keep it an independent
# ground truth for the name-leak check -- same role frontmatter plays for the synthetic set.
HARD_CV_NAMES = {
    "CV Dương Hồng Đức - CV1_Backend_DuongHongDuc-TopCV.vn (3).pdf": "Dương Hồng Đức",
    "CV_LeVanSy_Backend_Intern.pdf": "Le Van Sy",
    "Mobile Developer Intern - Android.pdf": "Nguyễn Tiến Khang Huy",
    "Nguyen-Anh-Tuan-TopCV.vn-040925.195058.pdf": "Nguyễn Anh Tuấn",
    "PHI-NGOC-THIEN-TopCV.vn-lan1.pdf": "Phí Ngọc Thiện",
}


def _read_frontmatter(md_path: Path) -> dict:
    text = md_path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    return yaml.safe_load(text[3:end]) or {}


def _discover() -> list[dict]:
    entries = []
    for md_path in sorted(CV_ROOT.rglob("*.md")):
        if md_path.name.lower() == "readme.md":
            continue
        meta = _read_frontmatter(md_path)
        if not meta:
            continue
        pdf_path = md_path.with_suffix(".pdf")
        entries.append(
            {
                "cv_id": meta.get("cv_id") or md_path.stem,
                "group_name": meta.get("group_name") or md_path.parts[-3],
                "subgroup": meta.get("subgroup") or md_path.parts[-2],
                "candidate_name": meta.get("candidate_name") or "",
                "quality_profile": meta.get("quality_profile") or "unknown",
                "seniority": meta.get("seniority") or "",
                "md_path": str(md_path.relative_to(REPO_ROOT)).replace("\\", "/"),
                "pdf_path": (
                    str(pdf_path.relative_to(REPO_ROOT)).replace("\\", "/")
                    if pdf_path.exists()
                    else None
                ),
            }
        )
    return entries


def build_sample() -> list[dict]:
    rng = random.Random(SEED)
    all_entries = [e for e in _discover() if e["pdf_path"]]  # need PDF: parse_node consumes bytes+mime

    by_group: dict[str, list[dict]] = {}
    for e in all_entries:
        by_group.setdefault(e["group_name"], []).append(e)

    selected: list[dict] = []
    selected_ids: set[str] = set()

    for group, entries in sorted(by_group.items()):
        rng.shuffle(entries)
        # prefer diversity of quality_profile within the group
        by_profile: dict[str, list[dict]] = {}
        for e in entries:
            by_profile.setdefault(e["quality_profile"], []).append(e)
        picks: list[dict] = []
        for profile in sorted(by_profile):
            if len(picks) >= PER_GROUP:
                break
            picks.append(by_profile[profile][0])
        i = 0
        while len(picks) < PER_GROUP and i < len(entries):
            if entries[i] not in picks:
                picks.append(entries[i])
            i += 1
        for p in picks:
            if p["cv_id"] not in selected_ids:
                selected.append(p)
                selected_ids.add(p["cv_id"])

    # top up "sparse" quality_profile CVs specifically: messiest formatting is the
    # most revealing case for the parse/clean nodes.
    sparse_pool = [
        e for e in all_entries if e["quality_profile"] == "sparse" and e["cv_id"] not in selected_ids
    ]
    rng.shuffle(sparse_pool)
    current_sparse = sum(1 for e in selected if e["quality_profile"] == "sparse")
    for e in sparse_pool:
        if current_sparse >= EXTRA_SPARSE_TARGET:
            break
        selected.append(e)
        selected_ids.add(e["cv_id"])
        current_sparse += 1

    selected.sort(key=lambda e: (e["group_name"], e["cv_id"]))
    return selected


def build_hard_sample() -> list[dict]:
    entries = []
    for pdf_path in sorted(HARD_CV_ROOT.glob("*.pdf")):
        entries.append(
            {
                "cv_id": f"HARD-{pdf_path.stem[:24]}",
                "group_name": "CV Hard (thực tế)",
                "subgroup": "real_world_topcv",
                "candidate_name": HARD_CV_NAMES.get(pdf_path.name, ""),
                "quality_profile": "hard_real_world",
                "seniority": "",
                "md_path": None,
                "pdf_path": str(pdf_path.relative_to(REPO_ROOT)).replace("\\", "/"),
            }
        )
    return entries


def main() -> None:
    sample = build_sample() + build_hard_sample()
    MANIFEST_PATH.write_text(json.dumps(sample, ensure_ascii=False, indent=2), encoding="utf-8")
    profiles: dict[str, int] = {}
    for e in sample:
        profiles[e["quality_profile"]] = profiles.get(e["quality_profile"], 0) + 1
    print(f"sampled {len(sample)} CVs across {len(set(e['group_name'] for e in sample))} groups")
    print(f"quality_profile breakdown: {profiles}")
    print(f"written to {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
