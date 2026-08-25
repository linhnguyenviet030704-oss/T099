from __future__ import annotations

import json
import time
from abc import ABC, abstractmethod
from collections.abc import Callable
from typing import Any

import httpx
from langchain_openai import ChatOpenAI
from langsmith import traceable

from backend.app.shared_brain.types import BrainConfig

PostFn = Callable[..., Any]
_MAX_ATTEMPTS = 3
_BACKOFF_BASE_SECONDS = 0.5


def _is_retryable(exc: Exception) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    return isinstance(exc, httpx.TransportError)


def _call_with_retries(post: PostFn, url: str, **kwargs: Any) -> Any:
    last_exc: Exception | None = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            response = post(url, **kwargs)
            if hasattr(response, "raise_for_status"):
                response.raise_for_status()
            return response
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if not _is_retryable(exc) or attempt == _MAX_ATTEMPTS - 1:
                raise
            time.sleep(_BACKOFF_BASE_SECONDS * (2**attempt))
    raise last_exc  # pragma: no cover


class BaseLLMProvider(ABC):
    def __init__(self, config: BrainConfig) -> None:
        self.config = config

    def _headers(self, api_key: str | None = None) -> dict[str, str]:
        key = api_key if api_key is not None else self.config.api_key
        headers = {"Content-Type": "application/json"}
        if key:
            headers["Authorization"] = f"Bearer {key}"
        return headers

    def _post_fn(self, post: PostFn | None = None) -> PostFn:
        return post or httpx.post

    @abstractmethod
    @traceable(name="brain_chat_complete", run_type="llm")
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
        """Execute chat completion and return response text."""

    @abstractmethod
    @traceable(name="brain_embed_query", run_type="embedding")
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
        """Generate vector embeddings for input text."""

    @abstractmethod
    @traceable(name="brain_rerank_query", run_type="tool")
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
        """Rerank documents with respect to query."""

    def get_chat_model(self, **kwargs: Any) -> ChatOpenAI:
        """Create a LangChain ChatOpenAI instance configured for this provider."""
        temp = kwargs.pop("temperature", self.config.temperature)
        mdl = kwargs.pop("model", self.config.llm_model)
        url = kwargs.pop("base_url", self.config.base_url)
        key = kwargs.pop("api_key", self.config.api_key) or "none"
        return ChatOpenAI(
            model=mdl,
            openai_api_base=url,
            openai_api_key=key,
            temperature=temp,
            timeout=self.config.timeout,
            **kwargs,
        )

    def _fallback_llm_rerank(
        self,
        query: str,
        documents: list[str],
        *,
        post: PostFn | None = None,
    ) -> list[dict[str, Any]]:
        """Fallback relevance scoring using standard chat completion when native rerank is unavailable."""
        if not documents:
            return []
        prompt = (
            "Rank the relevance of each document below to the query on a scale from 0.0 to 1.0.\n"
            f"Query: {query}\n"
            "Documents:\n"
            + "\n".join(f"[{i}] {doc[:500]}" for i, doc in enumerate(documents))
            + '\nReturn ONLY a JSON list of objects with "index" (integer) and "relevance_score" (float).'
        )
        try:
            resp_str = self.chat_complete(prompt, json_object=True, post=post)
            parsed = json.loads(resp_str)
            if isinstance(parsed, dict) and "results" in parsed:
                parsed = parsed["results"]
            if isinstance(parsed, list):
                return [
                    {"index": int(item["index"]), "relevance_score": float(item["relevance_score"])}
                    for item in parsed
                    if "index" in item and "relevance_score" in item
                ]
        except Exception:
            pass
        # Default simple descending dummy ranking as safeguard
        return [{"index": i, "relevance_score": round(1.0 - (i * 0.05), 4)} for i in range(len(documents))]
