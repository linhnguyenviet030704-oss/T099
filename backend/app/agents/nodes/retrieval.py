"""Knowledge Graph & Retrieval Context Node for Antigravity AI Agent System.

Enriches state with Knowledge Graph relation nodes, skill prerequisites, and target entity metadata.
"""

from __future__ import annotations

from backend.app.agents.state import AgentState
from backend.app.services.kg.client import get_kg_client


async def kg_retrieval_node(state: AgentState) -> dict:
    kg_params = state.get("kg_params") or {}
    entity_name = str(kg_params.get("entity_name") or "")
    relation_type = str(kg_params.get("relation_type") or "REQUIRES_SKILL")

    client = get_kg_client()
    relations = client.query_entity_relations(entity_name, relation_type)

    cv_skills = list(state.get("jd_skills") or state.get("cv_verified") or [])
    prereqs = []
    for skill in cv_skills:
        prereqs.extend(client.get_skill_prerequisites(skill))

    kg_context = {
        "entity_relations": relations,
        "skill_prerequisites": list(set(prereqs)),
        "active_domain": "IT_SOFTWARE",
    }

    return {"kg_context": kg_context}
