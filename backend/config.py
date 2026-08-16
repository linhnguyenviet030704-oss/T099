"""Backward-compatible settings import for legacy modules (e.g. LLM helpers)."""

from backend.app.core.config import Settings, get_settings, settings

__all__ = ["Settings", "get_settings", "settings"]
