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
    """Build prompt for generating natural language summary and career advice."""
    cv_name = parsed_cv.job_titles[0] if parsed_cv and parsed_cv.job_titles else "Ứng viên"
    jd_name = parsed_jd.job_titles[0] if parsed_jd and parsed_jd.job_titles else "Vị trí mục tiêu"

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

    return f"""Bạn là một chuyên gia tư vấn nghề nghiệp IT và Technical Recruiter cao cấp với 10 năm kinh nghiệm.

Hãy viết một báo cáo đánh giá năng lực và tư vấn lộ trình ngắn gọn (250-350 từ) bằng tiếng Việt cho ứng viên ({cv_name}) hướng tới vị trí/ngành nghề ({jd_name}), bao gồm:

1. **Đánh giá tổng quan**: Nhận xét về độ tương thích và năng lực thực tế (Điểm tổng thể: {overall_score:.0f}/100).
2. **Điểm mạnh nổi bật**: Các kỹ năng đã có bằng chứng dự án vững vàng ({scores_text}).
3. **Điểm yếu & Khoảng trống kỹ năng**: {skills_text}
4. **Độ chân thực & Chiều sâu dự án**: Nhận xét về tính thực chiến của hồ sơ, cảnh báo nếu có kỹ năng ma (chỉ liệt kê từ khóa mà thiếu dự án).
5. **Gợi ý trọng tâm phát triển**: {recommendations_text}
{red_flags_text}

Điểm số chi tiết:
{scores_text}

Phong cách viết: Chuyên nghiệp, khuyến khích, trung thực, mang tính định hướng hành động rõ ràng.
"""


def build_learning_roadmap(
    skill_analysis: SkillAnalysis,
    kg_context: dict[str, Any],
    target_role: str = "Software Engineer",
    target_level: str = "middle",
) -> list[dict[str, Any]]:
    """Xây dựng lộ trình học tập & bổ sung kỹ năng 3 giai đoạn có cấu trúc."""
    roadmap: list[dict[str, Any]] = []

    missing = skill_analysis.missing_critical or []
    prereqs_dict = kg_context.get("skill_prerequisites", {})

    # 1. Giai đoạn 1: Nền tảng & Tiên quyết (Prerequisites & Fundamentals)
    phase1_skills = []
    for s in missing[:4]:
        for p in prereqs_dict.get(s, []):
            if p not in phase1_skills:
                phase1_skills.append(p)

    if not phase1_skills:
        phase1_skills = ["data_structures", "oop", "sql", "git"]

    roadmap.append(
        {
            "phase": 1,
            "title": "Giai đoạn 1: Củng cố Nền tảng & Kỹ năng Tiên quyết",
            "duration_weeks": 3,
            "focus_skills": phase1_skills[:4],
            "recommended_topics_or_projects": [
                "Ôn tập cấu trúc dữ liệu, giải thuật và các nguyên lý thiết kế căn bản",
                "Thực hành viết Clean Code, Unit Tests và quản lý mã nguồn chuẩn mực",
            ],
        }
    )

    # 2. Giai đoạn 2: Công nghệ Trọng tâm Ngành nghề (Core Frameworks & Tools)
    phase2_skills = missing[:4] if missing else ["architecture_design", "performance_tuning"]
    roadmap.append(
        {
            "phase": 2,
            "title": f"Giai đoạn 2: Làm chủ Công nghệ Cốt lõi cho vị trí {target_role}",
            "duration_weeks": 5,
            "focus_skills": phase2_skills,
            "recommended_topics_or_projects": [
                f"Học chuyên sâu và thực hành các Frameworks/Tools trọng tâm: {', '.join(phase2_skills[:3])}",
                "Tìm hiểu kiến trúc hệ thống, xử lý bất đồng bộ (Async/Concurrency) và tối ưu truy vấn CSDL",
            ],
        }
    )

    # 3. Giai đoạn 3: Dự án Thực chiến & Portfolio (Real-world Projects & Impact)
    roadmap.append(
        {
            "phase": 3,
            "title": "Giai đoạn 3: Xây dựng Dự án Thực chiến & Nâng cấp Hồ sơ (Portfolio)",
            "duration_weeks": 4,
            "focus_skills": [*phase2_skills[:2], "docker", "ci/cd"],
            "recommended_topics_or_projects": [
                f"Triển khai dự án mô phỏng môi trường Production ứng dụng {', '.join(phase2_skills[:2])} có container hóa (Docker) và CI/CD",
                "Đo lường các chỉ số hiệu năng cụ thể (Latency, Throughput, Caching) để bổ sung bằng chứng thực tế vào CV",
            ],
        }
    )

    return roadmap



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
