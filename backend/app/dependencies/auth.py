from __future__ import annotations

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.app.core.exceptions import UnauthorizedError
from backend.app.core.security import AuthenticatedUser, TokenVerificationError, verify_access_token

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedError("Bearer authentication required")
    try:
        return verify_access_token(credentials.credentials)
    except TokenVerificationError as exc:
        raise UnauthorizedError(str(exc)) from exc
