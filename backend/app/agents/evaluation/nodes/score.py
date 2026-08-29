from __future__ import annotations

from typing import Any

from backend.app.agents.evaluation.state import EvaluationState
from backend.app.agents.evaluation.types import (
    BenchmarkComparison,
    MetricScore,
    RadarData,
    SkillAnalysis,
)
from backend.app.services.matching.cv_verifier import (
    AuthenticityReport,
    evaluate_cv_authenticity,
)
from backend.app.shared_brain import AgentBrain
from backend.app.tools.kg_tools import expand_skill_with_prerequisites

# Default weights for scoring components
DEFAULT_WEIGHTS = {
    "technical": 0.35,
    "experience": 0.30,
    "culture_fit": 0.20,
    "market": 0.15,
}


async def score_node(
    state: EvaluationState,
    brain: AgentBrain | None = None,
    weights: dict[str, float] | None = None,
) -> dict[str, Any]:
    """
    Calculate evaluation scores for CV vs JD comparison.

    Computes:
    - Technical score (evidence-weighted skill match)
    - Experience score (verified years & project depth)
    - Culture fit score
    - Market score (seniority, salary)
    - Authenticity & Fraud Analysis (Trust score, Red flags, Penalty)
    """
    parsed_cv = state.get("parsed_cv")
    parsed_jd = state.get("parsed_jd")
    reference_profiles = state.get("reference_profiles", [])
    kg_context = state.get("kg_context", {})

    weights = weights or DEFAULT_WEIGHTS
    breakdown: dict[str, MetricScore] = {}
    skill_analysis = SkillAnalysis()
    overall_score = 0.0

    # 1. Trích xuất hoặc tính toán báo cáo chân thực của CV (Authenticity Report)
    auth_report: AuthenticityReport | None = None
    if parsed_cv:
        if parsed_cv.authenticity and isinstance(parsed_cv.authenticity, dict):
            # Tái tạo AuthenticityReport từ dict nếu đã parse từ trước
            auth_dict = parsed_cv.authenticity
            auth_report = AuthenticityReport(
                trust_score=auth_dict.get("trust_score", 1.0),
                authenticity_status=auth_dict.get("authenticity_status", "VERIFIED"),
                claimed_years=auth_dict.get("claimed_years", 0),
                verified_years=auth_dict.get("verified_years", 0.0),
                experience_discrepancy_ratio=auth_dict.get("experience_discrepancy_ratio", 0.0),
                red_flags=auth_dict.get("red_flags", []),
                ghost_skills=auth_dict.get("ghost_skills", []),
                keyword_drop_skills=auth_dict.get("keyword_drop_skills", []),
                active_skills=auth_dict.get("active_skills", []),
                impact_skills=auth_dict.get("impact_skills", []),
                skill_evidence_levels=auth_dict.get("skill_evidence_levels", {}),
                project_substance_score=auth_dict.get("project_substance_score", 50.0),
                penalty_factor=auth_dict.get("penalty_factor", 0.0),
                anachronisms=auth_dict.get("anachronisms", []),
            )
        else:
            auth_report = evaluate_cv_authenticity(
                raw_text=parsed_cv.raw_text,
                claimed_skills=parsed_cv.skills,
                claimed_years=parsed_cv.experience_years,
                education_entries=parsed_cv.education,
            )

    # 2. Phân tích Kỹ năng theo Bằng chứng Thực tế (Evidence-Weighted Skill Analysis)
    if parsed_cv and parsed_jd:
        cv_skills_lower = {s.lower() for s in parsed_cv.skills}
        jd_skills_lower = {s.lower() for s in parsed_jd.skills}

        matched = [s for s in parsed_jd.skills if s.lower() in cv_skills_lower]
        missing = [s for s in parsed_jd.skills if s.lower() not in cv_skills_lower]

        matched_lower = {s.lower() for s in matched}
        expanded_cv = expand_skill_with_prerequisites(parsed_cv.skills)
        related_matched = []
        for skill, prereqs in expanded_cv.items():
            related_matched.extend([p for p in prereqs if p.lower() not in matched_lower])

        all_matched = list(set(matched + related_matched))

        # Tính toán điểm kỹ năng có trọng số bằng chứng (Evidence Level)
        evidence_levels = auth_report.skill_evidence_levels if auth_report else {}
        evidence_weighted_score = 0.0
        for s in matched:
            level = evidence_levels.get(s, 0.5)  # Level 0.0 (ghost) -> 1.0 (impact)
            evidence_weighted_score += level
        for s in related_matched:
            level = evidence_levels.get(s, 0.3) * 0.7  # Prerequisite được tính tối đa 70%
            evidence_weighted_score += level

        max_req_skills = max(len(parsed_jd.skills), 1)
        raw_match_rate = (len(all_matched) / max_req_skills) * 100
        # Skill match rate thực tế dựa trên bằng chứng
        evidence_match_rate = min((evidence_weighted_score / max_req_skills) * 100, 100.0)

        # Nếu kỹ năng xuất hiện nhưng hầu hết là ghost skills, match rate sẽ ưu tiên tuyệt đối bằng chứng dự án
        if auth_report and (len(auth_report.ghost_skills) >= 3 or len(auth_report.ghost_skills) > len(parsed_cv.skills) * 0.3):
            effective_skill_rate = (evidence_match_rate * 0.90) + (raw_match_rate * 0.10)
        else:
            effective_skill_rate = (evidence_match_rate * 0.75) + (raw_match_rate * 0.25)

        skill_analysis = SkillAnalysis(
            matched_skills=all_matched,
            missing_critical=missing,
            unexpected_skills=[s for s in parsed_cv.skills if s.lower() not in jd_skills_lower],
            skill_match_rate=round(effective_skill_rate, 1),
            skill_details={
                "total_required": len(parsed_jd.skills),
                "total_candidate": len(parsed_cv.skills),
                "direct_match": len(matched),
                "related_match": len(related_matched),
                "prerequisites_met": len(related_matched),
                "evidence_match_rate": round(evidence_match_rate, 1),
                "raw_match_rate": round(raw_match_rate, 1),
                "ghost_skills_count": len(auth_report.ghost_skills) if auth_report else 0,
            },
        )

        # Technical score
        tech_score = MetricScore(
            name="technical",
            score=round(effective_skill_rate, 1),
            weight=weights.get("technical", 0.35),
            details={
                "skill_match_rate": round(effective_skill_rate, 1),
                "evidence_match_rate": round(evidence_match_rate, 1),
                "matched_count": len(all_matched),
                "required_count": len(parsed_jd.skills),
                "missing_skills": missing,
                "ghost_skills": auth_report.ghost_skills if auth_report else [],
            },
            confidence=0.9 if len(parsed_jd.skills) > 3 else 0.7,
        )
        breakdown["technical"] = tech_score

    # 3. Tính điểm Kinh nghiệm Thực tế (Verified Experience Score)
    claimed_years = parsed_cv.experience_years if (parsed_cv and parsed_cv.experience_years) else 0
    demonstrated_years = (
        auth_report.verified_years
        if auth_report
        else (parsed_cv.demonstrated_years if (parsed_cv and parsed_cv.demonstrated_years) else claimed_years)
    )
    jd_years = parsed_jd.experience_years if parsed_jd else 0

    # Sử dụng số năm thực tế chứng minh được qua dự án để tính điểm
    # Nếu có chênh lệch quá lớn giữa tự khai và thực tế -> phạt điểm kinh nghiệm
    if jd_years and jd_years > 0:
        exp_ratio = min(demonstrated_years / jd_years, 1.5)
        exp_score = min(exp_ratio * 70, 100)
    elif demonstrated_years:
        exp_score = min(demonstrated_years * 10, 100)
    else:
        exp_score = 30  # Default nếu không chứng minh được kinh nghiệm

    # Phạt nếu khai khống số năm (ví dụ khai 10 năm nhưng dự án chỉ có 3 tháng)
    if auth_report and auth_report.experience_discrepancy_ratio > 0.6 and claimed_years >= 3:
        # Hạ điểm kinh nghiệm xuống mức sàn thực tế
        exp_score = min(exp_score * 0.3, 25.0)

    # Bonus tiến trình nghề nghiệp nếu hợp lý
    progression_bonus = 0
    if parsed_cv and len(parsed_cv.job_titles) > 1 and demonstrated_years >= 2.0:
        seniority_keywords = {"junior": 1, "middle": 2, "senior": 3, "lead": 4, "principal": 5, "manager": 4}
        levels = []
        for title in parsed_cv.job_titles:
            for kw, level in seniority_keywords.items():
                if kw in title.lower():
                    levels.append(level)
        if len(levels) >= 2 and levels[-1] > levels[0]:
            progression_bonus = 10

    exp_score = min(exp_score + progression_bonus, 100)

    exp_score_obj = MetricScore(
        name="experience",
        score=round(exp_score, 1),
        weight=weights.get("experience", 0.30),
        details={
            "candidate_claimed_years": claimed_years,
            "candidate_demonstrated_years": demonstrated_years,
            "required_years": jd_years,
            "progression_bonus": progression_bonus,
            "project_substance_score": auth_report.project_substance_score if auth_report else 50.0,
            "titles": parsed_cv.job_titles if parsed_cv else [],
        },
        confidence=0.9 if demonstrated_years else 0.5,
    )
    breakdown["experience"] = exp_score_obj

    # 4. Điểm Culture Fit
    culture_score = 70.0  # Default neutral
    if reference_profiles:
        similarities = [p.get("similarity", 0) for p in reference_profiles]
        avg_sim = sum(similarities) / len(similarities) if similarities else 0.5
        culture_score = avg_sim * 100

    culture_score_obj = MetricScore(
        name="culture_fit",
        score=round(culture_score, 1),
        weight=weights.get("culture_fit", 0.20),
        details={
            "reference_count": len(reference_profiles),
            "avg_similarity": round(culture_score / 100 if reference_profiles else 0, 2),
        },
        confidence=0.7 if reference_profiles else 0.5,
    )
    breakdown["culture_fit"] = culture_score_obj

    # 5. Điểm Market Fit (Độ phù hợp thị trường & cấp bậc)
    market_score = 70.0  # Default
    if parsed_cv and parsed_jd:
        cv_titles = [t.lower() for t in (parsed_cv.job_titles or [])]
        jd_titles = [t.lower() for t in (parsed_jd.job_titles or [])]

        seniority_levels = {"intern": 1, "junior": 2, "middle": 3, "senior": 4, "lead": 5, "principal": 6, "manager": 5, "director": 6, "vp": 7}

        # Nếu CV bị cắm cờ chém gió cấp bậc, hạ cấp bậc thực tế dựa trên demonstrated_years
        raw_cv_level = max((seniority_levels.get(t, 3) for t in cv_titles), default=3)
        if auth_report and auth_report.authenticity_status == "HIGH_INFLATION_RISK":
            # Nếu dự án thực tế chỉ < 1 năm, giới hạn level tối đa là 1-2 (intern/junior)
            if demonstrated_years < 1.0:
                cv_level = min(raw_cv_level, 1)
            elif demonstrated_years < 2.5:
                cv_level = min(raw_cv_level, 2)
            else:
                cv_level = raw_cv_level
        else:
            cv_level = raw_cv_level

        jd_level = max((seniority_levels.get(t, 3) for t in jd_titles), default=3)

        level_diff = cv_level - jd_level
        if level_diff == 0:
            market_score = 90.0
        elif level_diff == 1:
            market_score = 75.0  # Overqualified
        elif level_diff == -1:
            market_score = 65.0  # Underqualified but trainable
        else:
            market_score = 45.0  # Significant gap

    market_score_obj = MetricScore(
        name="market",
        score=round(market_score, 1),
        weight=weights.get("market", 0.15),
        details={
            "seniority_match": "exact" if cv_level == jd_level else "adjacent" if abs(cv_level - jd_level) <= 1 else "gap",
            "effective_candidate_level": cv_level,
            "target_job_level": jd_level,
        },
        confidence=0.75,
    )
    breakdown["market"] = market_score_obj

    # 6. Tính điểm Tổng Thể & Áp Dụng Hệ Số Phạt Gian Lận (Inflation Penalty)
    for metric_name, metric in breakdown.items():
        weight = metric.weight
        overall_score += metric.score * weight

    # Áp dụng hệ số trừ điểm nếu phát hiện CV ảo
    raw_overall_score = overall_score
    if auth_report and auth_report.penalty_factor > 0:
        overall_score = overall_score * (1.0 - auth_report.penalty_factor)

    overall_score = round(max(overall_score, 0.0), 1)

    # Generate recommendations based on analysis
    recommendations = _generate_recommendations(skill_analysis, breakdown, kg_context)

    # Build radar data
    radar_data = RadarData(
        labels=["Technical", "Experience", "Culture Fit", "Market"],
        values=[
            breakdown.get("technical", MetricScore("technical", 0, 0)).score,
            breakdown.get("experience", MetricScore("experience", 0, 0)).score,
            breakdown.get("culture_fit", MetricScore("culture_fit", 0, 0)).score,
            breakdown.get("market", MetricScore("market", 0, 0)).score,
        ],
        max_values=[100, 100, 100, 100],
    )

    # Benchmark comparison
    benchmark = BenchmarkComparison(
        percentile=_estimate_percentile(overall_score),
        compared_to_average=round(overall_score - 65, 1),
        industry_std="tech_vietnam",
        sample_size=len(reference_profiles),
    )

    # Bổ sung thông tin xác thực vào kết quả
    auth_dict = auth_report.__dict__ if auth_report else {}
    red_flags = auth_report.red_flags if auth_report else []

    return {
        "breakdown": {k: v.__dict__ for k, v in breakdown.items()},
        "skill_analysis": skill_analysis.__dict__,
        "overall_score": overall_score,
        "raw_overall_score": round(raw_overall_score, 1),
        "confidence": _calculate_confidence(breakdown, parsed_cv, parsed_jd),
        "recommendations": recommendations,
        "radar_chart": radar_data.__dict__,
        "comparison_with_benchmark": benchmark.__dict__,
        "authenticity": auth_dict,
        "red_flags": red_flags,
    }


