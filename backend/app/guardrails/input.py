"""Deterministic validation for user text and uploaded documents."""

from __future__ import annotations

import io
import unicodedata
import zipfile
from dataclasses import dataclass
from typing import Literal

from backend.app.core.exceptions import BadRequestError

TextSource = Literal["chat", "cv_text", "jd_text"]

MAX_CV_BYTES = 10 * 1024 * 1024
PDF_MIME = "application/pdf"
DOC_MIME = "application/msword"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TEXT_MIME = "text/plain"
ALLOWED_CV_MIMES = frozenset({PDF_MIME, DOC_MIME, DOCX_MIME, TEXT_MIME})

_MIME_ALIASES = {
    "application/doc": DOC_MIME,
    "application/docx": DOCX_MIME,
    "application/vnd.ms-word": DOC_MIME,
    "application/x-msword": DOC_MIME,
    "application/winword": DOC_MIME,
    "application/x-docx": DOCX_MIME,
    "application/x-zip-compressed": DOCX_MIME,
    "application/x-pdf": PDF_MIME,
    "application/acrobat": PDF_MIME,
    "applications/vnd.pdf": PDF_MIME,
    "text/pdf": PDF_MIME,
    "text/markdown": TEXT_MIME,
    "text/x-markdown": TEXT_MIME,
}
_GENERIC_MIMES = frozenset(
    {
        "",
        "application/octet-stream",
        "binary/octet-stream",
        "application/x-download",
        "application/download",
        "application/unknown",
        "unknown/unknown",
    }
)
_WORD_MIMES = frozenset({DOC_MIME, DOCX_MIME})
_OLE_MAGIC = bytes.fromhex("D0CF11E0A1B11AE1")
_REMOVED_CONTROLS = frozenset(
    {
        "\u200b",  # zero-width space
        "\u200c",  # zero-width non-joiner
        "\u200d",  # zero-width joiner
        "\u2060",  # word joiner
        "\ufeff",  # BOM / zero-width no-break space
        "\u202a",
        "\u202b",
        "\u202c",
        "\u202d",
        "\u202e",
        "\u2066",
        "\u2067",
        "\u2068",
        "\u2069",
    }
)


@dataclass(frozen=True)
class ValidatedText:
    text: str
    source: TextSource


@dataclass(frozen=True)
class ValidatedFile:
    data: bytes
    detected_mime: str


def normalize_text(text: str) -> str:
    """Normalize text before length and injection checks.

    Invisible direction/zero-width controls are removed so they cannot split
    security-sensitive tokens while remaining invisible to a reviewer.
    """

    normalized = unicodedata.normalize("NFC", str(text)).replace("\r\n", "\n").replace("\r", "\n")
    chars: list[str] = []
    for char in normalized:
        if char in _REMOVED_CONTROLS:
            continue
        category = unicodedata.category(char)
        if category == "Cc" and char not in {"\n", "\t"}:
            continue
        chars.append(char)
    return "".join(chars).strip()


def validate_text(
    text: str,
    *,
    source: TextSource,
    max_chars: int,
) -> ValidatedText:
    if max_chars <= 0:
        raise ValueError("max_chars must be positive")
    normalized = normalize_text(text)
    if not normalized:
        raise BadRequestError("Nội dung không được để trống", code="INPUT_EMPTY")
    if len(normalized) > max_chars:
        raise BadRequestError(
            f"Nội dung vượt quá giới hạn {max_chars} ký tự",
            code="INPUT_TOO_LARGE",
        )
    return ValidatedText(text=normalized, source=source)


def _normalize_mime(mime: str) -> str:
    value = (mime or "").split(";", 1)[0].strip().casefold()
    return _MIME_ALIASES.get(value, value)


def _is_docx(data: bytes) -> bool:
    if not data.startswith(b"PK"):
        return False
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = set(archive.namelist())
        return "[Content_Types].xml" in names and "word/document.xml" in names
    except (OSError, zipfile.BadZipFile):
        return False


def detect_mime(data: bytes) -> str | None:
    stripped = data.lstrip()
    if stripped.startswith(b"%PDF-"):
        return PDF_MIME
    if data.startswith(_OLE_MAGIC):
        return DOC_MIME
    if _is_docx(data):
        return DOCX_MIME
    if b"\x00" not in data:
        try:
            data.decode("utf-8")
            return TEXT_MIME
        except UnicodeDecodeError:
            return None
    return None


def validate_file(
    data: bytes,
    *,
    declared_mime: str,
    max_bytes: int = MAX_CV_BYTES,
    allowed_mimes: frozenset[str] = ALLOWED_CV_MIMES,
) -> ValidatedFile:
    if not data:
        raise BadRequestError("Tệp tải lên rỗng", code="INPUT_EMPTY")
    if max_bytes <= 0:
        raise ValueError("max_bytes must be positive")
    if len(data) > max_bytes:
        raise BadRequestError("Tệp vượt quá giới hạn dung lượng", code="INPUT_TOO_LARGE")

    declared = _normalize_mime(declared_mime)
    # Nếu MIME khai báo là generic/nhị phân tổng quát từ trình duyệt, bỏ qua khai báo và dựa vào magic bytes
    if declared in _GENERIC_MIMES:
        declared = ""

    if declared and declared not in allowed_mimes:
        raise BadRequestError("Định dạng tệp không được hỗ trợ", code="UNSUPPORTED_FILE_TYPE")

    detected = detect_mime(data)
    if detected is None or detected not in allowed_mimes:
        raise BadRequestError("Không nhận diện được định dạng tệp", code="UNSUPPORTED_FILE_TYPE")

    # Cho phép chuyển đổi tương thích giữa các định dạng trong họ Microsoft Word (doc / docx)
    is_word_family = declared in _WORD_MIMES and detected in _WORD_MIMES
    if declared and declared != detected and not is_word_family:
        raise BadRequestError(
            "Định dạng thực của tệp không khớp MIME khai báo",
            code="FILE_SIGNATURE_MISMATCH",
        )
    return ValidatedFile(data=data, detected_mime=detected)

