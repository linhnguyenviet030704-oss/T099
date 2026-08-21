"""Deterministic CV text -> structured markdown + metadata. No LLM."""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

from backend.app.services.matching.parse import (
    BULLET_RE,
    EMAIL_RE,
    PHONE_RE,
    URL_RE,
    _clean_text_artifacts,
    _detect_section,
    _looks_like_person_name,
    redact_pii,
)
from backend.app.services.matching.skills import categories_for, extract_skills

OUTPUT_SECTIONS = {
    "Summary": "Profile",
    "Experience": "Work Experience",
    "Education": "Education",
    "Skills": "Technical Skills",
    "Projects": "Projects",
    "Certifications": "Certifications",
    "Languages": "Additional",
    "Additional Information": "Additional",
}

DROP_SECTIONS = {"Contact", "Interests"}

ROLE_WORDS = (
    "intern",
    "associate",
    "fresher",
    "junior",
    "senior",
    "lead",
    "developer",
    "engineer",
    "programmer",
    "analyst",
    "tester",
    "designer",
    "architect",
    "manager",
    "specialist",
    "consultant",
    "administrator",
    "thực tập",
    "lập trình",
)

TITLE_HINTS: list[tuple[str, str, str]] = [
    (r"front[\s-]*end", "web", "frontend"),
    (r"back[\s-]*end", "web", "backend"),
    (r"full[\s-]*stack", "web", "backend"),
    (r"mobile|android|\bios\b|flutter|react native", "mobile", "mobile"),
    (r"devops|site reliability|\bsre\b", "cloud_devops", "devops"),
    (r"data engineer|data analyst|data science|machine learning|\bml\b|\bai\b", "data", "data_engineering"),
    (r"\bqa\b|tester|quality assurance", "qa_testing", "testing"),
    (r"security|cybersec", "cybersecurity", "cybersecurity"),
    (r"ui/?ux|product designer", "ui_ux", "ui_ux"),
    (r"\bgame\b|game developer", "game", "game"),
    (r"embedded|\biot\b|firmware", "embedded_iot", "embedded_iot"),
    (r"\bphp\b|laravel|django|spring|nestjs|asp\.net|\.net|golang", "web", "backend"),
]

CAT_TO_MAJOR = {
    "frontend": "web",
    "backend": "web",
    "api": "web",
    "cms_ecommerce": "web",
    "desktop": "web",
    "mobile": "mobile",
    "cloud": "cloud_devops",
    "aws": "cloud_devops",
    "azure": "cloud_devops",
    "gcp": "cloud_devops",
    "devops": "cloud_devops",
    "containers_orchestration": "cloud_devops",
    "observability": "cloud_devops",
    "data_engineering": "data",
    "data_analysis": "data",
    "ai_ml": "ai_ml",
    "generative_ai": "ai_ml",
    "mlops": "ai_ml",
    "testing": "qa_testing",
    "cybersecurity": "cybersecurity",
    "networking": "infrastructure_network",
    "system_infrastructure": "infrastructure_network",
    "enterprise": "enterprise_software",
    "crm_erp": "enterprise_software",
    "embedded_iot": "embedded_iot",
    "game": "game",
    "ui_ux": "ui_ux",
}

STRONG_SUB = {
    "frontend",
    "backend",
    "mobile",
    "devops",
    "data_engineering",
    "data_analysis",
    "ai_ml",
    "testing",
    "cybersecurity",
    "ui_ux",
    "game",
    "embedded_iot",
}

MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

