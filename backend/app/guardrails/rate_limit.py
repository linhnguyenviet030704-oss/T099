from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import Depends

from backend.app.core.exceptions import AppError
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.auth import get_current_user


class RateLimiter:
    # ponytail: process-local deque; ceiling = one process. Upgrade: Redis INCR+TTL.
    def __init__(self, max_hits: int, window_seconds: int) -> None:
        self.max_hits = max_hits
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= self.max_hits:
                return False
            bucket.append(now)
            return True


_chat_limiter = RateLimiter(max_hits=20, window_seconds=60)


async def enforce_chat_rate_limit(
    user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    if not _chat_limiter.allow(str(user.id)):
        raise AppError(429, "Too many chat requests", "RATE_LIMITED")
    return user
