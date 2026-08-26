"""Tests for routing intent classification."""
from __future__ import annotations

import pytest

from backend.app.agents.evaluation.types import IntentType, RejectionReason
from backend.app.agents.routing.intents import (
    check_off_topic,
    check_sensitive_content,
    classify_intent,
    validate_content,
)

# === Case 1: Pure job browsing - NO CV ===

class TestPureBrowsingNoCV:
    """User wants to browse/filter jobs, no CV usage."""

    @pytest.mark.parametrize(
        "query",
        [
            "Các công việc AI Engineer",
            "Các công việc hiện có tại Hà Nội",
            "Công việc Python lập trình viên",
            "Tìm việc AI Engineer",
            "Việc làm Backend Developer",
            "Các vị trí đang tuyển",
            "Danh sách công việc",
            "Tất cả công việc",
            "Show all jobs",
        ],
    )
    def test_browse_jobs_no_cv(self, query: str) -> None:
        result = classify_intent(query)
        assert result.needs_db is True, f"Query '{query}' should query DB"
        assert result.needs_cv is False, f"Query '{query}' should NOT use CV"
        assert result.requires_user_cv is False
        assert result.dispatch_target in ("recommend", "matching")


# === Case 2: Filter by location/domain - NO CV ===

class TestFilterBrowsingNoCV:
    """User filters by location/domain/company - NO CV."""

    def test_location_filter(self) -> None:
        result = classify_intent("Công việc tại Hà Nội")
        assert result.needs_db is True
        assert result.needs_cv is False
        assert result.requires_user_cv is False
        assert result.db_query_params.get("location") == "hà nội"

    def test_company_filter(self) -> None:
        result = classify_intent("Việc làm tại FPT")
        assert result.needs_db is True
        assert result.needs_cv is False
        assert result.db_query_params.get("company_name") == "fpt"

    def test_combined_filter(self) -> None:
        result = classify_intent("Tìm việc AI Engineer tại Hà Nội")
        assert result.needs_db is True
        assert result.needs_cv is False
        assert result.db_query_params.get("domain") is not None
        assert result.db_query_params.get("location") is not None


# === Case 3: Explicit CV mention - USE CV ===

class TestExplicitCVUsage:
    """User explicitly asks to use their CV."""

    @pytest.mark.parametrize(
        "query",
        [
            "Tìm việc phù hợp với CV của tôi",
            "Việc làm phù hợp với tôi",
            "Match CV với các job",
            "Based on my CV",
            "Dựa trên CV của tôi",
            "Theo hồ sơ của tôi",
        ],
    )
    def test_cv_explicit_match(self, query: str) -> None:
        result = classify_intent(query)
        assert result.needs_cv is True, f"Query '{query}' should use CV"
        assert result.requires_user_cv is True


# === Case 4: Deep CV evaluation - USE CV ===

class TestDeepEvaluation:
    """User wants deep CV evaluation."""

    @pytest.mark.parametrize(
        "query",
        [
            "Đánh giá CV của tôi",
            "Đánh giá resume",
            "CV tôi mạnh yếu thế nào",
            "Review my CV",
            "Rate my resume",
            "Điểm mạnh điểm yếu của CV",
            "Hồ sơ của tôi như thế nào",
        ],
    )
    def test_deep_cv_evaluation(self, query: str) -> None:
        result = classify_intent(query)
        assert result.needs_cv is True
        assert result.requires_user_cv is True
        assert result.dispatch_target == "evaluation"
        assert result.intent == IntentType.SELF_EVALUATE


# === Case 5: Skill gap - USE CV ===

class TestSkillGap:
    """User asks about skill gap - CV-based."""

    @pytest.mark.parametrize(
        "query",
        [
            "Tôi cần học gì để làm AI Engineer",
            "Bổ sung kỹ năng gì",
            "Lộ trình học thêm",
            "Skill gap của tôi",
            "Tôi cần cải thiện gì",
        ],
    )
    def test_skill_gap(self, query: str) -> None:
        result = classify_intent(query)
        assert result.needs_cv is True
        assert result.requires_user_cv is True
        assert result.intent == IntentType.SKILL_GAP_ADVICE


# === Case 6: Chitchat - no action ===

class TestChitchat:
    """Pure chitchat."""

    @pytest.mark.parametrize(
        "query",
        ["xin chào", "hello", "hi", "cảm ơn bạn"],
    )
    def test_chitchat(self, query: str) -> None:
        result = classify_intent(query)
        assert result.intent == IntentType.CHITCHAT
        assert result.needs_db is False
        assert result.needs_cv is False


# === Validation ===

