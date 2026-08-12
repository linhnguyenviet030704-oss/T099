from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from uuid import UUID

import jwt
from jwt import PyJWTError

from backend.app.core.config import settings


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    id: UUID
    email: str | None
    claims: dict[str, Any]


class TokenVerificationError(Exception):
    pass


def verify_access_token(token: str) -> AuthenticatedUser:
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except PyJWTError as exc:
        raise TokenVerificationError("Invalid or expired token") from exc

    sub = payload.get("sub")
    if not sub:
        raise TokenVerificationError("Token missing subject")

    try:
        user_id = UUID(str(sub))
    except ValueError as exc:
        raise TokenVerificationError("Token subject is not a UUID") from exc

    email = payload.get("email")
    return AuthenticatedUser(id=user_id, email=str(email) if email else None, claims=payload)
