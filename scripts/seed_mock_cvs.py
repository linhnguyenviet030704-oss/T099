"""Upload seed mock PDFs into the resumes Storage bucket.

SQL seed inserts resume rows; Storage has no bytes until this runs.

    python scripts/seed_mock_cvs.py
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pymupdf
from supabase import create_client

from backend.app.core.config import Settings
from backend.app.services.matching.embed import DEFAULT_EMBEDDING_MODEL, embed_text
from backend.app.services.matching.parse import parse_resume_bytes
from backend.app.services.matching.skills import extract_skills

JD_SKILLS = ["React", "TypeScript", "JavaScript", "Git"]
JOB_ID = "b0000000-0000-4000-8000-000000000001"
CANDIDATE_ID = "11111111-1111-1111-1111-111111111111"
JD_REQUIREMENTS = (
    "React TypeScript JavaScript Git\n"
    "- 2+ years building production UIs with React\n"
    "- Strong TypeScript and JavaScript\n"
    "- Git pull requests and code review"
)
JD_DESCRIPTION = (
    "FPT Software hiring a Frontend React Developer for a product squad. "
    "You will ship component libraries, hooks, and dashboard screens with React, "
    "TypeScript, and JavaScript, and review Git pull requests daily."
)

DEMO_CVS = [
    {
        "title": "Senior React Engineer",
        "full_name": "Nguyễn Văn Ứng Viên",
        "headline": "Senior Frontend Engineer",
        "summary": "Six years shipping design systems and SPA dashboards.",
        "experience": "Led a React TypeScript design system used by 40 engineers. Mentored juniors on Git reviews.",
        "education": "BSc Computer Science, HCMUS",
        "skills": "React TypeScript JavaScript Git Docker",
    },
    {
        "title": "Mid React TypeScript",
        "full_name": "Trần Minh Khoa",
        "headline": "Frontend Developer",
        "summary": "Four years of product UI work on B2B admin tools.",
        "experience": "Built filterable tables and form wizards in React with TypeScript. Daily Git feature branches.",
        "education": "BEng Software, Bach Khoa HCM",
        "skills": "React TypeScript JavaScript Git",
    },
    {
        "title": "React Next specialist",
        "full_name": "Lê Thị Hạnh",
        "headline": "Frontend Engineer",
        "summary": "SSR storefronts and app router migrations.",
        "experience": "Migrated a marketing site to React with TypeScript. Owned Git release tags.",
        "education": "BSc IT, UIT",
        "skills": "React TypeScript JavaScript Git",
    },
    {
        "title": "React JavaScript Git",
        "full_name": "Phạm Đức Anh",
        "headline": "UI Engineer",
        "summary": "Component-heavy CRMs without a typed codebase yet.",
        "experience": "Delivered React widgets in JavaScript. Reviewed Git diffs for accessibility.",
        "education": "College of Information Technology",
        "skills": "React JavaScript Git",
    },
    {
        "title": "React TypeScript emailed zips",
        "full_name": "Hoàng Ngọc Lan",
        "headline": "Frontend Developer",
        "summary": "Typed React screens for an insurance portal.",
        "experience": "Wrote React TypeScript form validation and JavaScript utilities. Solo contractor, emailed zip files.",
        "education": "BSc Math, Hue University",
        "skills": "React TypeScript JavaScript",
    },
    {
        "title": "Junior React JavaScript",
        "full_name": "Huỳnh Gia Bảo",
        "headline": "Junior Frontend",
        "summary": "Bootcamp graduate polishing React list pages.",
        "experience": "Intern: converted mockups into React JavaScript pages. Pair programming only.",
        "education": "CodeGym bootcamp 2025",
        "skills": "React JavaScript",
    },
    {
        "title": "React Git intern",
        "full_name": "Phan Thanh Tâm",
        "headline": "Frontend Intern",
        "summary": "Campus club websites with React and GitHub classroom.",
        "experience": "Maintained a student club React app. Opened Git issues and pull requests.",
        "education": "3rd year IT, Da Nang University",
        "skills": "React Git",
    },
    {
        "title": "React TypeScript contractor",
        "full_name": "Vũ Hải Đăng",
        "headline": "Contract Frontend",
        "summary": "Short React TypeScript spikes for startups.",
        "experience": "Three-month React TypeScript prototype for a logistics tracker. No shared version history to show.",
        "education": "Self-taught",
        "skills": "React TypeScript",
    },
    {
        "title": "Angular TypeScript frontend",
        "full_name": "Võ Thị Mai",
        "headline": "Frontend Engineer",
        "summary": "Enterprise Angular admin, typed throughout.",
        "experience": "Owned Angular TypeScript modules and JavaScript build scripts. Gitflow on Azure Repos.",
        "education": "BSc Software Engineering, PTIT",
        "skills": "TypeScript JavaScript Git",
    },
    {
        "title": "Vanilla JavaScript Git",
        "full_name": "Đặng Quốc Huy",
        "headline": "Web Developer",
        "summary": "jQuery-era catalogs moving slowly toward modules.",
        "experience": "Maintained JavaScript storefront scripts. Git svn-bridge at a traditional shop.",
        "education": "Associate degree, Cao Thang",
        "skills": "JavaScript Git",
    },
    {
        "title": "TypeScript Git libraries",
        "full_name": "Nguyễn Thị Phương",
        "headline": "SDK Engineer",
        "summary": "Typed client libraries, no UI framework.",
        "experience": "Published TypeScript SDKs. Git tags for semver releases. No page rendering work.",
        "education": "MSc CS, HUST",
        "skills": "TypeScript Git",
    },
    {
        "title": "JavaScript only intern",
        "full_name": "Trần Văn Long",
        "headline": "Web Intern",
        "summary": "School assignments in JavaScript.",
        "experience": "Built a JavaScript calculator and quiz. Zip submissions to the lecturer.",
        "education": "Freshman, Can Tho University",
        "skills": "JavaScript",
    },
    {
        "title": "Git only release manager",
        "full_name": "Lê Minh Tú",
        "headline": "Release Coordinator",
        "summary": "Coordinates Git tags and changelogs, does not write product UI.",
        "experience": "Ran Git release trains for a mobile vendor. No frontend framework experience.",
        "education": "BA English, HNUE",
        "skills": "Git",
    },
    {
        "title": "React plus Python backend",
        "full_name": "Phạm Thị Hoa",
        "headline": "Fullstack (light UI)",
        "summary": "Mostly Python APIs with a small React settings page.",
        "experience": "Shipped FastAPI services and one React admin blank. Heavy Python, thin UI.",
        "education": "BSc IT, Hue",
        "skills": "React Python FastAPI",
    },
    {
        "title": "Fullstack React Python",
        "full_name": "Hoàng Anh Tuấn",
        "headline": "Fullstack Engineer",
        "summary": "React TypeScript clients on Python FastAPI.",
        "experience": "Built a booking UI in React TypeScript JavaScript and Git-reviewed FastAPI handlers.",
        "education": "BEng, Bach Khoa HN",
        "skills": "React TypeScript JavaScript Git Python FastAPI",
    },
    {
        "title": "Python FastAPI Git",
        "full_name": "Huỳnh Nhật Nam",
        "headline": "Backend Engineer",
        "summary": "API and workers, no browser UI.",
        "experience": "Python FastAPI PostgreSQL SQL services. Git trunk-based. Docker compose locally.",
        "education": "BSc CS, VNU",
        "skills": "Python FastAPI PostgreSQL SQL Git Docker",
    },
    {
        "title": "Python FastAPI data",
        "full_name": "Phan Thị Linh",
        "headline": "Backend Developer",
        "summary": "ETL-ish Python services talking to PostgreSQL.",
        "experience": "Python FastAPI jobs writing PostgreSQL. No frontend, no shared VCS mentioned.",
        "education": "BSc Statistics, NEU",
        "skills": "Python FastAPI PostgreSQL",
    },
    {
        "title": "DevOps Docker Linux Git",
        "full_name": "Vũ Đức Thịnh",
        "headline": "DevOps Engineer",
        "summary": "Clusters and pipelines, not product screens.",
        "experience": "Docker Linux GitLab runners. On-call for deploys. Never owned a UI ticket.",
        "education": "BEng Electronics, DUT",
        "skills": "Docker Linux Git",
    },
    {
        "title": "Docker Linux operator",
        "full_name": "Võ Thanh Hà",
        "headline": "Platform Operator",
        "summary": "Keeps containers healthy on Linux hosts.",
        "experience": "Docker Linux patching windows. Tickets in a spreadsheet, not a repo.",
        "education": "Sysadmin certificate",
        "skills": "Docker Linux",
    },
    {
        "title": "PostgreSQL DBA",
        "full_name": "Đặng Gia Hân",
        "headline": "Database Administrator",
        "summary": "Indexes, backups, query plans.",
        "experience": "Tuned PostgreSQL SQL for an ERP. No application UI work.",
        "education": "BSc MIS, UEH",
        "skills": "PostgreSQL SQL",
    },
    {
        "title": "SQL report analyst",
        "full_name": "Nguyễn Hữu Phước",
        "headline": "Data Analyst",
        "summary": "Warehouse extracts and monthly packs.",
        "experience": "Wrote SQL for finance packs in Excel. Stakeholder slides, not software delivery.",
        "education": "BBA, FTU",
        "skills": "SQL",
    },
    {
        "title": "Linux sysadmin",
        "full_name": "Trần Khánh Vy",
        "headline": "System Administrator",
        "summary": "On-prem Linux fleet for a factory.",
        "experience": "Linux user accounts and cron. No product development.",
        "education": "Vocational IT",
        "skills": "Linux",
    },
    {
        "title": "Python scripting",
        "full_name": "Lê Quốc Bảo",
        "headline": "Automation Scripter",
        "summary": "One-off Python file converters.",
        "experience": "Python scripts to rename invoices. Desktop only, no web stack.",
        "education": "BSc Physics",
        "skills": "Python",
    },
    {
        "title": "Product designer Figma",
        "full_name": "Phạm Minh Châu",
        "headline": "Product Designer",
        "summary": "Figma systems and usability tests. Does not write production UI code.",
        "experience": "Designed checkout flows in Figma. Handoff notes for engineers. No implementation.",
        "education": "BDes, HCMUFA",
        "skills": "Figma prototyping usability",
    },
    {
        "title": "Business analyst",
        "full_name": "Hoàng Nhật Quang",
        "headline": "Business Analyst",
        "summary": "Workshops, user stories, UAT scripts.",
        "experience": "Wrote acceptance criteria for an HR portal. Facilitated stakeholders. No coding.",
        "education": "BBA, UEH",
        "skills": "workshops user stories UAT",
    },
    {
        "title": "Career change accountant",
        "full_name": "Huỳnh Thị Yến",
        "headline": "Accountant exploring tech",
        "summary": "Eight years of bookkeeping. Interested in software, no engineering projects yet.",
        "experience": "Month-end close, VAT invoices, Excel reconciliations. No programming portfolio.",
        "education": "BAcc, Academy of Finance",
        "skills": "Excel bookkeeping VAT",
    },
    {
        "title": "Node JavaScript Git Linux",
        "full_name": "Phan Văn Sơn",
        "headline": "Backend JavaScript",
        "summary": "Node services, not component trees.",
        "experience": "JavaScript workers on Linux. Git monorepo for APIs. No component library.",
        "education": "BSc IT, HUFLIT",
        "skills": "JavaScript Git Linux",
    },
    {
        "title": "Staff frontend architect",
        "full_name": "Vũ Ngọc Ánh",
        "headline": "Staff Frontend Architect",
        "summary": "Platform UI, performance budgets, hiring loops.",
        "experience": "Set React TypeScript JavaScript conventions, Git CODEOWNERS, Docker preview apps, Linux build agents.",
        "education": "MSc HCI",
        "skills": "React TypeScript JavaScript Git Docker Linux",
    },
    {
        "title": "WordPress JavaScript Git",
        "full_name": "Võ Đình Khôi",
        "headline": "WordPress Developer",
        "summary": "Themes and jQuery widgets for SMEs.",
        "experience": "JavaScript sliders on WordPress. Git for theme deploys. No SPA framework.",
        "education": "Self-taught web",
        "skills": "JavaScript Git",
    },
    {
        "title": "React bootcamp graduate",
        "full_name": "Đặng Thùy Dương",
        "headline": "Junior looking for first role",
        "summary": "Finished a React crash course last month.",
        "experience": "Todo list in React. No team delivery, no typed codebase, no shared history.",
        "education": "Online React course 2026",
        "skills": "React",
    },
]


def applicant_id(index: int) -> str:
    if index == 1:
        return CANDIDATE_ID
    return f"10000000-0000-4000-8000-{index + 7:012d}"


def resume_uuid(index: int) -> str:
    return f"c0000000-0000-4000-8000-{index:012d}"


def submit_uuid(index: int) -> str:
    if index == 1:
        return f"d0000000-0000-4000-8000-{index:012d}"
    return f"e0000000-0000-4000-8000-{index:012d}"


def _unicode_font() -> str | None:
    for path in (
        Path(r"C:\Windows\Fonts\arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
    ):
        if path.exists():
            return str(path)
    return None


def mock_cv_pdf(cv: dict) -> bytes:
    text = (
        f"{cv['full_name']}\n{cv['headline']}\n{cv['title']}\n\n"
        f"Summary\n{cv['summary']}\n\n"
        f"Experience\n{cv['experience']}\n\n"
        f"Education\n{cv['education']}\n\n"
        f"Skills\n{cv['skills']}\n"
    )
    doc = pymupdf.open()
    page = doc.new_page()
    fontfile = _unicode_font()
    rect = pymupdf.Rect(48, 48, 547, 780)
    if fontfile:
        page.insert_font(fontname="uni", fontfile=fontfile)
        page.insert_textbox(rect, text, fontsize=11, fontname="uni")
    else:
        page.insert_textbox(rect, text, fontsize=11)
    data = doc.tobytes(garbage=3, deflate=True)
    doc.close()
    return data


def _ingest(client, resume_id: str, pdf: bytes) -> None:
    parsed = parse_resume_bytes(pdf, mime_type="application/pdf")
    markdown = parsed.get("markdown") or ""
    client.table("embedded_resumes").upsert(
        {
            "resume_id": resume_id,
            "markdown": markdown,
            "metadata": {"skills": extract_skills(markdown), "summary": "", "titles": []},
            "content_hash": hashlib.sha256(pdf).hexdigest(),
            "embedding": embed_text(markdown),
            "model": DEFAULT_EMBEDDING_MODEL,
        }
    ).execute()


def _stage_for(index: int) -> str | None:
    return ("screening", "interview", "offer", "rejected", None)[index % 5]


def main() -> None:
    settings = Settings()
    if not settings.supabase_service_role_key:
        raise SystemExit("SUPABASE_SERVICE_ROLE_KEY is empty")
    client = create_client(settings.supabase_url, settings.supabase_service_role_key)

    client.table("job_posts").update(
        {"description": JD_DESCRIPTION, "requirements": JD_REQUIREMENTS}
    ).eq("id", JOB_ID).execute()

    uploaded = 0
    for index, cv in enumerate(DEMO_CVS, start=1):
        uid = applicant_id(index)
        rid = resume_uuid(index)
        path = f"{uid}/resumes/{rid}/cv-mock.pdf"
        pdf = mock_cv_pdf(cv)
        client.table("profiles").update({"full_name": cv["full_name"]}).eq("id", uid).execute()
        client.table("resumes").upsert(
            {
                "id": rid,
                "user_id": uid,
                "bucket_id": "resumes",
                "storage_path": path,
                "original_filename": f"cv-mock-{index}.pdf",
                "title": cv["title"],
                "mime_type": "application/pdf",
                "size_bytes": len(pdf),
                "is_default": True,
            }
        ).execute()
        client.table("job_submits").upsert(
            {
                "id": submit_uuid(index),
                "job_post_id": JOB_ID,
                "applicant_user_id": uid,
                "resume_id": rid,
                "cover_letter": f"Cover letter — {cv['title']}",
            },
            on_conflict="job_post_id,applicant_user_id",
        ).execute()
        client.storage.from_("resumes").upload(
            path,
            pdf,
            {"content-type": "application/pdf", "upsert": "true"},
        )
        uploaded += 1
        print(path)
        stage = _stage_for(index)
        status = (
            client.table("job_submits")
            .select("current_status")
            .eq("id", submit_uuid(index))
            .maybe_single()
            .execute()
            .data
            or {}
        )
        if stage and status.get("current_status") == "pending":
            client.table("application_stages").insert(
                {
                    "application_id": submit_uuid(index),
                    "changed_by_user_id": "22222222-2222-2222-2222-222222222222",
                    "stage": stage,
                    "note": f"Seed pipeline {stage}",
                    "is_system_generated": False,
                }
            ).execute()
        if settings.qwen_api_key:
            _ingest(client, rid, pdf)
            print(f"  ingested {cv['title']}")
        else:
            print("  skip ingest (QWEN_API_KEY empty)")
    print(f"uploaded {uploaded}")


if __name__ == "__main__":
    main()
