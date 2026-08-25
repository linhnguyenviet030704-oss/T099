from __future__ import annotations

from typing import Any

from backend.app.config.models import (
    DEFAULT_BASE_URL,
    DEFAULT_EMBED_DIM,
    DEFAULT_EMBED_MODEL,
    DEFAULT_LLM_MODEL,
    DEFAULT_RERANK_BASE_URL,
    DEFAULT_RERANK_INSTRUCT,
    DEFAULT_RERANK_MODEL,
    REQUEST_TIMEOUT,
)
from backend.app.shared_brain.providers.base import BaseLLMProvider, PostFn, _call_with_retries
from backend.app.shared_brain.types import BrainConfig, BrainProvider


class QwenProvider(BaseLLMProvider):
    def __init__(self, config: BrainConfig | None = None) -> None:
        cfg = config or BrainConfig(
            provider=BrainProvider.QWEN,
            base_url=DEFAULT_BASE_URL,
            llm_model=DEFAULT_LLM_MODEL,
            embedding_model=DEFAULT_EMBED_MODEL,
            rerank_base_url=DEFAULT_RERANK_BASE_URL,
            rerank_model=DEFAULT_RERANK_MODEL,
        )
        super().__init__(cfg)

    def _resolve_base_url(self, base_url: str | None) -> str:
        url = (base_url or self.config.base_url or DEFAULT_BASE_URL).rstrip("/")
        return url

    def _resolve_rerank_base_url(self, rerank_base_url: str | None) -> str:
        url = (rerank_base_url or self.config.rerank_base_url or DEFAULT_RERANK_BASE_URL).rstrip("/")
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
            "model": model or self.config.llm_model or DEFAULT_LLM_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature if temperature is not None else self.config.temperature,
            "stream": False,
            "enable_thinking": False,
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
            "model": model or self.config.embedding_model or DEFAULT_EMBED_MODEL,
            "input": text or " ",
            "dimensions": dimensions if dimensions is not None else DEFAULT_EMBED_DIM,
            "encoding_format": "float",
        }
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
        payload: dict[str, Any] = {
            "model": model or self.config.rerank_model or DEFAULT_RERANK_MODEL,
            "query": query,
            "documents": documents,
            "instruct": instruct or DEFAULT_RERANK_INSTRUCT,
        }
        payload.update(kwargs)

        root = self._resolve_rerank_base_url(base_url)
        url = f"{root}/reranks"
        headers = self._headers(api_key)
        response = self._post_fn(post)(
            url,
            json=payload,
            headers=headers,
            timeout=self.config.timeout or REQUEST_TIMEOUT,
        )
        if hasattr(response, "raise_for_status"):
            response.raise_for_status()
        results = response.json().get("results") or []
        return [
            {"index": int(item["index"]), "relevance_score": float(item["relevance_score"])}
            for item in results
        ]
