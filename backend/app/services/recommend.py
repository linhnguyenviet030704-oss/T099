from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

from backend.app.core.exceptions import ForbiddenError, NotFoundError
from backend.app.schemas.chat import RecommendedCandidate, RecommendedJob
from supabase import Client

MOCK_SCORES = (0.95, 0.88, 0.81, 0.74, 0.67)
MOCK_LIMIT = len(MOCK_SCORES)


def _company_name(row: dict[str, Any]) -> str | None:
    company = row.get("companies")
    if isinstance(company, dict):
        name = company.get("name")
        return str(name) if name else None
    if isinstance(company, list) and company:
        name = company[0].get("name")
        return str(name) if name else None
    return None


def _profile(row: dict[str, Any]) -> dict[str, Any]:
    profile = row.get("profiles")
    if isinstance(profile, dict):
        return profile
    if isinstance(profile, list) and profile:
        return profile[0]
    return {}


def mock_recommend(rows: list[dict[str, Any]]) -> list[RecommendedJob]:
    jobs: list[RecommendedJob] = []
    for index, row in enumerate(rows[:MOCK_LIMIT]):
        jobs.append(
            RecommendedJob(
                id=row["id"],
                title=row["title"],
                company_name=_company_name(row),
                location=row.get("location"),
                employment_type=row.get("employment_type"),
                salary_min=row.get("salary_min"),
                salary_max=row.get("salary_max"),
                currency=row.get("currency") or "VND",
                score=MOCK_SCORES[index],
            )
        )
    return jobs


def mock_recommend_candidates(rows: list[dict[str, Any]]) -> list[RecommendedCandidate]:
    candidates: list[RecommendedCandidate] = []
    for index, row in enumerate(rows[:MOCK_LIMIT]):
        profile = _profile(row)
        candidates.append(
            RecommendedCandidate(
                application_id=row["id"],
                applicant_user_id=row["applicant_user_id"],
                full_name=profile.get("full_name"),
                email=profile.get("email"),
                resume_title=row.get("resume_title_snapshot"),
                resume_storage_path=row.get("resume_storage_path_snapshot"),
                current_status=row.get("current_status") or "pending",
                score=MOCK_SCORES[index],
            )
        )
    return candidates


async def list_published_jobs(client: Client, limit: int = MOCK_LIMIT) -> list[dict[str, Any]]:
    def _query() -> list[dict[str, Any]]:
        result = (
            client.table("job_posts")
            .select(
                "id, title, location, employment_type, salary_min, salary_max, currency, companies(name)"
            )
            .eq("status", "published")
            .order("published_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    return await asyncio.to_thread(_query)


async def list_applications_for_job(
    client: Client,
    job_id: UUID,
    limit: int = MOCK_LIMIT,
) -> list[dict[str, Any]]:
    def _query() -> list[dict[str, Any]]:
        result = (
            client.table("job_submits")
            .select(
                "id, applicant_user_id, current_status, resume_title_snapshot, "
                "resume_storage_path_snapshot, profiles!applicant_user_id(full_name, email)"
            )
            .eq("job_post_id", str(job_id))
            .is_("withdrawn_at", "null")
            .order("applied_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    return await asyncio.to_thread(_query)


async def assert_recruiter_job_access(client: Client, actor_id: UUID, job_id: UUID) -> None:
    def _job() -> dict[str, Any] | None:
        result = (
            client.table("job_posts")
            .select("id, company_id, created_by_user_id")
            .eq("id", str(job_id))
            .maybe_single()
            .execute()
        )
        return result.data

    job = await asyncio.to_thread(_job)
    if not job:
        raise NotFoundError("Job not found", code="JOB_NOT_FOUND")

    def _profile() -> dict[str, Any] | None:
        result = (
            client.table("profiles")
            .select("role")
            .eq("id", str(actor_id))
            .maybe_single()
            .execute()
        )
        return result.data

    profile = await asyncio.to_thread(_profile)
    if profile and profile.get("role") == "admin":
        return

    if str(job.get("created_by_user_id")) != str(actor_id):
        raise ForbiddenError("Not the poster of this job")

    def _member() -> dict[str, Any] | None:
        result = (
            client.table("company_members")
            .select("id")
            .eq("company_id", str(job["company_id"]))
            .eq("user_id", str(actor_id))
            .eq("is_active", True)
            .in_("role", ["owner", "recruiter"])
            .maybe_single()
            .execute()
        )
        return result.data

    if not await asyncio.to_thread(_member):
        raise ForbiddenError("Not a recruiter for this job")
