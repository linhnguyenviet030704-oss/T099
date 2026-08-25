"""Translate the 36 synthetic English CVs already sampled in manifest.json into natural
Vietnamese, paired 1:1 with their English originals (same underlying person/skills/content,
only the language changes). This lets run_eval.py measure whether the parse/clean/extract/
summarize pipeline handles Vietnamese-language CV bodies as well as it handles the English
originals, with any metric delta attributable to language rather than CV content.

Section headings are translated to the exact Vietnamese variants
backend/app/services/matching/parse.py:SECTION_NAMES already recognizes (kinh nghiệm làm việc,
học vấn, kỹ năng, dự án, chứng chỉ, ngoại ngữ, giới thiệu, thông tin thêm) -- this is what makes
the eval a real test of that normalizer, not just a translation exercise. Technology/tool/
framework/certification names are kept in English, matching how real Vietnamese IT CVs are
written (see evaluation/cv_hard/*.pdf).

Writes translated .md under data_find/generated_cv_vi/ (same relative layout as
data_find/generated_cv/), renders them to PDF by shelling out to the existing
data_find/generated_cv/scripts/render_cv_pdf.py (reused unmodified), and appends the new
entries to evaluation/ingest_eval_v2/manifest.json. Existing manifest entries are tagged with
a `language` field (en for the synthetic pool, vi for the real TopCV.vn hard set, which was
already Vietnamese).

Usage: python -m evaluation.ingest_eval_v2.translate_cvs_vi
Requires OPENAI_API_KEY (see llm_openai.py).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

from backend.app.services.matching.skills import extract_skills, load_taxonomy_index  # noqa: E402
from evaluation.ingest_eval_v2.cache import cached_call, content_hash  # noqa: E402
from evaluation.ingest_eval_v2.llm_openai import CHAT_MODEL, openai_complete  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
GENERATED_CV_ROOT = REPO_ROOT / "data_find" / "generated_cv"
GENERATED_CV_VI_ROOT = REPO_ROOT / "data_find" / "generated_cv_vi"
RENDER_SCRIPT = GENERATED_CV_ROOT / "scripts" / "render_cv_pdf.py"
MANIFEST_PATH = Path(__file__).resolve().parent / "manifest.json"
PROMPT_VERSION = "v1"
MAX_ATTEMPTS = 2
MIN_SKILL_RETENTION = 0.9

TRANSLATE_PROMPT = """Bạn dịch một CV IT từ tiếng Anh sang tiếng Việt tự nhiên, như một CV
thật do người Việt viết bằng tiếng Việt (đúng phong cách CV IT Việt Nam thật, ví dụ CV export
từ TopCV.vn).

