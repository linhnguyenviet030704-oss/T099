from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from backend.app.agents.state import AgentState
from backend.app.clients.llm import chat_complete

CompleteFn = Callable[..., str]

_PROMPT_PATH = Path(__file__).resolve().parents[3] / "prompts" / "system" / "skill_gap_advice.txt"
SKILL_GAP_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")


def make_advice_node(
    *,
    complete: CompleteFn | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
):
    async def advice_node(state: AgentState) -> dict:
        def _complete(prompt: str, **kwargs):
            if complete is not None:
                return complete(prompt, **kwargs)
            return chat_complete(prompt, api_key=api_key, base_url=base_url)

        query = str(state.get("query") or state.get("message") or "").strip()
        cv_text = str(state.get("job_description") or state.get("jd_query") or "").strip()
        kg_context = json.dumps(state.get("kg_context") or {}, ensure_ascii=False)

        candidates = list(state.get("candidates") or [])
        target_job_text = ""
        if candidates:
            top = candidates[0]
            title = top.get("title") or ""
            company = top.get("company_name") or ""
            skills = ", ".join(top.get("skills") or [])
            body = top.get("clean_markdown") or top.get("markdown") or ""
            target_job_text = f"Title: {title}\nCompany: {company}\nRequired Skills: {skills}\nDetails: {body}"
        else:
            target_job_text = "Không có thông tin chi tiết vị trí công việc cụ thể."

        prompt = (
            SKILL_GAP_PROMPT_TEMPLATE.replace("{user_query}", query)
            .replace("{candidate_cv}", cv_text)
            .replace("{target_job}", target_job_text)
            .replace("{kg_context}", kg_context)
        )

        try:
            advice_response = _complete(prompt)
        except Exception:
            advice_response = (
                "Để ứng tuyển vị trí này, bạn nên tập trung bổ sung các kỹ năng cốt lõi còn thiếu "
                "so với yêu cầu tuyển dụng, đồng thời chuẩn bị thêm portfolio và dự án thực tế liên quan."
            )

        return {
            "response": advice_response,
            "candidates": [],  # Clear candidates so no job cards are attached for advice intent
        }

    return advice_node
