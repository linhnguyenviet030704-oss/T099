from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from backend.app.config.models import DEFAULT_BASE_URL, DEFAULT_EMBED_MODEL, DEFAULT_LLM_MODEL

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

    openai_api_key: str = ""
    model_name: str = "gpt-4o-mini"
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)

    qwen_base_url: str = DEFAULT_BASE_URL
    qwen_api_key: str = ""
    llm_model: str = DEFAULT_LLM_MODEL
    embedding_model: str = DEFAULT_EMBED_MODEL

    langsmith_tracing: bool = False
    langsmith_endpoint: str = "https://api.smith.langchain.com"
    langsmith_api_key: str = ""
    langsmith_project: str = "recruitment-portal"

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
