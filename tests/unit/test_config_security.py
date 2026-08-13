import pytest
from pydantic import ValidationError

from backend.app.core.config import DEFAULT_JWT_SECRET, Settings


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
