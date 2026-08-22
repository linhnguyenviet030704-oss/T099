"""Generate + verify the 20 golden CVs (2 per JD) for the eval pool.

For each JD, generates two CVs:
  - variant "a" (high match): includes every taxonomy skill the JD requires.
  - variant "b" (partial/low match): the JD's taxonomy skills minus one (or
    all of them, if the JD only has one) -- a deliberately weaker candidate.

"Match %" is verified with the real coverage_score()/extract_skills() the
Matching Agent uses, not a number the LLM reports about itself. Because most
JDs here only carry 1-3 recognized taxonomy skills, coverage_score can only
land on a few discrete values (0/50/100 for 2 skills, etc) -- there is no
continuous 80-90% band to hit. See docs/superpowers/specs/... for why.

Usage: python -m evaluation.golden.generate_cvs
Writes evaluation/golden/cvs/*.md (+.pdf) and evaluation/golden/cvs_manifest.json
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.app.services.matching.skills import (  # noqa: E402
    coverage_score,
    extract_skills,
    load_taxonomy_index,
)
from evaluation.golden.llm_openai import chat_complete  # noqa: E402

GOLDEN_DIR = Path(__file__).resolve().parent
JDS_PATH = GOLDEN_DIR / "jds.json"
CVS_DIR = GOLDEN_DIR / "cvs"
MANIFEST_PATH = GOLDEN_DIR / "cvs_manifest.json"
MAX_ATTEMPTS = 4

SAMPLE_CV = (ROOT / "data_find" / "generated_cv" / "group-01-software-development" /
             "02-backend-developer" / "g1-be-01-do-hoang-nam.md").read_text(encoding="utf-8")
SAMPLE_BODY = SAMPLE_CV.split("---", 2)[2].strip()


def jd_text(jd: dict) -> str:
    return f"{jd['title']}\n{jd['description']}\n{jd['requirements_text']}\nSkills: {jd['technical_skills']}"


def slugify(name: str) -> str:
    ascii_name = re.sub(r"[^a-zA-Z0-9]+", "-", name).strip("-").lower()
    return ascii_name or "candidate"


def build_prompt(jd: dict, keep_skills: list[str], omit_skills: list[str], attempt: int, prior_issue: str = "") -> str:
    extra_flavor = jd["technical_skills"]
    retry_note = ""
    if attempt > 0:
        retry_note = (
            f"\n\nLẦN THỬ TRƯỚC KHÔNG ĐẠT: {prior_issue}. Sửa đúng vấn đề này, "
            "đừng thay đổi phần còn lại quá nhiều."
        )
    return f"""Bạn viết 1 CV ứng viên IT bằng tiếng Anh (candidate Vietnamese, CV viết tiếng Anh),
