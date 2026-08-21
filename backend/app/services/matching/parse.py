from __future__ import annotations

import re

import pymupdf
import pymupdf4llm

SECTION_NAMES = {
    # Skills
    "skill": "Skills",
    "skills": "Skills",
    "technical skill": "Skills",
    "technical skills": "Skills",
    "professional skills": "Skills",
    "specialized skills": "Skills",
    "kỹ năng": "Skills",
    "kĩ năng": "Skills",
    "kỹ năng chuyên môn": "Skills",
    "skills and knowledge": "Skills",
    "skill and knowledge": "Skills",

    # Experience
    "experience": "Experience",
    "work experience": "Experience",
    "professional experience": "Experience",
    "employment history": "Experience",
    "kinh nghiệm": "Experience",
    "kinh nghiệm làm việc": "Experience",
    "kinh nghiệp làm việc": "Experience",
    "kinh nghiệm dự án": "Projects",
    "kinh nghiệm khác": "Experience",

    # Education
    "education": "Education",
    "academic background": "Education",
    "học vấn": "Education",

    # Projects
    "project": "Projects",
    "projects": "Projects",
    "personal project": "Projects",
    "personal projects": "Projects",
    "dự án": "Projects",
    "dự án cá nhân": "Projects",
    "dự án nhóm": "Projects",

    # Certifications
    "certification": "Certifications",
    "certifications": "Certifications",
    "certifications & awards": "Certifications",
    "awards": "Certifications",
    "chứng chỉ": "Certifications",
    "chứng chỉ & giải thưởng": "Certifications",
    "giải thưởng": "Certifications",

    # Languages
    "language": "Languages",
    "languages": "Languages",
    "ngoại ngữ": "Languages",

    # Summary
    "summary": "Summary",
    "professional summary": "Summary",
    "profile": "Summary",
    "objective": "Summary",
    "career objective": "Summary",
    "mục tiêu nghề nghiệp": "Summary",
    "profile summary": "Summary",
    "target": "Summary",
    "giới thiệu": "Summary",
    "tự giới thiệu": "Summary",
    "about me": "Summary",

    # Contact
    "contact": "Contact",
    "personal information": "Contact",
    "thông tin cá nhân": "Contact",
    "personal details": "Contact",
    "thông tin liên hệ": "Contact",

    # Other
    "additional information": "Additional Information",
    "thông tin thêm": "Additional Information",
    "interests": "Interests",
    "hobbies": "Interests",
    "sở thích": "Interests",
    "activities": "Additional Information",
    "activity": "Additional Information",
    "hoạt động": "Additional Information",
    "highlights": "Additional Information",
    "additional": "Additional Information",
    "other": "Additional Information",
}


BULLET_RE = re.compile(
    r"^\s*(?:[-*+•●▪◦‣–—]|(?:\d+)[.)])\s*"
)

MARKDOWN_HEADING_RE = re.compile(
    r"^(#{1,6})\s+(.+?)\s*$"
)

URL_RE = re.compile(
    r"https?://\S+|www\.\S+|github\.com/\S+|linkedin\.com/\S+|facebook\.com/\S+",
    re.IGNORECASE,
)

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)

PHONE_RE = re.compile(
    r"(?<!\d)(?:\+?84[\s.-]?|0)(?:3|5|7|8|9)\d(?:[\s.-]?\d){7,8}(?!\d)"
)

DOB_RE = re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b")

MARKDOWN_LINK_RE = re.compile(r"\[[^\]]+\]\([^)]+\)")

LABELED_PII_RE = re.compile(
    r"^\s*(?:[-*+•] )?(?:"
    r"email|e-mail|phone|tel|mobile|điện thoại|dien thoai|"
    r"địa chỉ|dia chi|address|linkedin|github|facebook|twitter|"
    r"ngày sinh|ngay sinh|date of birth|dob|giới tính|gioi tinh|gender|"
    r"cccd|cmnd|passport|họ và tên|ho va ten|full name|name"
    r")\s*[:：].*$",
    re.IGNORECASE,
)

_CONTACT_SECTIONS = {"contact", "personal information"}
_NAME_PARTICLES = {"van", "von", "de", "del", "da", "thi", "la", "le", "binh"}
_JOB_WORDS = {
    "engineer",
    "developer",
    "intern",
    "student",
    "manager",
    "bachelor",
    "master",
    "cv",
    "resume",
}