YÊU CẦU BẮT BUỘC:
1. GIỮ NGUYÊN cấu trúc markdown: đúng số dòng heading (#, ##, ###), đúng số gạch đầu dòng (-),
   đúng định dạng "### Chức danh | Công ty, Địa điểm | Khoảng thời gian", đúng định dạng nhãn
   "**Nhãn:** nội dung".
2. Dòng tên (dòng bắt đầu bằng "# ") và mọi proper noun (tên công ty, tên trường, tên chứng
   chỉ, tên sản phẩm) GIỮ NGUYÊN, không dịch.
3. Dịch chức danh, mô tả công việc, đoạn giới thiệu, các gạch đầu dòng kinh nghiệm sang tiếng
   Việt tự nhiên, mạch lạc (không dịch máy móc từng từ).
4. GIỮ NGUYÊN tiếng Anh mọi tên công nghệ / ngôn ngữ lập trình / framework / công cụ / method-
   ology (vd: Go, Java, PostgreSQL, AWS, Docker, Scrum, Kubernetes...) -- đây là chuẩn CV IT ở
   Việt Nam, tuyệt đối không dịch hay đổi các từ này.
5. Đổi heading section sang ĐÚNG các heading tiếng Việt sau (map 1-1 theo nghĩa heading gốc,
   không dùng biến thể khác):
   - Profile / Summary / Objective -> "## Giới thiệu"
   - Work Experience -> "## Kinh nghiệm làm việc"
   - Education -> "## Học vấn"
   - Technical Skills / Skills -> "## Kỹ năng"
   - Certifications -> "## Chứng chỉ"
   - Projects -> "## Dự án"
   - Languages -> "## Ngoại ngữ"
   - Additional (hoặc heading tự do khác) -> "## Thông tin thêm"
6. Số liệu, ngày tháng, phần trăm, số lượng GIỮ NGUYÊN.
7. Địa danh Việt Nam dịch sang tiếng Việt chuẩn (Ho Chi Minh City -> TP. Hồ Chí Minh, Ha Noi ->
   Hà Nội, District 7 -> Quận 7, v.v.).
8. Không thêm giải thích, không thêm ```, chỉ trả về đúng nội dung CV markdown đã dịch, bắt đầu
   từ dòng "# Tên".
{retry_note}
CV GỐC (tiếng Anh):
---
{body}
---
"""


def split_frontmatter(text: str) -> tuple[dict, str, str]:
    if not text.startswith("---"):
        return {}, "", text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, "", text
    import yaml

    fm_raw = text[3:end]
    meta = yaml.safe_load(fm_raw) or {}
    body = text[end + 4 :].lstrip("\n")
    return meta, fm_raw, body


def translate_body(cv_id: str, body: str, index: dict) -> tuple[str, bool]:
    original_skills = set(extract_skills(body, index))
    prior_issue = ""
    translated = body
    ok = True
    for attempt in range(MAX_ATTEMPTS):
        retry_note = (
            f"\nLẦN DỊCH TRƯỚC BỊ MẤT SKILL SAU: {prior_issue}. Lần này phải nhắc lại đúng các "
            "công nghệ đó (giữ nguyên tiếng Anh) ở đúng vị trí tương ứng.\n"
            if attempt > 0
            else ""
        )
        prompt = TRANSLATE_PROMPT.format(retry_note=retry_note, body=body)
        cache_key = content_hash(PROMPT_VERSION, CHAT_MODEL, "translate_vi", cv_id, str(attempt))
        translated = cached_call("translate_vi", cache_key, lambda p=prompt: {"text": openai_complete(p)})["text"]
        translated_skills = set(extract_skills(translated, index))
        retention = len(translated_skills & original_skills) / len(original_skills) if original_skills else 1.0
        if retention >= MIN_SKILL_RETENTION:
            ok = True
            break
        missing = sorted(original_skills - translated_skills)
        prior_issue = ", ".join(missing)
        ok = False
    return translated, ok


def slugify(name: str) -> str:
    ascii_name = re.sub(r"[^a-zA-Z0-9]+", "-", name).strip("-").lower()
    return ascii_name or "candidate"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    for entry in manifest:
        entry.setdefault("language", "vi" if entry["quality_profile"] == "hard_real_world" else "en")

    index = load_taxonomy_index()
    en_entries = [e for e in manifest if e["quality_profile"] != "hard_real_world"]
    if args.limit:
        en_entries = en_entries[: args.limit]

    new_entries: list[dict] = []
    warnings: list[str] = []
    for i, entry in enumerate(en_entries, 1):
        src_path = REPO_ROOT / entry["md_path"]
        text = src_path.read_text(encoding="utf-8")
        meta, _fm_raw, body = split_frontmatter(text)

        translated_body, ok = translate_body(entry["cv_id"], body, index)
        if not ok:
            warnings.append(entry["cv_id"])

        new_meta = dict(meta)
        new_meta["language"] = "vi"
        new_meta["source"] = "synthetic_llm_translated"
        new_meta["translated_from"] = entry["cv_id"]
        fm_yaml = "\n".join(
            f"{k}: {json.dumps(v, ensure_ascii=False) if isinstance(v, (list, bool)) else v}"
            for k, v in new_meta.items()
        )
        full_md = f"---\n{fm_yaml}\n---\n\n{translated_body.strip()}\n"

        rel_dir = Path(entry["md_path"]).relative_to("data_find/generated_cv").parent
        out_dir = GENERATED_CV_VI_ROOT / rel_dir
        out_dir.mkdir(parents=True, exist_ok=True)
        candidate_name = meta.get("candidate_name", entry["candidate_name"])
        filename = f"{entry['cv_id'].lower()}-vi-{slugify(candidate_name)}.md"
        out_path = out_dir / filename
        out_path.write_text(full_md, encoding="utf-8")

        vi_cv_id = f"{entry['cv_id']}-VI"
        new_entries.append(
            {
                "cv_id": vi_cv_id,
                "group_name": entry["group_name"],
                "subgroup": entry["subgroup"],
                "candidate_name": candidate_name,
                "quality_profile": entry["quality_profile"],
                "seniority": entry.get("seniority", ""),
                "language": "vi",
                "paired_with": entry["cv_id"],
                "md_path": str(out_path.relative_to(REPO_ROOT)).replace("\\", "/"),
                "pdf_path": str(out_path.with_suffix(".pdf").relative_to(REPO_ROOT)).replace("\\", "/"),
            }
        )
        print(f"[{i}/{len(en_entries)}] {vi_cv_id} translated ({'ok' if ok else 'SKILL LOSS'}) -> {out_path.name}")

    subprocess.run([sys.executable, str(RENDER_SCRIPT), str(GENERATED_CV_VI_ROOT)], check=True)

    manifest.extend(new_entries)
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n{len(new_entries)} Vietnamese CV(s) -> {GENERATED_CV_VI_ROOT}")
    print(f"manifest -> {MANIFEST_PATH} ({len(manifest)} entries total)")
    if warnings:
        print(f"WARNING: skill retention below {MIN_SKILL_RETENTION:.0%} after {MAX_ATTEMPTS} attempts: {warnings}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
