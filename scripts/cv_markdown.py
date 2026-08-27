"""Shared markdown-front-matter parsing and CV-PDF rendering.

Used by scripts/seed_generated_cvs.py (to compute an accurate resumes.size_bytes
at seed.sql-generation time) and scripts/seed_upload_generated_cvs.py (to
actually render the PDF bytes it uploads to Supabase Storage). Both need to
render byte-identical output from the same markdown source, which is why this
lives in one shared module instead of being duplicated.
"""

from __future__ import annotations

from pathlib import Path

import pymupdf
import yaml

_PAGE_RECT = pymupdf.Rect(48, 48, 547, 780)
_FONT_CANDIDATES = (
    Path(r"C:\Windows\Fonts\arial.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
)
CHARS_PER_PAGE = 3200


def parse_front_matter(text: str) -> tuple[dict, str]:
    """Split a `---\\n<yaml>\\n---\\n<body>` markdown file into (metadata, body).

    Returns ({}, text) unchanged if the text doesn't start with a `---` fence.
    Only the first fenced block is treated as front matter — a `---` later in
    the body (e.g. a markdown horizontal rule) is left alone.
    """
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, text
    end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
    if end is None:
        return {}, text
    front = "\n".join(lines[1:end])
    body = "\n".join(lines[end + 1 :]).strip("\n")
    metadata = yaml.safe_load(front) or {}
    return metadata, body


def _unicode_font() -> str | None:
    for path in _FONT_CANDIDATES:
        if path.exists():
            return str(path)
    return None


def render_markdown_to_pdf(body: str, fontsize: float = 9.5) -> bytes:
    """Render CV body text into a paginated PDF, packing paragraphs greedily
    so each page stays under CHARS_PER_PAGE — a plain-text render (no markdown
    formatting), same minimal approach scripts/seed_mock_cvs.py used, just
    extended to span multiple pages for longer real CVs.
    """
    paragraphs = [p for p in body.split("\n\n") if p.strip()] or [""]
    pages_text: list[str] = []
    buffer: list[str] = []
    buffer_len = 0
    for para in paragraphs:
        if buffer and buffer_len + len(para) > CHARS_PER_PAGE:
            pages_text.append("\n\n".join(buffer))
            buffer = []
            buffer_len = 0
        buffer.append(para)
        buffer_len += len(para) + 2
    if buffer:
        pages_text.append("\n\n".join(buffer))

    fontfile = _unicode_font()
    doc = pymupdf.open()
    for text in pages_text:
        page = doc.new_page()
        if fontfile:
            page.insert_font(fontname="uni", fontfile=fontfile)
            page.insert_textbox(_PAGE_RECT, text, fontsize=fontsize, fontname="uni")
        else:
            page.insert_textbox(_PAGE_RECT, text, fontsize=fontsize)
    data = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return data
