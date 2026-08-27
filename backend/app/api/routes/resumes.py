import re
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends

from backend.app.api.schemas.common import (
    CvHeaderInfo,
    DeleteResumeResponse,
    IngestResponse,
    ParsedCvLine,
    SetResumePublicRequest,
    SetResumePublicResponse,
)
from backend.app.clients.supabase import get_supabase_client
from backend.app.config.env import settings
from backend.app.core.exceptions import ForbiddenError, NotFoundError
from backend.app.core.security import AuthenticatedUser
from backend.app.dependencies.auth import get_current_user
from backend.app.guardrails.rate_limit import enforce_ingest_rate_limit
from backend.app.services.matching.ingest import ingest_resume
from backend.app.services.matching.store import SupabaseResumeStore
from supabase import Client

router = APIRouter()



def extract_cv_lines_from_markdown(
    markdown: str, metadata: dict | None = None
) -> tuple[list[dict[str, str]], dict[str, str]]:
    """Parse structured CV markdown into profile lines and header info."""
    lines: list[dict[str, str]] = []
    header: dict[str, str] = {}

    text = (markdown or "").strip()
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            text = parts[2].strip()

    section_map = {
        "profile": "summary",
        "summary": "summary",
        "about me": "summary",
        "giới thiệu": "summary",
        "tóm tắt": "summary",
        "mục tiêu": "summary",
        "mục tiêu nghề nghiệp": "summary",
        "work experience": "experience",
        "experience": "experience",
        "kinh nghiệm": "experience",
        "kinh nghiệm làm việc": "experience",
        "kinh nghiệm chuyên môn": "experience",
        "education": "education",
        "học vấn": "education",
        "trình độ học vấn": "education",
        "technical skills": "skill",
        "skills": "skill",
        "kỹ năng": "skill",
        "kĩ năng": "skill",
        "kỹ năng chuyên môn": "skill",
        "projects": "project",
        "project": "project",
        "dự án": "project",
        "dự án nổi bật": "project",
        "certifications": "certification",
        "certification": "certification",
        "chứng chỉ": "certification",
        "chứng chỉ & giải thưởng": "certification",
        "languages": "language",
        "language": "language",
        "ngoại ngữ": "language",
        "additional": "other",
        "additional information": "other",
        "thông tin thêm": "other",
        "thông tin bổ sung": "other",
    }

    sections = re.split(r"(?m)^##\s+(.+)$", text)
    if len(sections) <= 1:
        non_empty = [p.strip() for p in text.split("\n\n") if p.strip()]
        for p in non_empty:
            if not p.startswith("#"):
                lines.append({"name": "experience", "value": p})
    else:
        preamble = sections[0].strip()
        if preamble:
            emails = re.findall(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", preamble)
            if emails:
                header["email"] = emails[0]
            phones = re.findall(r"(?:\+?84|0)(?:3|5|7|8|9)\d(?:[\s.-]?\d){7,8}", preamble)
            if phones:
                header["phone"] = phones[0]

        for i in range(1, len(sections), 2):
            raw_title = sections[i].strip()
            content = sections[i + 1].strip() if i + 1 < len(sections) else ""
            if not content:
                continue

            sec_type = section_map.get(raw_title.lower(), "other")

            if sec_type in ("experience", "education", "project"):
                sub_blocks = re.split(r"(?m)^###\s+(.+)$", content)
                if len(sub_blocks) > 1:
                    for j in range(1, len(sub_blocks), 2):
                        heading = sub_blocks[j].strip()
                        body = sub_blocks[j + 1].strip() if j + 1 < len(sub_blocks) else ""
                        val = f"{heading}\n{body}".strip() if body else heading
                        lines.append({"name": sec_type, "value": val})
                else:
                    lines.append({"name": sec_type, "value": content})
            else:
                lines.append({"name": sec_type, "value": content})

    if metadata and metadata.get("skills") and not any(line["name"] == "skill" for line in lines):
        skills = metadata.get("skills")
        if isinstance(skills, list) and skills:
            lines.append({"name": "skill", "value": ", ".join(str(s) for s in skills)})

    return lines, header


@router.post("/resumes/{resume_id}/ingest", response_model=IngestResponse)
async def ingest_own_resume(
    resume_id: UUID,
    current_user: AuthenticatedUser = Depends(enforce_ingest_rate_limit),
    client: Client = Depends(get_supabase_client),
) -> IngestResponse:
    store = SupabaseResumeStore(client)
    resume = await store.get_resume(resume_id)
    if not resume:
        raise NotFoundError("Resume not found", code="RESUME_NOT_FOUND")
    if str(resume.get("user_id")) != str(current_user.id):
        raise ForbiddenError("Not your resume")
    status = await ingest_resume(
        store,
        resume_id,
        api_key=settings.qwen_api_key,
        base_url=settings.qwen_base_url,
    )
    parsed_record = await store.get_parsed(resume_id)
    markdown = ""
    meta: dict | None = None
    if parsed_record:
        markdown = parsed_record.get("clean_markdown") or parsed_record.get("markdown") or ""
        meta = parsed_record.get("metadata")

    parsed_lines, header_info = extract_cv_lines_from_markdown(markdown, meta)

    return IngestResponse(
        status=status,
        markdown=markdown,
        lines=[ParsedCvLine(name=line["name"], value=line["value"]) for line in parsed_lines],
        header=CvHeaderInfo(
            full_name=header_info.get("full_name"),
            email=header_info.get("email"),
            phone=header_info.get("phone"),
        ),
    )


@router.patch("/resumes/{resume_id}/public", response_model=SetResumePublicResponse)
async def set_resume_public(
    resume_id: UUID,
    payload: SetResumePublicRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> SetResumePublicResponse:
    res = (
        client.table("resumes")
        .select("id, user_id, is_public, deleted_at")
        .eq("id", str(resume_id))
        .maybe_single()
        .execute()
    )
    resume = res.data
    if not resume or resume.get("deleted_at") is not None:
        raise NotFoundError("Resume not found", code="RESUME_NOT_FOUND")

    if str(resume.get("user_id")) != str(current_user.id):
        raise ForbiddenError("Bạn chỉ có quyền thay đổi CV do chính mình sở hữu")

    if payload.is_public:
        # Enforce exactly one public resume per candidate
        # 1. Turn off public on any other resumes owned by this user
        client.table("resumes").update({"is_public": False}).eq("user_id", str(current_user.id)).neq("id", str(resume_id)).execute()
        # 2. Turn on public for this resume
        client.table("resumes").update({"is_public": True}).eq("id", str(resume_id)).eq("user_id", str(current_user.id)).execute()
        msg = "Đã đặt CV làm công khai (Đang tìm việc)."
    else:
        client.table("resumes").update({"is_public": False}).eq("id", str(resume_id)).eq("user_id", str(current_user.id)).execute()
        msg = "Đã tắt trạng thái công khai của CV."

    return SetResumePublicResponse(
        id=str(resume_id),
        is_public=payload.is_public,
        message=msg,
    )


@router.delete("/resumes/{resume_id}", response_model=DeleteResumeResponse)
async def delete_resume(
    resume_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> DeleteResumeResponse:
    res = (
        client.table("resumes")
        .select("id, user_id, is_default, is_public, deleted_at, storage_path, bucket_id")
        .eq("id", str(resume_id))
        .maybe_single()
        .execute()
    )
    resume = res.data
    if not resume or resume.get("deleted_at") is not None:
        raise NotFoundError("Resume not found", code="RESUME_NOT_FOUND")

    if str(resume.get("user_id")) != str(current_user.id):
        raise ForbiddenError("Bạn chỉ có quyền xóa CV do chính mình sở hữu")

    now_iso = datetime.now(UTC).isoformat()
    # 1. Soft-delete the resume and clear public / default flags
    client.table("resumes").update({
        "deleted_at": now_iso,
        "is_public": False,
        "is_default": False,
    }).eq("id", str(resume_id)).eq("user_id", str(current_user.id)).execute()

    # 2. If this was the user's default_resume_id in profiles, clear it
    client.table("profiles").update({
        "default_resume_id": None,
    }).eq("id", str(current_user.id)).eq("default_resume_id", str(resume_id)).execute()

    # 3. Clean up vector search embedding record if present
    client.table("embedded_resumes").delete().eq("resume_id", str(resume_id)).execute()

    return DeleteResumeResponse(
        id=str(resume_id),
        deleted=True,
        message="Đã xóa CV thành công.",
    )


