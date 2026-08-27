from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

from backend.app.agents.state import AgentState
from backend.app.guardrails.gates import gate_context
from backend.app.guardrails.output import validate_generated_text
from backend.app.shared_brain import AgentBrain, get_brain

CompleteFn = Callable[..., str]

_PROMPT_PATH = Path(__file__).resolve().parents[3] / "prompts" / "system" / "skill_gap_advice.txt"
SKILL_GAP_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")


def make_advice_node(
    *,
    complete: CompleteFn | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
    brain: AgentBrain | None = None,
):
    async def advice_node(state: AgentState) -> dict:
        def _complete(prompt: str, **kwargs):
            if complete is not None:
                return complete(prompt, **kwargs)
            active_brain = brain or get_brain("recommend")
            return active_brain.chat(prompt, api_key=api_key, base_url=base_url)

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

        cv_gate = gate_context(cv_text, source="cv", max_chars=20_000)
        job_gate = gate_context(target_job_text, source="jd", max_chars=10_000)
        if cv_gate.action == "block" or job_gate.action == "block":
            return {
                "response": "Không đủ dữ liệu an toàn để tạo tư vấn kỹ năng.",
                "candidates": [],
                "guardrail_codes": list(dict.fromkeys([*cv_gate.codes, *job_gate.codes])),
            }

        prompt = (
            SKILL_GAP_PROMPT_TEMPLATE.replace("{user_query}", query)
            .replace("{candidate_cv}", str(cv_gate.value))
            .replace("{target_job}", str(job_gate.value))
            .replace("{kg_context}", kg_context)
        )

        fallback = (
            "Để ứng tuyển vị trí này, bạn nên tập trung bổ sung các kỹ năng cốt lõi còn thiếu "
            "so với yêu cầu tuyển dụng, đồng thời chuẩn bị thêm portfolio và dự án thực tế liên quan."
        )
        try:
            advice_response = _complete(prompt)
        except Exception:
            advice_response = fallback

        evidence = [str(skill) for row in candidates[:1] for skill in row.get("skills") or []]
        guarded_output = validate_generated_text(
            advice_response,
            evidence=evidence,
            max_chars=4_000,
            fallback=fallback,
        )

        return {
            "response": guarded_output.value,
            "candidates": [],  # Clear candidates so no job cards are attached for advice intent
            "guardrail_codes": list(
                dict.fromkeys(
                    [
                        *state.get("guardrail_codes", []),
                        *cv_gate.codes,
                        *job_gate.codes,
                        *guarded_output.codes,
                    ]
                )
            ),
        }

    return advice_node
