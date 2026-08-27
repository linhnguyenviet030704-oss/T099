"""Key file selector for LLM evaluation - selects representative files within token budget."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from backend.app.core.github_client import GitHubFile

logger = logging.getLogger(__name__)

DEFAULT_BUDGET = 80_000
DEFAULT_MAX_CHARS_PER_FILE = 10_000

DEFAULT_ENTRY_PATTERNS = [
    r"\.py$",  # Python files
    r"\.ts$", r"\.tsx$",  # TypeScript files
    r"\.js$", r"\.jsx$",  # JavaScript files
    r"^src/", r"^lib/", r"^app/", r"^backend/", r"^frontend/",  # source dirs
    r"^tests?/", r"^specs?/",  # test dirs
    r"^main\.py$", r"^index\.(ts|js|tsx|jsx)$",  # entry points
    r"^Makefile$", r"^package\.json$", r"^requirements\.txt$",  # project files
    r"^pyproject\.toml$", r"^setup\.py$", r"^setup\.cfg$",  # Python config
    r"^Dockerfile$", r"^docker-compose",  # Docker files
    r"\.md$", r"\.txt$",  # docs
]


@dataclass
class SelectedFile:
    """A file selected for LLM evaluation."""
    path: str
    content: str
    size: int
    is_entry_point: bool


def select_key_files(
    files: list[GitHubFile],
    *,
    budget: int = DEFAULT_BUDGET,
    max_chars_per_file: int = DEFAULT_MAX_CHARS_PER_FILE,
    entry_patterns: list[str] | None = None,
    get_file_content: None = None,
) -> list[SelectedFile]:
    """
    Select representative files within token budget for LLM evaluation.

    Args:
        files: List of GitHubFile objects with optional content pre-loaded
        budget: Maximum total bytes (default 80,000)
        max_chars_per_file: Maximum chars per file (default 10,000)
        entry_patterns: Custom regex patterns for entry point detection
        get_file_content: Optional async function(owner, repo, path) -> str

    Returns:
        List of SelectedFile with content already truncated
    """
    if not files:
        return []

    compiled_patterns = [re.compile(p) for p in (entry_patterns or DEFAULT_ENTRY_PATTERNS)]

    def is_entry_point(path: str) -> bool:
        return any(p.search(path) for p in compiled_patterns)

    file_list = sorted(files, key=lambda f: (not is_entry_point(f.path), len(f.path)))

    selected: list[SelectedFile] = []
    total_size = 0

    for f in file_list:
        content = f.content or ""
        truncated = content[:max_chars_per_file]
        file_size = len(truncated.encode())

        if total_size + file_size > budget:
            remaining = budget - total_size
            if remaining <= 0:
                break
            entry_point = is_entry_point(f.path)
            if entry_point and remaining > 0:
                truncated = content[:remaining]
                file_size = len(truncated.encode())
            else:
                continue

        selected.append(SelectedFile(
            path=f.path,
            content=truncated,
            size=file_size,
            is_entry_point=is_entry_point(f.path),
        ))
        total_size += file_size

    logger.info("Selected %d files, total size %d/%d bytes", len(selected), total_size, budget)
    return selected


__all__ = [
    "select_key_files",
    "SelectedFile",
    "DEFAULT_BUDGET",
    "DEFAULT_MAX_CHARS_PER_FILE",
    "DEFAULT_ENTRY_PATTERNS",
]
