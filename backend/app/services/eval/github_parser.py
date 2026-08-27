"""GitHub URL Parser & Normalizer."""

import re

# Regex patterns for various GitHub URL formats:
# 1. Standard Web/HTTPS/HTTP: (http(s)://)?(www\.)?github\.com/<owner>/<repo>(/.*)?
# 2. SSH: git@github\.com:<owner>/<repo>(\.git)?
# 3. Protocol prefix: git://github\.com/<owner>/<repo>(\.git)? or git+https://...
_GITHUB_URL_PATTERNS = [
    # SSH style: git@github.com:owner/repo(.git)?
    re.compile(r"^(?:git@|ssh://git@)github\.com[:/](?P<owner>[a-zA-Z0-9_-]+)/(?P<repo>[a-zA-Z0-9_.-]+?)(?:\.git)?(?:/.*)?$"),
    # HTTP/HTTPS/Protocol/Bare style: (https?://)?(www\.)?github.com/owner/repo(...)
    re.compile(r"^(?:(?:https?|git|git\+https)://)?(?:www\.)?github\.com/(?P<owner>[a-zA-Z0-9_-]+)/(?P<repo>[a-zA-Z0-9_.-]+?)(?:\.git)?(?:[/?#].*)?$"),
]

_INVALID_REPOS = frozenset({"", ".", ".."})


def parse_github_url(url: str | None) -> tuple[str, str] | None:
    """Parse a GitHub URL and extract (owner, repo).

    Handles:
    - HTTPS / HTTP: https://github.com/owner/repo
    - SSH: git@github.com:owner/repo.git
    - Deep paths: https://github.com/owner/repo/tree/main/src
    - Query strings / fragments: https://github.com/owner/repo?tab=readme-ov-file#header
    - .git suffix: https://github.com/owner/repo.git
    - Special chars: repos with dots, underscores, hyphens

    Returns:
        tuple[str, str] with (owner, repo) or None if invalid.
    """
    if not url or not isinstance(url, str):
        return None

    cleaned_url = url.strip()
    if not cleaned_url:
        return None

    for pattern in _GITHUB_URL_PATTERNS:
        match = pattern.match(cleaned_url)
        if match:
            owner = match.group("owner").strip()
            repo = match.group("repo").strip().rstrip("/")
            if repo.endswith(".git"):
                repo = repo[:-4]

            if not owner or not repo or repo in _INVALID_REPOS:
                return None

            return owner, repo

    return None


def normalize_github_url(url: str | None) -> str | None:
    """Normalize a GitHub URL to standard 'owner/repo' format.

    Returns:
        'owner/repo' string, or None if URL is invalid.
    """
    result = parse_github_url(url)
    if result:
        return f"{result[0]}/{result[1]}"
    return None