PRESENT_RE = re.compile(
    r"^(?:present|now|current|nay|today|hiện tại|hien tai|hiện nay|hien nay)$",
    re.IGNORECASE,
)
MONTH_NAME = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
NUM_DATE = r"(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}[/-]\d{4}|\d{4})"
EN_DATE = rf"(?:{MONTH_NAME}\.?\s+\d{{1,2}},?\s+\d{{4}}|{MONTH_NAME}\.?\s+\d{{4}})"
DATE_TOKEN = rf"(?:{EN_DATE}|{NUM_DATE})"
PRESENT_TOKEN = r"(?:present|now|current|nay|today|hiện tại|hien tai|hiện nay|hien nay)"
RANGE_RE = re.compile(
    rf"({DATE_TOKEN})\s*(?:[-–—]|to)\s*(expected\s+)?({DATE_TOKEN}|{PRESENT_TOKEN})",
    re.IGNORECASE,
)
BARE_EN_RANGE_RE = re.compile(
    rf"({MONTH_NAME}\.?\s+\d{{4}})\s+({MONTH_NAME}\.?\s+\d{{4}})",
    re.IGNORECASE,
)
BARE_NUM_RANGE_RE = re.compile(
    r"(\d{1,2}[/-]\d{4})\s+(\d{1,2}[/-]\d{4})",
)
ICON_LINE_RE = re.compile(r"^[\W_✉📅📞🌐👤♂♀]+$", re.UNICODE)
WATERMARK_RE = re.compile(r"(?:©\s*)?topcv\.vn", re.IGNORECASE)
PICTURE_RE = re.compile(
    r"<!--\s*Start of picture text\s*-->.*?<!--\s*End of picture text\s*-->",
    re.DOTALL | re.IGNORECASE,
)
HEADING_STRIP_RE = re.compile(r"^#{1,6}\s*")
TAG_RE = re.compile(r"</?u>|</?b>|</?strong>|<br\s*/?>", re.IGNORECASE)
ID_FROM_NAME_RE = re.compile(r"(G(\d+)[-_][A-Za-z0-9]+[-_]\d+)", re.IGNORECASE)


def structure_resume(text: str, *, source_name: str = "") -> dict:
    raw = _prepare_text(text)
    if not raw.strip():
        return {"markdown": "", "metadata": {}}

    sections = _split_sections(raw)
    headline = _headline(sections)
    body = _render_body(sections, headline)
    body = redact_pii(body)
    leftover = redact_pii(raw)
    if len(body) < 400 and len(leftover) > 800:
        extra = leftover
        for chunk in body.splitlines():
            extra = extra.replace(chunk.strip(), "") if chunk.strip() else extra
        extra = re.sub(r"\n{3,}", "\n\n", extra).strip()
        if extra:
            body = f"{body}\n\n## Additional\n\n{extra}".strip() if body else extra
    meta = _metadata(raw, sections, headline, source_name)
    front = _frontmatter(meta)
    markdown = f"{front}\n\n{body}".strip() if body else front
    return {"markdown": markdown, "metadata": meta}


