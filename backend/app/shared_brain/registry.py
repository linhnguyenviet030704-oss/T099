"""Brain registry - manages AgentBrain instances per agent with per-agent model selection."""

from __future__ import annotations

import os
from typing import Any

from backend.app.config.env import settings
from backend.app.config.models import AGENT_MODELS
from backend.app.shared_brain.brain import AgentBrain
from backend.app.shared_brain.providers.base import BaseLLMProvider
from backend.app.shared_brain.providers.gemini_provider import GeminiProvider
from backend.app.shared_brain.providers.ollama_provider import OllamaProvider
from backend.app.shared_brain.providers.openai_provider import OpenAIProvider
from backend.app.shared_brain.providers.qwen_provider import QwenProvider
from backend.app.shared_brain.types import BrainConfig, BrainProvider


class BrainRegistry:
    """Central registry to manage and dispatch brains for all agents.

    Each agent gets its own brain with a configured model.
    Model selection: agent-specific config → env override → default
    """

    def __init__(self) -> None:
        self._brains: dict[str, AgentBrain] = {}

    def _resolve_llm_model(
        self,
        agent_name: str,
        explicit_model: str | None,
        settings_model: str | None,
    ) -> str:
        """Resolve LLM model for an agent.

        Priority:
        1. Explicit parameter (per-call override)
        2. Env var MODEL_<AGENT_NAME_UPPER>
        3. Config file AGENT_MODELS mapping
        4. Settings default
        """
        if explicit_model:
            return explicit_model

        # Check env override
        env_key = f"MODEL_{agent_name.upper()}"
        env_value = os.environ.get(env_key)
        if env_value:
            return env_value

        # Check config mapping
        if agent_name in AGENT_MODELS:
            return AGENT_MODELS[agent_name]

        return settings_model or "qwen3.7-flash"

    def create_provider(
        self,
        agent_name: str | None = None,
        provider_type: BrainProvider | str | None = None,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        llm_model: str | None = None,
        embedding_model: str | None = None,
        rerank_base_url: str | None = None,
        rerank_model: str | None = None,
        temperature: float | None = None,
        **extra: Any,
    ) -> BaseLLMProvider:
        """Create an LLM provider with resolved model for the agent."""
        prov_enum = BrainProvider.from_str(str(provider_type or settings.default_brain_provider))
        resolved_model = self._resolve_llm_model(
            agent_name or "default",
            llm_model,
            settings.llm_model,
        )

        if prov_enum == BrainProvider.OPENAI:
            config = BrainConfig(
                provider=BrainProvider.OPENAI,
                api_key=api_key if api_key is not None else settings.openai_api_key,
                base_url=base_url if base_url is not None else settings.openai_base_url,
                llm_model=llm_model if llm_model is not None else (settings.openai_model or settings.model_name),
                embedding_model=embedding_model if embedding_model is not None else settings.openai_embedding_model,
                temperature=temperature if temperature is not None else 0.0,
                extra=extra,
            )
            return OpenAIProvider(config)

        if prov_enum == BrainProvider.GEMINI:
            config = BrainConfig(
                provider=BrainProvider.GEMINI,
                api_key=api_key if api_key is not None else settings.gemini_api_key,
                base_url=base_url if base_url is not None else settings.gemini_base_url,
                llm_model=llm_model if llm_model is not None else settings.gemini_model,
                embedding_model=embedding_model if embedding_model is not None else settings.gemini_embedding_model,
                temperature=temperature if temperature is not None else 0.0,
                extra=extra,
            )
            return GeminiProvider(config)

        if prov_enum == BrainProvider.OLLAMA:
            config = BrainConfig(
                provider=BrainProvider.OLLAMA,
                api_key=api_key if api_key is not None else settings.ollama_api_key,
                base_url=base_url if base_url is not None else settings.ollama_base_url,
                llm_model=llm_model if llm_model is not None else settings.ollama_model,
                embedding_model=embedding_model if embedding_model is not None else settings.ollama_embedding_model,
                temperature=temperature if temperature is not None else 0.0,
                extra=extra,
            )
            return OllamaProvider(config)

        # Default: Qwen Cloud (DashScope)
        config = BrainConfig(
            provider=BrainProvider.QWEN,
            api_key=api_key if api_key is not None else settings.qwen_api_key,
            base_url=base_url if base_url is not None else settings.qwen_base_url,
            llm_model=resolved_model,  # Use resolved per-agent model
            embedding_model=embedding_model if embedding_model is not None else settings.embedding_model,
            rerank_base_url=rerank_base_url if rerank_base_url is not None else settings.qwen_rerank_base_url,
            rerank_model=rerank_model if rerank_model is not None else settings.qwen_rerank_model,
            temperature=temperature if temperature is not None else 0.0,
            extra=extra,
        )
        return QwenProvider(config)

    def register_brain(
        self,
        agent_name: str,
        *,
        provider: BrainProvider | str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        embedding_model: str | None = None,
        rerank_base_url: str | None = None,
        rerank_model: str | None = None,
        temperature: float | None = None,
        custom_provider: BaseLLMProvider | None = None,
        **extra: Any,
    ) -> AgentBrain:
        """Register a specific brain configuration for an agent."""
        if custom_provider is not None:
            llm_prov = custom_provider
        else:
            llm_prov = self.create_provider(
                agent_name=agent_name,
                provider_type=provider,
                api_key=api_key,
                base_url=base_url,
                llm_model=model,
                embedding_model=embedding_model,
                rerank_base_url=rerank_base_url,
                rerank_model=rerank_model,
                temperature=temperature,
                **extra,
            )
        brain = AgentBrain(agent_name=agent_name, provider=llm_prov)
        self._brains[agent_name] = brain
        return brain

    def get_brain(self, agent_name: str | None = None) -> AgentBrain:
        """Get an existing registered brain for an agent or spawn a default brain."""
        key = agent_name or "default"
        if key not in self._brains:
            self._brains[key] = self.register_brain(key)
        return self._brains[key]

    def list_registered_agents(self) -> list[str]:
        return list(self._brains.keys())

    def reset_registry(self) -> None:
        self._brains.clear()


# Global Registry Instance
_global_registry = BrainRegistry()


def get_registry() -> BrainRegistry:
    return _global_registry


def register_brain(
    agent_name: str,
    *,
    provider: BrainProvider | str | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
    embedding_model: str | None = None,
    rerank_base_url: str | None = None,
    rerank_model: str | None = None,
    temperature: float | None = None,
    custom_provider: BaseLLMProvider | None = None,
    **extra: Any,
) -> AgentBrain:
    return _global_registry.register_brain(
        agent_name=agent_name,
        provider=provider,
        api_key=api_key,
        base_url=base_url,
        model=model,
        embedding_model=embedding_model,
        rerank_base_url=rerank_base_url,
        rerank_model=rerank_model,
        temperature=temperature,
        custom_provider=custom_provider,
        **extra,
    )


def get_brain(agent_name: str | None = None) -> AgentBrain:
    return _global_registry.get_brain(agent_name)


def reset_registry() -> None:
    _global_registry.reset_registry()
