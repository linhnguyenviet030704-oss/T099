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
    CompareCandidatesResponse,
    ComparedCandidate,
    MetricScore,
)
from backend.app.clients.llm import chat_complete
from backend.app.core.exceptions import AppError, NotFoundError
from backend.app.guardrails.gates import gate_context
from backend.app.guardrails.output import validate_generated_text
from backend.app.observability.logger import get_logger
from backend.app.services.matching.ingest import try_ingest_resume
from backend.app.services.matching.skills import extract_skills
from backend.app.services.matching.store import SupabaseResumeStore
from backend.app.services.recommend import assert_recruiter_job_access
from supabase import Client

logger = get_logger(__name__)

CompleteFn = Callable[..., str]

_PROMPT_PATH = Path(__file__).resolve().parents[2] / "prompts" / "system" / "compare_candidates.txt"
COMPARE_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")

LABELS = ["Ứng viên A", "Ứng viên B", "Ứng viên C", "Ứng viên D", "Ứng viên E"]


def _strip_fence(raw: str) -> str:
    text = raw.strip()
    match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, flags=re.DOTALL | re.IGNORECASE)
    return match.group(1) if match else text


def _clean_cv_text_for_prompt(markdown: str, metadata: dict[str, Any] | None = None) -> str:
    text = (markdown or "").strip()
    if not text and metadata:
        parts = []
        if metadata.get("summary"):
            parts.append(f"Tóm tắt: {metadata['summary']}")
        if metadata.get("skills"):
            parts.append(f"Kỹ năng: {', '.join(str(s) for s in metadata['skills'])}")
        text = "\n".join(parts)
    decision = gate_context(text, source="cv", max_chars=3000)
    if decision.action == "block" or not decision.value:
        return "Hồ sơ chưa có mô tả chi tiết."
    return str(decision.value)


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


def _match_label(raw_id: str, candidate_keys: list[str]) -> str | None:
    cleaned = raw_id.strip()
    cleaned_no_accents = _strip_accents(cleaned)
    for k in candidate_keys:
        if k.lower() == cleaned.lower() or _strip_accents(k) == cleaned_no_accents:
            return k
    # Check letter (A, B, C...)
    for k in candidate_keys:
        letter = k.split()[-1] if " " in k else k
        if (
            letter.lower() == cleaned.lower()
            or f"ứng viên {letter.lower()}" == cleaned.lower()
            or f"ung vien {letter.lower()}" == cleaned_no_accents
            or f"candidate {letter.lower()}" == cleaned_no_accents
        ):
            return k
    # Check index
    for idx, k in enumerate(candidate_keys):
        if str(idx + 1) in cleaned or f"cand_{idx + 1}" in cleaned.lower():
            return k
    return None


def _fallback_metrics_for_candidate(
    cand: dict[str, Any],
    jd_skills: list[str],
    rank_hint: int,
    total: int,
) -> CandidateMetrics:
    cv_skills = [str(s).strip() for s in cand.get("skills", []) if str(s).strip()]
    jd_req_skills = [str(s).strip() for s in jd_skills if str(s).strip()]
    matched = [s for s in cv_skills if any(j.lower() in s.lower() or s.lower() in j.lower() for j in jd_req_skills)]

    # 1. Hard skills score
    if jd_req_skills:
        ratio = len(matched) / max(len(jd_req_skills), 1)
        skill_score = min(9.5, max(3.5, round(4.0 + ratio * 5.5, 1)))
        skill_reason = (
            f"Đáp ứng {len(matched)}/{len(jd_req_skills)} kỹ năng cốt lõi: {', '.join(matched[:3])}"
            if matched
            else "Chưa thể hiện đủ kỹ năng chuyên môn cốt lõi yêu cầu."
        )
    else:
        skill_score = 7.5
        skill_reason = f"Có các kỹ năng chuyên môn liên quan ({', '.join(cv_skills[:3]) if cv_skills else 'cơ bản'})."

    # 2. Experience score
    markdown = cand.get("clean_markdown") or cand.get("markdown") or ""
    has_years = bool(re.search(r"\b([2-9]|1[0-5])\s*(?:năm|years?)\b", markdown, re.IGNORECASE))
    exp_score = min(9.5, max(4.0, round(6.0 + (1.5 if has_years else 0.5) + (rank_hint * 0.2), 1)))
    exp_reason = (
        "Kinh nghiệm làm việc thực tế liên quan trực tiếp đến vị trí."
        if has_years
        else "Có kinh nghiệm thực tế, cần phỏng vấn thêm về dự án."
    )

    # 3. Education score
    has_degree = bool(re.search(r"(đại học|cử nhân|thạc sĩ|kỹ sư|bachelor|master|university)", markdown, re.IGNORECASE))
    edu_score = min(9.5, max(5.0, round(7.0 + (1.5 if has_degree else 0.5), 1)))
    edu_reason = (
        "Bằng cấp chuyên ngành phù hợp với yêu cầu tuyển dụng."
        if has_degree
        else "Đạt yêu cầu học vấn và nền tảng chuyên môn."
    )

    # 4. Overall fit
    overall_score = round(0.35 * skill_score + 0.35 * exp_score + 0.30 * edu_score, 1)
    overall_reason = (
        f"Hồ sơ tiềm năng, xếp thứ {rank_hint}/{total} trong nhóm ứng viên so sánh."
        if overall_score >= 7.5
        else "Hồ sơ cơ bản, cần đánh giá thêm qua phỏng vấn chuyên sâu."
    )

    return CandidateMetrics(
        experience=MetricScore(score=exp_score, reason=exp_reason[:100]),
        hard_skills=MetricScore(score=skill_score, reason=skill_reason[:100]),
        education=MetricScore(score=edu_score, reason=edu_reason[:100]),
        overall_fit=MetricScore(score=overall_score, reason=overall_reason[:100]),
    )


