from __future__ import annotations

import asyncio
import json
import re
import unicodedata
from collections.abc import Callable
from pathlib import Path
from typing import Any
from uuid import UUID

from backend.app.api.schemas.compare import (
    CandidateMetrics,
    CompareJobsResponse,
    ComparedJob,
    ComparedJobCompany,
    MetricScore,
)
from backend.app.clients.llm import chat_complete
from backend.app.core.exceptions import AppError, NotFoundError
from backend.app.observability.logger import get_logger
from backend.app.services.matching.ingest import try_ingest_resume
from backend.app.services.matching.skills import extract_skills
from backend.app.services.matching.store import SupabaseResumeStore
from supabase import Client

logger = get_logger(__name__)

CompleteFn = Callable[..., str]

_PROMPT_PATH = Path(__file__).resolve().parents[2] / "prompts" / "system" / "compare_jobs.txt"
COMPARE_JOBS_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")

JOB_LABELS = ["Công việc A", "Công việc B", "Công việc C", "Công việc D", "Công việc E"]


def _strip_fence(raw: str) -> str:
    text = raw.strip()
    match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, flags=re.DOTALL | re.IGNORECASE)
    return match.group(1) if match else text


def _clean_cv_text_for_prompt(markdown: str, metadata: dict[str, Any] | None = None) -> str:
    text = (markdown or "").strip()
    # Redact obvious PII patterns
    text = re.sub(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "[EMAIL ĐÃ ẨN]", text)
    text = re.sub(r"(?:\+?84|0)(?:3|5|7|8|9)\d(?:[\s.-]?\d){7,8}", "[SĐT ĐÃ ẨN]", text)
    if not text and metadata:
        parts = []
        if metadata.get("summary"):
            parts.append(f"Tóm tắt năng lực: {metadata['summary']}")
        if metadata.get("skills"):
            parts.append(f"Kỹ năng: {', '.join(str(s) for s in metadata['skills'])}")
        text = "\n".join(parts)
    return text[:3000] if len(text) > 3000 else (text or "Hồ sơ chưa có mô tả chi tiết.")


def _parse_llm_response(raw: str) -> list[dict[str, Any]]:
    text = _strip_fence(raw)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []
    if isinstance(data, dict):
        results = data.get("comparison_results")
        if isinstance(results, list):
            return results
    if isinstance(data, list):
        return data
    return []


