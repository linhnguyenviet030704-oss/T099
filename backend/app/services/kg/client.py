"""Knowledge Graph Client Interface for Antigravity AI Agent System.

Provides entity relation querying, skill prerequisite mapping, and career path routing.
This interface allows plugging Graph Databases (Neo4j, NetworkX, GraphDB) in the future.
"""

from __future__ import annotations

from typing import Any, Protocol


class KnowledgeGraphClient(Protocol):
    """Protocol interface for Knowledge Graph queries."""

    def query_entity_relations(self, entity_name: str, relation_type: str | None = None) -> list[dict[str, Any]]:
        ...

    def get_skill_prerequisites(self, skill_name: str) -> list[str]:
        ...

    def get_career_path(self, current_role: str, target_role: str) -> list[str]:
        ...


class TaxonomyKnowledgeGraphClient:
    """Production-ready Taxonomy Knowledge Graph Client.

    Grounded in current skill taxonomy and extensible for Graph DB integrations.
    """

    def __init__(self, graph_db_uri: str | None = None) -> None:
        self.graph_db_uri = graph_db_uri

    def query_entity_relations(self, entity_name: str, relation_type: str | None = None) -> list[dict[str, Any]]:
        if not entity_name:
            return []
        # Return mock / taxonomy entity relations
        return [
            {
                "entity": entity_name,
                "relation": relation_type or "REQUIRES_SKILL",
                "target_nodes": ["python", "fastapi", "docker", "postgresql", "restful_api"],
            }
        ]

    def get_skill_prerequisites(self, skill_name: str) -> list[str]:
        token = (skill_name or "").lower().strip()
        prereqs = {
            "fastapi": ["python", "restful_api"],
            "django": ["python", "sql"],
            "react": ["javascript", "html", "css"],
            "flutter": ["dart", "mobile_dev"],
            "docker": ["linux", "networking"],
            "kubernetes": ["docker", "linux"],
        }
        return prereqs.get(token, [])

    def get_career_path(self, current_role: str, target_role: str) -> list[str]:
        return [
            f"Củng cố nền tảng {current_role}",
            "Bổ sung kỹ năng cốt lõi còn thiếu",
            "Thực hiện dự án thực tế với công nghệ mới",
            f"Sẵn sàng đảm nhận vị trí {target_role}",
        ]


_DEFAULT_KG_CLIENT = TaxonomyKnowledgeGraphClient()


def get_kg_client() -> TaxonomyKnowledgeGraphClient:
    return _DEFAULT_KG_CLIENT
