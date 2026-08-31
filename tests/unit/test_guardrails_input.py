from __future__ import annotations

import io
import zipfile

import pytest

from backend.app.core.exceptions import BadRequestError
from backend.app.guardrails.input import (
    DOCX_MIME,
    PDF_MIME,
    validate_file,
    validate_text,
)


def _minimal_docx() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types />")
        archive.writestr("word/document.xml", "<document />")
    return buffer.getvalue()


def test_validate_text_normalizes_unicode_newlines_and_invisible_controls():
    result = validate_text("  Xin cha\u0300o\r\nPy\u200bthon  ", source="chat", max_chars=100)
    assert result.text == "Xin chào\nPython"


@pytest.mark.parametrize("text", ["", " \n\t ", "\u200b\ufeff"])
def test_validate_text_rejects_empty_content(text: str):
    with pytest.raises(BadRequestError) as exc:
        validate_text(text, source="chat", max_chars=10)
    assert exc.value.code == "INPUT_EMPTY"


def test_validate_text_enforces_boundary():
    assert validate_text("12345", source="chat", max_chars=5).text == "12345"
    with pytest.raises(BadRequestError) as exc:
        validate_text("123456", source="chat", max_chars=5)
    assert exc.value.code == "INPUT_TOO_LARGE"


def test_validate_pdf_magic_and_declared_mime():
    result = validate_file(b"%PDF-1.7\ncontent", declared_mime=PDF_MIME)
    assert result.detected_mime == PDF_MIME


def test_validate_docx_uses_archive_members_not_zip_magic_only():
    result = validate_file(_minimal_docx(), declared_mime=DOCX_MIME)
    assert result.detected_mime == DOCX_MIME

    with pytest.raises(BadRequestError) as exc:
        validate_file(b"PK\x03\x04not-a-docx", declared_mime=DOCX_MIME)
    assert exc.value.code == "FILE_SIGNATURE_MISMATCH"


def test_validate_file_rejects_mime_signature_mismatch():
    with pytest.raises(BadRequestError) as exc:
        validate_file(b"%PDF-1.7\ncontent", declared_mime=DOCX_MIME)
    assert exc.value.code == "FILE_SIGNATURE_MISMATCH"


def test_validate_file_rejects_size_above_limit():
    with pytest.raises(BadRequestError) as exc:
        validate_file(b"1234", declared_mime="text/plain", max_bytes=3)
    assert exc.value.code == "INPUT_TOO_LARGE"
