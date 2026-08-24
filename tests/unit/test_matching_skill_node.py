import pytest

from backend.app.agents.matching.nodes.skill import skill_node


@pytest.mark.asyncio
async def test_skill_node_scores_from_verified_skills_when_present():
    state = {
        "jd_skills": ["python", "fastapi"],
        "candidates": [
            {
                "application_id": "a",
                "skills": ["python", "fastapi"],
                "verified_skills": ["python"],
            }
        ],
    }
    result = await skill_node(state)
    assert result["candidates"][0]["skill_score"] == 0.5


@pytest.mark.asyncio
async def test_skill_node_falls_back_to_skills_when_verified_skills_absent():
    state = {
        "jd_skills": ["python", "fastapi"],
        "candidates": [{"application_id": "a", "skills": ["python", "fastapi"]}],
    }
    result = await skill_node(state)
    assert result["candidates"][0]["skill_score"] == 1.0


@pytest.mark.asyncio
async def test_skill_node_zero_score_when_verified_skills_explicitly_empty():
    state = {
        "jd_skills": ["python"],
        "candidates": [
            {"application_id": "a", "skills": ["python"], "verified_skills": []}
        ],
    }
    result = await skill_node(state)
    assert result["candidates"][0]["skill_score"] == 0.0
