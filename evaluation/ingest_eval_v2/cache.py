"""Content-hash JSON cache so re-running eval doesn't repeat paid LLM calls."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Callable

CACHE_ROOT = Path(__file__).resolve().parents[1] / ".cache" / "ingest_eval"


def content_hash(*parts: str) -> str:
    h = hashlib.sha256()
    for part in parts:
        h.update(part.encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()


def cached_call(bucket: str, key: str, fn: Callable[[], Any]) -> Any:
    path = CACHE_ROOT / bucket / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    result = fn()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result
