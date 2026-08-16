from backend.app.core.rate_limit import RateLimiter


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
