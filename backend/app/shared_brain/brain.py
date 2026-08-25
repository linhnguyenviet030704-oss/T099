from __future__ import annotations

from typing import Any

from langchain_openai import ChatOpenAI

from backend.app.shared_brain.providers.base import BaseLLMProvider, PostFn
from backend.app.shared_brain.types import BrainConfig, BrainProvider


class AgentBrain:
    """The brain instance associated with an agent."""

    def __init__(
        self,
        agent_name: str,
        provider: BaseLLMProvider,
    ) -> None:
        self.agent_name = agent_name
        self._provider = provider

    @property
    def provider(self) -> BaseLLMProvider:
        return self._provider

    @property
    def config(self) -> BrainConfig:
        return self._provider.config

    @property
    def provider_type(self) -> BrainProvider:
        return self._provider.config.provider

    def chat(
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
        """Send chat prompt to the agent brain's LLM provider."""
        return self._provider.chat_complete(
            prompt,
            model=model,
            base_url=base_url,
            api_key=api_key,
            json_object=json_object,
            temperature=temperature,
            post=post,
            **kwargs,
        )

    def embed(
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
        """Generate vector embedding for text using the agent brain's provider."""
        return self._provider.embed_query(
            text,
            model=model,
            base_url=base_url,
            api_key=api_key,
            dimensions=dimensions,
            post=post,
            **kwargs,
        )

    def rerank(
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
        """Rerank candidate documents against query."""
        return self._provider.rerank_query(
            query,
            documents,
            model=model,
            base_url=base_url,
            api_key=api_key,
            instruct=instruct,
            post=post,
            **kwargs,
        )

    def get_chat_model(self, **kwargs: Any) -> ChatOpenAI:
        """Obtain a LangChain ChatOpenAI object configured for this agent's brain."""
        return self._provider.get_chat_model(**kwargs)
