from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from backend.app.agents.evaluation import EvaluationAgent
from backend.app.agents.evaluation.nodes.report import build_learning_roadmap
from backend.app.agents.evaluation.types import EvaluationResult, EvaluationType
from backend.app.agents.routing import RoutingAgent
from backend.app.api.schemas.evaluation import (
    CvAssessmentRequest,
    CvAssessmentResponse,
    EvaluationRequest,
    EvaluationResponse,
    MetricScoreResponse,
    RadarChartData,
    RoadmapPhase,
    RoutingRequest,
    RoutingResponse,
    SkillAnalysisResponse,
)
from backend.app.clients.supabase import get_supabase_client
from backend.app.core.exceptions import AppError, BadRequestError, ForbiddenError, NotFoundError
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.auth import get_current_candidate, get_current_user
from backend.app.guardrails.input import MAX_CV_BYTES, validate_file
from backend.app.observability.logger import get_logger
from backend.app.services.kg.benchmarks import RoleBenchmark, build_role_benchmark
from backend.app.services.kg.client import get_kg_client
from backend.app.services.matching.parse import parse_resume_bytes
from backend.app.services.matching.store import SupabaseResumeStore
from backend.app.shared_brain import get_brain
from supabase import Client

logger = get_logger(__name__)

router = APIRouter()


def _get_evaluation_agent() -> EvaluationAgent:
    """Get evaluation agent instance with evaluation brain."""
    try:
        brain = get_brain("evaluation")
    except Exception:
        brain = None
    return EvaluationAgent(brain=brain)


def _get_routing_agent() -> RoutingAgent:
    """Get routing agent instance."""
    return RoutingAgent(brain=None)


async def _resolve_authorized_inputs(
    request: EvaluationRequest,
    *,
    actor_id: UUID,
    client: Client,
) -> EvaluationRequest:
    cv_text = request.cv_text
    jd_text = request.jd_text

    if cv_text is None and request.resume_id is not None:
        store = SupabaseResumeStore(client)
        resume = await store.get_resume(request.resume_id)
        if not resume:
            raise NotFoundError("Resume not found", code="RESUME_NOT_FOUND")
        if str(resume.get("user_id")) != str(actor_id):
            raise ForbiddenError("Not your resume")

        parsed = await store.get_parsed(request.resume_id)
        cv_text = str((parsed or {}).get("clean_markdown") or (parsed or {}).get("markdown") or "")
        if not cv_text:
            blob = await store.download(resume.get("bucket_id") or "resumes", resume["storage_path"])
            validated = validate_file(
                blob,
                declared_mime=resume.get("mime_type") or "",
                max_bytes=MAX_CV_BYTES,
            )
            parsed_local = parse_resume_bytes(validated.data, mime_type=validated.detected_mime)
            cv_text = str(parsed_local.get("markdown") or "")

    if jd_text is None and request.job_id is not None:
        def _fetch_job() -> dict | None:
            return (
                client.table("job_posts")
                .select("id, title, description, requirements, status, created_by_user_id")
                .eq("id", str(request.job_id))
                .maybe_single()
                .execute()
                .data
            )

        job = await asyncio.to_thread(_fetch_job)
        if not job:
            raise NotFoundError("Job not found", code="JOB_NOT_FOUND")
        if job.get("status") != "published" and str(job.get("created_by_user_id")) != str(actor_id):
            raise ForbiddenError("Job is not available")
        jd_text = "\n\n".join(
            part
            for part in (
                str(job.get("title") or "").strip(),
                str(job.get("description") or "").strip(),
                str(job.get("requirements") or "").strip(),
            )
            if part
        )

    return request.model_copy(update={"cv_text": cv_text, "jd_text": jd_text})


@router.post("/route", response_model=RoutingResponse)
async def route_message(
    request: RoutingRequest,
    _user: AuthenticatedUser = Depends(),
) -> RoutingResponse:
    """
    Route user message to appropriate agent.

    Classifies intent and validates input, returns dispatch target.
    """
    agent = _get_routing_agent()

    try:
        result = await agent.route(request.message, user_id=str(_user.id))

        if result.is_rejected():
            return RoutingResponse(
                intent=result.intent.value if result.intent else "unknown",
                is_valid=False,
                dispatch_target=None,
                context=result.context,
                rejection_reason=result.rejection_reason.value if result.rejection_reason else None,
                rejection_message=result.response,
            )

        return RoutingResponse(
            intent=result.intent.value if result.intent else "unknown",
            is_valid=True,
            dispatch_target=result.dispatch_target,
            context=result.context,
            rejection_reason=None,
            rejection_message=None,
        )
    except AppError:
        raise
    except Exception:
        logger.exception("Routing failed")
        raise HTTPException(status_code=500, detail="Internal routing error")


