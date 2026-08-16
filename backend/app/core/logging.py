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


def new_request_id() -> str:
    return uuid.uuid4().hex


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def safe_extra(**kwargs: Any) -> dict[str, Any]:
    """Drop known secret-ish keys from structured log extras."""
    blocked = {"password", "token", "jwt", "authorization", "api_key", "service_role_key", "secret"}
    return {k: v for k, v in kwargs.items() if k.lower() not in blocked and "key" not in k.lower()}
