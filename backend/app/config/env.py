from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from backend.app.config.models import (
    DEFAULT_BASE_URL,
    DEFAULT_BRAIN_PROVIDER,
    DEFAULT_EMBED_MODEL,
    DEFAULT_GEMINI_BASE_URL,
    DEFAULT_GEMINI_EMBEDDING_MODEL,
    DEFAULT_GEMINI_MODEL,
    DEFAULT_LLM_MODEL,
    DEFAULT_OLLAMA_BASE_URL,
    DEFAULT_OLLAMA_EMBEDDING_MODEL,
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_OPENAI_BASE_URL,
    DEFAULT_OPENAI_EMBEDDING_MODEL,
    DEFAULT_OPENAI_MODEL,
    DEFAULT_RERANK_BASE_URL,
    DEFAULT_RERANK_MODEL,
)

DEFAULT_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Recruitment API"
    app_env: Literal["development", "production", "test"] = "development"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_host: str = "0.0.0.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    supabase_url: str = "http://127.0.0.1:54321"
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = DEFAULT_JWT_SECRET
    supabase_anon_key: str = ""

    # Cron secret (dùng cho internal endpoints gọi từ cron)
    cron_secret: str = ""

    # GitHub API
    github_token: str = ""
    github_api_key: str = ""

    # Shared Brain / Default Provider
    default_brain_provider: str = DEFAULT_BRAIN_PROVIDER

    # OpenAI Provider
    openai_api_key: str = ""
    openai_base_url: str = DEFAULT_OPENAI_BASE_URL
    openai_model: str = DEFAULT_OPENAI_MODEL
    openai_embedding_model: str = DEFAULT_OPENAI_EMBEDDING_MODEL
    model_name: str = "gpt-4o-mini"
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)

    # Qwen Cloud Provider (DashScope / QwenCloud)
    qwen_base_url: str = DEFAULT_BASE_URL
    qwen_api_key: str = ""
    dashscope_api_key: str = ""
    llm_model: str = DEFAULT_LLM_MODEL
    embedding_model: str = DEFAULT_EMBED_MODEL
    qwen_model: str = DEFAULT_LLM_MODEL
    qwen_embedding_model: str = DEFAULT_EMBED_MODEL
    qwen_rerank_base_url: str = DEFAULT_RERANK_BASE_URL
    qwen_rerank_model: str = DEFAULT_RERANK_MODEL

    # Gemini API Provider (Google AI - OpenAI-compatible endpoint)
    gemini_api_key: str = ""
    google_api_key: str = ""
    gemini_base_url: str = DEFAULT_GEMINI_BASE_URL
    gemini_model: str = DEFAULT_GEMINI_MODEL
    gemini_embedding_model: str = DEFAULT_GEMINI_EMBEDDING_MODEL

    # Local Ollama Provider
    ollama_base_url: str = DEFAULT_OLLAMA_BASE_URL
    ollama_api_key: str = "ollama"
    ollama_model: str = DEFAULT_OLLAMA_MODEL
    ollama_embedding_model: str = DEFAULT_OLLAMA_EMBEDDING_MODEL

    langsmith_tracing: bool = False
    langsmith_endpoint: str = "https://api.smith.langchain.com"
    langsmith_api_key: str = ""
    langsmith_project: str = "recruitment-portal"

    @model_validator(mode="after")
    def sync_provider_keys(self) -> Self:
        # Fallback aliases
        if not self.qwen_api_key and self.dashscope_api_key:
            self.qwen_api_key = self.dashscope_api_key
        if not self.gemini_api_key and self.google_api_key:
            self.gemini_api_key = self.google_api_key
        if not self.github_token and self.github_api_key:
            self.github_token = self.github_api_key
        elif not self.github_api_key and self.github_token:
            self.github_api_key = self.github_token
        return self

    @model_validator(mode="after")
    def reject_default_jwt_in_production(self) -> Self:
        if self.app_env == "production" and self.supabase_jwt_secret == DEFAULT_JWT_SECRET:
            raise ValueError("SUPABASE_JWT_SECRET must be set to a non-default value in production")
        return self

    @model_validator(mode="after")
    def reject_unsafe_cors_in_production(self) -> Self:
        if self.app_env == "production":
            origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
            if not origins or "*" in origins:
                raise ValueError("CORS_ORIGINS must be explicit, non-wildcard origins in production")
        return self

    @model_validator(mode="after")
    def require_service_role_key_in_production(self) -> Self:
        if self.app_env == "production" and not self.supabase_service_role_key.strip():
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY must be set in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