@router.post("/evaluate", response_model=EvaluationResponse)
async def evaluate(
    request: EvaluationRequest,
    _user: AuthenticatedUser = Depends(),
    client: Client = Depends(get_supabase_client),
) -> EvaluationResponse:
    """
    Evaluate CV against JD or perform standalone assessment.

    Supports:
    - CV text + JD text: Full comparison
    - CV text only: Self-assessment
    - JD text only: Job quality assessment
    - resume_id: Load CV from database
    - job_id: Load JD from database
    """
    # Validate at least one input
    if not any([request.cv_text, request.jd_text, request.resume_id, request.job_id]):
        raise HTTPException(
            status_code=400,
            detail="At least one of cv_text, jd_text, resume_id, or job_id is required",
        )

    request = await _resolve_authorized_inputs(request, actor_id=_user.id, client=client)

    # Determine evaluation type
    eval_type = EvaluationType(request.evaluation_type)

    agent = _get_evaluation_agent()

    try:
        result = await agent.evaluate(
            cv_text=request.cv_text,
            jd_text=request.jd_text,
            resume_id=str(request.resume_id) if request.resume_id else None,
            job_id=str(request.job_id) if request.job_id else None,
            evaluation_type=eval_type,
        )

        return EvaluationResponse(
            overall_score=result.overall_score,
            breakdown={
                name: {
                    "score": ms.score,
                    "weight": ms.weight,
                    "details": ms.details,
                    "confidence": ms.confidence,
                }
                for name, ms in result.breakdown.items()
            },
            skill_analysis={
                "matched": result.skill_analysis.matched_skills,
                "missing": result.skill_analysis.missing_critical,
                "unexpected": result.skill_analysis.unexpected_skills,
                "match_rate": result.skill_analysis.skill_match_rate,
            },
            recommendations=result.recommendations,
            warnings=result.warnings,
            confidence=result.confidence,
            radar_chart=result.radar_chart.to_chart_format() if result.radar_chart else None,
            benchmark={
                "percentile": result.comparison_with_benchmark.percentile,
                "vs_average": result.comparison_with_benchmark.compared_to_average,
                "industry": result.comparison_with_benchmark.industry_std,
            }
            if result.comparison_with_benchmark
            else None,
            natural_language_summary=result.natural_language_summary,
        )
    except AppError:
        raise
    except Exception:
        logger.exception("Evaluation failed")
        raise HTTPException(status_code=500, detail="Internal evaluation error")


@router.post("/evaluate/file", response_model=EvaluationResponse)
async def evaluate_with_file(
    cv_file: UploadFile = File(...),
    job_id: UUID | None = None,
    jd_text: str | None = None,
    evaluation_type: str = "full",
    _user: AuthenticatedUser = Depends(),
    client: Client = Depends(get_supabase_client),
) -> EvaluationResponse:
    """
    Evaluate uploaded CV file against job.

    Accepts PDF, DOCX, or TXT files.
    """

    content = await cv_file.read()
    validated = validate_file(
        content,
        declared_mime=cv_file.content_type or "",
        max_bytes=MAX_CV_BYTES,
    )
    parsed = parse_resume_bytes(validated.data, mime_type=validated.detected_mime)
    cv_text = str(parsed.get("markdown") or "")
    if not cv_text:
        raise BadRequestError("Không trích xuất được nội dung CV", code="DATA_LOW_CONTENT")

    # Create request
    request = EvaluationRequest(
        cv_text=cv_text,
        jd_text=jd_text,
        job_id=job_id,
        evaluation_type=evaluation_type,
    )

    return await evaluate(request, _user, client)


async def _resolve_authorized_cv(
    request: CvAssessmentRequest,
    *,
    actor_id: UUID,
    client: Client,
) -> str:
    cv_text = request.cv_text

    if cv_text is None and request.resume_id is not None:
        store = SupabaseResumeStore(client)
        resume = await store.get_resume(request.resume_id)
        if not resume:
            raise NotFoundError("Resume not found", code="RESUME_NOT_FOUND")
        if str(resume.get("user_id")) != str(actor_id):
            raise ForbiddenError("Not your resume")

        parsed = await store.get_parsed(request.resume_id)
        cv_text = str((parsed or {}).get("clean_markdown") or (parsed or {}).get("markdown") or "")
        if not cv_text:
            blob = await store.download(resume.get("bucket_id") or "resumes", resume["storage_path"])
            validated = validate_file(
                blob,
                declared_mime=resume.get("mime_type") or "",
                max_bytes=MAX_CV_BYTES,
            )
            parsed_local = parse_resume_bytes(validated.data, mime_type=validated.detected_mime)
            cv_text = str(parsed_local.get("markdown") or "")

    if not cv_text or len(cv_text.strip()) < 30:
        raise BadRequestError(
            "Vui lòng cung cấp nội dung CV (cv_text) hoặc chọn resume_id hợp lệ",
            code="DATA_EMPTY",
        )

    return cv_text


