"""Tests for GitHub API client."""

import httpx
import pytest

from backend.app.core.github_client import (
    CircuitBreaker,
    FileType,
    GitHubAPIError,
    GitHubClient,
    GitHubFile,
    GitHubNotFoundError,
    GitHubRateLimitError,
)


class TestGitHubFile:
    def test_from_tree_entry_file(self):
        entry = {"path": "README.md", "type": "blob", "size": 100, "sha": "abc123"}
        git_file = GitHubFile.from_tree_entry(entry)
        assert git_file.path == "README.md"
        assert git_file.type == FileType.FILE
        assert git_file.size == 100
        assert git_file.sha == "abc123"

    def test_from_tree_entry_directory(self):
        entry = {"path": "src", "type": "tree", "sha": "def456"}
        git_file = GitHubFile.from_tree_entry(entry)
        assert git_file.path == "src"
        assert git_file.type == FileType.DIRECTORY
        assert git_file.sha == "def456"

    def test_from_tree_entry_missing_fields(self):
        entry = {"path": "test.txt"}
        git_file = GitHubFile.from_tree_entry(entry)
        assert git_file.path == "test.txt"
        assert git_file.size is None
        assert git_file.sha is None


class TestCircuitBreaker:
    def test_initial_state_is_closed(self):
        cb = CircuitBreaker()
        assert cb._state == "closed"

    def test_success_resets_failures(self):
        cb = CircuitBreaker(failure_threshold=3)
        cb._failures = 2
        cb._record_success()
        assert cb._failures == 0
        assert cb._state == "closed"

    def test_failure_threshold_opens_circuit(self):
        cb = CircuitBreaker(failure_threshold=3)
        cb._record_failure()
        assert cb._failures == 1
        cb._record_failure()
        assert cb._failures == 2
        cb._record_failure()
        assert cb._state == "open"
        assert cb._failures == 3

    @pytest.mark.asyncio
    async def test_open_blocks_execution(self):
        cb = CircuitBreaker(failure_threshold=1)
        cb._record_failure()
        assert cb._state == "open"
        assert not cb._can_execute()

    @pytest.mark.asyncio
    async def test_execute_success(self):
        cb = CircuitBreaker()

        async def success_fn():
            return "ok"

        result = await cb.execute(success_fn)
        assert result == "ok"

    @pytest.mark.asyncio
    async def test_execute_failure_records(self):
        cb = CircuitBreaker(failure_threshold=3)

        async def fail_fn():
            raise ValueError("boom")

        for _ in range(3):
            try:
                await cb.execute(fail_fn)
            except ValueError:
                pass
        assert cb._state == "open"