class TestContentValidation:
    """Content validation logic."""

    def test_too_short(self) -> None:
        is_valid, reason = validate_content("hi")
        assert is_valid is False
        assert reason == RejectionReason.MINIMUM_CONTENT_NOT_MET

    def test_valid_length(self) -> None:
        text = "x" * 150
        is_valid, reason = validate_content(text)
        assert is_valid is True
        assert reason is None

    def test_too_long(self) -> None:
        text = "x" * 60000
        is_valid, reason = validate_content(text)
        assert is_valid is False
        assert reason == RejectionReason.MALFORMED_REQUEST


class TestSensitiveContent:
    """Detect sensitive content (phone, email)."""

    @pytest.mark.parametrize(
        "text",
        [
            "Liên hệ tôi qua 0901234567",
            "Email: test@example.com",
            "My phone is 555-123-4567",
        ],
    )
    def test_sensitive_detected(self, text: str) -> None:
        assert check_sensitive_content(text) is True

    def test_no_sensitive(self) -> None:
        assert check_sensitive_content("Looking for AI Engineer jobs") is False


class TestOffTopic:
    """Detect off-topic content."""

    @pytest.mark.parametrize(
        "text",
        [
            "thời tiết hôm nay thế nào",
            "crypto bitcoin giá bao nhiêu",
            "nấu ăn ngon nhất",
        ],
    )
    def test_off_topic(self, text: str) -> None:
        assert check_off_topic(text) is True

    @pytest.mark.parametrize(
        "text",
        [
            "Tìm việc AI Engineer",
            "Đánh giá CV của tôi",
            "Các công việc tại Hà Nội",
        ],
    )
    def test_not_off_topic(self, text: str) -> None:
        assert check_off_topic(text) is False


# === Edge cases ===

class TestEdgeCases:
    """Edge cases and ambiguous queries."""

    def test_empty_input(self) -> None:
        result = classify_intent("")
        # Empty defaults to RECOMMEND_GENERAL with CV
        assert result.needs_cv is True

    def test_browse_keyword_without_filter(self) -> None:
        # Has "tìm việc" but no filter - ambiguous, default to CV
        result = classify_intent("Tôi đang tìm việc")
        # When truly ambiguous, prefer CV-based matching
        assert result.needs_cv is True

    def test_filter_overrides_cv_mention(self) -> None:
        # When explicit filter present, even with "phù hợp", lean toward browse
        # Actually "phù hợp" wins here - test priority
        result = classify_intent("Tìm việc AI Engineer phù hợp với tôi")
        # "phù hợp với tôi" is CV-based - this should be CV
        assert result.needs_cv is True


# === Vector search gating ===

class TestVectorSearchGating:
    """Only job_search / cv_recommend flows should use vector search.

    Evaluation flows (SELF_EVALUATE, SKILL_GAP_ADVICE, COMPARE_CV_JOB)
    must NOT use vector search - they work with the provided CV/JD directly.
    """

    def test_evaluation_no_vs(self) -> None:
        """Deep CV evaluation must skip vector search."""
        result = classify_intent("Đánh giá CV của tôi")
        assert result.intent == IntentType.SELF_EVALUATE
        assert result.needs_vector_search is False

    def test_skill_gap_no_vs(self) -> None:
        """Skill gap advice must skip vector search."""
        result = classify_intent("Tôi cần học gì để làm AI Engineer")
        assert result.intent == IntentType.SKILL_GAP_ADVICE
        assert result.needs_vector_search is False

    @pytest.mark.parametrize(
        "query",
        [
            "Các công việc AI Engineer",
            "Công việc Python tại Hà Nội",
            "Tìm việc AI Engineer",
            "Các vị trí đang tuyển",
        ],
    )
    def test_job_search_uses_vs(self, query: str) -> None:
        """Job search flows must use vector search for ranking."""
        result = classify_intent(query)
        assert result.needs_vector_search is True, (
            f"Query '{query}' should use VS for similarity ranking"
        )

    def test_cv_recommend_uses_vs(self) -> None:
        """CV-based recommendation must use VS to find matching jobs."""
        result = classify_intent("Tìm việc phù hợp với CV của tôi")
        assert result.needs_vector_search is True

    def test_chitchat_no_vs(self) -> None:
        """Chitchat must not use VS."""
        result = classify_intent("xin chào")
        assert result.needs_vector_search is False

    def test_vs_independent_of_cv(self) -> None:
        """A flow can need VS but not CV (job browse)."""
        result = classify_intent("Các công việc AI Engineer")
        assert result.needs_vector_search is True
        assert result.needs_cv is False
        assert result.requires_user_cv is False

    def test_vs_with_cv(self) -> None:
        """A flow can need both VS and CV (CV-based recommendation)."""
        result = classify_intent("Tìm việc phù hợp với CV của tôi")
        assert result.needs_vector_search is True
        assert result.needs_cv is True
        assert result.requires_user_cv is True
