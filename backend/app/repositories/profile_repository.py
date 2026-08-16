from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from backend.app.models.domain import Profile, ProfileRole
from supabase import Client


class ProfileRepository:
    def __init__(self, client: Client) -> None:
        self._client = client

    async def get_by_id(self, profile_id: UUID) -> Profile | None:
        def _query() -> dict[str, Any] | None:
            result = (
                self._client.table("profiles")
                .select("*")
                .eq("id", str(profile_id))
                .maybe_single()
                .execute()
            )
            return result.data

        row = await asyncio.to_thread(_query)
        return _to_profile(row) if row else None

    async def update(
        self,
        profile_id: UUID,
        *,
        full_name: str | None = None,
        phone: str | None = None,
        avatar_url: str | None = None,
    ) -> Profile | None:
        payload: dict[str, Any] = {}
        if full_name is not None:
            payload["full_name"] = full_name
        if phone is not None:
            payload["phone"] = phone
        if avatar_url is not None:
            payload["avatar_url"] = avatar_url
        if not payload:
            return await self.get_by_id(profile_id)

        def _query() -> dict[str, Any] | None:
            result = (
                self._client.table("profiles")
                .update(payload)
                .eq("id", str(profile_id))
                .select("*")
                .maybe_single()
                .execute()
            )
            return result.data

        row = await asyncio.to_thread(_query)
        return _to_profile(row) if row else None

    async def set_role(self, profile_id: UUID, role: ProfileRole) -> Profile | None:
        def _query() -> dict[str, Any] | None:
            result = (
                self._client.table("profiles")
                .update({"role": role})
                .eq("id", str(profile_id))
                .select("*")
                .maybe_single()
                .execute()
            )
            return result.data

        row = await asyncio.to_thread(_query)
        return _to_profile(row) if row else None

    async def get_recruiter_form(self, form_id: UUID) -> dict[str, Any] | None:
        def _query() -> dict[str, Any] | None:
            result = (
                self._client.table("recruiter_registration_forms")
                .select("*")
                .eq("id", str(form_id))
                .maybe_single()
                .execute()
            )
            return result.data

        return await asyncio.to_thread(_query)

    async def update_recruiter_form(
        self,
        form_id: UUID,
        *,
        status: str,
        admin_note: str | None,
        reviewed_by_user_id: UUID,
    ) -> dict[str, Any] | None:
        def _query() -> dict[str, Any] | None:
            result = (
                self._client.table("recruiter_registration_forms")
                .update(
                    {
                        "status": status,
                        "admin_note": admin_note,
                        "reviewed_by_user_id": str(reviewed_by_user_id),
                        "reviewed_at": datetime.now(UTC).isoformat(),
                    }
                )
                .eq("id", str(form_id))
                .select("*")
                .maybe_single()
                .execute()
            )
            return result.data

        return await asyncio.to_thread(_query)


def _to_profile(row: dict[str, Any]) -> Profile:
    created_at = _parse_dt(row.get("created_at"))
    updated_at = _parse_dt(row.get("updated_at"))
    role: ProfileRole = row.get("role") or "candidate"
    return Profile(
        id=UUID(str(row["id"])),
        email=row.get("email"),
        full_name=row.get("full_name"),
        phone=row.get("phone"),
        avatar_url=row.get("avatar_url"),
        role=role,
        default_resume_id=UUID(str(row["default_resume_id"])) if row.get("default_resume_id") else None,
        created_at=created_at,
        updated_at=updated_at,
    )


def _parse_dt(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).replace("Z", "+00:00")
    return datetime.fromisoformat(text)
