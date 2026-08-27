"""Tests for key file selector."""

import pytest

from backend.app.core.github_client import GitHubFile, FileType
from backend.app.core.key_file_selector import (
    select_key_files,
    SelectedFile,
    DEFAULT_BUDGET,
    DEFAULT_MAX_CHARS_PER_FILE,
    DEFAULT_ENTRY_PATTERNS,
)


def make_file(path: str, content: str = "", size: int | None = None) -> GitHubFile:
    return GitHubFile(
        path=path,
        type=FileType.FILE,
        size=size or len(content),
        content=content if content else None,
    )


class TestSelectKeyFiles:
    """Priority 1: Basic functionality."""

    def test_empty_list(self):
        result = select_key_files([])
        assert result == []

    def test_single_file_within_budget(self):
        files = [make_file("main.py", "print('hello')")]
        result = select_key_files(files)
        assert len(result) == 1
        assert result[0].path == "main.py"
        assert result[0].content == "print('hello')"

    def test_content_already_truncated(self):
        content = "x" * 20_000
        files = [make_file("big.py", content)]
        result = select_key_files(files, max_chars_per_file=5000)
        assert len(result) == 1
        assert len(result[0].content) == 5000
        assert result[0].size == 5000

    def test_budget_enforced(self):
        content = "x" * 5000
        files = [make_file(f"file{i}.py", content) for i in range(50)]
        result = select_key_files(files, budget=50_000, max_chars_per_file=10_000)
        total = sum(f.size for f in result)
        assert total <= 50_000


class TestEntryPointPriority:
    """Priority 2: Entry point patterns."""

    def test_entry_points_selected_first(self):
        files = [
            make_file("utils/helper.py", "helper"),
            make_file("main.py", "main entry"),
            make_file("README.md", "docs"),
        ]
        result = select_key_files(files)
        assert result[0].path == "main.py"
        assert result[0].is_entry_point is True

    def test_regex_pattern_matching(self):
        files = [
            make_file("src/app.py", "app"),
            make_file("lib/util.py", "util"),
            make_file("data/raw.txt", "data"),
        ]
        result = select_key_files(files)
        paths = [f.path for f in result]
        assert "src/app.py" in paths
        assert "lib/util.py" in paths

    def test_custom_entry_patterns(self):
        files = [
            make_file("custom_entry.xyz", "custom"),
            make_file("other.txt", "other"),
        ]
        result = select_key_files(files, entry_patterns=[r"custom_entry\.xyz"])
        assert len(result) >= 1
        assert result[0].path == "custom_entry.xyz"


class TestBudgetEnforcement:
    """Priority 3: Budget enforcement."""

    def test_strict_budget_limit(self):
        content = "a" * 5000
        files = [make_file(f"f{i}.py", content) for i in range(100)]
        result = select_key_files(files, budget=30_000, max_chars_per_file=5000)
        total = sum(f.size for f in result)
        assert total <= 30_000

    def test_large_file_partial_inclusion(self):
        content = "b" * 100_000
        files = [make_file("large.py", content)]
        result = select_key_files(files, budget=10_000, max_chars_per_file=50_000)
        assert len(result) == 1
        assert result[0].size <= 10_000

    def test_zero_budget(self):
        files = [make_file("test.py", "content")]
        result = select_key_files(files, budget=0)
        assert len(result) == 0

    def test_budget_with_various_sizes(self):
        files = [
            make_file("tiny.py", "x"),
            make_file("small.py", "x" * 100),
            make_file("medium.py", "x" * 1000),
            make_file("large.py", "x" * 5000),
        ]
        result = select_key_files(files, budget=1500)
        total = sum(f.size for f in result)
        assert total <= 1500


class TestEdgeCases:
    """Priority 4: Edge cases."""

    def test_file_without_content(self):
        files = [GitHubFile(path="no_content.py", type=FileType.FILE, size=100, content=None)]
        result = select_key_files(files)
        assert len(result) == 1
        assert result[0].content == ""

    def test_entry_point_at_budget_boundary(self):
        files = [
            make_file("entry.py", "entry"),
            make_file("other.py", "x" * 5000),
        ]
        result = select_key_files(files, budget=10)
        assert result[0].is_entry_point is True

    def test_all_files_entry_points(self):
        files = [make_file(f"file{i}.py", "x" * 100) for i in range(10)]
        result = select_key_files(files, budget=200)
        total = sum(f.size for f in result)
        assert total <= 200

    def test_none_patterns_uses_default(self):
        files = [make_file("main.py", "main")]
        result = select_key_files(files, entry_patterns=None)
        assert len(result) == 1
        assert result[0].is_entry_point is True


class TestDefaults:
    """Verify default values."""

    def test_default_budget(self):
        assert DEFAULT_BUDGET == 80_000

    def test_default_max_chars(self):
        assert DEFAULT_MAX_CHARS_PER_FILE == 10_000

    def test_default_patterns_not_empty(self):
        assert len(DEFAULT_ENTRY_PATTERNS) > 0
        assert any(r"^main\.py$" in p for p in DEFAULT_ENTRY_PATTERNS)
        assert any(".py" in p for p in DEFAULT_ENTRY_PATTERNS)
