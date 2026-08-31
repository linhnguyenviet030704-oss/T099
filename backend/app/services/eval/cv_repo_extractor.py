"""CV Project & GitHub Repository Extractor.

Extracts GitHub repository URLs, profile links, and project descriptions from CV text or structured CV data.
If a GitHub profile URL is found without direct repo URLs (or in addition to them),
fetches public repositories for that profile and matches them against projects in the CV.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any

from backend.app.config.env import settings
from backend.app.core.github_client import GitHubAPIError, GitHubClient
from backend.app.services.eval.github_parser import normalize_github_url, parse_github_url

logger = logging.getLogger(__name__)

# Reserved words or tabs on GitHub that are not user profiles or repo owners
_GITHUB_RESERVED_NAMES = frozenset({
    "about", "features", "pricing", "security", "enterprise", "customer-stories",
    "solutions", "open-source", "readme", "login", "signup", "settings", "explore",
    "trending", "topics", "collections", "events", "sponsors", "contact", "organizations",
    "site", "blog", "marketplace", "pulls", "issues", "notifications", "search",
})

_PROFILE_URL_PATTERN = re.compile(
    r"(?:https?://)?(?:www\.)?github\.com/([a-zA-Z0-9_-]+)/?(?:\s|$|[),;\]>'\"])",
    re.IGNORECASE,
)

_DIRECT_REPO_PATTERN = re.compile(
    r"(?:https?://)?(?:www\.)?github\.com/([a-zA-Z0-9_-]+)/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:[/?#\s),;\]>'\"]|$)",
    re.IGNORECASE,
)


def _slugify(text: str) -> str:
    """Normalize a title/name to a lowercase alphanumeric slug for matching."""
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text)
    return re.sub(r"[-\s_]+", "-", text).strip("-")


def extract_github_urls_from_text(text: str) -> tuple[list[str], list[str]]:
    """Extract direct repository URLs and profile usernames from freeform text.

    Returns:
        tuple (direct_repo_urls, profile_usernames)
    """
    direct_repos: list[str] = []
    seen_repos: set[str] = set()
    profile_users: list[str] = []
    seen_users: set[str] = set()

    # 1. Find direct repo URLs
    for match in _DIRECT_REPO_PATTERN.finditer(text):
        owner = match.group(1).strip()
        repo = match.group(2).strip().rstrip("/").rstrip(".")
        if repo.endswith(".git"):
            repo = repo[:-4]

        if owner.lower() in _GITHUB_RESERVED_NAMES:
            continue
        if repo.lower() in _GITHUB_RESERVED_NAMES or not repo:
            continue

        normalized = normalize_github_url(f"https://github.com/{owner}/{repo}")
        if normalized and normalized.lower() not in seen_repos:
            seen_repos.add(normalized.lower())
            direct_repos.append(f"https://github.com/{normalized}")

    # 2. Find profile usernames
    for match in _PROFILE_URL_PATTERN.finditer(text):
        username = match.group(1).strip()
        if username.lower() in _GITHUB_RESERVED_NAMES:
            continue
        if username.lower() not in seen_users:
            seen_users.add(username.lower())
            profile_users.append(username)

    return direct_repos, profile_users


def extract_cv_project_items(text: str) -> list[dict[str, str]]:
    """Parse projects and experience items from CV markdown or plaintext."""
    projects: list[dict[str, str]] = []
    lines = text.splitlines()

    current_project: dict[str, str] | None = None
    in_project_section = False

    project_section_headers = [
        "project", "projects", "dự án", "dự án nổi bật", "personal projects",
        "side projects", "key projects", "notable projects"
    ]

    for line in lines:
        raw = line.strip()
        if not raw:
            continue

        # Check section headers: ## Projects / # Projects / Projects:
        header_match = re.match(r"^#{1,3}\s+(.+)$", raw)
        if header_match:
            header_title = header_match.group(1).strip().lower()
            if any(h in header_title for h in project_section_headers):
                in_project_section = True
                continue
            elif in_project_section and header_title not in project_section_headers:
                if raw.startswith("## ") or raw.startswith("# "):
                    in_project_section = False

        if in_project_section:
            # Sub-project heading: ### My Project or **Project Name** or - Project Name:
            sub_match = re.match(r"^###\s+(.+)$", raw) or re.match(r"^\*\*(.+?)\*\*", raw) or re.match(r"^[-*]\s+\*\*(.+?)\*\*", raw)
            if sub_match:
                if current_project and current_project.get("title"):
                    projects.append(current_project)
                p_title = sub_match.group(1).strip()
                current_project = {"title": p_title, "description": ""}
                continue

            if current_project is not None:
                current_project["description"] = (current_project["description"] + " " + raw).strip()

    if current_project and current_project.get("title"):
        projects.append(current_project)

    # If no explicit project section found, extract bullet points with project keywords
    if not projects:
        for line in lines:
            line_str = line.strip()
            if any(k in line_str.lower() for k in ["project:", "dự án:", "app:", "system:", "tool:"]):
                parts = re.split(r"[:\-–]\s*", line_str, maxsplit=1)
                if len(parts) >= 2 and len(parts[0]) < 60:
                    projects.append({"title": parts[0].strip("#-* "), "description": parts[1].strip()})

    return projects


def match_public_repos_with_cv_projects(
    public_repos: list[dict[str, Any]],
    cv_projects: list[dict[str, str]],
    owner: str,
) -> list[dict[str, Any]]:
    """Match candidate's public repositories with project items in CV.

    Matches by:
    1. Exact or slugified name match (e.g. 'e-commerce-shop' matches 'E-Commerce Shop')
    2. Substring / keyword overlap in project title and repo name
    3. Keyword / tech stack overlap between project description and repo description/topics
    """
    matched: list[dict[str, Any]] = []
    seen_repo_names: set[str] = set()

    for repo in public_repos:
        repo_name = repo.get("name", "")
        repo_slug = _slugify(repo_name)
        repo_desc = (repo.get("description") or "").lower()
        repo_url = repo.get("html_url") or f"https://github.com/{owner}/{repo_name}"

        is_match = False
        matched_project_name = ""
        match_reason = ""

        for proj in cv_projects:
            proj_title = proj.get("title", "")
            proj_slug = _slugify(proj_title)
            proj_desc = proj.get("description", "").lower()

            # 1. Exact slug match
            if repo_slug and proj_slug and (repo_slug == proj_slug or repo_slug in proj_slug or proj_slug in repo_slug):
                is_match = True
                matched_project_name = proj_title
                match_reason = f"Khớp tên dự án '{proj_title}' với repository '{repo_name}'"
                break

            # 2. Words in project title contained in repo name
            title_words = [w for w in re.split(r"[\s_-]+", proj_slug) if len(w) >= 3]
            repo_words = [w for w in re.split(r"[\s_-]+", repo_slug) if len(w) >= 3]
            overlap = set(title_words).intersection(set(repo_words))
            if len(overlap) >= 2 or (len(title_words) == 1 and len(overlap) == 1):
                is_match = True
                matched_project_name = proj_title
                match_reason = f"Khớp từ khóa dự án ({', '.join(overlap)}) với tên repository '{repo_name}'"
                break

            # 3. Description & tech stack overlap
            if repo_desc and len(repo_desc) > 10:
                desc_words = set(re.findall(r"\b[a-zA-Z]{4,}\b", repo_desc))
                proj_desc_words = set(re.findall(r"\b[a-zA-Z]{4,}\b", proj_desc))
                shared_keywords = desc_words.intersection(proj_desc_words)
                if len(shared_keywords) >= 3:
                    is_match = True
                    matched_project_name = proj_title
                    match_reason = f"Khớp mô tả & công nghệ ({', '.join(list(shared_keywords)[:3])})"
                    break

        if is_match and repo_name.lower() not in seen_repo_names:
            seen_repo_names.add(repo_name.lower())
            matched.append({
                "repo_url": repo_url,
                "repo_name": repo_name,
                "repo_full_name": f"{owner}/{repo_name}",
                "project_name": matched_project_name or repo_name,
                "match_type": "profile_match",
                "match_reason": match_reason,
                "description": repo.get("description") or "",
                "stars": repo.get("stargazers_count", 0),
                "language": repo.get("language") or "",
            })

    # If CV has projects but none matched specific names, but user profile has public non-fork repos:
    # Include the top public repos (up to 5) as candidates
    if not matched and public_repos:
        for repo in public_repos[:5]:
            repo_name = repo.get("name", "")
            if repo.get("fork"):
                continue
            if repo_name.lower() not in seen_repo_names:
                seen_repo_names.add(repo_name.lower())
                matched.append({
                    "repo_url": repo.get("html_url") or f"https://github.com/{owner}/{repo_name}",
                    "repo_name": repo_name,
                    "repo_full_name": f"{owner}/{repo_name}",
                    "project_name": repo_name,
                    "match_type": "profile_match",
                    "match_reason": f"Repository công khai từ profile '{owner}'",
                    "description": repo.get("description") or "",
                    "stars": repo.get("stargazers_count", 0),
                    "language": repo.get("language") or "",
                })

    return matched


async def extract_cv_repos_and_projects(
    cv_text: str,
    github_client: GitHubClient | None = None,
) -> dict[str, Any]:
    """Main extraction pipeline for a CV.

    Steps:
    1. Parse text for direct GitHub repository URLs.
    2. Parse text for GitHub profile URLs.
    3. Parse text for project titles & descriptions.
    4. If profile URL found and direct repos are missing or we need to resolve projects:
       Fetch user's public repositories and match them against CV projects.
    5. If no repositories found anywhere:
       Return found=False, repos=None, and a detailed report explaining why.
    """
    if not cv_text or not cv_text.strip():
        return {
            "found": False,
            "repos": None,
            "profile_url": None,
            "projects_found": [],
            "message": "Nội dung CV trống hoặc không hợp lệ. Vui lòng cung cấp nội dung CV để bắt đầu trích xuất.",
        }

    direct_repo_urls, profile_users = extract_github_urls_from_text(cv_text)
    cv_projects = extract_cv_project_items(cv_text)
    project_titles = [p["title"] for p in cv_projects if p.get("title")]

    extracted_repos: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    # 1. Add direct repository URLs
    for repo_url in direct_repo_urls:
        parsed = parse_github_url(repo_url)
        if parsed:
            owner, name = parsed
            norm = f"https://github.com/{owner}/{name}"
            if norm.lower() not in seen_urls:
                seen_urls.add(norm.lower())
                matching_proj = next(
                    (p["title"] for p in cv_projects if _slugify(p.get("title", "")) in name.lower() or name.lower() in _slugify(p.get("title", ""))),
                    name,
                )
                extracted_repos.append({
                    "repo_url": norm,
                    "repo_name": name,
                    "repo_full_name": f"{owner}/{name}",
                    "project_name": matching_proj,
                    "match_type": "direct_url",
                    "match_reason": f"Trích xuất trực tiếp từ URL GitHub trong CV: {norm}",
                    "description": "",
                    "language": "",
                })

    # 2. If profile found, query public repos and match
    gh = (
        github_client
        if github_client
        else GitHubClient(
            token=settings.github_token
            or settings.github_api_key
            or os.getenv("GITHUB_API_KEY")
            or os.getenv("GITHUB_TOKEN")
            or ""
        )
    )

    should_close_gh = github_client is None
    profile_url = f"https://github.com/{profile_users[0]}" if profile_users else None

    try:
        if profile_users:
            for username in profile_users[:2]:
                try:
                    public_repos = await gh.list_repos(username)
                    if isinstance(public_repos, list) and public_repos:
                        matched_profile_repos = match_public_repos_with_cv_projects(
                            public_repos, cv_projects, username
                        )
                        for r in matched_profile_repos:
                            r_url = r["repo_url"].rstrip("/").lower()
                            if r_url not in seen_urls:
                                seen_urls.add(r_url)
                                extracted_repos.append(r)
                except GitHubAPIError as e:
                    logger.warning("Failed to fetch public repos for user %s: %s", username, e)
                except Exception as e:
                    logger.warning("Error querying GitHub profile %s: %s", username, e)
    finally:
        if should_close_gh:
            await gh.close()

    # 3. Formulate output and report
    if not extracted_repos:
        if profile_url:
            msg = (
                f"Đã tìm thấy GitHub Profile ({profile_url}), nhưng không tìm thấy repository public "
                f"nào khớp với các dự án mô tả trong CV ({', '.join(project_titles) if project_titles else 'không có tên dự án cụ thể'})."
            )
        elif project_titles:
            msg = (
                f"Đã tìm thấy {len(project_titles)} dự án trong CV ({', '.join(project_titles[:3])}), "
                f"nhưng không tìm thấy đường dẫn URL GitHub repository hoặc GitHub profile nào trong CV."
            )
        else:
            msg = "Không tìm thấy URL GitHub repository hoặc GitHub profile nào trong CV này."

        return {
            "found": False,
            "repos": None,
            "profile_url": profile_url,
            "projects_found": project_titles,
            "message": msg,
        }

    success_msg = (
        f"Đã trích xuất thành công {len(extracted_repos)} repository từ CV "
        f"({len([r for r in extracted_repos if r['match_type'] == 'direct_url'])} URL trực tiếp, "
        f"{len([r for r in extracted_repos if r['match_type'] == 'profile_match'])} từ GitHub profile)."
    )

    return {
        "found": True,
        "repos": extracted_repos,
        "profile_url": profile_url,
        "projects_found": project_titles,
        "message": success_msg,
    }
