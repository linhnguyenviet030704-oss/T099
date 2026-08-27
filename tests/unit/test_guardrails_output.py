from __future__ import annotations

from math import inf, nan

from backend.app.guardrails.output import (
    validate_embedding,
    validate_generated_text,
    validate_ranked_items,
)


def test_generated_text_allows_grounded_narrative():
    result = validate_generated_text(
        "Ứng viên có bằng chứng sử dụng Python và FastAPI.",
        evidence=["Python", "FastAPI"],
        max_chars=200,
        fallback="Không đủ bằng chứng.",
    )
    assert result.action == "allow"


def test_generated_text_falls_back_when_ungrounded():
    result = validate_generated_text(
        "Ứng viên rất giỏi Kubernetes.",
        evidence=["Python"],
        max_chars=200,
        fallback="Không đủ bằng chứng.",
    )
    assert result.action == "fallback"
    assert result.value == "Không đủ bằng chứng."
    assert "OUTPUT_UNGROUNDED" in result.codes


def test_generated_text_removes_pii_from_model_narrative():
    result = validate_generated_text(
        "Liên hệ ada@example.com; ứng viên có Python.",
        evidence=["Python"],
        max_chars=200,
        fallback="Python phù hợp.",
    )
    assert result.action == "sanitize"
    assert "ada@example.com" not in result.value


def test_ranked_items_reject_unknown_id_and_use_whole_fallback():
    fallback = [{"application_id": "a", "rrf_score": 0.5}]
    result = validate_ranked_items(
        [{"application_id": "outside", "rrf_score": 0.9}],
        allowed_ids={"a"},
        max_items=10,
        deterministic_fallback=fallback,
    )
    assert result.action == "fallback"
    assert result.value == fallback
    assert "OUTPUT_ID_NOT_ALLOWED" in result.codes


def test_ranked_items_reject_duplicate_and_non_finite_scores():
    fallback = [{"job_id": "a", "rrf_score": 0.5}]
    duplicate = validate_ranked_items(
        [{"job_id": "a"}, {"job_id": "a"}],
        allowed_ids={"a"},
        max_items=10,
        deterministic_fallback=fallback,
    )
    assert duplicate.action == "fallback"

    for value in (nan, inf):
        invalid = validate_ranked_items(
            [{"job_id": "a", "rerank_score": value}],
            allowed_ids={"a"},
            max_items=10,
            deterministic_fallback=fallback,
        )
        assert invalid.action == "fallback"


def test_ranked_items_reject_partial_model_window():
    fallback = [{"job_id": "a"}, {"job_id": "b"}]
    result = validate_ranked_items(
        [{"job_id": "a"}],
        allowed_ids={"a", "b"},
        max_items=10,
        deterministic_fallback=fallback,
    )
    assert result.action == "fallback"
    assert result.value == fallback


def test_ranked_items_preserve_confirmed_constraint_partition():
    fallback = [
        {"application_id": "pass", "constraint_status": "pass"},
        {"application_id": "fail", "constraint_status": "fail"},
    ]
    result = validate_ranked_items(
        list(reversed(fallback)),
        allowed_ids={"pass", "fail"},
        max_items=10,
        deterministic_fallback=fallback,
        enforce_constraints=True,
    )
    assert result.action == "fallback"
    assert result.value == fallback
    assert "OUTPUT_CONSTRAINT_VIOLATION" in result.codes


def test_embedding_requires_finite_non_zero_expected_dimension():
    assert validate_embedding([0.1, 0.2], expected_dimension=2).action == "allow"
    assert validate_embedding([0.0, 0.0], expected_dimension=2).action == "block"
    assert validate_embedding([nan, 0.1], expected_dimension=2).action == "block"
    assert validate_embedding([0.1], expected_dimension=2).action == "block"
