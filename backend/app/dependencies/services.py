from __future__ import annotations

from fastapi import Depends

from backend.app.dependencies.supabase import get_supabase_client
from backend.app.repositories.profile_repository import ProfileRepository
from backend.app.services.admin_service import AdminService
from backend.app.services.chat_service import ChatService
from backend.app.services.profile_service import ProfileService
from backend.app.services.recommend import (
    assert_recruiter_job_access,
    list_applications_for_job,
    list_published_jobs,
)
from supabase import Client


def get_profile_repository(
    client: Client = Depends(get_supabase_client),
) -> ProfileRepository:
    return ProfileRepository(client)


def get_profile_service(
    repository: ProfileRepository = Depends(get_profile_repository),
) -> ProfileService:
    return ProfileService(repository)


def get_chat_service(client: Client = Depends(get_supabase_client)) -> ChatService:
    async def fetch_jobs() -> list:
        return await list_published_jobs(client)

    async def fetch_candidates(job_id):
        return await list_applications_for_job(client, job_id)

    async def assert_access(actor_id, job_id):
        await assert_recruiter_job_access(client, actor_id, job_id)

    return ChatService(fetch_jobs, fetch_candidates, assert_access)


def get_admin_service(
    repository: ProfileRepository = Depends(get_profile_repository),
) -> AdminService:
    return AdminService(repository)
