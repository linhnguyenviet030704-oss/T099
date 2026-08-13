from __future__ import annotations

from fastapi import Depends

from backend.app.dependencies.supabase import get_supabase_client
from backend.app.repositories.profile_repository import ProfileRepository
from backend.app.services.admin_service import AdminService
from backend.app.services.chat_service import ChatService
from backend.app.services.profile_service import ProfileService
from supabase import Client


def get_profile_repository(
    client: Client = Depends(get_supabase_client),
) -> ProfileRepository:
    return ProfileRepository(client)


def get_profile_service(
    repository: ProfileRepository = Depends(get_profile_repository),
) -> ProfileService:
    return ProfileService(repository)


def get_chat_service() -> ChatService:
    return ChatService()


def get_admin_service(
    repository: ProfileRepository = Depends(get_profile_repository),
) -> AdminService:
    return AdminService(repository)
