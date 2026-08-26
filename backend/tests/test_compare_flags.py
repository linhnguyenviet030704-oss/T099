"""Tests for compare flow flags and constraints."""

from __future__ import annotations

import pytest

from backend.app.agents.evaluation.types import IntentType
from backend.app.agents.routing.compare_flags import (
    COMPARE_CANDIDATES_FLAGS,
    COMPARE_JOBS_FLAGS,
    CompareFlowFlags,
    assert_compare_flow_is_pure,
)


class TestCompareFlags:
    """Compare flow flags must enforce: needs_cv=True, needs_db=True, needs_vector_search=False."""

    def test_compare_candidates_flags(self) -> None:
        assert COMPARE_CANDIDATES_FLAGS.needs_cv is True
        assert COMPARE_CANDIDATES_FLAGS.needs_db is True
        assert COMPARE_CANDIDATES_FLAGS.needs_vector_search is False
        assert COMPARE_CANDIDATES_FLAGS.requires_user_cv is True

    def test_compare_jobs_flags(self) -> None:
        assert COMPARE_JOBS_FLAGS.needs_cv is True
        assert COMPARE_JOBS_FLAGS.needs_db is True
        assert COMPARE_JOBS_FLAGS.needs_vector_search is False
        assert COMPARE_JOBS_FLAGS.requires_user_cv is True

    def test_intent_types_defined(self) -> None:
        """Both compare intents must be in IntentType enum."""
        assert IntentType.COMPARE_CANDIDATES.value == "compare_candidates"
        assert IntentType.COMPARE_JOBS.value == "compare_jobs"


class TestCompareFlowPurity:
    """Runtime check prevents accidental vector search in compare flows."""

    def test_pure_flow_passes(self) -> None:
        # Should not raise
        assert_compare_flow_is_pure(COMPARE_CANDIDATES_FLAGS)
        assert_compare_flow_is_pure(COMPARE_JOBS_FLAGS)

    def test_impure_flow_fails(self) -> None:
        """If someone flips needs_vector_search=True, the assert must fail."""
        bad_flags = CompareFlowFlags(
            needs_cv=True,
            needs_db=True,
            needs_vector_search=True,  # WRONG
            requires_user_cv=True,
        )
        with pytest.raises(RuntimeError, match="vector search"):
            assert_compare_flow_is_pure(bad_flags)

    def test_default_flags_are_pure(self) -> None:
        """Default-constructed flags should be pure."""
        default_flags = CompareFlowFlags()
        assert default_flags.needs_vector_search is False
        assert_compare_flow_is_pure(default_flags)
