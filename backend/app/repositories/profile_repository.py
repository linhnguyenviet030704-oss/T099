from __future__ import annotations

import asyncio
from datetime import datetime
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
