"""Unit tests for Interview Tools."""

import uuid

from backend.app.agents.interview.tools.validation_tools import (
    persist_interview_session,
    validate_coverage,
)


class TestValidateCoverage:
    def test_coverage_met(self):
        requirements = ["Python", "FastAPI", "PostgreSQL", "Docker", "Git"]
        questions = [
            {"text": "Q1", "jd_requirement_mapped": "Python"},
            {"text": "Q2", "jd_requirement_mapped": "FastAPI"},
            {"text": "Q3", "jd_requirement_mapped": "PostgreSQL"},
            {"text": "Q4", "jd_requirement_mapped": "Docker"},
        ]
        result = validate_coverage.invoke({
            "questions": questions,
            "jd_requirements": requirements,
            "threshold": 0.80,
        })
        assert result["ratio"] == 0.8
        assert result["passed"] is True
        assert result["missing"] == ["Git"]

    def test_coverage_unmet(self):
        requirements = ["Python", "FastAPI", "PostgreSQL", "Docker", "Git"]
        questions = [
            {"text": "Q1", "jd_requirement_mapped": "Python"},
            {"text": "Q2", "jd_requirement_mapped": "FastAPI"},
            {"text": "Q3", "jd_requirement_mapped": "PostgreSQL"},
        ]
        result = validate_coverage.invoke({
            "questions": questions,
            "jd_requirements": requirements,
            "threshold": 0.80,
        })
        assert result["ratio"] == 0.6
        assert result["passed"] is False
        assert set(result["missing"]) == {"Docker", "Git"}

    def test_empty_requirements(self):
        result = validate_coverage.invoke({
            "questions": [{"text": "Tell me about yourself"}],
            "jd_requirements": [],
            "threshold": 0.80,
        })
        assert result["ratio"] == 1.0
        assert result["passed"] is True


class TestPersistInterviewSession:
    def test_persist_returns_valid_uuid(self):
        cand_id = str(uuid.uuid4())
        job_id = str(uuid.uuid4())
        questions = [
            {
                "text": "What is dependency injection?",
                "category": "technical",
                "difficulty": "medium",
                "jd_requirement_mapped": "FastAPI",
            }
        ]
        session_id = persist_interview_session.invoke({
            "candidate_id": cand_id,
            "job_id": job_id,
            "questions": questions,
            "distribution": {"technical": 1},
            "coverage_ratio": 1.0,
            "coverage_threshold": 0.80,
        })
        assert uuid.UUID(session_id)