def _format_cv_assessment_response(
    eval_result: EvaluationResult,
    benchmark: RoleBenchmark,
) -> CvAssessmentResponse:
    # 1. Điểm mạnh (Strengths)
    strengths: list[str] = []
    matched = eval_result.skill_analysis.matched_skills or []
    if matched:
        strengths.append(f"Kỹ năng cốt lõi đáp ứng chuẩn ngành: {', '.join(matched[:8])}")
    auth = eval_result.authenticity or {}
    impact_skills = auth.get("impact_skills") or []
    if impact_skills:
        strengths.append(f"Kỹ năng thực chiến có bằng chứng dự án mạnh: {', '.join(impact_skills[:5])}")
    active_skills = auth.get("active_skills") or []
    if active_skills:
        strengths.append(f"Kỹ năng được sử dụng trực tiếp trong công việc/dự án: {', '.join(active_skills[:5])}")
    verified_years = float(auth.get("verified_years", 0.0))
    if verified_years >= benchmark.expected_years and benchmark.expected_years > 0:
        strengths.append(f"Kinh nghiệm thực tế ({verified_years} năm) đáp ứng tốt yêu cầu cấp bậc {benchmark.level.upper()}")

    # 2. Điểm yếu (Weaknesses)
    weaknesses: list[str] = []
    missing = eval_result.skill_analysis.missing_critical or []
    if missing:
        weaknesses.append(f"Kỹ năng trọng tâm của ngành cần bổ sung: {', '.join(missing[:8])}")
    ghost_skills = auth.get("ghost_skills") or []
    if ghost_skills:
        weaknesses.append(f"Kỹ năng thiếu dự án chứng minh (Ghost Skills): {', '.join(ghost_skills[:5])}")
    if verified_years < benchmark.expected_years:
        weaknesses.append(f"Kinh nghiệm thực chiến ({verified_years} năm) còn thấp hơn chuẩn kỳ vọng ({benchmark.expected_years} năm)")

    # 3. Lộ trình học tập 3 giai đoạn
    kg_client = get_kg_client()
    prereqs_map = {s: kg_client.get_skill_prerequisites(s) for s in missing}
    kg_context = {"skill_prerequisites": prereqs_map}
    roadmap_raw = build_learning_roadmap(
        eval_result.skill_analysis,
        kg_context,
        target_role=benchmark.role_name,
        target_level=benchmark.level,
    )
    roadmap = [RoadmapPhase(**phase) for phase in roadmap_raw]

    # 4. Điểm số & Phân tích chi tiết
    breakdown_map = {
        name: MetricScoreResponse(
            score=ms.score,
            weight=ms.weight,
            details=ms.details,
            confidence=ms.confidence,
        )
        for name, ms in eval_result.breakdown.items()
    }

    skill_analysis_resp = SkillAnalysisResponse(
        matched=eval_result.skill_analysis.matched_skills,
        missing=eval_result.skill_analysis.missing_critical,
        unexpected=eval_result.skill_analysis.unexpected_skills,
        match_rate=eval_result.skill_analysis.skill_match_rate,
    )

    radar_chart_data = None
    if eval_result.radar_chart:
        radar_chart_data = RadarChartData(**eval_result.radar_chart.to_chart_format())

    return CvAssessmentResponse(
        target_role=benchmark.role_name,
        target_level=benchmark.level,
        overall_score=eval_result.overall_score,
        breakdown=breakdown_map,
        skill_analysis=skill_analysis_resp,
        authenticity=auth,
        red_flags=eval_result.red_flags,
        strengths=strengths,
        weaknesses=weaknesses,
        skill_gap={
            "matched": matched,
            "missing": missing,
            "prerequisites": benchmark.prerequisites,
        },
        radar_chart=radar_chart_data,
        recommendations=eval_result.recommendations,
        learning_roadmap=roadmap,
        natural_language_summary=eval_result.natural_language_summary,
        confidence=eval_result.confidence,
    )