class TestGitHubClient:
    def test_client_initialization(self):
        client = GitHubClient(token="test-token")
        assert client.token == "test-token"
        assert client.api_url == "https://api.github.com"
        assert client.timeout == 30.0

    def test_client_custom_api_url(self):
        client = GitHubClient(api_url="https://github.example.com/api/v3")
        assert client.api_url == "https://github.example.com/api/v3"

    def test_get_headers_without_token(self):
        client = GitHubClient()
        headers = client._get_headers()
        assert "Authorization" not in headers
        assert headers["Accept"] == "application/vnd.github.v3+json"

    def test_get_headers_with_token(self):
        client = GitHubClient(token="ghp_test")
        headers = client._get_headers()
        assert headers["Authorization"] == "Bearer ghp_test"

    def test_update_rate_limits(self):
        client = GitHubClient()
        headers = httpx.Headers({
            "x-ratelimit-remaining": "42",
            "x-ratelimit-reset": "1234567890.0",
        })
        client._update_rate_limits(headers)
        assert client._rate_limit_remaining == 42
        assert client._rate_limit_reset == 1234567890.0

    def test_rate_limit_remaining_default(self):
        client = GitHubClient()
        assert client._rate_limit_remaining == 5000

    @pytest.mark.asyncio
    async def test_proactive_rate_limit_sleep_when_limited(self):
        import time
        client = GitHubClient()
        client._rate_limit_remaining = 0
        client._rate_limit_reset = time.time() + 0.1
        start = time.time()
        await client._proactive_rate_limit_sleep()
        elapsed = time.time() - start
        assert elapsed >= 0.05

    @pytest.mark.asyncio
    async def test_proactive_rate_limit_sleep_no_limit(self):
        import time
        client = GitHubClient()
        client._rate_limit_remaining = 100
        start = time.time()
        await client._proactive_rate_limit_sleep()
        elapsed = time.time() - start
        assert elapsed < 0.05

    @pytest.mark.asyncio
    async def test_close_without_client(self):
        client = GitHubClient()
        await client.close()

    @pytest.mark.asyncio
    async def test_get_text_file_decodes_base64(self, respx_mock):
        import httpx
        import base64

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        test_content = "Hello, World!"
        encoded = base64.b64encode(test_content.encode()).decode()

        with respx_mock:
            route = respx.get("https://api.github.com/repos/owner/repo/contents/test.txt")
            route.return_value = httpx.Response(
                200,
                json={"content": encoded, "encoding": "base64"},
            )

            content = await client.get_text_file("owner", "repo", "test.txt")
            assert content == test_content

        await client.close()

    @pytest.mark.asyncio
    async def test_get_text_file_404_raises(self, respx_mock):
        import httpx

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        with respx_mock:
            respx.get("https://api.github.com/repos/owner/repo/contents/missing.txt").mock(
                return_value=httpx.Response(404, json={"message": "Not Found"})
            )
            with pytest.raises(GitHubNotFoundError):
                await client.get_text_file("owner", "repo", "missing.txt")

        await client.close()


class TestGitHubClientGetRepoTree:
    @pytest.mark.asyncio
    async def test_get_repo_tree_parses_entries(self, respx_mock):
        import httpx

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        tree_response = {
            "tree": [
                {"path": ".gitmodules", "type": "blob", "sha": "abc123", "size": 50},
                {"path": "README.md", "type": "blob", "sha": "def456", "size": 100},
                {"path": "src", "type": "tree", "sha": "ghi789"},
            ]
        }

        with respx_mock:
            respx.get("https://api.github.com/repos/owner/repo/git/trees/HEAD").mock(
                return_value=httpx.Response(200, json=tree_response)
            )

            files = await client.get_repo_tree("owner", "repo")
            assert len(files) == 3

            paths = [f.path for f in files]
            assert ".gitmodules" in paths
            assert "README.md" in paths
            assert "src" in paths

            readme = next(f for f in files if f.path == "README.md")
            assert readme.type == FileType.FILE
            assert readme.size == 100

            src = next(f for f in files if f.path == "src")
            assert src.type == FileType.DIRECTORY

        await client.close()

    @pytest.mark.asyncio
    async def test_get_repo_tree_detects_submodules(self, respx_mock):
        import httpx

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        tree_response = {
            "tree": [
                {"path": ".gitmodules", "type": "blob", "sha": "abc123", "size": 100},
                {"path": "lib/submodule", "type": "blob", "sha": "def456", "size": 50},
            ]
        }

        with respx_mock:
            respx.get("https://api.github.com/repos/owner/repo/git/trees/HEAD").mock(
                return_value=httpx.Response(200, json=tree_response)
            )

            files = await client.get_repo_tree("owner", "repo")
            submodule = next(f for f in files if f.path == ".gitmodules")
            assert submodule.submodule is True

        await client.close()

    @pytest.mark.asyncio
    async def test_get_repo_tree_no_submodules(self, respx_mock):
        import httpx

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        tree_response = {
            "tree": [
                {"path": "README.md", "type": "blob", "sha": "abc123", "size": 100},
            ]
        }

        with respx_mock:
            respx.get("https://api.github.com/repos/owner/repo/git/trees/HEAD").mock(
                return_value=httpx.Response(200, json=tree_response)
            )

            files = await client.get_repo_tree("owner", "repo")
            readme = files[0]
            assert readme.submodule is False

        await client.close()


