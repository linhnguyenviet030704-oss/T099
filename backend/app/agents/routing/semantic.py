"""Phân loại ngữ nghĩa dự phòng cho các câu không khớp luật định tuyến."""

from __future__ import annotations

import json
from collections.abc import Callable

from backend.app.agents.routing.intents import IntentClassification, classify_intent

CompleteFn = Callable[..., str]

_CANONICAL_QUERIES = {
    "chitchat": "xin chào",
    "list_available_jobs": "show all jobs",
    "search_jobs": "tìm việc Python",
    "recommend_jobs": "gợi ý việc phù hợp với CV của tôi",
    "evaluate_cv": "đánh giá CV của tôi",
    "skill_gap": "tôi cần học gì để phát triển nghề nghiệp",
    "find_candidates": "tìm ứng viên phù hợp",
    "out_of_scope": "thời tiết hôm nay",
    "unknown": "yêu cầu chưa rõ",
}


def classify_intent_semantically(
    message: str,
    *,
    complete: CompleteFn,
) -> IntentClassification:
    """Dùng LLM chuẩn hóa ý định rồi đưa lại qua router tất định.

    Nếu nhà cung cấp lỗi hoặc trả dữ liệu không hợp lệ, hàm giữ nguyên kết quả
    của router luật để cuộc trò chuyện không bị gián đoạn.
    """

    fallback = classify_intent(message)
    prompt = f"""Bạn là bộ phân loại ý định cho trợ lý tuyển dụng Việt–Anh.
Chỉ trả JSON với khóa \"intent\" và đúng một trong các nhãn sau:
chitchat, list_available_jobs, search_jobs, recommend_jobs, evaluate_cv,
skill_gap, find_candidates, out_of_scope, unknown.

Quy tắc:
- list_available_jobs: người dùng muốn xem/liệt kê các việc đang có.
- search_jobs: tìm việc theo vai trò, kỹ năng, công ty hoặc địa điểm.
- recommend_jobs: muốn việc phù hợp với bản thân hoặc CV.
- evaluate_cv: muốn nhận xét/chấm CV.
- skill_gap: hỏi kỹ năng hoặc lộ trình nghề nghiệp.
- find_candidates: nhà tuyển dụng muốn tìm/lọc ứng viên.
- chitchat: lời chào, cảm ơn hoặc trò chuyện xã giao.
- out_of_scope: rõ ràng không liên quan việc làm, CV hay tuyển dụng.
- unknown: không đủ thông tin để kết luận.

Tin nhắn: {json.dumps(message, ensure_ascii=False)}"""
    try:
        raw = complete(prompt, json_object=True, temperature=0)
        payload = json.loads(raw)
        label = str(payload.get("intent") or "").strip().lower()
        canonical = _CANONICAL_QUERIES.get(label)
        if canonical is None:
            return fallback
        return classify_intent(canonical)
    except (TypeError, ValueError, json.JSONDecodeError, KeyError):
        return fallback
    except Exception:
        return fallback
