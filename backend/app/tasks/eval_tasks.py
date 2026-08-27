"""Celery tasks for Project Evaluation (Agent 1)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from backend.app.agents.eval.graph import agent1_graph
from backend.app.clients.supabase import get_supabase_client
from backend.app.core.celery_app import celery_app
from backend.app.core.github_client import GitHubRateLimitError

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3)
def run_evaluation_pipeline(
    self: Any,
    evaluation_id: str,
    candidate_id: str,
    repo_urls: list[str],
    selected_repos: list[str] | None = None,
) -> dict[str, Any]:
    """Execute evaluation pipeline for candidate repositories."""
    repos_to_eval = selected_repos if selected_repos else repo_urls
    results = {}

    async def _process_repos() -> dict[str, Any]:
        eval_results: dict[str, Any] = {}
        for repo_url in repos_to_eval:
            try:
                state_input = {
                    "candidate_id": candidate_id,
                    "repo_url": repo_url,
                    "status": "pending",
                }
                res = await agent1_graph.ainvoke(
                    state_input,
                    config={"configurable": {"thread_id": f"{evaluation_id}_{repo_url}"}},
                )
                eval_results[repo_url] = {
                    "status": res.get("status", "complete"),
                    "final_scores": res.get("final_scores"),
                    "summary": res.get("summary"),
                    "error": res.get("error"),
                }
            except GitHubRateLimitError as e:
                logger.warning("Rate limit hit during evaluation: %s", e)
                raise
            except Exception as e:
                logger.error("Error evaluating repo %s: %s", repo_url, e)
                eval_results[repo_url] = {
                    "status": "failed",
                    "error": str(e),
                }

        # Update candidate_projects / evaluation status in Supabase if configured
        try:
            db = get_supabase_client()
            db.table("candidate_projects").update({
                "status": "complete",
            }).eq("candidate_id", candidate_id).execute()
        except Exception as e:
            logger.warning("Could not update Supabase evaluation status: %s", e)

        return eval_results

    try:
        results = asyncio.run(_process_repos())
        return {
            "evaluation_id": evaluation_id,
            "candidate_id": candidate_id,
            "results": results,
            "status": "complete",
        }
    except GitHubRateLimitError as exc:
        countdown = getattr(exc, "retry_after", 60) or 60
        raise self.retry(exc=exc, countdown=countdown)
    except Exception as exc:
        logger.error("Fatal error in run_evaluation_pipeline: %s", exc)
        return {
            "evaluation_id": evaluation_id,
            "candidate_id": candidate_id,
            "error": str(exc),
            "status": "failed",
        }
