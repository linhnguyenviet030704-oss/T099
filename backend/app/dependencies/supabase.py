from __future__ import annotations

from functools import lru_cache

from backend.app.core.config import settings
from backend.app.core.exceptions import AppError
from supabase import Client, create_client


@lru_cache
def get_supabase_client() -> Client:
    if not settings.supabase_service_role_key:
        raise AppError(
            status_code=500,
            detail="Supabase is not configured",
            code="SUPABASE_NOT_CONFIGURED",
        )
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
