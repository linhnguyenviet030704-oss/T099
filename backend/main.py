"""ASGI entrypoint. Prefer: uvicorn backend.app.main:app"""

from backend.app.main import app

__all__ = ["app"]
