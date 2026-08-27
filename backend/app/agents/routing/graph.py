"""Reactive routing agent using LangGraph.

Routes user input to:
- recommend agent (with optional CV load)
- evaluation agent (CV-based scoring)
- or rejection (invalid/off-topic/sensitive)

ponytail: regex-based classification over a learned classifier. Upgrade path:
collect labeled logs, train a small text classifier.
"""

from __future__ import annotations

from typing import Any

from langgraph.graph import END, StateGraph

from backend.app.agents.evaluation.state import RoutingState
from backend.app.agents.evaluation.types import IntentType, RejectionReason
from backend.app.agents.routing.intents import (
    check_off_topic,
    check_sensitive_content,
    classify_intent,
    is_supported_language,
    validate_content,
)
from backend.app.shared_brain import AgentBrain


def routing_node(state: RoutingState, brain: AgentBrain | None = None) -> dict[str, Any]:
    """
    Main routing node that classifies intent and validates input.

    Flow:
    1. Validate content (length, format, language)
    2. Check for off-topic / sensitive content
    3. Classify intent with CV/DB usage flags
    4. Determine dispatch target
    """
    raw_input = state.get("raw_input", "")

    # === Step 0: Empty input check ===
    if not raw_input or not raw_input.strip():
        return {
            "intent": IntentType.OUT_OF_SCOPE,
            "is_valid": False,
            "rejection_reason": RejectionReason.MALFORMED_REQUEST,
            "dispatch_target": None,
            "context": {},
            "validation_errors": ["Input is empty"],
        }

    # === Step 0.5: Language check (reject non-English and non-Vietnamese) ===
    is_supported, _ = is_supported_language(raw_input)
    if not is_supported:
        return {
            "intent": IntentType.UNSUPPORTED_LANGUAGE,
            "is_valid": False,
            "rejection_reason": RejectionReason.UNSUPPORTED_LANGUAGE,
            "dispatch_target": None,
            "context": {},
            "validation_errors": ["Ngôn ngữ không được hỗ trợ. Hệ thống chỉ hỗ trợ tiếng Việt và tiếng Anh."],
        }

    # === Step 1: Validate content length ===
    is_valid, rejection_reason = validate_content(raw_input)
    if not is_valid:
        if rejection_reason == RejectionReason.MINIMUM_CONTENT_NOT_MET:
            intent = IntentType.CONTENT_TOO_SHORT
        elif rejection_reason == RejectionReason.UNSUPPORTED_LANGUAGE:
            intent = IntentType.UNSUPPORTED_LANGUAGE
        else:
            intent = IntentType.INVALID_FORMAT

        return {
            "intent": intent,
            "is_valid": False,
            "rejection_reason": rejection_reason,
            "dispatch_target": None,
            "context": {},
            "validation_errors": [f"Content validation failed: {rejection_reason.value if rejection_reason else 'unknown'}"],
        }

    # === Step 2: Off-topic check ===
    if check_off_topic(raw_input):
        return {
            "intent": IntentType.OUT_OF_SCOPE,
            "is_valid": False,
            "rejection_reason": RejectionReason.OFF_TOPIC,
            "dispatch_target": None,
            "context": {},
            "validation_errors": ["Input appears to be off-topic"],
        }

    # === Step 3: Classify intent with CV/DB usage ===
    classification = classify_intent(raw_input)
    if classification.intent == IntentType.OUT_OF_SCOPE:
        return {
            "intent": IntentType.OUT_OF_SCOPE,
            "is_valid": False,
            "rejection_reason": RejectionReason.OFF_TOPIC,
            "dispatch_target": None,
            "context": {},
            "validation_errors": ["Input is outside the recruitment domain"],
        }
    if classification.intent == IntentType.UNSUPPORTED_LANGUAGE:
        return {
            "intent": IntentType.UNSUPPORTED_LANGUAGE,
            "is_valid": False,
            "rejection_reason": RejectionReason.UNSUPPORTED_LANGUAGE,
            "dispatch_target": None,
            "context": {},
            "validation_errors": ["Input language is not supported"],
        }
    if classification.intent == IntentType.UNKNOWN:
        return {
            "intent": IntentType.UNKNOWN,
            "is_valid": False,
            "rejection_reason": RejectionReason.AMBIGUOUS_REQUEST,
            "dispatch_target": None,
            "context": {},
            "validation_errors": ["Recruitment intent is ambiguous"],
        }

    # === Step 4: Sensitive content flag (process but mark) ===
    has_sensitive = check_sensitive_content(raw_input)

    # === Step 5: Build context for downstream ===
    context = {
        "needs_db": classification.needs_db,
        "needs_cv": classification.needs_cv,
        "requires_user_cv": classification.requires_user_cv,
        "needs_vector_search": classification.needs_vector_search,  # Gate VS calls
        "db_query_params": classification.db_query_params,
        "kg_params": classification.kg_params,
        "has_sensitive_content": has_sensitive,
    }

    return {
        "intent": classification.intent,
        "is_valid": True,
        "rejection_reason": None,
        "dispatch_target": classification.dispatch_target,
        "context": context,
        "validation_errors": [],
    }


