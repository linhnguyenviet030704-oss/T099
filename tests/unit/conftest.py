"""Standalone conftest for github_client tests - no app imports."""

import pytest

pytest_plugins = ["respx"]


@pytest.fixture
def respx_mock():
    """Import respx for mocking httpx - available from pytest-respx."""
    import respx
    return respx


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "asyncio: mark test as async")
