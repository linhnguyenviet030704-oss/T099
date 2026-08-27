"""Unit tests for Diversity Enforcer."""

import pytest

from backend.app.agents.interview.diversity import DiversityViolation, enforce_diversity


class TestDiversityEnforcer:
    def test_empty_questions(self):
        assert enforce_diversity([]) == []

    def test_text_deduplication(self):
        questions = [
            {"text": "What is dependency injection?", "category": "technical", "difficulty": "medium"},
            {"text": "  what is DEPENDENCY injection?  ", "category": "technical", "difficulty": "medium"},
            {"text": "Tell me about a conflict.", "category": "behavioral", "difficulty": "easy"},
            {"text": "Design a URL shortener.", "category": "system_design", "difficulty": "hard"},
        ]
        result = enforce_diversity(questions)
        assert len(result) == 3
        texts = [q["text"] for q in result]
        assert "What is dependency injection?" in texts
        assert "Tell me about a conflict." in texts
        assert "Design a URL shortener." in texts

    def test_category_spread_violation(self):
        questions = [
            {"text": "Q1", "category": "technical", "difficulty": "medium"},
            {"text": "Q2", "category": "technical", "difficulty": "hard"},
            {"text": "Q3", "category": "behavioral", "difficulty": "easy"},
        ]
        with pytest.raises(DiversityViolation) as exc_info:
            enforce_diversity(questions, min_categories=3)
        assert "need at least 3" in str(exc_info.value)

    def test_max_per_category_enforced(self):
        questions = [
            {"text": f"Tech {i}", "category": "technical", "difficulty": "medium"}
            for i in range(8)
        ] + [
            {"text": "Beh 1", "category": "behavioral", "difficulty": "easy"},
            {"text": "Sys 1", "category": "system_design", "difficulty": "hard"},
        ]
        result = enforce_diversity(questions, max_per_category=5)
        tech_qs = [q for q in result if q["category"] == "technical"]
        assert len(tech_qs) == 5
        assert len(result) == 7

    def test_hard_question_ratio_warning(self, caplog):
        questions = [
            {"text": "Q1", "category": "technical", "difficulty": "easy"},
            {"text": "Q2", "category": "behavioral", "difficulty": "easy"},
            {"text": "Q3", "category": "system_design", "difficulty": "medium"},
        ]
        with caplog.at_level("WARNING"):
            result = enforce_diversity(questions)
            assert len(result) == 3
            assert "Hard question ratio" in caplog.text