def rejection_node(state: RoutingState) -> dict[str, Any]:
    """Handle rejection cases - generate appropriate error response."""
    rejection_reason = state.get("rejection_reason")
    validation_errors = state.get("validation_errors", [])

    error_message = _get_rejection_message(rejection_reason, validation_errors)

    return {
        "response": error_message,
        "dispatch_target": None,
    }


def _get_rejection_message(
    rejection_reason: RejectionReason | None,
    validation_errors: list[str],
) -> str:
    """Generate human-readable rejection message."""
    messages = {
        RejectionReason.MINIMUM_CONTENT_NOT_MET: (
            "Nội dung quá ngắn để thực hiện đánh giá. "
            "Vui lòng cung cấp CV hoặc JD đầy đủ (ít nhất 100 ký tự)."
        ),
        RejectionReason.UNPARSEABLE_FORMAT: (
            "Không thể phân tích định dạng. "
            "Vui lòng cung cấp text thuần túy."
        ),
        RejectionReason.OFF_TOPIC: (
            "Nội dung không liên quan đến tuyển dụng. "
            "Hệ thống chỉ hỗ trợ câu hỏi về CV, việc làm, và đánh giá ứng viên."
        ),
        RejectionReason.UNSUPPORTED_LANGUAGE: (
            "Hiện tại hệ thống hỗ trợ tiếng Việt và tiếng Anh. "
            "Vui lòng gửi lại yêu cầu bằng một trong hai ngôn ngữ này."
        ),
        RejectionReason.AMBIGUOUS_REQUEST: (
            "Chưa xác định được yêu cầu tuyển dụng. "
            "Vui lòng nói rõ bạn muốn tìm việc, đánh giá CV, xem thiếu kỹ năng hay tìm ứng viên."
        ),
        RejectionReason.SENSITIVE_DATA_DETECTED: (
            "Phát hiện thông tin nhạy cảm. "
            "Vui lòng ẩn số điện thoại/email trước khi gửi."
        ),
        RejectionReason.QUOTA_EXCEEDED: (
            "Bạn đã sử dụng hết quota. "
            "Vui lòng thử lại sau hoặc nâng cấp gói."
        ),
        RejectionReason.MALFORMED_REQUEST: (
            "Yêu cầu không hợp lệ. Vui lòng thử lại."
        ),
        RejectionReason.UNSUPPORTED_LANGUAGE: (
            "Hệ thống chỉ hỗ trợ tiếng Việt và tiếng Anh. "
            "Vui lòng gửi yêu cầu bằng tiếng Việt hoặc tiếng Anh."
        ),
    }

    if rejection_reason in messages:
        return messages[rejection_reason]

    if validation_errors:
        return f"Lỗi xác thực: {'; '.join(validation_errors)}"

    return "Không thể xử lý yêu cầu."


def build_routing_graph(brain: AgentBrain | None = None) -> Any:
    """Build the routing agent LangGraph."""
    graph = StateGraph(RoutingState)

    graph.add_node("route", lambda s: routing_node(s, brain))
    graph.add_node("reject", rejection_node)

    graph.set_entry_point("route")

    def should_reject(state: RoutingState) -> str:
        return END if state.get("is_valid", False) else "reject"

    graph.add_conditional_edges("route", should_reject)
    graph.add_edge("reject", END)

    return graph.compile()
