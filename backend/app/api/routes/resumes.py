import re
from uuid import UUID

from fastapi import APIRouter, Depends

from backend.app.api.schemas.common import CvHeaderInfo, IngestResponse, ParsedCvLine
from backend.app.clients.supabase import get_supabase_client
from backend.app.config.env import settings
from backend.app.core.exceptions import ForbiddenError, NotFoundError
from backend.app.core.security import AuthenticatedUser
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
