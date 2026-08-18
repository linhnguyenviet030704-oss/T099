from uuid import uuid4

import pytest

from backend.app.core.exceptions import AppError
from backend.app.core.security import AuthenticatedUser
from backend.app.guardrails.rate_limit import RateLimiter, _rate_limit_dependency


def test_rate_limiter_allows_under_limit():
    limiter = RateLimiter(max_hits=2, window_seconds=60)
    assert limiter.allow("user-a") is True
    assert limiter.allow("user-a") is True


def test_rate_limiter_blocks_over_limit():
    limiter = RateLimiter(max_hits=2, window_seconds=60)
    limiter.allow("user-a")
    limiter.allow("user-a")
    assert limiter.allow("user-a") is False


def test_rate_limiter_keys_are_independent():
    limiter = RateLimiter(max_hits=1, window_seconds=60)
    assert limiter.allow("a") is True
    assert limiter.allow("b") is True
    assert limiter.allow("a") is False


@pytest.mark.asyncio
async def test_rate_limit_dependency_allows_then_blocks():
    limiter = RateLimiter(max_hits=1, window_seconds=60)
    enforce = _rate_limit_dependency(limiter, "too many requests")
    user = AuthenticatedUser(id=uuid4(), email="user@example.com", claims={})

    result = await enforce(user)
    assert result is user

    with pytest.raises(AppError) as exc_info:
        await enforce(user)
    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == "too many requests"
    assert exc_info.value.code == "RATE_LIMITED"
