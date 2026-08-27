"""GitHub API client with rate limiting, circuit breaker, and Trees API support."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import httpx

logger = logging.getLogger(__name__)


# === Exceptions ===

class GitHubAPIError(Exception):
    """Base exception for GitHub API errors."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class GitHubRateLimitError(GitHubAPIError):
    """Raised when GitHub rate limit is exceeded."""

    def __init__(self, retry_after: int | None = None) -> None:
        self.retry_after = retry_after
        super().__init__(
            f"GitHub API rate limit exceeded. Retry after {retry_after}s" if retry_after else "GitHub API rate limit exceeded",
            status_code=403,
        )


class GitHubNotFoundError(GitHubAPIError):
    """Raised when a resource is not found."""

    def __init__(self, message: str = "GitHub resource not found") -> None:
        super().__init__(message, status_code=404)


# === Circuit Breaker ===

_CB_STATE_OPEN = "open"
_CB_STATE_HALF_OPEN = "half_open"
_CB_STATE_CLOSED = "closed"


@dataclass
class CircuitBreaker:
    """Simple circuit breaker for GitHub API calls.

    States:
    - CLOSED: normal operation, requests pass through
    - OPEN: failures exceeded threshold, requests fail fast
    - HALF_OPEN: testing if service recovered
    """

    failure_threshold: int = 5
    recovery_timeout: float = 30.0
    half_open_max_calls: int = 3

    _failures: int = field(default=0, init=False)
    _state: str = field(default=_CB_STATE_CLOSED, init=False)
    _opened_at: float = field(default=0.0, init=False)
    _half_open_calls: int = field(default=0, init=False)

    def _record_success(self) -> None:
        self._failures = 0
        self._state = _CB_STATE_CLOSED
        self._half_open_calls = 0

    def _record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.failure_threshold:
            self._state = _CB_STATE_OPEN
            self._opened_at = time.monotonic()
            logger.warning("Circuit breaker OPEN after %d failures", self._failures)

    def _can_execute(self) -> bool:
        now = time.monotonic()
        if self._state == _CB_STATE_CLOSED:
            return True
        if self._state == _CB_STATE_OPEN:
            if now - self._opened_at >= self.recovery_timeout:
                self._state = _CB_STATE_HALF_OPEN
                self._half_open_calls = 0
                logger.info("Circuit breaker HALF_OPEN, testing recovery")
                return True
            return False
        if self._state == _CB_STATE_HALF_OPEN:
            if self._half_open_calls < self.half_open_max_calls:
                self._half_open_calls += 1
                return True
            return False
        return False

    async def execute[T](self, fn: Any) -> T:
        """Execute async function with circuit breaker protection."""
        if not self._can_execute():
            raise GitHubAPIError("Circuit breaker is OPEN, request blocked")
        try:
            result = await fn()
            if self._state == _CB_STATE_HALF_OPEN:
                self._record_success()
            elif self._state == _CB_STATE_CLOSED and self._failures > 0:
                self._record_success()
            return result
        except Exception as exc:
            self._record_failure()
            raise


# === Dataclasses ===

class FileType(Enum):
    FILE = "file"
    DIRECTORY = "dir"
    SUBMODULE = "submodule"
    SYMLINK = "symlink"


@dataclass
class GitHubFile:
    path: str
    type: FileType
    size: int | None = None
    sha: str | None = None
    content: str | None = None
    submodule: bool = False

    @classmethod
    def from_tree_entry(cls, entry: dict[str, Any]) -> GitHubFile:
        entry_type = entry.get("type", "blob")
        file_type = FileType.FILE if entry_type == "blob" else FileType.DIRECTORY
        return cls(
            path=entry.get("path", ""),
            type=file_type,
            size=entry.get("size"),
            sha=entry.get("sha"),
        )


# === Config ===

DEFAULT_GITHUB_API_URL = "https://api.github.com"
DEFAULT_TIMEOUT = 30.0


# === Client ===

_DEFAULT_HEADERS = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "RecruitmentPortal/1.0",
}


