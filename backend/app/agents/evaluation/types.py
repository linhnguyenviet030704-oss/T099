"""Type definitions for evaluation agent."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class EvaluationType(StrEnum):
    """Type of evaluation to perform."""

    FULL = "full"  # Full evaluation with all metrics
    SKILL_ONLY = "skill_only"  # Skills assessment only
    EXPERIENCE_ONLY = "experience_only"  # Experience assessment only
    QUICK = "quick"  # Fast evaluation with basic metrics


class IntentType(StrEnum):
    """Intent types for routing agent."""

    # Evaluation intents
    EVALUATE_CV = "evaluate_cv"
    EVALUATE_JOB = "evaluate_job"
    COMPARE_CV_JOB = "compare_cv_job"
    SELF_EVALUATE = "self_evaluate"
    RECRUITER_SCREEN = "recruiter_screen"

    # Compare intents (explicit flows for /compare endpoints)
    # needs_cv=True, needs_db=True, needs_vector_search=False
    COMPARE_CANDIDATES = "compare_candidates"  # /candidates/compare
    COMPARE_JOBS = "compare_jobs"  # /jobs/compare

    # Existing intents (keep for compatibility)
    CHITCHAT = "chitchat"
    SKILL_GAP_ADVICE = "skill_gap_advice"
    TARGET_SPECIFIC = "target_specific"
    SEARCH_BY_DOMAIN = "search_by_domain"
    LIST_AVAILABLE_JOBS = "list_available_jobs"
    RECOMMEND_GENERAL = "recommend_general"

    # Rejection intents
    CONTENT_TOO_SHORT = "content_too_short"
    INVALID_FORMAT = "invalid_format"
    OUT_OF_SCOPE = "out_of_scope"
    SENSITIVE_CONTENT = "sensitive_content"
    RATE_LIMITED = "rate_limited"


class RejectionReason(StrEnum):
    """Reasons for rejecting a request."""

    MINIMUM_CONTENT_NOT_MET = "minimum_content_not_met"
    UNPARSEABLE_FORMAT = "unparseable_format"
    OFF_TOPIC = "off_topic"
    SENSITIVE_DATA_DETECTED = "sensitive_data_detected"
    QUOTA_EXCEEDED = "quota_exceeded"
    MALFORMED_REQUEST = "malformed_request"


@dataclass
class ParsedProfile:
    """Parsed CV or job profile."""

    raw_text: str
    summary: str | None = None
    skills: list[str] = field(default_factory=list)
    verified_skills: list[str] = field(default_factory=list)
    inferred_skills: list[str] = field(default_factory=list)
    experience_years: int | None = None
    education: list[str] = field(default_factory=list)
    job_titles: list[str] = field(default_factory=list)
    companies: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "summary": self.summary,
            "skills": self.skills,
            "verified_skills": self.verified_skills,
            "inferred_skills": self.inferred_skills,
            "experience_years": self.experience_years,
            "education": self.education,
            "job_titles": self.job_titles,
            "companies": self.companies,
            "metadata": self.metadata,
        }


@dataclass
class MetricScore:
    """Individual metric score."""

    name: str
    score: float  # 0-100
    weight: float  # Relative importance
    details: dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.8  # Model confidence 0-1


@dataclass
class SkillAnalysis:
    """Analysis of skills match/mismatch."""

    matched_skills: list[str] = field(default_factory=list)
    missing_critical: list[str] = field(default_factory=list)
    unexpected_skills: list[str] = field(default_factory=list)
    skill_match_rate: float = 0.0  # 0-100
    skill_details: dict[str, Any] = field(default_factory=dict)


@dataclass
class RadarData:
    """Data for radar/spider chart visualization."""

    labels: list[str]
    values: list[float]
    max_values: list[float] = field(default_factory=list)

    def to_chart_format(self) -> dict[str, Any]:
        return {
            "type": "radar",
            "labels": self.labels,
            "datasets": [
                {
                    "label": "Current",
                    "data": self.values,
                },
                {
                    "label": "Target/Ideal",
                    "data": self.max_values or self.values,
                },
            ],
        }


@dataclass
class BenchmarkComparison:
    """Comparison against benchmark/industry standards."""

    percentile: float | None = None  # e.g., 75th percentile
    compared_to_average: float = 0.0  # +/- vs average
    industry_std: str = "general"
    sample_size: int = 0


@dataclass
class EvaluationResult:
    """Final evaluation result with all metrics."""

    overall_score: float  # 0-100

    breakdown: dict[str, MetricScore]  # name -> MetricScore

    skill_analysis: SkillAnalysis

    recommendations: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    confidence: float = 0.8  # Overall confidence 0-1

    # Visual-ready data
    radar_chart: RadarData | None = None
    comparison_with_benchmark: BenchmarkComparison | None = None

    # Raw data for debugging
    parsed_cv: ParsedProfile | None = None
    parsed_jd: ParsedProfile | None = None
    reference_profiles: list[dict[str, Any]] = field(default_factory=list)

    def to_api_response(self) -> dict[str, Any]:
        """Format for API response."""
        return {
            "overall_score": round(self.overall_score, 1),
            "breakdown": {
                name: {
                    "score": round(ms.score, 1),
                    "weight": ms.weight,
                    "details": ms.details,
                    "confidence": ms.confidence,
                }
                for name, ms in self.breakdown.items()
            },
            "skill_analysis": {
                "matched": self.skill_analysis.matched_skills,
                "missing": self.skill_analysis.missing_critical,
                "unexpected": self.skill_analysis.unexpected_skills,
                "match_rate": round(self.skill_analysis.skill_match_rate, 1),
            },
            "recommendations": self.recommendations,
            "warnings": self.warnings,
            "confidence": round(self.confidence, 2),
            "radar_chart": self.radar_chart.to_chart_format() if self.radar_chart else None,
            "benchmark": {
                "percentile": self.comparison_with_benchmark.percentile,
                "vs_average": round(self.comparison_with_benchmark.compared_to_average, 1),
                "industry": self.comparison_with_benchmark.industry_std,
            }
            if self.comparison_with_benchmark
            else None,
        }
