"""OpenAI-compatible chat/embed/rerank client backed by shared_brain."""

from __future__ import annotations

from typing import Any

from langsmith import traceable

from backend.app.shared_brain import get_brain
from backend.app.shared_brain.providers.base import PostFn, _call_with_retries

__all__ = [
    "PostFn",
    "_call_with_retries",
    "chat_complete",
    "embed_query",
    "rerank_query",
]


@traceable(name="chat_complete", run_type="llm")
def chat_complete(
    prompt: str,
    *,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    json_object: bool = False,
    post: PostFn | None = None,
    **kwargs: Any,
) -> str:
    brain = get_brain()
    return brain.chat(
        prompt,
        model=model,
        base_url=base_url,
        api_key=api_key,
        json_object=json_object,
        post=post,
        **kwargs,
    )


@traceable(name="embed_query", run_type="embedding")
def embed_query(
    text: str,
    *,
    model: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    dimensions: int | None = None,
    post: PostFn | None = None,
    **kwargs: Any,
) -> list[float]:
    brain = get_brain()
    return brain.embed(
        text,
        model=model,
        base_url=base_url,
        api_key=api_key,
        dimensions=dimensions,
        post=post,
        **kwargs,
    )


@traceable(name="rerank_query", run_type="tool")
def rerank_query(
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
    brain = get_brain()
    return brain.rerank(
        query,
        documents,
        model=model,
        base_url=base_url,
        api_key=api_key,
        instruct=instruct,
        post=post,
        **kwargs,
    )

