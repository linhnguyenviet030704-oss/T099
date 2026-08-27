"""Tests for GitHub API client - standalone without app imports."""

import asyncio
import time
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.app.core.github_client import (
    BINARY_EXTENSIONS,
    MAX_CONTENT_SIZE,
    CircuitBreaker,
    FileType,
    GitHubAPIError,
    GitHubClient,
    GitHubFile,
    GitHubNotFoundError,
    GitHubRateLimitError,
)


class TestGitHubFile(unittest.TestCase):
    def test_from_tree_entry_file(self):
        entry = {"path": "README.md", "type": "blob", "size": 100, "sha": "abc123"}
        git_file = GitHubFile.from_tree_entry(entry)
        self.assertEqual(git_file.path, "README.md")
        self.assertEqual(git_file.type, FileType.FILE)
        self.assertEqual(git_file.size, 100)
        self.assertEqual(git_file.sha, "abc123")

    def test_from_tree_entry_directory(self):
        entry = {"path": "src", "type": "tree", "sha": "def456"}
        git_file = GitHubFile.from_tree_entry(entry)
        self.assertEqual(git_file.path, "src")
        self.assertEqual(git_file.type, FileType.DIRECTORY)
        self.assertEqual(git_file.sha, "def456")

    def test_from_tree_entry_submodule(self):
        entry = {"path": "lib/submodule", "type": "submodule", "sha": "abc123", "size": 40}
        git_file = GitHubFile.from_tree_entry(entry)
        self.assertEqual(git_file.path, "lib/submodule")
        self.assertEqual(git_file.type, FileType.SUBMODULE)
        self.assertEqual(git_file.sha, "abc123")

    def test_from_tree_entry_missing_fields(self):
        entry = {"path": "test.txt"}
        git_file = GitHubFile.from_tree_entry(entry)
        self.assertEqual(git_file.path, "test.txt")
        self.assertIsNone(git_file.size)
        self.assertIsNone(git_file.sha)

    def test_from_tree_entry_unknown_type_defaults_to_file(self):
        entry = {"path": "weird", "type": "unknown", "sha": "xyz"}
        git_file = GitHubFile.from_tree_entry(entry)
        self.assertEqual(git_file.type, FileType.FILE)


class TestCircuitBreaker(unittest.TestCase):
    def test_initial_state_is_closed(self):
        cb = CircuitBreaker()
        self.assertEqual(cb._state, "closed")

    def test_success_resets_failures(self):
        cb = CircuitBreaker(failure_threshold=3)
        cb._failures = 2
        cb._record_success()
        self.assertEqual(cb._failures, 0)
        self.assertEqual(cb._state, "closed")

    def test_failure_threshold_opens_circuit(self):
        cb = CircuitBreaker(failure_threshold=3)
        cb._record_failure()
        self.assertEqual(cb._failures, 1)
        cb._record_failure()
        self.assertEqual(cb._failures, 2)
        cb._record_failure()
        self.assertEqual(cb._state, "open")
        self.assertEqual(cb._failures, 3)

    def test_open_blocks_execution(self):
        cb = CircuitBreaker(failure_threshold=1)
        cb._record_failure()
        self.assertEqual(cb._state, "open")
        self.assertFalse(cb._can_execute())

    def test_half_open_after_recovery_timeout(self):
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout=0.1)
        cb._record_failure()
        self.assertEqual(cb._state, "open")
        time.sleep(0.15)
        self.assertTrue(cb._can_execute())
        self.assertEqual(cb._state, "half_open")

    def test_execute_success(self):
        cb = CircuitBreaker()
        result = cb.execute(AsyncMock(return_value="ok"))
        self.assertEqual(asyncio.run(result), "ok")

    def test_execute_failure_records(self):
        cb = CircuitBreaker(failure_threshold=3)
        for _ in range(3):
            try:
                asyncio.run(cb.execute(AsyncMock(side_effect=ValueError("boom"))))
            except ValueError:
                pass
        self.assertEqual(cb._state, "open")


class TestGitHubClient(unittest.TestCase):
    def test_client_initialization(self):
        client = GitHubClient(token="test-token")
        self.assertEqual(client.token, "test-token")
        self.assertEqual(client.api_url, "https://api.github.com")
        self.assertEqual(client.timeout, 30.0)

    def test_client_custom_api_url(self):
        client = GitHubClient(api_url="https://github.example.com/api/v3")
        self.assertEqual(client.api_url, "https://github.example.com/api/v3")

    def test_get_headers_without_token(self):
        client = GitHubClient()
        headers = client._get_headers()
        self.assertNotIn("Authorization", headers)
        self.assertEqual(headers["Accept"], "application/vnd.github.v3+json")

    def test_get_headers_with_token(self):
        client = GitHubClient(token="ghp_test")
        headers = client._get_headers()
        self.assertEqual(headers["Authorization"], "Bearer ghp_test")


class TestBinaryFiltering(unittest.TestCase):
    def test_binary_extensions_defined(self):
        self.assertIn(".png", BINARY_EXTENSIONS)
        self.assertIn(".jpg", BINARY_EXTENSIONS)
        self.assertIn(".exe", BINARY_EXTENSIONS)
        self.assertIn(".pdf", BINARY_EXTENSIONS)
        self.assertNotIn(".py", BINARY_EXTENSIONS)
        self.assertNotIn(".md", BINARY_EXTENSIONS)

    def test_max_content_size(self):
        self.assertEqual(MAX_CONTENT_SIZE, 1_000_000)

    def test_text_extensions_not_binary(self):
        self.assertNotIn(".py", BINARY_EXTENSIONS)
        self.assertNotIn(".js", BINARY_EXTENSIONS)
        self.assertNotIn(".ts", BINARY_EXTENSIONS)
        self.assertNotIn(".md", BINARY_EXTENSIONS)


