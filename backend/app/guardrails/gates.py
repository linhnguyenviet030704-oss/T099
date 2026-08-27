"""Safety and data-quality gates used between parse/retrieve and providers."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

from backend.app.guardrails.input import normalize_text

GateAction = Literal["pass", "sanitize", "degrade", "block"]
ContextSource = Literal["chat", "cv", "jd", "retrieval", "chat_history"]

_EMAIL_RE = re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
_PHONE_RE = re.compile(r"(?<!\w)(?:\+?84|0)(?:3|5|7|8|9)\d(?:[\s.-]?\d){7,8}(?!\w)")
_URL_RE = re.compile(r"(?i)\b(?:https?://|www\.)\S+|\b(?:linkedin|github|facebook|twitter|x)\.com/\S+")
_UUID_RE = re.compile(r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b")
_LABELED_ID_RE = re.compile(
    r"(?im)^\s*(?:full[ _-]?name|name|họ\s*(?:và\s*)?tên|ứng\s*viên|candidate|cccd|cmnd|passport|resume[ _-]?id|application[ _-]?id|user[ _-]?id|storage[ _-]?path)\s*[:=].*$"
)
_SECRET_PATTERNS = (
    re.compile(r"(?i)\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*[^\s,;]+"),
    re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{12,}"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{12,}\b"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{20,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
)
_INJECTION_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("ignore_instructions", re.compile(r"(?i)\b(?:ignore|disregard|forget|bỏ qua)\b.{0,40}\b(?:instruction|prompt|chỉ dẫn|yêu cầu)")),
    ("reveal_prompt", re.compile(r"(?i)\b(?:show|reveal|print|tiết lộ|hiển thị)\b.{0,40}\b(?:system prompt|developer message|prompt hệ thống)")),
    ("role_override", re.compile(r"(?i)\b(?:you are now|act as|đóng vai|từ giờ bạn là)\b")),
    ("external_action", re.compile(r"(?i)\b(?:send|upload|exfiltrate|gửi|tải)\b.{0,50}\b(?:elsewhere|server|url|email|ra ngoài|máy chủ)\b")),
    ("tool_override", re.compile(r"(?i)\b(?:call|invoke|run|execute|gọi|chạy)\b.{0,30}\b(?:tool|command|shell|sql|công cụ|lệnh)\b")),
)
_PROTECTED_REQUEST_PATTERNS = (
    re.compile(
        r"\b(?:show|give|send|tell|print|display|reveal|expose|dump|repeat|quote|translate|"
        r"summari[sz]e|share|provide|can i see|may i see)\b.{0,60}"
        r"\b(?:system prompt|developer (?:message|instruction)|prompt template|internal prompt|"
        r"system (?:instruction|message|policy)|tool (?:schema|configuration|config)|"
        r"your prompt|agent prompt)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:what is|what are|describe|explain)\b.{0,30}"
        r"\b(?:your|the internal|the configured|current)\b.{0,20}"
        r"\b(?:system prompt|developer (?:message|instruction)|prompt|tool (?:schema|config))\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:show|give|send|tell|print|display|reveal|expose|dump|share|provide)\b.{0,40}"
        r"\b(?:your|the|internal|configured|actual|real|current)\b.{0,12}"
        r"\b(?:api key|secret|password|token)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:give|send|provide|share)\b.{0,15}\b(?:me|us|to me|to us)\b.{0,15}"
        r"\b(?:an?\s+|the\s+|your\s+)?(?:api key|secret|password|token)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:what is|what are|where is|where are)\b.{0,30}"
        r"\b(?:your|the internal|the configured|current)\b.{0,12}"
        r"\b(?:api key|secret|password|token)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:cho|dua|gui|noi|in|hien thi|tiet lo|lap lai|trich dan|dich|tom tat|"
        r"chia se|cung cap|cho biet)\b.{0,60}"
        r"\b(?:system prompt|developer message|developer instruction|prompt template|internal prompt|"
        r"prompt he thong|prompt cua ban|chi dan he thong|thong diep developer|cau hinh cong cu|"
        r"api key|secret|mat khau|token)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:mo ta|giai thich|cho biet)\b.{0,40}"
        r"\b(?:system prompt|prompt he thong|chi dan he thong)\b.{0,20}\b(?:cua ban|noi bo)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:api key|secret|mat khau|token)\b.{0,20}\b(?:cua ban|he thong|noi bo)\b"
        r".{0,15}\b(?:la gi|o dau|cho toi|gui toi)\b",
        re.IGNORECASE,
    ),
)
_FOLDED_INJECTION_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("ignore_instructions", re.compile(r"\b(?:bo qua|quen)\b.{0,40}\b(?:instruction|prompt|chi dan|yeu cau)\b")),
    ("reveal_prompt", re.compile(r"\b(?:tiet lo|hien thi|in|cho biet)\b.{0,40}\b(?:system prompt|prompt he thong)\b")),
    ("role_override", re.compile(r"\b(?:dong vai|tu gio ban la)\b")),
    ("tool_override", re.compile(r"\b(?:goi|chay)\b.{0,30}\b(?:tool|command|shell|sql|cong cu|lenh)\b")),
)
_DEFERRED_INJECTION_RE = re.compile(
    r"\b(?:remember|store|save|memorize|ghi nho|luu lai)\b.{0,80}"
    r"\b(?:instruction|prompt|command|chi dan|yeu cau|lenh)\b.{0,80}"
    r"\b(?:later|next|after|sau|lat nua|tiep theo)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class GateDecision:
    action: GateAction
    value: Any
    codes: tuple[str, ...] = ()
    signals: tuple[str, ...] = ()

    @property
    def can_continue(self) -> bool:
        return self.action != "block"


def _fold_for_detection(text: str) -> str:
    folded = unicodedata.normalize("NFKD", normalize_text(text)).casefold()
    folded = "".join(char for char in folded if not unicodedata.combining(char))
    folded = folded.replace("đ", "d")
    # Common adversarial/mistyped variants. This is only a detection view;
    # the original normalized value is preserved for legitimate processing.
    replacements = {
        r"\bprom+t\b": "prompt",
        r"\bpr0mpt\b": "prompt",
        r"\bsytem\b": "system",
        r"\bsyst3m\b": "system",
        r"\bk3y\b": "key",
        r"\bapi[_-]?k[e3]y\b": "api key",
        r"\binstrution\b": "instruction",
        r"\binstructon\b": "instruction",
    }
    for pattern, replacement in replacements.items():
        folded = re.sub(pattern, replacement, folded)
    return re.sub(r"\s+", " ", folded).strip()


def find_injection_signals(text: str) -> tuple[str, ...]:
    normalized = normalize_text(text)
    folded = _fold_for_detection(normalized)
    signals = [name for name, pattern in _INJECTION_PATTERNS if pattern.search(normalized)]
    signals.extend(name for name, pattern in _FOLDED_INJECTION_PATTERNS if pattern.search(folded))
    if any(pattern.search(folded) for pattern in _PROTECTED_REQUEST_PATTERNS):
        signals.append("protected_information_request")
    if _DEFERRED_INJECTION_RE.search(folded):
        signals.append("deferred_instruction")
    return tuple(dict.fromkeys(signals))


def contains_secret(text: str) -> bool:
    return any(pattern.search(text) for pattern in _SECRET_PATTERNS)


def sanitize_sensitive_text(text: str, *, redact_internal_ids: bool = True) -> tuple[str, bool]:
    cleaned = normalize_text(text)
    original = cleaned
    cleaned = _LABELED_ID_RE.sub("", cleaned)
    cleaned = _EMAIL_RE.sub("[REDACTED_EMAIL]", cleaned)
    cleaned = _PHONE_RE.sub("[REDACTED_PHONE]", cleaned)
    cleaned = _URL_RE.sub("[REDACTED_URL]", cleaned)
    if redact_internal_ids:
        cleaned = _UUID_RE.sub("[REDACTED_ID]", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned, cleaned != original


def _remove_injection_lines(text: str) -> str:
    kept: list[str] = []
    for line in text.splitlines():
        if find_injection_signals(line):
            continue
        kept.append(line)
    return "\n".join(kept).strip()


def gate_context(
    text: str,
    *,
    source: ContextSource,
    max_chars: int,
    redact_pii: bool = True,
) -> GateDecision:
    normalized = normalize_text(text)
    if not normalized:
        return GateDecision("degrade", "", ("DATA_LOW_CONTENT",))
    if len(normalized) > max_chars:
        normalized = normalized[:max_chars].rstrip()
        budget_codes: tuple[str, ...] = ("DATA_BUDGET_EXCEEDED",)
    else:
        budget_codes = ()

    if contains_secret(normalized):
        return GateDecision("block", "", ("DATA_SECRET_DETECTED",))

    signals = find_injection_signals(normalized)
    if signals and source == "chat":
        override_signals = set(signals) - {"reveal_prompt", "protected_information_request"}
        code = (
            "DATA_PROTECTED_INFO_REQUEST"
            if "protected_information_request" in signals and not override_signals
            else "DATA_INJECTION_SIGNAL"
        )
        return GateDecision("block", "", (code,), signals)

    value = normalized
    codes = list(budget_codes)
    action: GateAction = "degrade" if budget_codes else "pass"
    if redact_pii:
        value, redacted = sanitize_sensitive_text(value)
        if redacted:
            codes.append("DATA_PII_REDACTED")
            action = "sanitize" if action == "pass" else action
    if signals:
        value = _remove_injection_lines(value)
        codes.append("DATA_INJECTION_SIGNAL")
        action = "sanitize" if value else "degrade"
    if not value.strip():
        codes.append("DATA_LOW_CONTENT")
        action = "degrade"
    return GateDecision(action, value, tuple(dict.fromkeys(codes)), signals)


def gate_records(
    records: Sequence[Mapping[str, Any]],
    *,
    id_field: str,
    allowed_ids: set[str],
    max_items: int,
) -> GateDecision:
    if max_items <= 0:
        raise ValueError("max_items must be positive")
    seen: set[str] = set()
    copied: list[dict[str, Any]] = []
    for record in records:
        item_id = str(record.get(id_field) or "")
        if not item_id or item_id not in allowed_ids or item_id in seen:
            return GateDecision("block", [], ("DATA_SCOPE_MISMATCH",))
        seen.add(item_id)
        copied.append(dict(record))
    if len(copied) > max_items:
        return GateDecision("degrade", copied[:max_items], ("DATA_BUDGET_EXCEEDED",))
    return GateDecision("pass", copied)


def gate_evidence(
    evidence: Sequence[Mapping[str, Any]],
    *,
    minimum_items: int = 1,
) -> GateDecision:
    usable = [dict(item) for item in evidence if any(str(value).strip() for value in item.values())]
    if len(usable) < minimum_items:
        return GateDecision("degrade", usable, ("DATA_EVIDENCE_INSUFFICIENT",))
    return GateDecision("pass", usable)


def gate_parsed_quality(metadata: Mapping[str, Any], text: str) -> GateDecision:
    if not str(text).strip() or bool(metadata.get("low_content")):
        return GateDecision("degrade", dict(metadata), ("DATA_LOW_CONTENT",))
    return GateDecision("pass", dict(metadata))


def sanitize_record_contexts(
    records: Sequence[Mapping[str, Any]],
    *,
    fields: Sequence[str] = ("markdown", "clean_markdown", "summary"),
    max_chars: int = 4000,
) -> GateDecision:
    output: list[dict[str, Any]] = []
    codes: list[str] = []
    action: GateAction = "pass"
    for record in records:
        copied = dict(record)
        for field in fields:
            if not copied.get(field):
                continue
            decision = gate_context(str(copied[field]), source="retrieval", max_chars=max_chars)
            if decision.action == "block":
                return decision
            copied[field] = decision.value
            codes.extend(decision.codes)
            if decision.action in {"sanitize", "degrade"}:
                action = decision.action
        output.append(copied)
    return GateDecision(action, output, tuple(dict.fromkeys(codes)))
