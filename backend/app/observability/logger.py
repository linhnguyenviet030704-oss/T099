from __future__ import annotations

import logging
import uuid
from contextvars import ContextVar
from typing import Any

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


class _RequestIdFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        if not hasattr(record, "request_id"):
            record.request_id = request_id_ctx.get() or "-"
        return super().format(record)


_SENSITIVE_MARKERS = ("password", "token", "jwt", "authorization", "api_key", "service_role_key", "secret")


def _is_sensitive_key(name: str) -> bool:
    lowered = name.lower()
    return "key" in lowered or any(marker in lowered for marker in _SENSITIVE_MARKERS)


class _SensitiveDataFilter(logging.Filter):
    """Redacts LogRecord attributes set via `extra={...}` that look like a
    secret, so protection does not depend on every call site remembering to
    use `safe_extra()`. Does not scan free-text message strings."""

    def filter(self, record: logging.LogRecord) -> bool:
        for name in list(record.__dict__.keys()):
            if _is_sensitive_key(name):
                setattr(record, name, "***REDACTED***")
        return True


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(
        _RequestIdFormatter(
            "%(asctime)s %(levelname)s [%(name)s] request_id=%(request_id)s %(message)s"
        )
    )
    root.addHandler(handler)
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    if not any(isinstance(f, _SensitiveDataFilter) for f in root.filters):
        root.addFilter(_SensitiveDataFilter())


def new_request_id() -> str:
    return uuid.uuid4().hex


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def safe_extra(**kwargs: Any) -> dict[str, Any]:
    """Drop known secret-ish keys from structured log extras."""
    return {k: v for k, v in kwargs.items() if not _is_sensitive_key(k)}


def get_current_trace_id() -> str | None:
    """Return active LangSmith run tree id if within a traceable context, else None."""
    try:
        from langsmith.run_helpers import get_current_run_tree

        run_tree = get_current_run_tree()
        if run_tree:
            return str(run_tree.id)
    except Exception:
        pass
    return None