class TestProactiveRateLimitSleep(unittest.TestCase):
    def test_sleep_when_limited_to_zero(self):
        client = GitHubClient()
        client._rate_limit_remaining = 0
        client._rate_limit_reset = time.time() + 0.1
        start = time.time()
        asyncio.run(client._proactive_rate_limit_sleep())
        elapsed = time.time() - start
        self.assertGreaterEqual(elapsed, 0.05)

    def test_sleep_when_limited_to_one(self):
        """Issue #5 fix: should sleep when remaining <= 1."""
        client = GitHubClient()
        client._rate_limit_remaining = 1
        client._rate_limit_reset = time.time() + 0.1
        start = time.time()
        asyncio.run(client._proactive_rate_limit_sleep())
        elapsed = time.time() - start
        self.assertGreaterEqual(elapsed, 0.05)

    def test_no_sleep_when_plenty_remaining(self):
        client = GitHubClient()
        client._rate_limit_remaining = 100
        start = time.time()
        asyncio.run(client._proactive_rate_limit_sleep())
        elapsed = time.time() - start
        self.assertLess(elapsed, 0.05)


class TestCircuitBreakerIntegration(unittest.IsolatedAsyncioTestCase):
    async def test_circuit_breaker_open_fails_fast_without_retry(self):
        """Issue #1 fix: circuit breaker check is BEFORE retry loop."""
        client = GitHubClient(token="test")
        client._circuit_breaker._state = "open"
        client._circuit_breaker._opened_at = time.monotonic()

        start = time.time()
        with self.assertRaises(GitHubAPIError) as ctx:
            await client._request_with_retries("GET", "http://test.com")

        elapsed = time.time() - start
        self.assertIn("Circuit breaker is OPEN", str(ctx.exception))
        self.assertLess(elapsed, 0.5)

    async def test_circuit_breaker_check_before_rate_limit(self):
        """Issue #2 fix: GitHubAPIError from circuit doesn't bypass rate limit handling."""
        client = GitHubClient(token="test")
        client._circuit_breaker._state = "open"
        client._circuit_breaker._opened_at = time.monotonic()

        with self.assertRaises(GitHubAPIError) as ctx:
            await client._request_with_retries("GET", "http://test.com")

        self.assertIn("Circuit breaker is OPEN", str(ctx.exception))


class TestParseGitmodules(unittest.TestCase):
    def test_parse_gitmodules_finds_file(self):
        """Issue #6 fix: check for .gitmodules path existence."""
        client = GitHubClient()
        tree_data = {"tree": [{"path": ".gitmodules", "type": "blob", "sha": "abc123"}]}
        result = client._parse_gitmodules(tree_data)
        self.assertTrue(result)

    def test_parse_gitmodules_not_found(self):
        client = GitHubClient()
        tree_data = {"tree": [{"path": "README.md", "type": "blob", "sha": "abc123"}]}
        result = client._parse_gitmodules(tree_data)
        self.assertFalse(result)

    def test_parse_gitmodules_empty_tree(self):
        client = GitHubClient()
        tree_data = {"tree": []}
        result = client._parse_gitmodules(tree_data)
        self.assertFalse(result)


class TestGetRepoTreeSubmodule(unittest.TestCase):
    async def test_get_repo_tree_detects_submodule_path(self):
        """Submodule detection via .gitmodules path."""
        client = GitHubClient(token="test")

        mock_response = MagicMock()
        mock_response.headers = {}
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "tree": [
                {"path": ".gitmodules", "type": "blob", "sha": "abc123", "size": 100},
                {"path": "lib/sub", "type": "blob", "sha": "def456", "size": 50},
            ]
        }

        with patch.object(client, "_get") as mock_get:
            mock_get.return_value = mock_response.json.return_value
            files = await client.get_repo_tree("owner", "repo")

            gitmodules = next(f for f in files if f.path == ".gitmodules")
            self.assertTrue(gitmodules.submodule)


class TestExceptions(unittest.TestCase):
    def test_github_api_error(self):
        exc = GitHubAPIError("Test error", status_code=500)
        self.assertEqual(exc.message, "Test error")
        self.assertEqual(exc.status_code, 500)

    def test_github_rate_limit_error(self):
        exc = GitHubRateLimitError(retry_after=60)
        self.assertEqual(exc.retry_after, 60)
        self.assertEqual(exc.status_code, 403)

    def test_github_rate_limit_error_no_retry(self):
        exc = GitHubRateLimitError()
        self.assertIsNone(exc.retry_after)

    def test_github_not_found_error(self):
        exc = GitHubNotFoundError()
        self.assertEqual(exc.status_code, 404)
        self.assertIn("not found", str(exc).lower())

    def test_github_not_found_error_custom_message(self):
        exc = GitHubNotFoundError("Custom not found")
        self.assertIn("Custom not found", str(exc))


if __name__ == "__main__":
    unittest.main(verbosity=2)
