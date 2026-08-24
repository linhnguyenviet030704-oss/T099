from __future__ import annotations

import pytest

from backend.app.agents.nodes.router import classify_intent, router_node
from backend.app.services.kg.client import TaxonomyKnowledgeGraphClient, get_kg_client


def test_classify_intent_skill_gap_advice():
    res = classify_intent("Tôi muốn làm việc tại Backend Python Engineer #2 VNG Corporation thì cần bổ sung kỹ năng gì?")
    assert res["intent"] == "SKILL_GAP_ADVICE"
    assert res["needs_db_query"] is True
    assert res["db_query_params"].get("company_name") == "vng"
    assert res["db_query_params"].get("target_job_num") == "2"
    assert res["kg_params"].get("relation_type") == "REQUIRES_SKILL"


def test_classify_intent_target_specific():
    res = classify_intent("Tìm ứng viên phù hợp cho bài đăng FPT Software")
    assert res["intent"] == "TARGET_SPECIFIC"
    assert res["needs_db_query"] is True
    assert res["db_query_params"].get("company_name") == "fpt"


def test_classify_intent_recommend_general():
    res = classify_intent("Gợi ý việc phù hợp")
    assert res["intent"] == "RECOMMEND_GENERAL"
    assert res["needs_db_query"] is True


def test_classify_intent_chitchat():
    res = classify_intent("Xin chào")
    assert res["intent"] == "CHITCHAT"
    assert res["needs_db_query"] is False


@pytest.mark.asyncio
async def test_router_node_returns_state_updates():
    state = {"query": "Tôi cần bổ sung kỹ năng gì cho công ty VNG?"}
    out = await router_node(state)
    assert out["intent"] == "SKILL_GAP_ADVICE"
    assert out["needs_db_query"] is True
    assert out["db_query_params"].get("company_name") == "vng"


def test_knowledge_graph_client_prerequisites():
    client = get_kg_client()
    assert isinstance(client, TaxonomyKnowledgeGraphClient)

    prereqs = client.get_skill_prerequisites("fastapi")
    assert "python" in prereqs

    relations = client.query_entity_relations("VNG", "REQUIRES_SKILL")
    assert relations[0]["entity"] == "VNG"
    assert "python" in relations[0]["target_nodes"]
