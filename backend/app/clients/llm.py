"""OpenAI-compatible chat/embed client for Qwen Cloud (DashScope)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import httpx

from backend.app.config.env import settings
from backend.app.config.models import (
    DEFAULT_BASE_URL,
    DEFAULT_EMBED_DIM,
    DEFAULT_EMBED_MODEL,
    DEFAULT_LLM_MODEL,
    REQUEST_TIMEOUT,
)

PostFn = Callable[..., Any]


def _headers(api_key: str) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _base_url(base_url: str | None) -> str:
    url = (base_url if base_url is not None else settings.qwen_base_url) or DEFAULT_BASE_URL
    return url.rstrip("/")


def _api_key(api_key: str | None) -> str:
    if api_key is not None:
        return api_key
    return settings.qwen_api_key


def _post(post: PostFn | None):
    return post or httpx.post


def chat_complete(
    prompt: str,
    *,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    json_object: bool = False,
    post: PostFn | None = None,
) -> str:
    payload: dict[str, Any] = {
        "model": model or settings.llm_model or DEFAULT_LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        "stream": False,
        "enable_thinking": False,
    }
    if json_object:
        payload["response_format"] = {"type": "json_object"}
    response = _post(post)(
        f"{_base_url(base_url)}/chat/completions",
        json=payload,
        headers=_headers(_api_key(api_key)),
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    return str(content).strip()


def embed_query(
    text: str,
    *,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    dimensions: int | None = None,
    post: PostFn | None = None,
) -> list[float]:
    payload = {
        "model": model or settings.embedding_model or DEFAULT_EMBED_MODEL,
        "input": text or " ",
        "dimensions": dimensions if dimensions is not None else DEFAULT_EMBED_DIM,
        "encoding_format": "float",
    }
    response = _post(post)(
        f"{_base_url(base_url)}/embeddings",
        json=payload,
        headers=_headers(_api_key(api_key)),
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return [float(x) for x in response.json()["data"][0]["embedding"]]