def _generate_recommendations(
    skill_analysis: SkillAnalysis,
    breakdown: dict[str, MetricScore],
    kg_context: dict[str, Any],
) -> list[str]:
    """Generate actionable recommendations based on analysis."""
    recommendations = []

    # Skill gap recommendations
    if skill_analysis.missing_critical:
        top_missing = skill_analysis.missing_critical[:3]
        recommendations.append(
            f"Focus on these critical skills: {', '.join(top_missing)}"
        )

        # Add prerequisite suggestions from KG
        prereqs = kg_context.get("skill_prerequisites", {})
        for skill in top_missing:
            if skill_prereqs := prereqs.get(skill):
                recommendations.append(
                    f"Before learning {skill}, consider: {', '.join(skill_prereqs[:2])}"
                )

    # Experience recommendations
    exp_score = breakdown.get("experience")
    if exp_score and exp_score.score < 60:
        recommendations.append(
            "Consider taking on more responsibilities or projects to demonstrate growth"
        )

    # Market recommendations
    market_score = breakdown.get("market")
    if market_score and market_score.score < 70:
        recommendations.append(
            "Your seniority level may not fully match this position. Consider roles at a slightly different level."
        )

    # General improvement
    if not recommendations:
        recommendations.append("Strong match! Focus on preparing for role-specific interviews.")

    return recommendations


def _estimate_percentile(score: float) -> float | None:
    """Estimate percentile based on score."""
    if score >= 90:
        return 95
    elif score >= 80:
        return 85
    elif score >= 70:
        return 70
    elif score >= 60:
        return 50
    elif score >= 50:
        return 30
    else:
        return 15


def _calculate_confidence(
    breakdown: dict[str, MetricScore],
    parsed_cv,
    parsed_jd,
) -> float:
    """Calculate overall confidence in the evaluation."""
    confidences = [m.confidence for m in breakdown.values()]

    # Reduce confidence if data is sparse
    if not parsed_cv:
        confidences.append(0.3)
    if not parsed_jd:
        confidences.append(0.3)

    return round(sum(confidences) / len(confidences), 2) if confidences else 0.5
