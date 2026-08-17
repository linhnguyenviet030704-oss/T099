from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any
from uuid import UUID

import jwt
from jwt import PyJWTError

from backend.app.config.env import settings

_ASYMMETRIC_ALGS = ("ES256", "RS256")


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    id: UUID
    email: str | None
    claims: dict[str, Any]


class TokenVerificationError(Exception):
    pass


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return jwt.PyJWKClient(url)


def _decode_payload(token: str) -> dict[str, Any]:
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")
        if alg == "HS256":
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        if alg in _ASYMMETRIC_ALGS:
            key = _jwks_client().get_signing_key_from_jwt(token).key
            return jwt.decode(
                token,
                key,
                algorithms=list(_ASYMMETRIC_ALGS),
                audience="authenticated",
            )
    except PyJWTError as exc:
        raise TokenVerificationError("Invalid or expired token") from exc
    raise TokenVerificationError("Invalid or expired token")


def verify_access_token(token: str) -> AuthenticatedUser:
    payload = _decode_payload(token)

    sub = payload.get("sub")
    if not sub:
        raise TokenVerificationError("Token missing subject")

    try:
        user_id = UUID(str(sub))
    except ValueError as exc:
        raise TokenVerificationError("Token subject is not a UUID") from exc

    email = payload.get("email")
    return AuthenticatedUser(id=user_id, email=str(email) if email else None, claims=payload)