def _prepare_text(text: str) -> str:
    text = PICTURE_RE.sub("\n", text)
    text = TAG_RE.sub("\n", text)
    text = WATERMARK_RE.sub("", text)
    text = _clean_text_artifacts(text)
    kept: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or ICON_LINE_RE.match(stripped):
            if kept and kept[-1] != "":
                kept.append("")
            continue
        if re.fullmatch(r"#{1,6}", stripped):
            continue
        kept.append(HEADING_STRIP_RE.sub("", stripped).strip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip()


def _split_sections(text: str) -> list[tuple[str, list[str]]]:
    current = "preamble"
    buf: list[str] = []
    out: list[tuple[str, list[str]]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            buf.append("")
            continue
        section = _detect_section(line)
        if section:
            out.append((current, buf))
            current = section
            buf = []
            continue
        buf.append(line)
    out.append((current, buf))
    return out


def _headline(sections: list[tuple[str, list[str]]]) -> str:
    for name, lines in sections:
        if name != "preamble":
            continue
        for line in lines:
            folded = line.casefold()
            if any(word in folded for word in ROLE_WORDS) and 1 <= len(line.split()) <= 8:
                return re.sub(r"^#+\s*", "", line).strip(" -|")
    return ""


def _render_body(sections: list[tuple[str, list[str]]], headline: str) -> str:
    buckets: dict[str, list[str]] = {label: [] for label in (
        "Profile",
        "Work Experience",
        "Projects",
        "Education",
        "Technical Skills",
        "Certifications",
        "Additional",
    )}
    for name, lines in sections:
        if name in DROP_SECTIONS:
            continue
        compact = _compact(lines)
        if not compact:
            continue
        if name == "preamble":
            prose = _preamble_profile(compact, headline)
            if prose:
                buckets["Profile"].extend(prose)
            continue
        label = OUTPUT_SECTIONS.get(name)
        if not label:
            continue
        if name in {"Experience", "Projects", "Education"}:
            buckets[label].extend(_format_entries(compact, education=name == "Education"))
        elif name == "Summary":
            if buckets["Profile"]:
                continue
            profile = _profile_lines(compact, headline)
            if profile:
                buckets["Profile"].extend(profile)
        else:
            buckets[label].extend(_as_content(compact))

    if not buckets["Profile"]:
        synth = _synthetic_profile(headline)
        if not synth:
            for line in buckets["Work Experience"]:
                if line.startswith("### "):
                    synth = line[4:].split("|")[0].strip()
                    break
        if synth:
            buckets["Profile"].append(synth)

    parts: list[str] = []
    for label, content in buckets.items():
        content = [c for c in content if c is not None]
        if not content:
            continue
        parts.append(f"## {label}")
        parts.append("")
        parts.extend(content)
        parts.append("")
    return "\n".join(parts).strip()


def _compact(lines: list[str]) -> list[str]:
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if out and out[-1] != "":
                out.append("")
            continue
        if (
            out
            and out[-1]
            and not BULLET_RE.match(stripped)
            and not _detect_section(stripped)
            and not _range_in(stripped)
            and not _headerish(stripped)
            and (
                BULLET_RE.match(out[-1])
                or out[-1].endswith(("-", ",", ";", "and", "và", "the", "of", "to", "for", "with"))
                or (len(out[-1]) > 40 and stripped[:1].islower())
            )
        ):
            out[-1] = f"{out[-1]} {stripped}"
            continue
        out.append(stripped)
    while out and out[-1] == "":
        out.pop()
    return out


def _profile_lines(lines: list[str], headline: str) -> list[str]:
    skip = re.compile(
        r"^(?:ngắn hạn|dài hạn|short-term|long-term|sau \d|after \d)\b",
        re.IGNORECASE,
    )
    kept: list[str] = []
    for line in lines:
        if skip.match(BULLET_RE.sub("", line)):
            continue
        if BULLET_RE.match(line):
            text = BULLET_RE.sub("", line).strip()
            if text:
                kept.append(text)
        else:
            kept.append(line)
    text = " ".join(kept).strip()
    if not text:
        return [headline] if headline else []
    return [text]


def _preamble_profile(lines: list[str], headline: str) -> list[str]:
    kept: list[str] = []
    for line in lines:
        if _looks_like_person_name(line):
            continue
        if EMAIL_RE.search(line) or PHONE_RE.search(line) or URL_RE.search(line):
            continue
        if headline and line.strip() == headline:
            continue
        if len(line) < 40:
            continue
        kept.append(line)
    if kept:
        return [" ".join(kept)]
    return []


def _synthetic_profile(headline: str) -> str:
    return headline.strip()


def _as_content(lines: list[str]) -> list[str]:
    out: list[str] = []
    for line in lines:
        if not line:
            continue
        if BULLET_RE.match(line):
            content = BULLET_RE.sub("", line).strip()
            if content:
                out.append(f"- {content}")
            continue
        if re.match(r"^\d+[.)]\s+", line):
            out.append(f"- {re.sub(r'^\d+[.)]\s+', '', line)}")
            continue
        out.append(line)
    return out


def _format_entries(lines: list[str], *, education: bool = False) -> list[str]:
    starts = [i for i, line in enumerate(lines) if _range_in(line) and _entry_header_line(line)]
    if not starts:
        return _as_content(lines)

    used: set[int] = set()
    blocks: list[tuple[int, int]] = []
    # ponytail: lookback of 3 short lines; adjacent PDF date blocks can still swap titles.
    for idx, start in enumerate(starts):
        lookback = start
        while lookback > 0 and lookback - 1 not in used and lines[lookback - 1] and not _range_in(lines[lookback - 1]):
            prev = lines[lookback - 1]
            if BULLET_RE.match(prev) or re.match(r"^\d+[.)]\s+", prev):
                break
            if not _headerish(prev):
                break
            lookback -= 1
            if start - lookback >= 3:
                break
        end = starts[idx + 1] if idx + 1 < len(starts) else len(lines)
        # next date may belong to this block if it is a continuation; cap at next lookback-worthy header
        if idx + 1 < len(starts):
            nxt = starts[idx + 1]
            headerish = False
            for j in range(start + 1, nxt):
                if j in used:
                    continue
                if lines[j] and not BULLET_RE.match(lines[j]) and not _range_in(lines[j]) and not re.match(r"^\d+[.)]\s+", lines[j]):
                    if j >= nxt - 3:
                        headerish = True
                        break
            if not headerish:
                end = nxt
        blocks.append((lookback, end))
        used.update(range(lookback, end))

    rendered: list[str] = []
    for start, end in blocks:
        chunk = lines[start:end]
        header_lines = []
        bullets = []
        dates = ""
        for line in chunk:
            if not line:
                continue
            found = _range_in(line)
            if found and not dates:
                dates = found
                leftover = _strip_range(line)
                if leftover and not re.match(r"^gpa\b", leftover, flags=re.IGNORECASE):
                    header_lines.append(leftover)
                continue
            if BULLET_RE.match(line) or re.match(r"^\d+[.)]\s+", line):
                bullets.append(BULLET_RE.sub("", re.sub(r"^\d+[.)]\s+", "", line)).strip())
                continue
            if line.lower().startswith(("position:", "role:", "vai trò", "title:")):
                header_lines.append(re.sub(r"^(?:position|role|title|vai trò(?: cá nhân)?)\s*:\s*", "", line, flags=re.I))
                continue
            header_lines.append(line)
        title, org = _split_title_org(header_lines, education=education)
        bits = []
        for part in (title, org):
            if part and part not in bits:
                bits.append(part)
        if dates:
            bits.append(dates)
        heading = " | ".join(bits)
        if heading:
            rendered.append(f"### {heading}")
        for bullet in bullets:
            if bullet and not re.fullmatch(r"[\w\s/&+-]{1,40}:", bullet):
                rendered.append(f"- {bullet}")
        rendered.append("")
    # ponytail: uncovered lines are usually the same jobs in raw form; keep structured entries only
    while rendered and rendered[-1] == "":
        rendered.pop()
    return rendered


def _headerish(line: str) -> bool:
    text = BULLET_RE.sub("", line).strip()
    if not text or len(text) > 90:
        return False
    if text[:1].islower():
        return False
    if re.match(r"^gpa\b", text, flags=re.IGNORECASE):
        return False
    return True


def _entry_header_line(line: str) -> bool:
    leftover = _strip_range(line)
    if len(line) > 120 and leftover and len(leftover) > 80:
        return False
    return True


def _split_title_org(header_lines: list[str], *, education: bool) -> tuple[str, str]:
    cleaned = [re.sub(r"\s+", " ", line).strip(" -|") for line in header_lines if line.strip() and len(line) < 120]
    if not cleaned:
        return "", ""
    if any(" | " in line for line in cleaned):
        parts = [p.strip() for p in re.split(r"\s*\|\s*", " | ".join(cleaned)) if p.strip()]
        if len(parts) >= 2:
            return parts[0], parts[1]
    uni = re.compile(r"university|college|đại học|cao đẳng|học viện|polytechnic|aptech|fpt|hcmut|hust", re.I)
    loc = re.compile(r"vietnam|ha noi|hanoi|ho chi minh|hcm|đà nẵng|da nang", re.I)
    if education:
        org = next((line for line in cleaned if uni.search(line)), cleaned[0])
        title = next((line for line in cleaned if line != org and not loc.search(line)), "")
        return title, org
    title = ""
    org = ""
    for line in cleaned:
        folded = line.casefold()
        if any(word in folded for word in ROLE_WORDS) and not title:
            title = line
        elif not org:
            org = line
        elif not title:
            title = line
    if not title and cleaned:
        title = cleaned[0]
        org = cleaned[1] if len(cleaned) > 1 else org
    return title, org


def _range_in(line: str) -> str:
    match = RANGE_RE.search(line)
    if match:
        start, _, end = match.group(1), match.group(2), match.group(3)
        return f"{_pretty_date(start)} - {_pretty_date(end)}"
    match = BARE_EN_RANGE_RE.search(line)
    if match:
        return f"{_pretty_date(match.group(1))} - {_pretty_date(match.group(2))}"
    match = BARE_NUM_RANGE_RE.search(line)
    if match:
        return f"{_pretty_date(match.group(1))} - {_pretty_date(match.group(2))}"
    return ""


def _strip_range(line: str) -> str:
    line = RANGE_RE.sub("", line)
    line = BARE_EN_RANGE_RE.sub("", line)
    line = BARE_NUM_RANGE_RE.sub("", line)
    return re.sub(r"\s+", " ", line).strip(" -–—|()")


def _pretty_date(token: str) -> str:
    token = re.sub(r"\s+", " ", token).strip()
    if PRESENT_RE.match(token):
        return "Present"
    parsed = _parse_date(token)
    if parsed is None:
        return token
    return f"{parsed.strftime('%b')} {parsed.year}"


def _parse_date(token: str) -> date | None:
    token = re.sub(r"\s+", " ", token).strip().rstrip(".")
    if PRESENT_RE.match(token):
        return date.today()
    m = re.match(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$", token)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if year < 100:
            year += 2000
        if month > 12 and day <= 12:
            day, month = month, day
        try:
            return date(year, month, 1)
        except ValueError:
            return None
    m = re.match(r"(\d{1,2})[/-](\d{4})$", token)
    if m:
        try:
            return date(int(m.group(2)), int(m.group(1)), 1)
        except ValueError:
            return None
    m = re.match(rf"({MONTH_NAME})\.?\s+(\d{{1,2}}),?\s+(\d{{4}})$", token, re.I)
    if m:
        month = MONTHS.get(m.group(1).lower().rstrip("."))
        if month:
            return date(int(m.group(3)), month, 1)
    m = re.match(rf"({MONTH_NAME})\.?\s+(\d{{4}})$", token, re.I)
    if m:
        key = m.group(1).lower().rstrip(".")
        month = MONTHS.get(key) or MONTHS.get(key[:3])
        if month:
            return date(int(m.group(2)), month, 1)
    m = re.match(r"(\d{4})$", token)
    if m:
        return date(int(m.group(1)), 1, 1)
    return None


def _intervals(lines: list[str]) -> list[tuple[date, date]]:
    found: list[tuple[date, date]] = []
    for line in lines:
        for match in RANGE_RE.finditer(line):
            start = _parse_date(match.group(1))
            end = _parse_date(match.group(3))
            if start and end and end >= start:
                found.append((start, end))
        for match in BARE_EN_RANGE_RE.finditer(line):
            start, end = _parse_date(match.group(1)), _parse_date(match.group(2))
            if start and end and end >= start:
                found.append((start, end))
        for match in BARE_NUM_RANGE_RE.finditer(line):
            start, end = _parse_date(match.group(1)), _parse_date(match.group(2))
            if start and end and end >= start:
                found.append((start, end))
    return found


def _merged_months(intervals: list[tuple[date, date]]) -> int:
    if not intervals:
        return 0
    ordered = sorted(intervals)
    merged = [list(ordered[0])]
    for start, end in ordered[1:]:
        if start <= merged[-1][1]:
            if end > merged[-1][1]:
                merged[-1][1] = end
        else:
            merged.append([start, end])
    months = 0
    for start, end in merged:
        months += (end.year - start.year) * 12 + (end.month - start.month)
    return max(months, 0)


def _years_experience(sections: list[tuple[str, list[str]]]) -> int:
    job_lines: list[str] = []
    for name, lines in sections:
        if name == "Experience":
            job_lines.extend(line for line in lines if _entry_header_line(line))
    if not job_lines:
        return 0
    months = _merged_months(_intervals(job_lines))
    return int(round(months / 12)) if months else 0


def _seniority(headline: str, sections: list[tuple[str, list[str]]], years: int) -> str:
    titles = [headline]
    for name, lines in sections:
        if name in {"Experience", "Projects", "preamble"}:
            titles.extend(lines[:4])
    blob = " ".join(titles).casefold()
    if re.search(r"intern|thực tập|thuc tap|fresher|thực tập sinh", blob):
        return "intern"
    if re.search(r"\b(principal|staff engineer|tech lead|team lead|lead\b|senior)\b", blob):
        return "senior"
    if re.search(r"\b(junior|jr\.?)\b", blob):
        return "junior"
    if years >= 5:
        return "senior"
    if years >= 2:
        return "mid"
    if years >= 1:
        return "junior"
    return "intern"


def _classify(text: str, headline: str, skills: list[str]) -> tuple[str, str]:
    blob = f"{headline}\n{text[:4000]}"
    sub_votes: dict[str, int] = {}
    major_votes: dict[str, int] = {}
    for pattern, maj, sub_name in TITLE_HINTS:
        n_head = len(re.findall(pattern, headline, flags=re.IGNORECASE))
        n_all = len(re.findall(pattern, blob, flags=re.IGNORECASE))
        weight = n_head * 8 + n_all
        if weight:
            sub_votes[sub_name] = sub_votes.get(sub_name, 0) + weight * 4
            major_votes[maj] = major_votes.get(maj, 0) + weight * 4
    for skill_id in skills:
        for cat in categories_for(skill_id):
            weight = 3 if cat in STRONG_SUB else 1
            sub_votes[cat] = sub_votes.get(cat, 0) + weight
            mapped = CAT_TO_MAJOR.get(cat)
            if mapped:
                major_votes[mapped] = major_votes.get(mapped, 0) + weight
    major = max(major_votes, key=major_votes.get) if major_votes else ""
    strong = {k: v for k, v in sub_votes.items() if k in STRONG_SUB}
    if "game" in strong and strong.get("game", 0) < max((v for k, v in strong.items() if k != "game"), default=0) * 1.5:
        strong.pop("game", None)
    pool = strong or sub_votes
    sub = max(pool, key=pool.get) if pool else ""
    return major, sub


def _source_ids(source_name: str) -> tuple[str, int | None]:
    stem = Path(source_name).stem if source_name else ""
    if not stem:
        return "", None
    match = ID_FROM_NAME_RE.search(stem)
    if match:
        return match.group(1).replace("_", "-").upper(), int(match.group(2))
    return stem, None


def _metadata(
    text: str,
    sections: list[tuple[str, list[str]]],
    headline: str,
    source_name: str,
) -> dict:
    hay = URL_RE.sub(" ", text)
    hay = EMAIL_RE.sub(" ", hay)
    skills = extract_skills(hay)
    years = _years_experience(sections)
    seniority = _seniority(headline, sections, years)
    major, sub = _classify(text, headline, skills)
    cv_id, group_id = _source_ids(source_name)
    meta = {
        "cv_id": cv_id,
        "group_id": group_id,
        "major_field": major,
        "sub_field": sub,
        "seniority": seniority,
        "years_experience": years,
        "skills": skills,
    }
    return meta


def _yaml_scalar(value) -> str:
    text = str(value)
    if text == "" or " " in text or any(ch in text for ch in ":#{}[],&*?|>!%@`'\"") or text[:1] in "-":
        escaped = text.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return text


def _frontmatter(meta: dict) -> str:
    lines = ["---"]
    if meta.get("cv_id"):
        lines.append(f"cv_id: {_yaml_scalar(meta['cv_id'])}")
    if meta.get("group_id") is not None:
        lines.append(f"group_id: {meta['group_id']}")
    for key in ("major_field", "sub_field", "seniority"):
        if meta.get(key):
            lines.append(f"{key}: {meta[key]}")
    lines.append(f"years_experience: {meta.get('years_experience', 0)}")
    skills = meta.get("skills") or []
    if skills:
        lines.append("skills:")
        for skill in skills:
            lines.append(f"  - {skill}")
    lines.append("---")
    return "\n".join(lines)
