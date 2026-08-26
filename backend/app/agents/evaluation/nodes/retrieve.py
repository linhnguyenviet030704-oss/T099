"""Retrieve reference profiles node - fetches similar CVs/JDs for benchmarking.

ponytail: Only calls vector search when explicitly requested via needs_vector_search flag.
Evaluation flows (CV scoring, skill gap) don't need VS - they work with the provided CV/JD directly.
"""

from __future__ import annotations

from typing import Any

from backend.app.agents.evaluation.state import EvaluationState
from backend.app.tools import get_skill_prerequisites, query_entity_relations


async def retrieve_reference_node(
    state: EvaluationState,
) -> dict[str, Any]:
    """
    Retrieve reference profiles for benchmarking.

    Only calls vector search if explicitly requested (needs_vector_search=True).
    Evaluation-only flows skip vector search entirely.

    Args:
        state: Evaluation state with needs_vector_search flag

    Returns:
        reference_profiles: List of similar profiles (empty if no VS needed)
        kg_context: Knowledge graph context for skill relationships
    """
    needs_vector_search = state.get("needs_vector_search", False)
    parsed_cv = state.get("parsed_cv")
    parsed_jd = state.get("parsed_jd")

    references: list[dict[str, Any]] = []
    kg_context: dict[str, Any] = {"skill_prerequisites": {}, "related_entities": []}

    # === Knowledge Graph context (always fetch - lightweight) ===
    skills_to_expand = (parsed_cv.skills if parsed_cv else [])[:10]
    for skill in skills_to_expand:
        try:
            prereqs = get_skill_prerequisites(skill)
            if prereqs:
                kg_context["skill_prerequisites"][skill] = prereqs
        except Exception:
            pass

    if parsed_jd and parsed_jd.skills:
        main_skill = parsed_jd.skills[0]
        try:
            entities = query_entity_relations(main_skill)
            kg_context["related_entities"] = entities
        except Exception:
            pass

    # === Vector search (only when explicitly requested) ===
    if not needs_vector_search:
        # Skip expensive vector search for evaluation-only flows
        return {
            "reference_profiles": [],
            "kg_context": kg_context,
        }

    # Only reach here if needs_vector_search=True (job_search / cv_recommend flows)
    try:
        references = await _do_vector_search(parsed_cv, parsed_jd)
    except Exception:
        # Silently fail - references are nice-to-have for benchmarking
        pass

    return {
        "reference_profiles": references,
        "kg_context": kg_context,
    }


async def _do_vector_search(
    parsed_cv: Any | None,
    parsed_jd: Any | None,
    match_count: int = 5,
) -> list[dict[str, Any]]:
    """Perform vector search for similar profiles (only called when needed)."""
    from backend.app.tools import hybrid_search

    references: list[dict[str, Any]] = []

    # Build search query from parsed profiles
    query_parts = []
    if parsed_cv:
        if parsed_cv.skills:
            query_parts.extend(parsed_cv.skills[:5])
        if parsed_cv.job_titles:
            query_parts.append(" ".join(parsed_cv.job_titles[:2]))

    if parsed_jd:
        if parsed_jd.skills:
            query_parts.extend(parsed_jd.skills[:5])
        if parsed_jd.job_titles:
            query_parts.append(" ".join(parsed_jd.job_titles[:2]))

    if not query_parts:
        return []

    query = " ".join(query_parts)

    # Search for similar resumes
    try:
        resume_results = await hybrid_search(
            query,
            table="embedded_resumes",
            match_count=match_count,
            alpha=0.6,
        )

        for result in resume_results:
            references.append(
                {
                    "type": "resume",
                    "id": result.id,
                    "title": result.title,
                    "content_preview": result.content[:500],
                    "similarity": result.similarity,
                    "skills": result.metadata.get("skills", []),
                }
            )
    except Exception:
        pass

    # Search for similar jobs
    try:
        job_results = await hybrid_search(
            query,
            table="job_posts",
            match_count=match_count,
            alpha=0.6,
        )

        for result in job_results:
            references.append(
                {
                    "type": "job",
                    "id": result.id,
                    "title": result.title,
                    "content_preview": result.content[:500],
                    "similarity": result.similarity,
                    "skills": result.metadata.get("skills", []),
                }
            )
    except Exception:
        pass

    return references