class TestGitHubClientRepoMethods:
    @pytest.mark.asyncio
    async def test_list_repos(self, respx_mock):
        import httpx

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        repos_response = [
            {"name": "repo1", "full_name": "owner/repo1"},
            {"name": "repo2", "full_name": "owner/repo2"},
        ]

        with respx_mock:
            respx.get("https://api.github.com/users/owner/repos").mock(
                return_value=httpx.Response(200, json=repos_response)
            )

            repos = await client.list_repos("owner")
            assert len(repos) == 2
            assert repos[0]["name"] == "repo1"

        await client.close()

    @pytest.mark.asyncio
    async def test_get_repo_info(self, respx_mock):
        import httpx

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        repo_info = {"name": "test-repo", "description": "A test repository"}

        with respx_mock:
            respx.get("https://api.github.com/repos/owner/repo").mock(
                return_value=httpx.Response(200, json=repo_info)
            )

            info = await client.get_repo_info("owner", "repo")
            assert info["name"] == "test-repo"

        await client.close()

    @pytest.mark.asyncio
    async def test_get_readme_success(self, respx_mock):
        import httpx
        import base64

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        readme_content = "# Test README"
        encoded = base64.b64encode(readme_content.encode()).decode()

        with respx_mock:
            respx.get("https://api.github.com/repos/owner/repo/contents/README.md").mock(
                return_value=httpx.Response(200, json={"content": encoded, "encoding": "base64"})
            )

            readme = await client.get_readme("owner", "repo")
            assert readme == readme_content

        await client.close()

    @pytest.mark.asyncio
    async def test_get_readme_not_found_returns_none(self, respx_mock):
        import httpx

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        with respx_mock:
            respx.get("https://api.github.com/repos/owner/repo/contents/README.md").mock(
                return_value=httpx.Response(404, json={"message": "Not Found"})
            )

            readme = await client.get_readme("owner", "repo")
            assert readme is None

        await client.close()

    @pytest.mark.asyncio
    async def test_repo_has_submodules_true(self, respx_mock):
        import httpx

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        tree_response = {
            "tree": [
                {"path": ".gitmodules", "type": "blob", "sha": "abc123", "size": 50},
            ]
        }

        with respx_mock:
            respx.get("https://api.github.com/repos/owner/repo/git/trees/HEAD").mock(
                return_value=httpx.Response(200, json=tree_response)
            )

            has_submodules = await client.repo_has_submodules("owner", "repo")
            assert has_submodules is True

        await client.close()

    @pytest.mark.asyncio
    async def test_repo_has_submodules_false(self, respx_mock):
        import httpx

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        tree_response = {
            "tree": [
                {"path": "README.md", "type": "blob", "sha": "abc123", "size": 50},
            ]
        }

        with respx_mock:
            respx.get("https://api.github.com/repos/owner/repo/git/trees/HEAD").mock(
                return_value=httpx.Response(200, json=tree_response)
            )

            has_submodules = await client.repo_has_submodules("owner", "repo")
            assert has_submodules is False

        await client.close()

    @pytest.mark.asyncio
    async def test_repo_has_submodules_on_error_returns_false(self, respx_mock):
        import httpx

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        with respx_mock:
            respx.get("https://api.github.com/repos/owner/nonexistent/git/trees/HEAD").mock(
                return_value=httpx.Response(404, json={"message": "Not Found"})
            )

            has_submodules = await client.repo_has_submodules("owner", "nonexistent")
            assert has_submodules is False

        await client.close()


class TestGitHubClientCircuitBreakerIntegration:
    @pytest.mark.asyncio
    async def test_circuit_breaker_opens_on_failures(self, respx_mock):
        import httpx

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        with respx_mock:
            route = respx.get("https://api.github.com/repos/owner/repo/contents/test.txt")
            route.side_effect = httpx.HTTPStatusError(
                "Server error",
                request=httpx.Request("GET", "https://api.github.com/repos/owner/repo/contents/test.txt"),
                response=httpx.Response(500),
            )

            for _ in range(5):
                try:
                    await client.get_text_file("owner", "repo", "test.txt")
                except GitHubAPIError:
                    pass

            assert client._circuit_breaker._state == "open"

        await client.close()


