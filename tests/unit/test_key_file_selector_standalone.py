"""Standalone test runner for key file selector - no app imports required."""

import sys
sys.path.insert(0, '.')

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


def run_tests():
    passed = 0
    failed = 0
    
    # === TestSelectKeyFiles ===
    print("=== TestSelectKeyFiles ===")
    
    # test_empty_list
    try:
        result = select_key_files([])
        assert result == [], f"Expected [], got {result}"
        print("  test_empty_list: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_empty_list: FAIL - {e}")
        failed += 1
    
    # test_single_file_within_budget
    try:
        files = [make_file("main.py", "print('hello')")]
        result = select_key_files(files)
        assert len(result) == 1, f"Expected 1, got {len(result)}"
        assert result[0].path == "main.py"
        assert result[0].content == "print('hello')"
        print("  test_single_file_within_budget: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_single_file_within_budget: FAIL - {e}")
        failed += 1
    
    # test_content_already_truncated
    try:
        content = "x" * 20_000
        files = [make_file("big.py", content)]
        result = select_key_files(files, max_chars_per_file=5000)
        assert len(result) == 1, f"Expected 1, got {len(result)}"
        assert len(result[0].content) == 5000, f"Expected 5000, got {len(result[0].content)}"
        assert result[0].size == 5000, f"Expected 5000, got {result[0].size}"
        print("  test_content_already_truncated: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_content_already_truncated: FAIL - {e}")
        failed += 1
    
    # test_budget_enforced
    try:
        content = "x" * 5000
        files = [make_file(f"file{i}.py", content) for i in range(50)]
        result = select_key_files(files, budget=50_000, max_chars_per_file=10_000)
        total = sum(f.size for f in result)
        assert total <= 50_000, f"Expected total <= 50000, got {total}"
        print("  test_budget_enforced: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_budget_enforced: FAIL - {e}")
        failed += 1
    
    # === TestEntryPointPriority ===
    print("=== TestEntryPointPriority ===")
    
    # test_entry_points_selected_first
    try:
        files = [
            make_file("utils/helper.py", "helper"),
            make_file("main.py", "main entry"),
            make_file("README.md", "docs"),
        ]
        result = select_key_files(files)
        assert result[0].path == "main.py", f"Expected main.py first, got {result[0].path}"
        assert result[0].is_entry_point is True, f"Expected is_entry_point=True"
        print("  test_entry_points_selected_first: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_entry_points_selected_first: FAIL - {e}")
        failed += 1
    
    # test_regex_pattern_matching
    try:
        files = [
            make_file("src/app.py", "app"),
            make_file("lib/util.py", "util"),
            make_file("data/raw.txt", "data"),
        ]
        result = select_key_files(files)
        paths = [f.path for f in result]
        assert "src/app.py" in paths, f"Expected src/app.py in paths, got {paths}"
        assert "lib/util.py" in paths, f"Expected lib/util.py in paths, got {paths}"
        print("  test_regex_pattern_matching: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_regex_pattern_matching: FAIL - {e}")
        failed += 1
    
    # test_custom_entry_patterns
    try:
        files = [
            make_file("custom_entry.xyz", "custom"),
            make_file("other.txt", "other"),
        ]
        result = select_key_files(files, entry_patterns=[r"custom_entry\.xyz"])
        assert len(result) >= 1, f"Expected at least 1, got {len(result)}"
        assert result[0].path == "custom_entry.xyz", f"Expected custom_entry.xyz first, got {result[0].path}"
        print("  test_custom_entry_patterns: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_custom_entry_patterns: FAIL - {e}")
        failed += 1
    
    # === TestBudgetEnforcement ===
    print("=== TestBudgetEnforcement ===")
    
    # test_strict_budget_limit
    try:
        content = "a" * 5000
        files = [make_file(f"f{i}.py", content) for i in range(100)]
        result = select_key_files(files, budget=30_000, max_chars_per_file=5000)
        total = sum(f.size for f in result)
        assert total <= 30_000, f"Expected total <= 30000, got {total}"
        print("  test_strict_budget_limit: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_strict_budget_limit: FAIL - {e}")
        failed += 1
    
    # test_large_file_partial_inclusion
    try:
        content = "b" * 100_000
        files = [make_file("large.py", content)]
        result = select_key_files(files, budget=10_000, max_chars_per_file=50_000)
        assert len(result) == 1, f"Expected 1, got {len(result)}"
        assert result[0].size <= 10_000, f"Expected size <= 10000, got {result[0].size}"
        print("  test_large_file_partial_inclusion: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_large_file_partial_inclusion: FAIL - {e}")
        failed += 1
    
    # test_zero_budget
    try:
        files = [make_file("test.py", "content")]
        result = select_key_files(files, budget=0)
        assert len(result) == 0, f"Expected 0, got {len(result)}"
        print("  test_zero_budget: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_zero_budget: FAIL - {e}")
        failed += 1
    
    # test_budget_with_various_sizes
    try:
        files = [
            make_file("tiny.py", "x"),
            make_file("small.py", "x" * 100),
            make_file("medium.py", "x" * 1000),
            make_file("large.py", "x" * 5000),
        ]
        result = select_key_files(files, budget=1500)
        total = sum(f.size for f in result)
        assert total <= 1500, f"Expected total <= 1500, got {total}"
        print("  test_budget_with_various_sizes: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_budget_with_various_sizes: FAIL - {e}")
        failed += 1
    
    # === TestEdgeCases ===
    print("=== TestEdgeCases ===")
    
    # test_file_without_content
    try:
        files = [GitHubFile(path="no_content.py", type=FileType.FILE, size=100, content=None)]
        result = select_key_files(files)
        assert len(result) == 1, f"Expected 1, got {len(result)}"
        assert result[0].content == "", f"Expected empty content, got {result[0].content!r}"
        print("  test_file_without_content: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_file_without_content: FAIL - {e}")
        failed += 1
    
    # test_entry_point_at_budget_boundary
    try:
        files = [
            make_file("entry.py", "entry"),
            make_file("other.py", "x" * 5000),
        ]
        result = select_key_files(files, budget=10)
        assert result[0].is_entry_point is True, f"Expected entry.py first"
        print("  test_entry_point_at_budget_boundary: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_entry_point_at_budget_boundary: FAIL - {e}")
        failed += 1
    
    # test_all_files_entry_points
    try:
        files = [make_file(f"file{i}.py", "x" * 100) for i in range(10)]
        result = select_key_files(files, budget=200)
        total = sum(f.size for f in result)
        assert total <= 200, f"Expected total <= 200, got {total}"
        print("  test_all_files_entry_points: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_all_files_entry_points: FAIL - {e}")
        failed += 1
    
    # test_none_patterns_uses_default
    try:
        files = [make_file("main.py", "main")]
        result = select_key_files(files, entry_patterns=None)
        assert len(result) == 1, f"Expected 1, got {len(result)}"
        assert result[0].is_entry_point is True, f"Expected is_entry_point=True with defaults"
        print("  test_none_patterns_uses_default: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_none_patterns_uses_default: FAIL - {e}")
        failed += 1
    
    # === TestDefaults ===
    print("=== TestDefaults ===")
    
    # test_default_budget
    try:
        assert DEFAULT_BUDGET == 80_000, f"Expected 80000, got {DEFAULT_BUDGET}"
        print("  test_default_budget: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_default_budget: FAIL - {e}")
        failed += 1
    
    # test_default_max_chars
    try:
        assert DEFAULT_MAX_CHARS_PER_FILE == 10_000, f"Expected 10000, got {DEFAULT_MAX_CHARS_PER_FILE}"
        print("  test_default_max_chars: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_default_max_chars: FAIL - {e}")
        failed += 1
    
    # test_default_patterns_not_empty
    try:
        assert len(DEFAULT_ENTRY_PATTERNS) > 0, "Expected non-empty patterns"
        assert any(r"^main\.py$" in p for p in DEFAULT_ENTRY_PATTERNS), "Expected main.py pattern"
        assert any(".py" in p for p in DEFAULT_ENTRY_PATTERNS), "Expected .py pattern"
        print("  test_default_patterns_not_empty: PASS")
        passed += 1
    except Exception as e:
        print(f"  test_default_patterns_not_empty: FAIL - {e}")
        failed += 1
    
    print(f"\n=== Results: {passed} passed, {failed} failed ===")
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
