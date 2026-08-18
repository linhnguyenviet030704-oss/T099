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
        supabase_service_role_key="a-prod-service-role-key",
    )
    assert settings.app_env == "production"


def _prod_kwargs(**overrides):
    base = {
        "app_env": "production",
        "supabase_jwt_secret": "a-long-production-jwt-secret-not-the-default",
        "supabase_service_role_key": "a-prod-service-role-key",
        "cors_origins": "https://app.example.com",
    }
    base.update(overrides)
    return base


def test_production_rejects_wildcard_cors():
    with pytest.raises(ValidationError):
        Settings(**_prod_kwargs(cors_origins="*"))


def test_production_rejects_empty_cors():
    with pytest.raises(ValidationError):
        Settings(**_prod_kwargs(cors_origins=""))


def test_production_rejects_partial_wildcard_cors():
    with pytest.raises(ValidationError):
        Settings(**_prod_kwargs(cors_origins="https://app.example.com,*"))


def test_production_accepts_explicit_cors_origins():
    settings = Settings(**_prod_kwargs(cors_origins="https://app.example.com,https://admin.example.com"))
    assert settings.cors_origins == "https://app.example.com,https://admin.example.com"


def test_development_allows_wildcard_cors():
    settings = Settings(app_env="development", cors_origins="*")
    assert settings.cors_origins == "*"


def test_production_rejects_missing_service_role_key():
    with pytest.raises(ValidationError):
        Settings(**_prod_kwargs(supabase_service_role_key=""))


def test_production_accepts_service_role_key():
    settings = Settings(**_prod_kwargs())
    assert settings.supabase_service_role_key == "a-prod-service-role-key"


def test_qwen_cloud_defaults():
    settings = Settings(_env_file=None)
    assert settings.llm_model == "qwen3.7-flash"
    assert settings.embedding_model == "qwen3.7-text-embedding"
    assert settings.qwen_base_url.endswith("/compatible-mode/v1")
    assert settings.qwen_api_key == ""