class TestGitHubExceptions:
    def test_github_api_error(self):
        exc = GitHubAPIError("Test error", status_code=500)
        assert exc.message == "Test error"
        assert exc.status_code == 500

    def test_github_rate_limit_error(self):
        exc = GitHubRateLimitError(retry_after=60)
        assert exc.retry_after == 60
        assert exc.status_code == 403

    def test_github_rate_limit_error_no_retry(self):
        exc = GitHubRateLimitError()
        assert exc.retry_after is None

    def test_github_not_found_error(self):
        exc = GitHubNotFoundError()
        assert exc.status_code == 404
        assert "not found" in str(exc).lower()

    def test_github_not_found_error_custom_message(self):
        exc = GitHubNotFoundError("Custom not found")
        assert "Custom not found" in str(exc)


class TestGitHubFileSubmoduleType:
    def test_from_tree_entry_submodule(self):
        entry = {"path": "lib/submodule", "type": "submodule", "sha": "abc123", "size": 40}
        git_file = GitHubFile.from_tree_entry(entry)
        assert git_file.path == "lib/submodule"
        assert git_file.type == FileType.SUBMODULE
        assert git_file.sha == "abc123"

    def test_from_tree_entry_submodule_unknown_type_defaults_to_file(self):
        entry = {"path": "weird", "type": "unknown", "sha": "xyz"}
        git_file = GitHubFile.from_tree_entry(entry)
        assert git_file.type == FileType.FILE


class TestBinaryFiltering:
    @pytest.mark.asyncio
    async def test_get_text_file_skips_binary_by_extension(self, respx_mock):
        import httpx

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        with respx_mock:
            respx.get("https://api.github.com/repos/owner/repo/contents/image.png").mock(
                return_value=httpx.Response(200, json={"content": "fake", "encoding": "base64"})
            )

            content = await client.get_text_file("owner", "repo", "image.png")
            assert content == ""

        await client.close()

    @pytest.mark.asyncio
    async def test_get_text_file_skips_oversized_files(self, respx_mock):
        import httpx

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        with respx_mock:
            respx.get("https://api.github.com/repos/owner/repo/contents/large.txt").mock(
                return_value=httpx.Response(200, json={"content": "fake", "encoding": "base64", "size": 2_000_000})
            )

            content = await client.get_text_file("owner", "repo", "large.txt")
            assert content == ""

        await client.close()

    @pytest.mark.asyncio
    async def test_get_text_file_allows_text_file(self, respx_mock):
        import httpx
        import base64

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        test_content = "print('hello')"
        encoded = base64.b64encode(test_content.encode()).decode()

        with respx_mock:
            respx.get("https://api.github.com/repos/owner/repo/contents/main.py").mock(
                return_value=httpx.Response(200, json={"content": encoded, "encoding": "base64", "size": 14})
            )

            content = await client.get_text_file("owner", "repo", "main.py")
            assert content == test_content

        await client.close()


class TestCircuitBreakerFastFail:
    @pytest.mark.asyncio
    async def test_circuit_breaker_open_fails_fast_without_retry(self, respx_mock):
        """When circuit is OPEN, request should fail immediately without entering retry loop."""
        import httpx
        import time

        client = GitHubClient(token="test")
        client._client = httpx.AsyncClient(
            headers=client._get_headers(),
            base_url=client.api_url,
        )

        client._circuit_breaker._state = "open"
        client._circuit_breaker._opened_at = time.monotonic()

        start = time.time()
        with respx_mock:
            respx.get("https://api.github.com/repos/owner/repo/contents/test.txt").mock(
                return_value=httpx.Response(200, json={"content": "", "encoding": "base64"})
            )

            with pytest.raises(GitHubAPIError) as exc_info:
                await client.get_text_file("owner", "repo", "test.txt")

            elapsed = time.time() - start
            assert "Circuit breaker is OPEN" in str(exc_info.value)
            assert elapsed < 0.5

        await client.close()