def _normalize_section_key(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^#{1,6}\s*", "", text)
    text = BULLET_RE.sub("", text)
    text = re.sub(r"^[\W_\d]+", "", text, flags=re.UNICODE)
    text = text.replace("/", " ").replace("|", " ")
    text = text.rstrip(":").strip()
    text = re.sub(r"\s+", " ", text)
    return text.casefold()


def _detect_section(text: str) -> str | None:
    if len(text.strip()) > 80:
        return None
    return SECTION_NAMES.get(_normalize_section_key(text))


def _clean_text_artifacts(text: str) -> str:
    """
    Remove common PDF/OCR garbage without aggressively modifying
    legitimate resume content.
    """
    text = text.replace("\x00", "")
    text = text.replace("\ufeff", "")
    text = text.replace("\u00ad", "")

    # Normalize line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Remove trailing spaces
    text = "\n".join(line.rstrip() for line in text.splitlines())

    # Avoid huge empty gaps
    text = re.sub(r"\n{4,}", "\n\n\n", text)

    return text.strip()


def _looks_corrupted(text: str) -> bool:
    """
    Conservative quality gate.

    Only trigger full OCR when there are clear signs that the native
    PDF text layer is unreliable.
    """
    if not text.strip():
        return True

    replacement_chars = text.count("\ufffd")
    null_chars = text.count("\x00")

    if replacement_chars >= 3 or null_chars >= 1:
        return True

    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    if not lines:
        return True

    # Example:
    # https://facebook.com/abc
    # m
    #
    # or highly fragmented extraction.
    tiny_lines = sum(
        1
        for line in lines
        if len(line) <= 2
        and not re.fullmatch(r"\d+", line)
    )

    if len(lines) >= 10 and tiny_lines / len(lines) > 0.10:
        return True

    # Many unicode replacement-like/control characters
    suspicious = sum(
        1
        for ch in text
        if ord(ch) < 32 and ch not in "\n\t"
    )

    if suspicious > 2:
        return True

    return False


def _pdf_to_markdown(
    data: bytes,
    *,
    force_ocr: bool = False,
) -> str:
    """
    Convert PDF bytes directly to layout-aware Markdown.
    """
    with pymupdf.open(
        stream=data,
        filetype="pdf",
    ) as doc:
        markdown = pymupdf4llm.to_markdown(
            doc,
            header=False,
            footer=False,
            use_ocr=True,
            force_ocr=force_ocr,
            ocr_language="vie+eng",
            show_progress=False,
        )

    return _clean_text_artifacts(markdown)


def _normalize_markdown_sections(markdown: str) -> str:
    """
    Standardize known resume sections as ## headings.

    Existing useful Markdown from PyMuPDF4LLM is retained.
    We deliberately avoid converting every short line into ### because
    that heuristic creates many false headings.
    """
    lines = markdown.splitlines()
    output: list[str] = []

    previous_blank = True

    for raw_line in lines:
        line = raw_line.strip()

        if not line:
            if output and output[-1] != "":
                output.append("")
            previous_blank = True
            continue

        section = _detect_section(line)

        if section:
            if output and output[-1] != "":
                output.append("")

            output.append(f"## {section}")
            output.append("")
            previous_blank = True
            continue

        heading_match = MARKDOWN_HEADING_RE.match(line)

        if heading_match:
            hashes, title = heading_match.groups()

            # Do not allow arbitrary extracted headings to become the
            # root CV title.
            level = max(3, len(hashes))

            output.append(
                f"{'#' * level} {title.strip()}"
            )
            previous_blank = False
            continue

        # Clean weird bullet symbols while preserving Markdown bullets.
        if BULLET_RE.match(line):
            content = BULLET_RE.sub("", line).strip()

            if content:
                output.append(f"- {content}")

            previous_blank = False
            continue

        output.append(line)
        previous_blank = False

    result = "\n".join(output)

    result = re.sub(
        r"\n{3,}",
        "\n\n",
        result,
    )

    return result.strip()


def _ensure_cv_title(markdown: str) -> str:
    if not markdown:
        return ""

    # Prevent duplicate root title
    if re.match(
        r"^\s*#\s+CV\b",
        markdown,
        flags=re.IGNORECASE,
    ):
        return markdown.strip()

    return f"# CV\n\n{markdown.strip()}"


def _blocks_reading_order(page) -> str:
    blocks = [b for b in page.get_text("blocks") if b[6] == 0 and str(b[4]).strip()]
    if not blocks:
        return page.get_text()
    width = float(page.rect.width) or 1.0
    mid = width * 0.42
    left = [b for b in blocks if (b[0] + b[2]) / 2 < mid]
    right = [b for b in blocks if (b[0] + b[2]) / 2 >= mid]
    left_width = max((b[2] - b[0] for b in left), default=width)
    sidebar = (
        len(left) >= 3
        and len(right) >= 3
        and left_width < width * 0.48
    )
    if sidebar:
        ordered = sorted(left, key=lambda b: (b[1], b[0])) + sorted(right, key=lambda b: (b[1], b[0]))
    else:
        ordered = sorted(blocks, key=lambda b: (round(b[1] / 6), b[0]))
    return "\n".join(str(b[4]).strip() for b in ordered)


def _score_extract(text: str) -> float:
    if not text or not text.strip():
        return -1.0
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    n = max(len(lines), 1)
    sections = sum(1 for line in lines if _detect_section(re.sub(r"^#{1,6}\s*", "", line)))
    empty_headings = sum(1 for line in lines if re.fullmatch(r"#{1,6}", line))
    picture = text.lower().count("start of picture")
    replacement = text.count("\ufffd") + text.count("�")
    tiny = sum(1 for line in lines if len(line) <= 2 and not re.fullmatch(r"\d+", line))
    letters = sum(ch.isalpha() for ch in text)
    score = sections * 6.0 + min(len(text), 12_000) / 500.0
    score -= empty_headings * 2.5
    score -= picture * 4.0
    score -= replacement * 2.0
    score -= (tiny / n) * 12.0
    if letters < 80:
        score -= 25.0
    return score


def _parse_pdf(data: bytes) -> str:
    """Native text, column blocks, then markdown. Pick the least-garbled extract."""
    candidates: list[str] = []
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        native = "\n".join(page.get_text() for page in doc)
        candidates.append(_clean_text_artifacts(native))
        candidates.append(_clean_text_artifacts("\n\n".join(_blocks_reading_order(page) for page in doc)))
        try:
            markdown = pymupdf4llm.to_markdown(
                doc,
                header=False,
                footer=False,
                use_ocr=True,
                force_ocr=False,
                ocr_language="vie+eng",
                show_progress=False,
            )
            candidates.append(_clean_text_artifacts(markdown))
        except Exception:
            pass

    best = max(candidates, key=_score_extract) if candidates else ""
    if _looks_corrupted(best):
        try:
            ocr_markdown = _pdf_to_markdown(data, force_ocr=True)
            if ocr_markdown.strip() and _score_extract(ocr_markdown) > _score_extract(best):
                best = ocr_markdown
        except Exception:
            pass
    return best


def _name_token(word: str) -> bool:
    token = word.strip(".,;:")
    if not token.isalpha():
        return False
    folded = token.casefold()
    if folded in _NAME_PARTICLES or (len(token) == 1):
        return True
    if token.isupper() and len(token) <= 15:
        return True
    return token[0].isupper() and token[1:].islower()


def _looks_like_person_name(line: str) -> bool:
    text = MARKDOWN_HEADING_RE.sub(r"\2", line).strip()
    if not text or text.casefold() in {"cv", "resume", "curriculum vitae"}:
        return False
    words = text.split()
    if not (2 <= len(words) <= 5):
        return False
    if any(word.casefold() in _JOB_WORDS for word in words):
        return False
    return all(_name_token(word) for word in words)


def redact_pii(markdown: str) -> str:
    """Strip identifiers so LLM/embed never see the person. Ceiling: regex + header heuristics."""
    lines_out: list[str] = []
    skip_contact = False
    seen_section = False
    for raw in markdown.splitlines():
        heading = re.match(r"^##\s+(.+?)\s*$", raw)
        if heading:
            seen_section = True
            skip_contact = heading.group(1).strip().casefold() in _CONTACT_SECTIONS
            if skip_contact:
                continue
        elif skip_contact:
            continue
        if LABELED_PII_RE.match(raw):
            continue
        if not seen_section and _looks_like_person_name(raw):
            continue
        if raw.startswith("# ") and _looks_like_person_name(raw):
            continue
        lines_out.append(raw)

    text = "\n".join(lines_out)
    text = MARKDOWN_LINK_RE.sub("", text)
    text = EMAIL_RE.sub("", text)
    text = URL_RE.sub("", text)
    text = PHONE_RE.sub("", text)
    text = DOB_RE.sub("", text)
    cleaned: list[str] = []
    for line in text.splitlines():
        stripped = BULLET_RE.sub("", line).strip()
        if not stripped:
            if cleaned and cleaned[-1] != "":
                cleaned.append("")
            continue
        cleaned.append(line.rstrip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(cleaned)).strip()


def clean_markdown(markdown: str) -> str:
    return _ensure_cv_title(_normalize_markdown_sections(_clean_text_artifacts(markdown)))


def parse_resume_bytes(
    data: bytes,
    mime_type: str = "",
    source_name: str = "",
) -> dict:
    """PDF or text bytes -> structured PII-stripped Markdown + metadata. No LLM."""
    from backend.app.services.matching.structure import structure_resume

    if not data:
        return {"markdown": "", "metadata": {}}

    is_pdf = (
        mime_type.casefold() == "application/pdf"
        or data.lstrip()[:4] == b"%PDF"
    )

    if is_pdf:
        text = _parse_pdf(data)
    else:
        text = data.decode("utf-8", errors="replace")

    return structure_resume(text, source_name=source_name)
