"""Tests for Agent 2 (Interview Question Generator) LangGraph State Machine."""

import json
import uuid
from unittest.mock import MagicMock, patch

import pytest

from backend.app.agents.interview.graph import build_agent2_graph


@pytest.mark.asyncio
async def test_agent2_graph_flow_success():
    cand_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    mock_llm_response = [
        {
            "id": str(uuid.uuid4()),
            "text": "Explain Python async event loop and concurrency.",
            "category": "technical",
            "difficulty": "medium",
            "project_reference": "owner/fastapi-app",
            "jd_requirement_mapped": "Python",
            "skills_tested": ["Python", "asyncio"],
            "expected_answer_outline": "Explains event loop, tasks, coroutines",
            "rubric": {"excellent": "Complete explanation", "acceptable": "Basic", "poor": "Wrong"},
            "follow_ups": [],
        },
        {
            "id": str(uuid.uuid4()),
            "text": "How would you design a distributed caching layer?",
            "category": "system_design",
            "difficulty": "hard",
            "project_reference": None,
            "jd_requirement_mapped": "System Architecture",
            "skills_tested": ["System Design", "Redis"],
            "expected_answer_outline": "Cache invalidation, sharding, replication",
            "rubric": {"excellent": "Detailed architecture", "acceptable": "Basic cache", "poor": "No design"},
            "follow_ups": [],
        },
        {
            "id": str(uuid.uuid4()),
            "text": "Describe a difficult conflict you resolved in a team.",
            "category": "behavioral",
            "difficulty": "easy",
            "project_reference": None,
            "jd_requirement_mapped": "Team Collaboration",
            "skills_tested": ["Communication"],
            "expected_answer_outline": "STAR method applied to conflict resolution",
            "rubric": {"excellent": "Empathetic and constructive", "acceptable": "Adequate", "poor": "Blaming"},
            "follow_ups": [],
        },
    ]

    def mock_llm_fn(prompt: str) -> str:
        return json.dumps(mock_llm_response)

    graph = build_agent2_graph(llm_client=mock_llm_fn)
    result = await graph.ainvoke({
        "candidate_id": cand_id,
        "job_id": job_id,
        "coverage_threshold": 0.50,
    })

    assert result["status"] == "generated"
    assert result["session_id"] is not None
    assert len(result["generated_questions"]) >= 3
    assert result["validation_result"] is not None


@pytest.mark.asyncio
async def test_agent2_graph_refine_loop_on_low_coverage():
    cand_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    # Return only 1 category/requirement initially, triggering refinement
    mock_llm_response = [
        {
            "id": str(uuid.uuid4()),
            "text": "Basic Python syntax question",
            "category": "technical",
            "difficulty": "easy",
            "jd_requirement_mapped": "Python",
        },
        {
            "id": str(uuid.uuid4()),
            "text": "Basic behavioral question",
            "category": "behavioral",
            "difficulty": "easy",
            "jd_requirement_mapped": "Team Collaboration",
        },
        {
            "id": str(uuid.uuid4()),
            "text": "Basic system question",
            "category": "system_design",
            "difficulty": "hard",
            "jd_requirement_mapped": "System Architecture",
        },
    ]

    def mock_llm_fn(prompt: str) -> str:
        return json.dumps(mock_llm_response)

    graph = build_agent2_graph(llm_client=mock_llm_fn)
    result = await graph.ainvoke({
        "candidate_id": cand_id,
        "job_id": job_id,
        "coverage_threshold": 0.90,  # High threshold triggers refine loop
    })

    assert result["status"] == "generated"
    assert result["session_id"] is not None
    assert result["refine_count"] >= 1
