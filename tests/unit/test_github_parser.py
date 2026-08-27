"""Tests for GitHub URL Parser."""

import pytest

from backend.app.services.eval.github_parser import normalize_github_url, parse_github_url


class TestParseGitHubUrl:
    def test_standard_https(self):
        assert parse_github_url("https://github.com/torvalds/linux") == ("torvalds", "linux")

    def test_https_with_trailing_slash(self):
        assert parse_github_url("https://github.com/torvalds/linux/") == ("torvalds", "linux")

    def test_https_with_git_extension(self):
        assert parse_github_url("https://github.com/torvalds/linux.git") == ("torvalds", "linux")

    def test_http_url(self):
        assert parse_github_url("http://github.com/fastapi/fastapi") == ("fastapi", "fastapi")

    def test_ssh_url_with_git(self):
        assert parse_github_url("git@github.com:octocat/Hello-World.git") == ("octocat", "Hello-World")

    def test_ssh_url_without_git(self):
        assert parse_github_url("git@github.com:octocat/Hello-World") == ("octocat", "Hello-World")

    def test_ssh_protocol_url(self):
        assert parse_github_url("ssh://git@github.com/octocat/Hello-World.git") == ("octocat", "Hello-World")

    def test_git_plus_https(self):
        assert parse_github_url("git+https://github.com/encode/uvicorn.git") == ("encode", "uvicorn")

    def test_bare_domain(self):
        assert parse_github_url("github.com/owner/repo") == ("owner", "repo")
        assert parse_github_url("www.github.com/owner/repo") == ("owner", "repo")

    def test_deep_tree_path(self):
        assert parse_github_url("https://github.com/psf/black/tree/main/src/black") == ("psf", "black")

    def test_deep_blob_path(self):
        assert parse_github_url("https://github.com/psf/black/blob/main/README.md") == ("psf", "black")

    def test_url_with_query_and_fragment(self):
        assert parse_github_url("https://github.com/tiangolo/fastapi?tab=readme-ov-file#installation") == (
            "tiangolo",
            "fastapi",
        )

    def test_repo_with_special_characters(self):
        assert parse_github_url("https://github.com/my-org/my_cool.project-v2.0") == (
            "my-org",
            "my_cool.project-v2.0",
        )

    def test_whitespace_handling(self):
        assert parse_github_url("  https://github.com/owner/repo  \n") == ("owner", "repo")

    @pytest.mark.parametrize(
        "invalid_url",
        [
            None,
            "",
            "   ",
            "not_a_url",
            "https://gitlab.com/owner/repo",
            "https://bitbucket.org/owner/repo",
            "https://github.com",
            "https://github.com/",
            "https://github.com/owner",
            "https://github.com/owner/",
            "https://evil-github.com/owner/repo",
            "https://github.com//repo",
            12345,
        ],
    )
    def test_invalid_urls_return_none(self, invalid_url):
        assert parse_github_url(invalid_url) is None  # type: ignore


class TestNormalizeGitHubUrl:
    def test_normalize_valid_urls(self):
        assert normalize_github_url("https://github.com/torvalds/linux.git") == "torvalds/linux"
        assert normalize_github_url("git@github.com:octocat/Hello-World.git") == "octocat/Hello-World"
        assert normalize_github_url("https://github.com/psf/black/tree/main/src") == "psf/black"

    def test_normalize_invalid_urls(self):
        assert normalize_github_url("https://gitlab.com/owner/repo") is None
        assert normalize_github_url("") is None
        assert normalize_github_url(None) is None