theo đúng phong cách/định dạng markdown ở PHẦN MẪU bên dưới (không copy nội dung mẫu,
chỉ bám cấu trúc: # Name, contact line, ## Profile, ## Work Experience với ### Title | Employer, Location | dates,
## Education, ## Technical Skills, có thể thêm ## Certifications / ## Additional).

Ứng viên đang ứng tuyển vị trí sau:
Title: {jd['title']}
Description: {jd['description'][:1200]}
Requirements: {jd['requirements_text'][:1200]}
Công nghệ liên quan đến vị trí (tham khảo để CV thực tế, không bắt buộc dùng hết): {extra_flavor}

YÊU CẦU BẮT BUỘC (quan trọng nhất, sẽ được kiểm tra tự động bằng cách quét từ khoá):
- CV PHẢI nhắc rõ ràng, tự nhiên (trong Work Experience hoặc Technical Skills) các công nghệ sau: {keep_skills or "(không có, có thể bỏ qua)"}.
- CV TUYỆT ĐỐI KHÔNG được nhắc tên các công nghệ sau ở BẤT KỲ ĐÂU trong CV (kể cả viết tắt/biến thể): {omit_skills or "(không có)"}.
  Nếu ứng viên cần một hệ quản trị CSDL/ngôn ngữ nào đó mà nằm trong danh sách cấm, hãy dùng công nghệ KHÁC tương đương
  (vd nếu cấm PostgreSQL thì dùng MySQL/SQL Server, nếu cấm Docker thì dùng triển khai thủ công trên VM, nếu cấm Python thì dùng ngôn ngữ khác).
- Ứng viên vẫn phải là 1 hồ sơ thực tế, mạch lạc, không phải danh sách từ khoá trần trụi.
- Không dùng tên người thật, thông tin liên hệ là hư cấu (giả).

MẪU PHONG CÁCH (chỉ tham khảo cấu trúc/văn phong, KHÔNG copy nội dung):
{SAMPLE_BODY[:2200]}
{retry_note}

Chỉ trả về nội dung CV (markdown), bắt đầu từ dòng "# Tên ứng viên", không kèm giải thích, không kèm ```.
"""


def verify(cv_body: str, keep_skills: list[str], omit_skills: list[str], index: dict) -> tuple[bool, str]:
    found = set(extract_skills(cv_body, index))
    missing = [s for s in keep_skills if s not in found]
    leaked = [s for s in omit_skills if s in found]
    if missing or leaked:
        issue = []
        if missing:
            issue.append(f"thiếu (chưa nhắc tới): {missing}")
        if leaked:
            issue.append(f"lỡ nhắc tới công nghệ bị cấm: {leaked}")
        return False, "; ".join(issue)
    return True, ""


def generate_one(jd: dict, variant: str, keep_skills: list[str], omit_skills: list[str], index: dict) -> dict:
    prior_issue = ""
    cv_body = ""
    ok = False
    for attempt in range(MAX_ATTEMPTS):
        prompt = build_prompt(jd, keep_skills, omit_skills, attempt, prior_issue)
        cache_key = f"cv|{jd['jd_id']}|{variant}|attempt{attempt}|{keep_skills}|{omit_skills}"
        cv_body = chat_complete(prompt, cache_key=cache_key)
        ok, prior_issue = verify(cv_body, keep_skills, omit_skills, index)
        if ok:
            break
    actual_skills = extract_skills(cv_body, index)
    actual_pct = round(coverage_score(actual_skills, jd["taxonomy_skills"], index) * 100, 1)

    name_match = re.search(r"^#\s+(.+)$", cv_body, re.MULTILINE)
    candidate_name = (name_match.group(1).strip() if name_match else f"Candidate {jd['jd_id']}{variant}")
    cv_id = f"{jd['jd_id']}-{variant.upper()}"
    slug = slugify(candidate_name)

    frontmatter = {
        "cv_id": cv_id,
        "target_jd_id": jd["jd_id"],
        "variant": variant,
        "candidate_name": candidate_name,
        "language": "en",
        "source": "synthetic_llm",
        "intended_keep_skills": keep_skills,
        "intended_omit_skills": omit_skills,
        "verified": ok,
        "actual_taxonomy_skills": actual_skills,
        "actual_coverage_pct": actual_pct,
    }
    fm_yaml = "\n".join(
        f"{k}: {json.dumps(v, ensure_ascii=False) if isinstance(v, (list, bool)) else v}"
        for k, v in frontmatter.items()
    )
    full_md = f"---\n{fm_yaml}\n---\n\n{cv_body.strip()}\n"

    filename = f"{cv_id.lower()}-{slug}.md"
    (CVS_DIR / filename).write_text(full_md, encoding="utf-8")

    return {**frontmatter, "md_path": f"cvs/{filename}"}


def main() -> int:
    CVS_DIR.mkdir(parents=True, exist_ok=True)
    jds = json.loads(JDS_PATH.read_text(encoding="utf-8"))
    index = load_taxonomy_index()

    manifest = []
    for jd in jds:
        skills = list(jd["taxonomy_skills"])
        # variant a: high match -- keep everything
        row_a = generate_one(jd, "a", keep_skills=skills, omit_skills=[], index=index)
        # variant b: partial/low match -- drop one skill (or all, if only one exists)
        omit = skills[:1] if len(skills) >= 2 else skills
        keep_b = [s for s in skills if s not in omit]
        row_b = generate_one(jd, "b", keep_skills=keep_b, omit_skills=omit, index=index)
        manifest.append({"jd_id": jd["jd_id"], "jd_title": jd["title"], "jd_taxonomy_skills": skills, "cvs": [row_a, row_b]})
        print(f"{jd['jd_id']}: a={row_a['actual_coverage_pct']}% verified={row_a['verified']} | "
              f"b={row_b['actual_coverage_pct']}% verified={row_b['verified']}")

    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{sum(len(m['cvs']) for m in manifest)} CV(s) -> {CVS_DIR}")
    print(f"manifest -> {MANIFEST_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
