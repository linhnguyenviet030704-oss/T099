import pytest
from pydantic import ValidationError

from backend.app.config.env import DEFAULT_JWT_SECRET, Settings


def test_development_allows_default_jwt_secret():
    settings = Settings(app_env="development", supabase_jwt_secret=DEFAULT_JWT_SECRET)
    assert settings.supabase_jwt_secret == DEFAULT_JWT_SECRET


def test_production_rejects_default_jwt_secret():
    with pytest.raises(ValidationError):
        Settings(app_env="production", supabase_jwt_secret=DEFAULT_JWT_SECRET)


def test_production_accepts_custom_jwt_secret():
    settings = Settings(
        app_env="production",
        supabase_jwt_secret="a-long-production-jwt-secret-not-the-default",
    )
    assert settings.app_env == "production"


def test_qwen_cloud_defaults():
    settings = Settings(_env_file=None)
    assert settings.llm_model == "qwen3.7-flash"
    assert settings.embedding_model == "qwen3.7-text-embedding"
    assert settings.qwen_base_url.endswith("/compatible-mode/v1")
    assert settings.qwen_api_key == ""
