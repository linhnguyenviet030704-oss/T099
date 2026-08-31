from backend.app.agents.evaluation.types import IntentType
from backend.app.agents.routing.semantic import classify_intent_semantically


def test_semantic_fallback_normalizes_job_list_request():
    def complete(*_args, **_kwargs):
        return '{"intent":"list_available_jobs"}'

    result = classify_intent_semantically("Could you display vacancies?", complete=complete)

    assert result.intent == IntentType.LIST_AVAILABLE_JOBS
    assert result.dispatch_target == "recommend"
    assert result.needs_cv is False


def test_semantic_fallback_keeps_rule_result_when_provider_fails():
    def complete(*_args, **_kwargs):
        raise RuntimeError("provider unavailable")

    result = classify_intent_semantically("một yêu cầu rất mơ hồ", complete=complete)

    assert result.intent == IntentType.OUT_OF_SCOPE


def test_semantic_fallback_rejects_unknown_model_label():
    def complete(*_args, **_kwargs):
        return '{"intent":"delete_database"}'

    result = classify_intent_semantically("do something", complete=complete)

    assert result.intent == IntentType.OUT_OF_SCOPE
