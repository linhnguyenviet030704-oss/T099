"""Generate report node - creates final evaluation report."""

from __future__ import annotations

import asyncio
from typing import Any

from backend.app.agents.evaluation.state import EvaluationState
from backend.app.agents.evaluation.types import (
    BenchmarkComparison,
    EvaluationResult,
    MetricScore,
    RadarData,
    SkillAnalysis,
)
from backend.app.guardrails.output import validate_generated_text
from backend.app.shared_brain import AgentBrain


async def generate_report_node(
    state: EvaluationState,
    brain: AgentBrain | None = None,
) -> dict[str, Any]:
    """
    Generate final evaluation report.

    Combines all analysis into a structured EvaluationResult
    with optional natural language summary.
    """
    breakdown_dict = state.get("breakdown", {})
    skill_analysis_dict = state.get("skill_analysis", {})
    overall_score = state.get("overall_score", 0)
    confidence = state.get("confidence", 0.7)
    parsed_cv = state.get("parsed_cv")
    parsed_jd = state.get("parsed_jd")
    reference_profiles = state.get("reference_profiles", [])
    radar_chart_dict = state.get("radar_chart")
    benchmark_dict = state.get("comparison_with_benchmark")
    recommendations = state.get("recommendations", [])
    authenticity = state.get("authenticity", {})
    red_flags = state.get("red_flags", [])

    # Reconstruct objects from dicts
    breakdown = {}
    for name, data in breakdown_dict.items():
        breakdown[name] = MetricScore(**data)

    skill_analysis = SkillAnalysis(**skill_analysis_dict)

    radar_chart = RadarData(**radar_chart_dict) if radar_chart_dict else None
    benchmark = BenchmarkComparison(**benchmark_dict) if benchmark_dict else None

    # Generate natural language summary if brain is available
    response = None
    if brain and (parsed_cv or parsed_jd):
        try:
            prompt = _build_summary_prompt(
                overall_score,
                breakdown,
                skill_analysis,
                parsed_cv,
                parsed_jd,
                recommendations,
                red_flags,
            )
            raw_response = await asyncio.to_thread(brain.chat, prompt, temperature=0.7)
            evidence = [*skill_analysis.matched_skills, *skill_analysis.missing_critical]
            response = validate_generated_text(
                raw_response,
                evidence=evidence,
                max_chars=4_000,
                fallback="",
            ).value
        except Exception:
            pass

    # Add warnings (kết hợp các cảnh báo thông thường và các Red Flags từ xác thực CV)
    warnings = _generate_warnings(skill_analysis, breakdown, confidence, red_flags)

    # Build result
    result = EvaluationResult(
        overall_score=overall_score,
        breakdown=breakdown,
        skill_analysis=skill_analysis,
        recommendations=recommendations,
        warnings=warnings,
        red_flags=red_flags,
        authenticity=authenticity,
        confidence=confidence,
        radar_chart=radar_chart,
        comparison_with_benchmark=benchmark,
        parsed_cv=parsed_cv,
        parsed_jd=parsed_jd,
        reference_profiles=reference_profiles,
        natural_language_summary=str(response) if response else None,
    )

    return {
        "result": result,
        "response": response,
        "overall_score": overall_score,
        "authenticity": authenticity,
        "red_flags": red_flags,
    }


def _build_summary_prompt(
    overall_score: float,
    breakdown: dict[str, MetricScore],
    skill_analysis: SkillAnalysis,
    parsed_cv,
    parsed_jd,
    recommendations: list[str],
    red_flags: list[str] | None = None,
) -> str:
    """Build prompt for generating natural language summary."""
    cv_name = parsed_cv.job_titles[0] if parsed_cv and parsed_cv.job_titles else "the candidate"
    jd_name = parsed_jd.job_titles[0] if parsed_jd and parsed_jd.job_titles else "the job"

    scores_text = "\n".join(
        f"- {m.name}: {m.score:.0f}/100 (weight: {m.weight:.0%})"
        for m in breakdown.values()
    )

    skills_text = f"""
Matched skills ({len(skill_analysis.matched_skills)}): {', '.join(skill_analysis.matched_skills[:10])}
Missing critical skills ({len(skill_analysis.missing_critical)}): {', '.join(skill_analysis.missing_critical[:5])}
"""

    recommendations_text = "\n".join(f"- {r}" for r in recommendations[:3])

    red_flags_text = ""
    if red_flags:
        red_flags_text = "\n**CẢNH BÁO RỦI RO / RED FLAGS ĐÃ PHÁT HIỆN**:\n" + "\n".join(f"- ⚠️ {f}" for f in red_flags)

    return f"""Bạn là một chuyên gia HR với 10 năm kinh nghiệm đánh giá ứng viên.

Hãy viết một báo cáo đánh giá ngắn gọn (200-300 từ) bằng tiếng Việt cho ứng viên ({cv_name}) ứng tuyển vị trí ({jd_name}), bao gồm:

1. **Đánh giá tổng quan**: Nhận xét về mức độ phù hợp thực tế (Overall Real Score: {overall_score:.0f}/100)
2. **Điểm mạnh & Điểm hạn chế**: ({scores_text})
3. **Khoảng trống kỹ năng**: {skills_text}
4. **Độ chân thực của hồ sơ**: Nhận xét về tính nhất quán giữa số năm kinh nghiệm, kỹ năng và bằng chứng dự án thực tế.
5. **Khuyến nghị & Cảnh báo cho Nhà tuyển dụng**: {recommendations_text}
{red_flags_text}

Điểm số chi tiết:
{scores_text}

Viết theo phong cách chuyên nghiệp, khách quan, trung thực, giúp nhà tuyển dụng nhìn ra được năng lực thực tế.
"""


def _generate_warnings(
    skill_analysis: SkillAnalysis,
    breakdown: dict[str, MetricScore],
    confidence: float,
    red_flags: list[str] | None = None,
) -> list[str]:
    """Generate warnings for potential issues."""
    warnings = []

    # Thêm các Red Flags phát hiện được từ CV
    if red_flags:
        for rf in red_flags:
            warnings.append(f"[Cảnh báo rủi ro] {rf}")

    # Low confidence warning
    if confidence < 0.6:
        warnings.append(
            "Dữ liệu đầu vào hạn chế, độ chính xác của đánh giá có thể bị ảnh hưởng."
        )

    # High skill gap warning
    if skill_analysis.missing_critical and len(skill_analysis.missing_critical) > 5:
        warnings.append(
            f"Có {len(skill_analysis.missing_critical)} kỹ năng quan trọng bị thiếu."
        )

    # Experience gap warning
    exp_score = breakdown.get("experience")
    if exp_score and exp_score.score < 50:
        warnings.append("Chênh lệch kinh nghiệm đáng kể với yêu cầu.")

    # No references warning
    if skill_analysis.skill_match_rate < 30:
        warnings.append(
            "Tỷ lệ match kỹ năng thấp, cần đánh giá kỹ hơn về khả năng học hỏi."
        )

    return warnings
