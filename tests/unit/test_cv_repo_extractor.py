"""Unit tests for CV Project & GitHub Repository Extractor."""

import pytest
from unittest.mock import AsyncMock, patch
from backend.app.services.eval.cv_repo_extractor import (
    extract_github_urls_from_text,
    extract_cv_project_items,
    match_public_repos_with_cv_projects,
    extract_cv_repos_and_projects,
)


def test_extract_github_urls_direct():
    cv_text = """
    # Nguyen Van A - Software Engineer
    GitHub: https://github.com/nguyenvana
    
    ## Projects
    ### E-Commerce Microservices
    Source: https://github.com/nguyenvana/ecommerce-microservices
    Built with FastAPI, Redis, PostgreSQL.
    
    ### AI Chatbot
    Code: https://github.com/nguyenvana/ai-chatbot.git
    """
    repos, users = extract_github_urls_from_text(cv_text)
    assert "https://github.com/nguyenvana/ecommerce-microservices" in repos
    assert "https://github.com/nguyenvana/ai-chatbot" in repos
    assert "nguyenvana" in users


def test_extract_cv_project_items():
    cv_text = """
    # Developer CV
    ## Projects
    ### Realtime Chat Application
    Developed using WebSocket and React.
    ### Task Management Dashboard
    A Kanban board web application with Next.js and Supabase.
    """
    projects = extract_cv_project_items(cv_text)
    assert len(projects) == 2
    assert projects[0]["title"] == "Realtime Chat Application"
    assert "WebSocket" in projects[0]["description"]
    assert projects[1]["title"] == "Task Management Dashboard"


def test_match_public_repos_with_cv_projects():
    public_repos = [
        {
            "name": "realtime-chat-app",
            "html_url": "https://github.com/nguyenvana/realtime-chat-app",
            "description": "Fullstack chat app with websockets",
            "language": "TypeScript",
            "stargazers_count": 15,
            "topics": ["chat", "websocket", "react"],
        },
        {
            "name": "random-utility",
            "html_url": "https://github.com/nguyenvana/random-utility",
            "description": "Some random scripts",
            "language": "Python",
            "stargazers_count": 1,
            "topics": [],
        },
    ]

    cv_projects = [
        {
            "title": "Realtime Chat App",
            "description": "Realtime messaging application with React",
        }
    ]

    matched = match_public_repos_with_cv_projects(public_repos, cv_projects, "nguyenvana")
    assert len(matched) >= 1
    assert matched[0]["repo_name"] == "realtime-chat-app"
    assert matched[0]["project_name"] == "Realtime Chat App"
    assert matched[0]["match_type"] == "profile_match"


@pytest.mark.asyncio
async def test_extract_cv_repos_and_projects_no_repos():
    cv_text = """
    # Le Van B
    Email: levanb@example.com
    Experience: 3 years at Company X.
    No links provided.
    """
    res = await extract_cv_repos_and_projects(cv_text)
    assert res["found"] is False
    assert res["repos"] is None
    assert "Không tìm thấy" in res["message"]


@pytest.mark.asyncio
async def test_extract_cv_repos_and_projects_with_profile_fallback():
    cv_text = """
    # Tran Thi C
    GitHub: https://github.com/tranthic
    
    ## Projects
    ### Portfolio Web
    Personal portfolio built with React.
    """
    mock_repos = [
        {
            "name": "portfolio-web",
            "html_url": "https://github.com/tranthic/portfolio-web",
            "description": "Personal portfolio site",
            "language": "JavaScript",
            "stargazers_count": 5,
            "topics": ["portfolio", "react"],
        }
    ]

    with patch("backend.app.core.github_client.GitHubClient.list_repos", new_callable=AsyncMock) as mock_list:
        mock_list.return_value = mock_repos
        res = await extract_cv_repos_and_projects(cv_text)
        assert res["found"] is True
        assert len(res["repos"]) == 1
        assert res["repos"][0]["repo_name"] == "portfolio-web"
        assert res["repos"][0]["match_type"] == "profile_match"
