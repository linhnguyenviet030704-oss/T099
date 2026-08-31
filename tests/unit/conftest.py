"""Standalone conftest for github_client tests - no app imports."""

import pytest


@pytest.fixture
def respx_mock():
    """Import respx for mocking httpx."""
    import respx
    return respx.mock


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "asyncio: mark test as async")
