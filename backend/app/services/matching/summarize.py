"""LLM resume rewrite. Skills for scoring are merged outside this parser."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

from backend.app.clients.llm import chat_complete
from backend.app.services.matching.skills import allowlist_token, load_major_group, load_skills_catalog

CompleteFn = Callable[..., str]

_PROMPT_PATH = Path(__file__).resolve().parents[2] / "prompts" / "system" / "summarize.txt"
SUMMARIZE_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")
SUMMARIZE_PROMPT_VERSION = "2026-08-19.v3"
LLM_INPUT_MAX_CHARS = 24_000


def summarize_resume(markdown: str, *, complete: CompleteFn | None = None) -> dict[str, Any]:
    empty = {
        "summary": "",
        "titles": [],
        "body": "",
        "skills": [],
        "major_field": "",
        "sub_field": [],
    }
    if not markdown.strip():
        return empty
    fn = complete or chat_complete
    clipped = markdown[:LLM_INPUT_MAX_CHARS]
    prompt = SUMMARIZE_PROMPT_TEMPLATE.replace("{cv_content}", clipped)
    try:
        raw = fn(prompt, json_object=True)
    except Exception:
        return empty
    return _parse_llm_output(raw)


def _parse_llm_output(raw: str) -> dict[str, Any]:
    text = _strip_fence(raw)
    empty = {"summary": "", "titles": [], "body": "", "skills": [], "major_field": "", "sub_field": []}
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        if _looks_like_markdown(text):
            return _from_markdown(text)
        return empty
    if not isinstance(data, dict):
        return empty
    body = str(data.get("body") or data.get("markdown") or "").strip()
    if not body and _looks_like_markdown(text):
        return _from_markdown(text)
    majors = set(load_major_group())
    sub_keys = set(load_skills_catalog())
    major = str(data.get("major_field") or "").strip()
    if major not in majors:
        major = ""
    sub_field: list[str] = []
    seen: set[str] = set()
    for raw_sub in data.get("sub_field") or []:
        key = str(raw_sub).strip()
        if key in sub_keys and key not in seen:
            seen.add(key)
            sub_field.append(key)
    skills: list[str] = []
    for raw_skill in data.get("skills") or []:
        canonical = allowlist_token(str(raw_skill))
        if canonical and canonical not in skills:
            skills.append(canonical)
    return {
        "summary": _clean_summary(data.get("summary")),
        "titles": [],
        "body": body,
        "skills": skills,
        "major_field": major,
        "sub_field": sub_field,
    }


def _from_markdown(text: str) -> dict[str, Any]:
    body = text.strip()
    return {
        "summary": _summary_from_markdown(body),
        "titles": [],
        "body": body,
        "skills": [],
        "major_field": "",
        "sub_field": [],
    }


def _clean_summary(summary: Any) -> str:
    text = str(summary).strip().replace("\n", " ") if summary else ""
    if text.casefold() in {"1-3 sentences", "1-3 sentence", "summary"}:
        return ""
    return text


def _summary_from_markdown(body: str) -> str:
    lines = [line.strip() for line in body.splitlines() if line.strip() and not line.strip().startswith("#")]
    return lines[0] if lines else ""


def _looks_like_markdown(text: str) -> bool:
    stripped = text.strip()
    return stripped.startswith("#") or "\n## " in stripped


def _strip_fence(raw: str) -> str:
    text = raw.strip()
    match = re.match(r"^```(?:json|markdown|md)?\s*(.*?)\s*```$", text, flags=re.DOTALL | re.IGNORECASE)
    return match.group(1) if match else text
