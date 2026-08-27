"""Tests for Agent 1 LangGraph State Machine."""

from unittest.mock import AsyncMock, MagicMock
import pytest

from backend.app.agents.eval.graph import _compute_tier1_metrics, build_agent1_graph
from backend.app.core.github_client import FileType, GitHubClient, GitHubFile


class TestTier1Metrics:
    def test_compute_metrics_empty(self):
        metrics = _compute_tier1_metrics([], None)
        assert metrics["file_count"] == 0
        assert metrics["test_ratio"] == 0.0
        assert metrics["tier1_score"] == 2.0

    def test_compute_metrics_with_tests_and_docs(self):
        files = [
            GitHubFile(path="main.py", type=FileType.FILE),
            GitHubFile(path="src/service.py", type=FileType.FILE),
            GitHubFile(path="src/utils.py", type=FileType.FILE),
            GitHubFile(path="tests/test_service.py", type=FileType.FILE),
            GitHubFile(path="tests/test_utils.py", type=FileType.FILE),
            GitHubFile(path="README.md", type=FileType.FILE),
            GitHubFile(path=".github/workflows/ci.yml", type=FileType.FILE),
            GitHubFile(path="Dockerfile", type=FileType.FILE),
        ]
        metrics = _compute_tier1_metrics(files, "A" * 300)
        assert metrics["file_count"] == 8
        assert metrics["has_ci"] is True
        assert metrics["has_docker"] is True
        assert metrics["test_files_count"] == 2
        assert metrics["tier1_score"] >= 8.0


@pytest.mark.asyncio
async def test_agent1_graph_invalid_url():
    graph = build_agent1_graph()
    result = await graph.ainvoke({
        "candidate_id": "123",
        "repo_url": "https://gitlab.com/invalid/repo",
    })
    assert result["status"] == "failed"
    assert "Invalid GitHub URL" in result["error"]


@pytest.mark.asyncio
async def test_agent1_graph_skip_tier2_for_empty_repo():
    mock_gh = MagicMock(spec=GitHubClient)
    mock_gh.get_repo_info = AsyncMock(return_value={"description": "empty", "stargazers_count": 0, "forks_count": 0})
    mock_gh.get_repo_tree = AsyncMock(return_value=[])
    mock_gh.get_readme = AsyncMock(return_value=None)
    mock_gh.close = AsyncMock()

    graph = build_agent1_graph(github_client_provider=lambda: mock_gh)
    result = await graph.ainvoke({
        "candidate_id": "123",
        "repo_url": "https://github.com/owner/empty-repo",
    })

    assert result["status"] == "complete"
    assert result["should_skip_tier2"] is True
    assert result["final_scores"]["completeness"] is not None


@pytest.mark.asyncio
async def test_agent1_graph_full_evaluation_flow():
    mock_gh = MagicMock(spec=GitHubClient)
    mock_gh.get_repo_info = AsyncMock(return_value={
        "description": "Awesome project",
        "stargazers_count": 50,
        "forks_count": 5,
        "language": "Python",
        "topics": ["ai", "fastapi"],
    })
    files = [
        GitHubFile(path="main.py", type=FileType.FILE, size=200),
        GitHubFile(path="src/core.py", type=FileType.FILE, size=500),
        GitHubFile(path="src/api.py", type=FileType.FILE, size=400),
        GitHubFile(path="tests/test_api.py", type=FileType.FILE, size=300),
        GitHubFile(path="tests/test_core.py", type=FileType.FILE, size=300),
        GitHubFile(path="README.md", type=FileType.FILE, size=800),
    ]
    mock_gh.get_repo_tree = AsyncMock(return_value=files)
    mock_gh.get_readme = AsyncMock(return_value="# Awesome project\nDetailed docs here.")
    mock_gh.get_text_file = AsyncMock(return_value="def main(): pass")
    mock_gh.close = AsyncMock()

    # Mock LLM client returning structured JSON
    def mock_llm(prompt, **kwargs):
        return """{
            "overall_score": 8.5,
            "completeness": {"score": 8.0, "reason": "Good coverage"},
            "complexity": {"score": 7.5, "reason": "Modular structure"},
            "optimization": {"score": 8.0, "reason": "Efficient algorithms"},
            "code_cleanliness": {"score": 9.0, "reason": "Clean code"},
            "project_understanding": {"score": 9.0, "reason": "Clear docs"},
            "overall_summary": "High quality repo with thorough tests",
            "red_flags": []
        }"""

    graph = build_agent1_graph(
        github_client_provider=lambda: mock_gh,
        llm_client=mock_llm,
    )
    result = await graph.ainvoke({
        "candidate_id": "c-123",
        "repo_url": "https://github.com/owner/awesome-project",
    })

    assert result["status"] == "complete"
    assert result["should_skip_tier2"] is False
    assert result["final_scores"]["completeness"] == 8.0
    assert result["final_scores"]["code_cleanliness"] == 9.0
    assert result["summary"] == "High quality repo with thorough tests"
