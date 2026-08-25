from __future__ import annotations

from typing import Any

from backend.app.config.models import (
    DEFAULT_OLLAMA_BASE_URL,
    DEFAULT_OLLAMA_EMBEDDING_MODEL,
    DEFAULT_OLLAMA_MODEL,
    REQUEST_TIMEOUT,
)
from backend.app.shared_brain.providers.base import BaseLLMProvider, PostFn, _call_with_retries
from backend.app.shared_brain.types import BrainConfig, BrainProvider


class OllamaProvider(BaseLLMProvider):
    def __init__(self, config: BrainConfig | None = None) -> None:
        cfg = config or BrainConfig(
            provider=BrainProvider.OLLAMA,
            base_url=DEFAULT_OLLAMA_BASE_URL,
            llm_model=DEFAULT_OLLAMA_MODEL,
            embedding_model=DEFAULT_OLLAMA_EMBEDDING_MODEL,
            api_key="ollama",
        )
        super().__init__(cfg)

    def _resolve_base_url(self, base_url: str | None) -> str:
        url = (base_url or self.config.base_url or DEFAULT_OLLAMA_BASE_URL).rstrip("/")
        return url

    def chat_complete(
        self,
        prompt: str,
        *,
        model: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
        json_object: bool = False,
        temperature: float | None = None,
        post: PostFn | None = None,
        **kwargs: Any,
    ) -> str:
        payload: dict[str, Any] = {
            "model": model or self.config.llm_model or DEFAULT_OLLAMA_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature if temperature is not None else self.config.temperature,
            "stream": False,
        }
        if json_object:
            payload["response_format"] = {"type": "json_object"}
        payload.update(kwargs)

        url = f"{self._resolve_base_url(base_url)}/chat/completions"
        headers = self._headers(api_key)
        response = _call_with_retries(
            self._post_fn(post),
            url,
            json=payload,
            headers=headers,
            timeout=self.config.timeout or REQUEST_TIMEOUT,
        )
        content = response.json()["choices"][0]["message"]["content"]
        return str(content).strip()

    def embed_query(
        self,
        text: str,
        *,
        model: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
        dimensions: int | None = None,
        post: PostFn | None = None,
        **kwargs: Any,
    ) -> list[float]:
        payload: dict[str, Any] = {
            "model": model or self.config.embedding_model or DEFAULT_OLLAMA_EMBEDDING_MODEL,
            "input": text or " ",
            "encoding_format": "float",
        }
        if dimensions is not None:
            payload["dimensions"] = dimensions
        payload.update(kwargs)

        url = f"{self._resolve_base_url(base_url)}/embeddings"
        headers = self._headers(api_key)
        response = _call_with_retries(
            self._post_fn(post),
            url,
            json=payload,
            headers=headers,
            timeout=self.config.timeout or REQUEST_TIMEOUT,
        )
        return [float(x) for x in response.json()["data"][0]["embedding"]]

    def rerank_query(
        self,
        query: str,
        documents: list[str],
        *,
        model: str | None = None,
        base_url: str | None = None,
        api_key: str | None = None,
        instruct: str | None = None,
        post: PostFn | None = None,
        **kwargs: Any,
    ) -> list[dict[str, Any]]:
        return self._fallback_llm_rerank(query, documents, post=post)