@router.post("/cv-assessment", response_model=CvAssessmentResponse)
async def assess_cv(
    request: CvAssessmentRequest,
    _user: AuthenticatedUser = Depends(get_current_candidate),
    client: Client = Depends(get_supabase_client),
) -> CvAssessmentResponse:
    """
    Đánh giá độ mạnh/yếu CV theo ngành nghề mục tiêu và gợi ý lộ trình bổ sung kiến thức.
    Dành riêng cho Ứng viên (Candidate).
    """
    cv_text = await _resolve_authorized_cv(request, actor_id=_user.id, client=client)
    benchmark = build_role_benchmark(request.target_role, request.target_level)

    agent = _get_evaluation_agent()

    try:
        eval_result = await agent.evaluate(
            cv_text=cv_text,
            jd_text=benchmark.benchmark_jd_text,
            evaluation_type=EvaluationType.FULL,
            needs_vector_search=False,
        )
        return _format_cv_assessment_response(eval_result, benchmark)
    except AppError:
        raise
    except Exception:
        logger.exception("CV Assessment failed")
        raise HTTPException(status_code=500, detail="Internal CV assessment error")


@router.post("/cv-assessment/file", response_model=CvAssessmentResponse)
async def assess_cv_with_file(
    cv_file: UploadFile = File(...),
    target_role: str = Form(...),
    target_level: str = Form("middle"),
    _user: AuthenticatedUser = Depends(get_current_candidate),
    client: Client = Depends(get_supabase_client),
) -> CvAssessmentResponse:
    """
    Đánh giá CV tải lên trực tiếp (PDF/DOCX/TXT) theo ngành nghề mục tiêu.
    Dành riêng cho Ứng viên (Candidate).
    """
    content = await cv_file.read()
    validated = validate_file(
        content,
        declared_mime=cv_file.content_type or "",
        max_bytes=MAX_CV_BYTES,
    )
    parsed = parse_resume_bytes(validated.data, mime_type=validated.detected_mime)
    cv_text = str(parsed.get("markdown") or "")
    if not cv_text:
        raise BadRequestError("Không trích xuất được nội dung CV từ tệp", code="DATA_LOW_CONTENT")

    request = CvAssessmentRequest(
        cv_text=cv_text,
        target_role=target_role,
        target_level=target_level,  # type: ignore[arg-type]
    )
    return await assess_cv(request, _user, client)


@router.post("/cv-assessment/stream")
async def assess_cv_stream(
    request: CvAssessmentRequest,
    _user: AuthenticatedUser = Depends(get_current_candidate),
    client: Client = Depends(get_supabase_client),
) -> StreamingResponse:
    """
    Phát luồng Server-Sent Events (SSE) theo dõi từng bước đánh giá CV và gợi ý lộ trình phát triển.
    """
    async def event_generator():
        try:
            yield f"event: status\ndata: {json.dumps({'step': 'init', 'label': 'Đang phân tích thông tin CV và ngành nghề mục tiêu...'}, ensure_ascii=False)}\n\n"
            cv_text = await _resolve_authorized_cv(request, actor_id=_user.id, client=client)
            benchmark = build_role_benchmark(request.target_role, request.target_level)

            agent = _get_evaluation_agent()
            eval_node_labels = {
                "parse": "Đang trích xuất cấu trúc CV và xác thực bằng chứng dự án thực tế...",
                "retrieve": "Đang tra cứu Knowledge Graph và tiêu chuẩn chuyên môn ngành...",
                "score": "Đang tính toán điểm tương thích chuyên môn và biểu đồ Radar...",
                "report": "Đang tổng hợp báo cáo đánh giá và lộ trình phát triển...",
            }

            final_eval_state: dict[str, Any] = {}
            async for chunk in agent.evaluate_stream(
                cv_text=cv_text,
                jd_text=benchmark.benchmark_jd_text,
                evaluation_type=EvaluationType.FULL,
                needs_vector_search=False,
            ):
                if isinstance(chunk, dict):
                    for node_name, node_state in chunk.items():
                        if isinstance(node_state, dict):
                            final_eval_state.update(node_state)
                        label = eval_node_labels.get(node_name, f"Đang xử lý bước {node_name}...")
                        yield f"event: status\ndata: {json.dumps({'step': node_name, 'label': label}, ensure_ascii=False)}\n\n"

            eval_result = final_eval_state.get("result")
            if not eval_result:
                yield f"event: error\ndata: {json.dumps({'error': 'Không thể hoàn thành đánh giá CV', 'code': 'EVALUATION_FAILED'}, ensure_ascii=False)}\n\n"
                return

            response_data = _format_cv_assessment_response(eval_result, benchmark)
            yield f"event: complete\ndata: {json.dumps(response_data.model_dump(mode='json'), ensure_ascii=False)}\n\n"
        except AppError as exc:
            yield f"event: error\ndata: {json.dumps({'error': exc.detail, 'code': exc.code}, ensure_ascii=False)}\n\n"
        except Exception:
            logger.exception("assess_cv_stream error")
            yield f"event: error\ndata: {json.dumps({'error': 'Lỗi xử lý luồng đánh giá CV', 'code': 'STREAM_ERROR'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

