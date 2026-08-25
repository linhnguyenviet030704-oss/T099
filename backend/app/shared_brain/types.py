from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class BrainProvider(StrEnum):
    OPENAI = "openai"
    QWEN = "qwen"
    GEMINI = "gemini"
    OLLAMA = "ollama"

    @classmethod
    def from_str(cls, value: str | None) -> BrainProvider:
        if not value:
            return cls.QWEN
        val = value.strip().lower()
        if val in ("openai", "gpt"):
            return cls.OPENAI
        if val in ("qwen", "dashscope", "alibaba", "qwencloud"):
            return cls.QWEN
        if val in ("gemini", "google", "googleai"):
            return cls.GEMINI
        if val in ("ollama", "local"):
            return cls.OLLAMA
        return cls.QWEN


@dataclass
class BrainConfig:
    provider: BrainProvider = BrainProvider.QWEN
    api_key: str = ""
    base_url: str = ""
    llm_model: str = ""
    embedding_model: str = ""
    rerank_base_url: str = ""
    rerank_model: str = ""
    temperature: float = 0.0
    timeout: float = 120.0
    extra: dict[str, Any] = field(default_factory=dict)