async def compare_candidates_for_job(
    client: Client,
    actor_id: UUID,
    job_id: UUID,
    application_ids: list[UUID],
    *,
    complete: CompleteFn | None = None,
    store: SupabaseResumeStore | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> CompareCandidatesResponse:
    """Compare 2-5 candidate CVs objectively against a Job Description using LLM."""
    if len(application_ids) < 2 or len(application_ids) > 5:
        raise AppError(400, "Vui lòng chọn từ 2 đến 5 ứng viên để so sánh", "INVALID_CANDIDATE_COUNT")

    await assert_recruiter_job_access(client, actor_id, job_id)

    # 1. Fetch Job Post
    def _fetch_job() -> dict[str, Any] | None:
        return (
            client.table("job_posts")
            .select("id, title, description, requirements, skill_constraints")
            .eq("id", str(job_id))
            .maybe_single()
            .execute()
            .data
        )

    job = await asyncio.to_thread(_fetch_job)
    if not job:
        raise NotFoundError("Job not found", code="JOB_NOT_FOUND")

    # 2. Fetch Applications
    def _fetch_submits() -> list[dict[str, Any]]:
        return (
            client.table("job_submits")
            .select(
                "id, applicant_user_id, resume_id, current_status, "
                "resume_title_snapshot, resume_storage_path_snapshot, "
                "profiles!applicant_user_id(full_name, email)"
            )
            .eq("job_post_id", str(job_id))
            .in_("id", [str(aid) for aid in application_ids])
            .is_("withdrawn_at", "null")
            .execute()
            .data
            or []
        )

    submits = await asyncio.to_thread(_fetch_submits)
    if len(submits) < 2:
        raise AppError(400, "Không tìm thấy đủ ứng viên hợp lệ để so sánh", "NOT_ENOUGH_CANDIDATES")

    # Sort submits to match the requested order
    requested_order = {str(aid): idx for idx, aid in enumerate(application_ids)}
    submits.sort(key=lambda s: requested_order.get(str(s["id"]), 999))

    # 3. Fetch or Ingest parsed resumes
    resume_store = store or SupabaseResumeStore(client)
    resume_uuids = [UUID(str(s["resume_id"])) for s in submits if s.get("resume_id")]

    for r_uuid in resume_uuids:
        await try_ingest_resume(resume_store, r_uuid, api_key=api_key, base_url=base_url)

    # Fetch parsed records from embedded_resumes
    def _fetch_embedded() -> list[dict[str, Any]]:
        r_ids = [str(r) for r in resume_uuids]
        if not r_ids:
            return []
        return (
            client.table("embedded_resumes")
            .select("resume_id, metadata, clean_markdown, markdown")
            .in_("resume_id", r_ids)
            .execute()
            .data
            or []
        )

    embedded_rows = await asyncio.to_thread(_fetch_embedded)
    embedded_by_resume_id = {str(row["resume_id"]): row for row in embedded_rows if row.get("resume_id")}

    # 4. Prepare Anonymized CVs and Mapping
    anon_map: dict[str, dict[str, Any]] = {}
    anonymized_cv_blocks: list[str] = []

    for idx, submit in enumerate(submits):
        label = LABELS[idx] if idx < len(LABELS) else f"Ứng viên {idx + 1}"
        resume_id = str(submit.get("resume_id") or "")
        parsed = embedded_by_resume_id.get(resume_id, {})
        metadata = parsed.get("metadata") or {}
        clean_markdown = parsed.get("clean_markdown") or parsed.get("markdown") or ""

        cv_body = _clean_cv_text_for_prompt(clean_markdown, metadata)
        anonymized_cv_blocks.append(f"{label}:\n{cv_body}\n")

        profile = submit.get("profiles") or {}
        if isinstance(profile, list) and profile:
            profile = profile[0]

        anon_map[label] = {
            "application_id": UUID(str(submit["id"])),
            "applicant_user_id": UUID(str(submit["applicant_user_id"])),
            "full_name": profile.get("full_name"),
            "email": profile.get("email"),
            "resume_title": submit.get("resume_title_snapshot"),
            "resume_storage_path": submit.get("resume_storage_path_snapshot"),
            "current_status": submit.get("current_status") or "pending",
            "skills": metadata.get("skills") or [],
            "clean_markdown": clean_markdown,
            "markdown": parsed.get("markdown") or "",
        }

    # 5. Build Prompt
    jd_parts = [f"Tiêu đề: {job.get('title')}"]
    if job.get("description"):
        jd_parts.append(f"Mô tả công việc:\n{job['description']}")
    if job.get("requirements"):
        jd_parts.append(f"Yêu cầu công việc:\n{job['requirements']}")
    jd_text = "\n\n".join(jd_parts)
    guarded_jd = gate_context(jd_text, source="jd", max_chars=8000)
    anonymized_cvs_text = "\n".join(anonymized_cv_blocks)

    prompt = COMPARE_PROMPT_TEMPLATE.replace(
        "{job_description_and_requirements}", str(guarded_jd.value)
    ).replace(
        "{anonymized_cvs}", anonymized_cvs_text
    )

    # 6. Call LLM
    fn = complete or chat_complete
    parsed_results: list[dict[str, Any]] = []
    try:
        if guarded_jd.action == "block" or not guarded_jd.value:
            raise ValueError("job context blocked by safety gate")
        raw_output = await asyncio.to_thread(fn, prompt, json_object=True, api_key=api_key, base_url=base_url)
        parsed_results = _parse_llm_response(raw_output)
    except Exception as exc:
        logger.warning("LLM comparison failed, falling back to deterministic: %s", exc)
        parsed_results = []

    # Map LLM results by matched label
    candidate_keys = list(anon_map.keys())
    llm_metrics_by_label: dict[str, CandidateMetrics] = {}

    for item in parsed_results:
        raw_cid = str(item.get("candidate_id") or "")
        matched_label = _match_label(raw_cid, candidate_keys)
        if not matched_label or matched_label in llm_metrics_by_label:
            continue

        raw_metrics = item.get("metrics") or {}

        def _extract_metric(key: str, default_score: float = 6.0) -> MetricScore:
            sub = raw_metrics.get(key) or {}
            score = sub.get("score")
            try:
                score_val = float(score)
                score_val = max(1.0, min(10.0, score_val))
            except (TypeError, ValueError):
                score_val = default_score
            reason = validate_generated_text(
                str(sub.get("reason") or ""),
                max_chars=120,
                fallback="Phù hợp với yêu cầu vị trí.",
            )
            return MetricScore(score=round(score_val, 1), reason=str(reason.value))

        llm_metrics_by_label[matched_label] = CandidateMetrics(
            experience=_extract_metric("experience", 7.0),
            hard_skills=_extract_metric("hard_skills", 7.0),
            education=_extract_metric("education", 7.5),
            overall_fit=_extract_metric("overall_fit", 7.0),
        )

    # 7. Assemble compared candidates (with fallback for any missing candidate)
    jd_skills = extract_skills(jd_text)
    total_cand = len(anon_map)
    compared_list: list[ComparedCandidate] = []

    for idx, (label, cand_info) in enumerate(anon_map.items(), start=1):
        if label in llm_metrics_by_label:
            metrics = llm_metrics_by_label[label]
        else:
            metrics = _fallback_metrics_for_candidate(cand_info, jd_skills, idx, total_cand)

        total_score = round(
            metrics.experience.score
            + metrics.hard_skills.score
            + metrics.education.score
            + metrics.overall_fit.score,
            1,
        )
        average_score = round(total_score / 4.0, 1)

        compared_list.append(
            ComparedCandidate(
                application_id=cand_info["application_id"],
                applicant_user_id=cand_info["applicant_user_id"],
                full_name=cand_info["full_name"],
                email=cand_info["email"],
                resume_title=cand_info["resume_title"],
                resume_storage_path=cand_info["resume_storage_path"],
                current_status=cand_info["current_status"],
                anonymous_label=label,
                metrics=metrics,
                total_score=total_score,
                average_score=average_score,
                rank=1,  # updated below
            )
        )

    # 8. Sort and Rank
    compared_list.sort(key=lambda c: (c.total_score, c.metrics.overall_fit.score), reverse=True)
    for rank_idx, cand in enumerate(compared_list, start=1):
        cand.rank = rank_idx

    top_candidate = compared_list[0] if compared_list else None
    top_candidate_id = top_candidate.application_id if top_candidate else None

    # Summary text
    if top_candidate:
        top_name = top_candidate.full_name or top_candidate.anonymous_label
        summary = (
            f"AI đã so sánh chi tiết {len(compared_list)} ứng viên dựa trên JD '{job.get('title')}'. "
            f"Ứng viên nổi bật nhất là {top_name} với điểm trung bình {top_candidate.average_score}/10."
        )
    else:
        summary = f"Đã so sánh {len(compared_list)} ứng viên."

    return CompareCandidatesResponse(
        job_id=job_id,
        job_title=str(job.get("title") or "Vị trí tuyển dụng"),
        candidates=compared_list,
        top_candidate_id=top_candidate_id,
        summary=summary,
    )