def _strip_accents(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def _match_job_label(raw_id: str, job_keys: list[str]) -> str | None:
    cleaned = raw_id.strip()
    cleaned_no_accents = _strip_accents(cleaned)
    for k in job_keys:
        if k.lower() == cleaned.lower() or _strip_accents(k) == cleaned_no_accents:
            return k

    # Check letter (A, B, C...)
    for k in job_keys:
        letter = k.split()[-1] if " " in k else k
        if (
            letter.lower() == cleaned.lower()
            or f"công việc {letter.lower()}" == cleaned.lower()
            or f"cong viec {letter.lower()}" == cleaned_no_accents
            or f"job {letter.lower()}" == cleaned_no_accents
        ):
            return k

    # Check index (1, 2, 3...)
    for idx, k in enumerate(job_keys):
        if str(idx + 1) in cleaned or f"job_{idx + 1}" in cleaned.lower():
            return k

    return None


def _fallback_metrics_for_job(
    cv_info: dict[str, Any],
    job: dict[str, Any],
    rank_hint: int,
    total: int,
) -> CandidateMetrics:
    cv_skills = [str(s).strip() for s in cv_info.get("skills", []) if str(s).strip()]
    job_req_text = f"{job.get('title', '')} {job.get('requirements', '')} {job.get('description', '')}"
    jd_req_skills = extract_skills(job_req_text)
    matched = [s for s in cv_skills if any(j.lower() in s.lower() or s.lower() in j.lower() for j in jd_req_skills)]

    # 1. Hard skills score
    if jd_req_skills:
        ratio = len(matched) / max(len(jd_req_skills), 1)
        skill_score = min(9.5, max(4.0, round(4.5 + ratio * 5.0, 1)))
        skill_reason = (
            f"Đáp ứng {len(matched)}/{len(jd_req_skills)} kỹ năng yêu cầu: {', '.join(matched[:3])}"
            if matched
            else "Kỹ năng chuyên môn hiện tại cần bổ sung thêm theo JD."
        )
    else:
        skill_score = 7.5
        skill_reason = f"Kỹ năng ({', '.join(cv_skills[:3]) if cv_skills else 'cơ bản'}) phù hợp với định hướng công việc."

    # 2. Experience score
    markdown = cv_info.get("clean_markdown") or cv_info.get("markdown") or ""
    has_years = bool(re.search(r"\b([2-9]|1[0-5])\s*(?:năm|years?)\b", markdown, re.IGNORECASE))
    exp_score = min(9.5, max(4.0, round(6.0 + (1.5 if has_years else 0.5) + (rank_hint * 0.2), 1)))
    exp_reason = (
        "Kinh nghiệm thực tế đáp ứng tốt các đầu việc của vị trí."
        if has_years
        else "Kinh nghiệm có liên quan, phù hợp mức độ yêu cầu."
    )

    # 3. Education score
    has_degree = bool(re.search(r"(đại học|cử nhân|thạc sĩ|kỹ sư|bachelor|master|university)", markdown, re.IGNORECASE))
    edu_score = min(9.5, max(5.0, round(7.0 + (1.5 if has_degree else 0.5), 1)))
    edu_reason = (
        "Học vấn và nền tảng đào tạo chuyên môn đạt chuẩn JD."
        if has_degree
        else "Nền tảng học vấn và chứng chỉ đáp ứng vị trí."
    )

    # 4. Overall fit
    overall_score = round(0.35 * skill_score + 0.35 * exp_score + 0.30 * edu_score, 1)
    overall_reason = (
        f"Vị trí rất phù hợp với năng lực và mục tiêu phát triển của bạn."
        if overall_score >= 7.5
        else "Mức độ phù hợp khá, cần chuẩn bị kỹ năng chuyên sâu."
    )

    return CandidateMetrics(
        experience=MetricScore(score=exp_score, reason=exp_reason[:100]),
        hard_skills=MetricScore(score=skill_score, reason=skill_reason[:100]),
        education=MetricScore(score=edu_score, reason=edu_reason[:100]),
        overall_fit=MetricScore(score=overall_score, reason=overall_reason[:100]),
    )


async def compare_jobs_for_candidate(
    client: Client,
    actor_id: UUID,
    job_ids: list[UUID],
    *,
    resume_id: UUID | None = None,
    complete: CompleteFn | None = None,
    store: SupabaseResumeStore | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> CompareJobsResponse:
    """Compare 2-5 Job Descriptions visually for a candidate based on candidate's anonymized CV using AI Career Advisor."""
    if len(job_ids) < 2 or len(job_ids) > 5:
        raise AppError(400, "Vui lòng chọn từ 2 đến 5 việc làm để so sánh", "INVALID_JOB_COUNT")

    # 1. Fetch Candidate Resume
    def _fetch_candidate_resume() -> dict[str, Any] | None:
        if resume_id:
            return (
                client.table("resumes")
                .select("id, title, storage_path, created_at")
                .eq("id", str(resume_id))
                .eq("user_id", str(actor_id))
                .is_("deleted_at", "null")
                .maybe_single()
                .execute()
                .data
            )
        # Try default resume
        default_res = (
            client.table("resumes")
            .select("id, title, storage_path, created_at")
            .eq("user_id", str(actor_id))
            .eq("is_default", True)
            .is_("deleted_at", "null")
            .maybe_single()
            .execute()
            .data
        )
        if default_res:
            return default_res
        # Fallback to latest resume
        return (
            client.table("resumes")
            .select("id, title, storage_path, created_at")
            .eq("user_id", str(actor_id))
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
            .limit(1)
            .maybe_single()
            .execute()
            .data
        )

    resume_row = await asyncio.to_thread(_fetch_candidate_resume)
    if not resume_row or not resume_row.get("id"):
        raise AppError(
            400,
            "Bạn chưa có CV nào để so sánh. Vui lòng tải lên hoặc tạo CV trước.",
            "NO_RESUME_FOUND",
        )

    chosen_resume_id = UUID(str(resume_row["id"]))
    resume_title = resume_row.get("title") or "CV ứng viên"

    # 2. Ingest and fetch parsed CV content
    resume_store = store or SupabaseResumeStore(client)
    await try_ingest_resume(resume_store, chosen_resume_id, api_key=api_key, base_url=base_url)

    def _fetch_embedded_resume() -> dict[str, Any] | None:
        return (
            client.table("embedded_resumes")
            .select("metadata, clean_markdown, markdown")
            .eq("resume_id", str(chosen_resume_id))
            .maybe_single()
            .execute()
            .data
        )

    parsed_cv = await asyncio.to_thread(_fetch_embedded_resume) or {}
    cv_metadata = parsed_cv.get("metadata") or {}
    cv_clean = parsed_cv.get("clean_markdown") or parsed_cv.get("markdown") or ""
    anonymized_cv_text = _clean_cv_text_for_prompt(cv_clean, cv_metadata)

    cv_info = {
        "resume_id": chosen_resume_id,
        "title": resume_title,
        "skills": cv_metadata.get("skills") or [],
        "clean_markdown": cv_clean,
        "markdown": parsed_cv.get("markdown") or "",
    }

    # 3. Fetch Jobs
    def _fetch_jobs() -> list[dict[str, Any]]:
        return (
            client.table("job_posts")
            .select(
                "id, title, description, requirements, benefits, location, employment_type, "
                "salary_min, salary_max, currency, deadline_at, status, "
                "companies!company_id(id, name, logo_storage_path)"
            )
            .in_("id", [str(jid) for jid in job_ids])
            .execute()
            .data
            or []
        )

    job_rows = await asyncio.to_thread(_fetch_jobs)
    if len(job_rows) < 2:
        raise AppError(400, "Không tìm thấy đủ công việc hợp lệ để so sánh", "NOT_ENOUGH_JOBS")

    # Maintain requested job order
    requested_order = {str(jid): idx for idx, jid in enumerate(job_ids)}
    job_rows.sort(key=lambda j: requested_order.get(str(j["id"]), 999))

    # 4. Prepare JD blocks labeled as Công việc A, Công việc B...
    anon_job_map: dict[str, dict[str, Any]] = {}
    jd_blocks: list[str] = []

    for idx, job in enumerate(job_rows):
        label = JOB_LABELS[idx] if idx < len(JOB_LABELS) else f"Công việc {idx + 1}"
        company_data = job.get("companies")
        if isinstance(company_data, list) and company_data:
            company_data = company_data[0]
        company_name = (company_data or {}).get("name") if isinstance(company_data, dict) else "Công ty đối tác"

        parts = [f"{label}:", f"- Tiêu đề: {job.get('title')}", f"- Công ty: {company_name}"]
        if job.get("location"):
            parts.append(f"- Địa điểm: {job['location']}")
        if job.get("employment_type"):
            parts.append(f"- Hình thức: {job['employment_type']}")
        if job.get("description"):
            parts.append(f"- Mô tả công việc:\n{job['description']}")
        if job.get("requirements"):
            parts.append(f"- Yêu cầu công việc:\n{job['requirements']}")
        if job.get("benefits"):
            parts.append(f"- Quyền lợi:\n{job['benefits']}")

        jd_blocks.append("\n".join(parts))
        anon_job_map[label] = {
            "job": job,
            "company": company_data if isinstance(company_data, dict) else None,
        }

    jd_text = "\n\n".join(jd_blocks)

    # 5. Build Career Advisor Prompt
    prompt = COMPARE_JOBS_PROMPT_TEMPLATE.replace(
        "{{JD_AND_REQUIREMENTS}}", jd_text
    ).replace(
        "{{ANONYMIZED_CV}}", anonymized_cv_text
    )

    # 6. Call LLM
    fn = complete or chat_complete
    parsed_results: list[dict[str, Any]] = []
    try:
        raw_output = fn(prompt, json_object=True, api_key=api_key, base_url=base_url)
        parsed_results = _parse_llm_response(raw_output)
    except Exception as exc:
        logger.warning("LLM job comparison failed, falling back to deterministic: %s", exc)
        parsed_results = []

    # Map LLM results by matched label
    job_keys = list(anon_job_map.keys())
    llm_metrics_by_label: dict[str, CandidateMetrics] = {}

    for item in parsed_results:
        raw_jid = str(item.get("job_id") or "")
        matched_label = _match_job_label(raw_jid, job_keys)
        if not matched_label or matched_label in llm_metrics_by_label:
            continue

        raw_metrics = item.get("metrics") or {}

        def _extract_metric(key: str, default_score: float = 6.5) -> MetricScore:
            sub = raw_metrics.get(key) or {}
            score = sub.get("score")
            try:
                score_val = float(score)
                score_val = max(1.0, min(10.0, score_val))
            except (TypeError, ValueError):
                score_val = default_score
            reason_val = str(sub.get("reason") or "Phù hợp với hồ sơ ứng viên.").strip()
            return MetricScore(score=round(score_val, 1), reason=reason_val[:120])

        llm_metrics_by_label[matched_label] = CandidateMetrics(
            experience=_extract_metric("experience", 7.0),
            hard_skills=_extract_metric("hard_skills", 7.0),
            education=_extract_metric("education", 7.5),
            overall_fit=_extract_metric("overall_fit", 7.0),
        )

    # 7. Assemble compared jobs with fallback for missing entries
    total_jobs = len(anon_job_map)
    compared_list: list[ComparedJob] = []

    for idx, (label, item_info) in enumerate(anon_job_map.items(), start=1):
        job = item_info["job"]
        company_dict = item_info["company"]
        company_obj = None
        if company_dict and company_dict.get("id"):
            company_obj = ComparedJobCompany(
                id=UUID(str(company_dict["id"])),
                name=company_dict.get("name") or "Công ty",
                logo_storage_path=company_dict.get("logo_storage_path"),
            )

        if label in llm_metrics_by_label:
            metrics = llm_metrics_by_label[label]
        else:
            metrics = _fallback_metrics_for_job(cv_info, job, idx, total_jobs)

        total_score = round(
            metrics.experience.score
            + metrics.hard_skills.score
            + metrics.education.score
            + metrics.overall_fit.score,
            1,
        )
        average_score = round(total_score / 4.0, 1)

        compared_list.append(
            ComparedJob(
                job_id=UUID(str(job["id"])),
                title=str(job.get("title") or "Vị trí tuyển dụng"),
                company=company_obj,
                location=job.get("location"),
                employment_type=job.get("employment_type"),
                salary_min=float(job["salary_min"]) if job.get("salary_min") is not None else None,
                salary_max=float(job["salary_max"]) if job.get("salary_max") is not None else None,
                currency=job.get("currency") or "VND",
                deadline_at=str(job["deadline_at"]) if job.get("deadline_at") else None,
                anonymous_label=label,
                metrics=metrics,
                total_score=total_score,
                average_score=average_score,
                rank=1,
            )
        )

    # 8. Sort by highest total_score and overall_fit
    compared_list.sort(key=lambda c: (c.total_score, c.metrics.overall_fit.score), reverse=True)
    for rank_idx, c_job in enumerate(compared_list, start=1):
        c_job.rank = rank_idx

    top_job = compared_list[0] if compared_list else None
    top_job_id = top_job.job_id if top_job else None

    # Summary career advisor advice
    if top_job:
        comp_name = top_job.company.name if top_job.company else "Nhà tuyển dụng"
        summary = (
            f"AI Career Advisor đã phân tích đối chiếu CV '{resume_title}' với {len(compared_list)} công việc được chọn. "
            f"Vị trí phù hợp nhất với bạn là '{top_job.title}' tại {comp_name} với điểm trung bình {top_job.average_score}/10, "
            f"nổi bật với độ phù hợp tổng thể {top_job.metrics.overall_fit.score}/10."
        )
    else:
        summary = f"Đã so sánh đối chiếu {len(compared_list)} công việc với CV của bạn."

    return CompareJobsResponse(
        candidate_id=actor_id,
        resume_id=chosen_resume_id,
        resume_title=resume_title,
        jobs=compared_list,
        top_job_id=top_job_id,
        summary=summary,
    )