class GitHubClient:
    """GitHub API client with Trees API, rate limiting, and circuit breaker."""

    def __init__(
        self,
        token: str | None = None,
        api_url: str = DEFAULT_GITHUB_API_URL,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.token = token
        self.api_url = api_url.rstrip("/")
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None
        self._rate_limit_remaining: int = 5000
        self._rate_limit_reset: float = 0.0
        self._circuit_breaker = CircuitBreaker()

    def _get_headers(self) -> dict[str, str]:
        headers = _DEFAULT_HEADERS.copy()
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                headers=self._get_headers(),
                timeout=httpx.Timeout(self.timeout),
            )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    def _update_rate_limits(self, headers: httpx.Headers) -> None:
        remaining = headers.get("x-ratelimit-remaining")
        reset = headers.get("x-ratelimit-reset")
        if remaining is not None:
            self._rate_limit_remaining = int(remaining)
        if reset is not None:
            self._rate_limit_reset = float(reset)

    async def _proactive_rate_limit_sleep(self) -> None:
        if self._rate_limit_remaining == 0 and self._rate_limit_reset > 0:
            sleep_seconds = max(0, self._rate_limit_reset - time.time()) + 1
            logger.info("Rate limit reached, sleeping for %.1fs", sleep_seconds)
            await asyncio.sleep(sleep_seconds)

    async def _request_with_retries(
        self,
        method: str,
        url: str,
        max_retries: int = 3,
        **kwargs: Any,
    ) -> httpx.Response:
        await self._proactive_rate_limit_sleep()

        async def do_request() -> httpx.Response:
            client = await self._get_client()
            response = await client.request(method, url, **kwargs)
            self._update_rate_limits(response.headers)

            if response.status_code == 403 and "rate limit" in response.text.lower():
                raise GitHubRateLimitError()

            if response.status_code == 404:
                raise GitHubNotFoundError(f"Resource not found: {url}")

            if response.status_code >= 500:
                raise GitHubAPIError(f"GitHub API error: {response.status_code}", status_code=response.status_code)

            response.raise_for_status()
            return response

        last_exc: Exception | None = None
        for attempt in range(max_retries):
            try:
                return await self._circuit_breaker.execute(do_request)
            except GitHubAPIError:
                raise
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                if attempt < max_retries - 1:
                    backoff = 0.5 * (2**attempt)
                    logger.warning("Request failed, retrying in %.1fs (attempt %d/%d)", backoff, attempt + 1, max_retries)
                    await asyncio.sleep(backoff)
                else:
                    raise
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if attempt < max_retries - 1:
                    backoff = 0.5 * (2**attempt)
                    await asyncio.sleep(backoff)
                else:
                    raise

        raise last_exc  # pragma: no cover

    async def _get(self, path: str, **kwargs: Any) -> dict[str, Any]:
        url = f"{self.api_url}{path}"
        response = await self._request_with_retries("GET", url, **kwargs)
        return response.json()

    async def get_repo_tree(
        self,
        owner: str,
        repo: str,
        recursive: bool = True,
    ) -> list[GitHubFile]:
        """Get repository file tree using GitHub Trees API.

        Uses recursive=true to get full tree in one request.
        Filters binary files automatically.
        Detects submodules via .gitmodules in tree.
        """
        url = f"/repos/{owner}/{repo}/git/trees/{'master' if not self.token else 'HEAD'}"
        params: dict[str, Any] = {"recursive": 1} if recursive else {}

        tree_data = await self._get(url, params=params)

        files: list[GitHubFile] = []
        submodule_paths: set[str] = set()

        for entry in tree_data.get("tree", []):
            if entry.get("path") == ".gitmodules":
                submodule_paths.update(self._parse_gitmodules(tree_data))
                break

        for entry in tree_data.get("tree", []):
            git_file = GitHubFile.from_tree_entry(entry)
            if entry.get("type") == "blob":
                git_file.submodule = git_file.path in submodule_paths
            files.append(git_file)

        return files

    def _parse_gitmodules(self, tree_data: dict[str, Any]) -> set[str]:
        """Parse .gitmodules from tree to find submodule paths."""
        submodule_paths: set[str] = set()
        for entry in tree_data.get("tree", []):
            if entry.get("path") == ".gitmodules" and entry.get("type") == "blob":
                submodule_paths.add(entry.get("path"))
        return submodule_paths

    async def get_text_file(self, owner: str, repo: str, path: str) -> str:
        """Get text file content using GitHub API.

        Returns empty string for binary files.
        """
        url = f"/repos/{owner}/{repo}/contents/{path}"
        data = await self._get(url)
        content = data.get("content", "")
        if data.get("encoding") == "base64" and content:
            import base64
            return base64.b64decode(content).decode("utf-8", errors="replace")
        return content

    async def repo_has_submodules(self, owner: str, repo: str) -> bool:
        """Check if repository contains submodules."""
        try:
            files = await self.get_repo_tree(owner, repo, recursive=True)
            return any(f.path == ".gitmodules" for f in files)
        except GitHubAPIError:
            return False

    async def get_readme(self, owner: str, repo: str) -> str | None:
        """Get repository README content."""
        try:
            return await self.get_text_file(owner, repo, "README.md")
        except GitHubNotFoundError:
            return None
        except GitHubAPIError:
            return None

    async def list_repos(self, owner: str) -> list[dict[str, Any]]:
        """List repositories for a user or organization."""
        return await self._get(f"/users/{owner}/repos", params={"per_page": 100, "type": "public"})

    async def get_repo_info(self, owner: str, repo: str) -> dict[str, Any]:
        """Get repository metadata."""
        return await self._get(f"/repos/{owner}/{repo}")


__all__ = [
    "GitHubClient",
    "GitHubFile",
    "GitHubAPIError",
    "GitHubRateLimitError",
    "GitHubNotFoundError",
    "FileType",
    "CircuitBreaker",
]
