"""Knowledge Graph utility functions for evaluation agent.

Wraps the taxonomy KG client for easier access.
ponytail: Direct calls instead of tool agent - simpler, faster, testable.
"""

from __future__ import annotations

from typing import Any

from backend.app.services.kg.client import get_kg_client


def get_skill_prerequisites(skill: str) -> list[str]:
    """
    Get prerequisite skills for a given skill.

    Args:
        skill: Skill name (e.g., 'fastapi', 'kubernetes')

    Returns:
        List of prerequisite skill names
    """
    client = get_kg_client()
    return client.get_skill_prerequisites(skill)


def get_career_path(current_role: str, target_role: str) -> list[str]:
    """
    Get career path steps from current role to target role.

    Args:
        current_role: Current job title
        target_role: Target job title

    Returns:
        List of step descriptions for career progression
    """
    client = get_kg_client()
    return client.get_career_path(current_role, target_role)


def query_entity_relations(
    entity: str,
    relation_type: str | None = None,
) -> list[dict[str, Any]]:
    """
    Query entity relationships from knowledge graph.

    Args:
        entity: Entity name to query
        relation_type: Optional relation type filter

    Returns:
        List of related entities with relation info
    """
    client = get_kg_client()
    return client.query_entity_relations(entity, relation_type)


def expand_skill_with_prerequisites(skills: list[str]) -> dict[str, list[str]]:
    """
    Expand a list of skills with their prerequisites.

    Args:
        skills: List of skill names

    Returns:
        Dict mapping each skill to its prerequisites
    """
    expanded: dict[str, list[str]] = {}
    for skill in skills:
        prereqs = get_skill_prerequisites(skill)
        if prereqs:
            expanded[skill] = prereqs
    return expanded


def get_skill_gap(
    candidate_skills: list[str],
    target_skills: list[str],
) -> tuple[list[str], list[str]]:
    """
    Calculate skill gap between candidate and target.

    Args:
        candidate_skills: Skills the candidate has
        target_skills: Skills required for target

    Returns:
        Tuple of (missing_skills, matched_skills)
    """
    candidate_set = {s.lower() for s in candidate_skills}

    missing = [s for s in target_skills if s.lower() not in candidate_set]
    matched = [s for s in target_skills if s.lower() in candidate_set]

    return missing, matched


def get_role_benchmark(role_name: str, level: str | None = None) -> Any:
    """
    Get standard role benchmark profile for a target career and seniority level.

    Args:
        role_name: Target career/role name
        level: Optional seniority level ('intern', 'fresher', 'junior', 'middle', 'senior', 'lead')

    Returns:
        RoleBenchmark instance with standard skills and benchmark JD
    """
    client = get_kg_client()
    return client.get_role_benchmark(role_name, level)
