from __future__ import annotations

import logging
import uuid
from contextvars import ContextVar
from typing import Any

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s [%(name)s] request_id=%(request_id)s %(message)s",
    )
    logging.getLogger().addFilter(_RequestIdFilter())


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get() or "-"
        return True


def new_request_id() -> str:
    return uuid.uuid4().hex


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def safe_extra(**kwargs: Any) -> dict[str, Any]:
    """Drop known secret-ish keys from structured log extras."""
    blocked = {"password", "token", "jwt", "authorization", "api_key", "service_role_key", "secret"}
    return {k: v for k, v in kwargs.items() if k.lower() not in blocked and "key" not in k.lower()}
