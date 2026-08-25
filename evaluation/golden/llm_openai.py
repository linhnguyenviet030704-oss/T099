"""OpenAI client for the golden-dataset eval pipeline.

Not used by the production backend (which always calls Qwen via
``backend/app/clients/llm.py``). Kept separate because Qwen's OpenAI-compatible
endpoint rejected DashScope-only request fields when pointed at OpenAI, and
because swapping the LLM backend for an offline eval script is a reasonable,
low-risk choice that shouldn't touch production code.
"""

from __future__ import annotations

import hashlib
import json
import random
import time
from pathlib import Path

import httpx

from backend.app.clients.llm import embed_query
from backend.app.config.env import settings

CHAT_MODEL = "gpt-4o-mini"
EMBED_MODEL = "text-embedding-3-small"
EMBED_DIM = 1536
REQUEST_TIMEOUT = 120.0
BASE_URL = "https://api.openai.com/v1"
MAX_RETRIES = 6

CACHE_DIR = Path(__file__).resolve().parent / ".cache"


def _post_with_retry(url: str, *, json_payload: dict, headers: dict) -> httpx.Response:
    """POST with exponential backoff + jitter on 429/5xx -- needed because
    judge_relevance.py and run_eval.py now fan requests out across a
    ThreadPoolExecutor, which trips OpenAI's per-minute rate limit even
    though each individual call is well-formed."""
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        response = httpx.post(url, json=json_payload, headers=headers, timeout=REQUEST_TIMEOUT)
        if response.status_code not in (429, 500, 502, 503, 504):
            return response
        retry_after = response.headers.get("retry-after")
        if retry_after is not None:
            try:
                delay = float(retry_after)
            except ValueError:
                delay = 2.0**attempt
        else:
            delay = 2.0**attempt
        delay += random.uniform(0, 1)
        last_exc = httpx.HTTPStatusError(
            f"{response.status_code} on attempt {attempt + 1}/{MAX_RETRIES}", request=response.request, response=response
        )
        if attempt == MAX_RETRIES - 1:
            break
        time.sleep(delay)
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("unreachable")  # pragma: no cover


def _cache_path(kind: str, key: str) -> Path:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    d = CACHE_DIR / kind
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{digest}.json"


def chat_complete(prompt: str, *, model: str = CHAT_MODEL, json_object: bool = False, cache_key: str | None = None) -> str:
    key = cache_key or f"{model}|{json_object}|{prompt}"
    cache_file = _cache_path("chat", key)
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))["content"]

    payload: dict = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
    }
    if json_object:
        payload["response_format"] = {"type": "json_object"}
    response = _post_with_retry(
        f"{BASE_URL}/chat/completions",
        json_payload=payload,
        headers={"Authorization": f"Bearer {settings.openai_api_key}", "Content-Type": "application/json"},
    )
    response.raise_for_status()
    content = str(response.json()["choices"][0]["message"]["content"]).strip()
    cache_file.write_text(json.dumps({"content": content}, ensure_ascii=False), encoding="utf-8")
    return content


def embed_text(text: str, *, model: str = EMBED_MODEL) -> list[float]:
    key = f"{model}|{text}"
    cache_file = _cache_path("embed", key)
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))["vector"]

    vector = embed_query(text or " ", base_url=BASE_URL, api_key=settings.openai_api_key, model=model, dimensions=EMBED_DIM)
    cache_file.write_text(json.dumps({"vector": vector}), encoding="utf-8")
    return vector
