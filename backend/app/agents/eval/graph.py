"""Agent 1 (Project Evaluation) LangGraph State Machine."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Callable

from langgraph.graph import END, StateGraph

from backend.app.agents.eval.state import Agent1State
from backend.app.config.env import settings
from backend.app.core.github_client import FileType, GitHubAPIError, GitHubClient, GitHubFile
from backend.app.core.key_file_selector import select_key_files
from backend.app.core.llm_evaluator import (
    RepoEvaluationResult,
    RepoEvaluator,
    RepoMetadata,
    _heuristic_result,
)
from backend.app.services.eval.github_parser import parse_github_url

logger = logging.getLogger(__name__)


def _compute_tier1_metrics(files: list[GitHubFile], readme_content: str | None) -> dict[str, Any]:
    """Compute Tier 1 heuristic metrics from repository file tree."""
    total_blobs = [f for f in files if f.type == FileType.FILE]
    file_count = len(total_blobs)

    test_files = [
        f for f in total_blobs
        if any(t in f.path.lower() for t in ["test", "tests/", "spec", "specs/"])
    ]
    doc_files = [
        f for f in total_blobs
        if any(d in f.path.lower() for d in ["readme", "doc", "docs/", ".md", ".rst"])
    ]

    has_ci = any(
        ".github/workflows" in f.path or ".gitlab-ci" in f.path or "circleci" in f.path
        for f in files
    )
    has_docker = any(
        "dockerfile" in f.path.lower() or "docker-compose" in f.path.lower()
        for f in files
    )

    extensions = {
        f.path.split(".")[-1].lower()
        for f in total_blobs
        if "." in f.path
    }
    language_count = len(extensions)

    has_submodules = any(getattr(f, "submodule", False) or f.path == ".gitmodules" for f in files)
    readme_length = len(readme_content) if readme_content else 0

    test_ratio = len(test_files) / max(file_count, 1)
    doc_ratio = len(doc_files) / max(file_count, 1)

    # Compute rough Tier 1 score (0-10)
    score = 2.0
    if file_count >= 5:
        score += 2.0
    if test_ratio >= 0.1:
        score += 2.0
    if readme_length > 200:
        score += 1.5
    if has_ci:
        score += 1.5
    if has_docker:
        score += 1.0

    return {
        "file_count": file_count,
        "test_files_count": len(test_files),
        "doc_files_count": len(doc_files),
        "test_ratio": round(test_ratio, 3),
        "doc_ratio": round(doc_ratio, 3),
        "has_ci": has_ci,
        "has_docker": has_docker,
        "language_count": language_count,
        "languages": sorted(extensions),
        "has_submodules": has_submodules,
        "readme_length": readme_length,
        "tier1_score": round(min(score, 10.0), 2),
    }


def build_agent1_graph(
    *,
    github_client_provider: Callable[[], GitHubClient] | None = None,
    llm_client: Any = None,
    supabase_client_provider: Callable[[], Any] | None = None,
    checkpointer: Any = None,
) -> Any:
    """Build and compile the Agent 1 (Repo Evaluator) StateGraph."""

    async def preflight_check(state: Agent1State) -> dict[str, Any]:
        repo_url = state.get("repo_url", "")
        parsed = parse_github_url(repo_url)
        if not parsed:
            return {
                "error": f"Invalid GitHub URL: {repo_url}",
                "status": "failed",
            }

        owner, repo = parsed
        repo_full_name = f"{owner}/{repo}"

        # Check cache if DB provider available
        is_cached = False
        if supabase_client_provider:
            try:
                db = supabase_client_provider()
                cache_resp = (
                    db.table("repo_cache")
                    .select("repo_full_name, cached_at, expires_at")
                    .eq("repo_full_name", repo_full_name)
                    .execute()
                )
                if cache_resp.data and len(cache_resp.data) > 0:
                    candidate_id = state.get("candidate_id")
                    if candidate_id:
                        proj_resp = (
                            db.table("candidate_projects")
                            .select("id, evaluation_scores, weighted_score, summary")
                            .eq("candidate_id", candidate_id)
                            .eq("repo_full_name", repo_full_name)
                            .eq("is_current", True)
                            .execute()
                        )
                        if proj_resp.data and len(proj_resp.data) > 0:
                            is_cached = True
            except Exception as e:
                logger.warning("Cache check failed: %s", e)

        return {
            "repo_full_name": repo_full_name,
            "is_cached": is_cached,
            "status": "pending",
        }

    async def run_heuristic_scan(state: Agent1State) -> dict[str, Any]:
        repo_full_name = state.get("repo_full_name")
        if not repo_full_name:
            return {"error": "Missing repository name", "status": "failed"}

        owner, repo = repo_full_name.split("/", 1)
        gh = (
            github_client_provider()
            if github_client_provider
            else GitHubClient(
                token=settings.github_token
                or settings.github_api_key
                or os.getenv("GITHUB_API_KEY")
                or os.getenv("GITHUB_TOKEN")
                or ""
            )
        )

        try:
            try:
                info = await gh.get_repo_info(owner, repo)
            except GitHubAPIError as e:
                return {"error": f"Failed to fetch repo info: {e.message}", "status": "failed"}

            try:
                files = await gh.get_repo_tree(owner, repo, recursive=True)
            except GitHubAPIError as e:
                return {"error": f"Failed to fetch repo tree: {e.message}", "status": "failed"}

            readme_content = await gh.get_readme(owner, repo)

            heuristic_metrics = _compute_tier1_metrics(files, readme_content)
            tier1_score = heuristic_metrics.get("tier1_score", 0.0)

            # Check if repo is trivially small/empty
            file_count = heuristic_metrics.get("file_count", 0)
            test_count = heuristic_metrics.get("test_files_count", 0)
            doc_count = heuristic_metrics.get("doc_files_count", 0)
            should_skip_tier2 = (
                file_count == 0
                or (file_count < 5 and test_count == 0 and doc_count == 0)
            )

            metadata = {
                "name": repo,
                "owner": owner,
                "description": info.get("description"),
                "stars": info.get("stargazers_count", 0),
                "forks": info.get("forks_count", 0),
                "language": info.get("language"),
                "topics": info.get("topics", []),
                "readme_preview": (readme_content[:500] if readme_content else None),
                "default_branch": info.get("default_branch", "main"),
            }

            # Serialize files for state
            file_entries = [
                {"path": f.path, "type": f.type.value if hasattr(f.type, "value") else str(f.type), "size": f.size, "sha": f.sha}
                for f in files
            ]

            return {
                "metadata": metadata,
                "file_tree": file_entries,
                "heuristic_metrics": heuristic_metrics,
                "tier1_score": tier1_score,
                "should_skip_tier2": should_skip_tier2,
                "status": "tier1_done",
            }
        finally:
            if not github_client_provider:
                await gh.close()

    async def select_key_files_node(state: Agent1State) -> dict[str, Any]:
        file_tree = state.get("file_tree") or []
        gh_files = [
            GitHubFile(
                path=f.get("path", ""),
                type=FileType.DIRECTORY if f.get("type") == "tree" else FileType.FILE,
                size=f.get("size"),
                sha=f.get("sha"),
            )
            for f in file_tree
        ]

        selected = select_key_files(gh_files, budget=80_000)
        return {
            "selected_files": [
                {"path": s.path, "is_entry_point": s.is_entry_point}
                for s in selected
            ]
        }

    async def fetch_file_contents_node(state: Agent1State) -> dict[str, Any]:
        repo_full_name = state.get("repo_full_name", "")
        owner, repo = repo_full_name.split("/", 1)
        selected_files = state.get("selected_files") or []

        gh = (
            github_client_provider()
            if github_client_provider
            else GitHubClient(
                token=settings.github_token
                or settings.github_api_key
                or os.getenv("GITHUB_API_KEY")
                or os.getenv("GITHUB_TOKEN")
                or ""
            )
        )
        file_contents: list[tuple[str, str]] = []

        try:
            targets = [s.get("path") for s in selected_files[:12] if s.get("path")]
            tasks = [gh.get_text_file(owner, repo, p) for p in targets]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for p, res in zip(targets, results):
                if isinstance(res, str) and res:
                    file_contents.append((p, res))

            return {"file_contents": file_contents}
        finally:
            if not github_client_provider:
                await gh.close()

    async def run_llm_evaluation_node(state: Agent1State) -> dict[str, Any]:
        metadata_dict = state.get("metadata") or {}
        file_contents = state.get("file_contents") or []

        meta = RepoMetadata(
            name=metadata_dict.get("name", ""),
            owner=metadata_dict.get("owner", ""),
            description=metadata_dict.get("description"),
            stars=metadata_dict.get("stars", 0),
            forks=metadata_dict.get("forks", 0),
            language=metadata_dict.get("language"),
            topics=metadata_dict.get("topics", []),
            readme_preview=metadata_dict.get("readme_preview"),
        )

        evaluator = RepoEvaluator()
        try:
            result = evaluator.evaluate(
                metadata=meta,
                files=file_contents,
                llm_client=llm_client,
            )
        except Exception as e:
            logger.warning("LLM evaluation threw exception, falling back to heuristic: %s", e)
            result = _heuristic_result(meta)

        final_scores = {
            "completeness": result.completeness.score,
            "complexity": result.complexity.score,
            "optimization": result.optimization.score,
            "code_cleanliness": result.code_cleanliness.score,
            "project_understanding": result.project_understanding.score,
            "weighted_score": result.overall_score,
        }

        return {
            "llm_evaluation": result.model_dump(),
            "final_scores": final_scores,
            "summary": result.overall_summary,
            "status": "tier2_done",
        }

    async def compute_heuristic_only_node(state: Agent1State) -> dict[str, Any]:
        metadata_dict = state.get("metadata") or {}
        meta = RepoMetadata(
            name=metadata_dict.get("name", ""),
            owner=metadata_dict.get("owner", ""),
            description=metadata_dict.get("description"),
            stars=metadata_dict.get("stars", 0),
            forks=metadata_dict.get("forks", 0),
            language=metadata_dict.get("language"),
            topics=metadata_dict.get("topics", []),
            readme_preview=metadata_dict.get("readme_preview"),
        )

        result = _heuristic_result(meta)

        final_scores = {
            "completeness": result.completeness.score,
            "complexity": result.complexity.score,
            "optimization": result.optimization.score,
            "code_cleanliness": result.code_cleanliness.score,
            "project_understanding": result.project_understanding.score,
            "weighted_score": result.overall_score,
        }

        return {
            "llm_evaluation": result.model_dump(),
            "final_scores": final_scores,
            "summary": result.overall_summary,
            "status": "tier1_done",
        }

    async def persist_results_node(state: Agent1State) -> dict[str, Any]:
        candidate_id = state.get("candidate_id")
        repo_full_name = state.get("repo_full_name")
        repo_url = state.get("repo_url")
        metadata = state.get("metadata") or {}
        scores = state.get("final_scores") or {}
        llm_eval = state.get("llm_evaluation") or {}
        summary = state.get("summary") or ""
        metrics = state.get("heuristic_metrics") or {}
        tier = "heuristic_only" if state.get("should_skip_tier2") or llm_eval.get("heuristic_fallback") else "full"

        if supabase_client_provider and candidate_id and repo_full_name:
            try:
                db = supabase_client_provider()
                owner, repo = repo_full_name.split("/", 1)

                # Invalidate older evaluations
                db.table("candidate_projects").update({"is_current": False}).eq("candidate_id", candidate_id).eq("repo_full_name", repo_full_name).execute()

                # Insert new candidate_projects record
                proj_data = {
                    "candidate_id": candidate_id,
                    "repo_url": repo_url,
                    "repo_full_name": repo_full_name,
                    "repo_owner": owner,
                    "repo_name": repo,
                    "default_branch": metadata.get("default_branch", "main"),
                    "language": metadata.get("language"),
                    "heuristic_metrics": metrics,
                    "evaluation_scores": scores,
                    "evaluation_breakdown": llm_eval,
                    "summary": summary,
                    "red_flags": llm_eval.get("red_flags", []),
                    "evaluation_tier": tier,
                    "is_current": True,
                    "status": "complete",
                }
                db.table("candidate_projects").insert(proj_data).execute()

                # Upsert candidate_nodes (project node)
                node_data = {
                    "candidate_id": candidate_id,
                    "node_type": "project",
                    "name": repo_full_name,
                    "description": metadata.get("description") or summary,
                    "properties": {
                        "scores": scores,
                        "summary": summary,
                        "language": metadata.get("language"),
                    },
                    "source": "agent_eval",
                    "is_active": True,
                }
                node_res = db.table("candidate_nodes").insert(node_data).execute()

                # Upsert candidate_edges
                if node_res.data and len(node_res.data) > 0:
                    project_node_id = node_res.data[0]["id"]
                    # Candidate profile node or link
                    edge_data = {
                        "candidate_id": candidate_id,
                        "from_node": project_node_id,
                        "to_node": project_node_id,
                        "edge_type": "demonstrates",
                        "properties": {"weighted_score": scores.get("weighted_score", 0.0)},
                    }
                    try:
                        db.table("candidate_edges").insert(edge_data).execute()
                    except Exception:
                        pass
            except Exception as e:
                logger.error("Failed to persist results to Supabase: %s", e)

        return {"status": "complete"}

    async def return_cached_node(state: Agent1State) -> dict[str, Any]:
        return {"status": "complete"}

    async def handle_error_node(state: Agent1State) -> dict[str, Any]:
        return {"status": "failed"}

    # Route conditions
    def route_after_preflight(state: Agent1State) -> str:
        if state.get("error"):
            return "error"
        if state.get("is_cached"):
            return "cache_hit"
        return "continue"

    def route_after_tier1(state: Agent1State) -> str:
        if state.get("error"):
            return "error"
        if state.get("should_skip_tier2"):
            return "skip_tier2"
        return "continue"

    def route_after_llm(state: Agent1State) -> str:
        if state.get("error"):
            return "error"
        return "persist"

    # Construct StateGraph
    workflow = StateGraph(Agent1State)
    workflow.add_node("preflight", preflight_check)
    workflow.add_node("tier1_heuristic", run_heuristic_scan)
    workflow.add_node("tier2_select_files", select_key_files_node)
    workflow.add_node("tier2_fetch_content", fetch_file_contents_node)
    workflow.add_node("tier2_llm_evaluate", run_llm_evaluation_node)
    workflow.add_node("compute_heuristic_only", compute_heuristic_only_node)
    workflow.add_node("persist_results", persist_results_node)
    workflow.add_node("return_cached", return_cached_node)
    workflow.add_node("handle_error", handle_error_node)

    workflow.set_entry_point("preflight")
    workflow.add_conditional_edges(
        "preflight",
        route_after_preflight,
        {"cache_hit": "return_cached", "continue": "tier1_heuristic", "error": "handle_error"},
    )
    workflow.add_conditional_edges(
        "tier1_heuristic",
        route_after_tier1,
        {"skip_tier2": "compute_heuristic_only", "continue": "tier2_select_files", "error": "handle_error"},
    )
    workflow.add_edge("tier2_select_files", "tier2_fetch_content")
    workflow.add_edge("tier2_fetch_content", "tier2_llm_evaluate")
    workflow.add_conditional_edges(
        "tier2_llm_evaluate",
        route_after_llm,
        {"persist": "persist_results", "error": "handle_error"},
    )
    workflow.add_edge("compute_heuristic_only", "persist_results")
    workflow.add_edge("persist_results", END)
    workflow.add_edge("return_cached", END)
    workflow.add_edge("handle_error", END)

    return workflow.compile(checkpointer=checkpointer)


# Default compiled graph instance
agent1_graph = build_agent1_graph()
