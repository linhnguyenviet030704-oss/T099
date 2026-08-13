from __future__ import annotations

from io import BytesIO

from backend.app.services.matching.skills import extract_skills

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None  # type: ignore[misc, assignment]


def _pdf_to_text(data: bytes) -> str:
    if PdfReader is None:
        return data.decode("utf-8", errors="replace")
    reader = PdfReader(BytesIO(data))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def parse_resume_bytes(data: bytes, mime_type: str = "") -> dict:
    """PDF or text bytes → markdown + skill metadata."""
    is_pdf = mime_type == "application/pdf" or data[:4] == b"%PDF"
    if is_pdf:
        text = _pdf_to_text(data).strip()
    else:
        text = data.decode("utf-8", errors="replace").strip()
    markdown = f"# CV\n\n{text}" if text else ""
    return {"markdown": markdown, "metadata": {"skills": extract_skills(markdown)}}
