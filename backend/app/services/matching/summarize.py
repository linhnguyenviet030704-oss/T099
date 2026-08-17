"""LLM resume rewrite. Skills for scoring are NOT taken from the model."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

from backend.app.clients.llm import chat_complete

CompleteFn = Callable[..., str]

_PROMPT_PATH = Path(__file__).resolve().parents[2] / "prompts" / "system" / "summarize.txt"
SUMMARIZE_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")

_TITLE_NOISE = {
    "role",
    "skills",
    "skill",
    "education",
    "experience",
    "contact",
    "projects",
    "project",
    "objective",
    "summary",
    "profile",
    "languages",
    "language",
    "techniques",
    "responsibilities",
    "soft skills",
    "technical skills",
    "professional experience",
    "project experience",
    "frameworks & libraries",
    "architecture & system design",
    "databases",
    "tools & devops",
    "required skills & qualifications",
    "language & certification",
}


def summarize_resume(markdown: str, *, complete: CompleteFn | None = None) -> dict[str, Any]:
    empty = {"summary": "", "titles": [], "body": ""}
    if not markdown.strip():
        return empty
    fn = complete or chat_complete
    prompt = SUMMARIZE_PROMPT_TEMPLATE.replace("{cv_content}", markdown)
    try:
        raw = fn(prompt, json_object=True)
    except Exception:
        return empty
    return _parse_llm_output(raw)


def _parse_llm_output(raw: str) -> dict[str, Any]:
    text = _strip_fence(raw)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        if _looks_like_markdown(text):
            return _from_markdown(text)
        return {"summary": "", "titles": [], "body": ""}
    if not isinstance(data, dict):
        return {"summary": "", "titles": [], "body": ""}
    body = str(data.get("body") or data.get("markdown") or "").strip()
    if not body and _looks_like_markdown(text):
        return _from_markdown(text)
    summary = _clean_summary(data.get("summary"))
    titles = _clean_titles(data.get("titles") or [])
    return {"summary": summary, "titles": titles, "body": body}


def _from_markdown(text: str) -> dict[str, Any]:
    body = text.strip()
    return {"summary": _summary_from_markdown(body), "titles": [], "body": body}


def _clean_summary(summary: Any) -> str:
    text = str(summary).strip().replace("\n", " ") if summary else ""
    if text.casefold() in {"1-3 sentences", "1-3 sentence", "summary"}:
        return ""
    return text


def _summary_from_markdown(body: str) -> str:
    lines = [line.strip() for line in body.splitlines() if line.strip() and not line.strip().startswith("#")]
    return lines[0] if lines else ""


def _clean_titles(titles: list) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in titles:
        name = str(raw).strip()
        key = name.casefold()
        if not name or key in _TITLE_NOISE or key in seen:
            continue
        seen.add(key)
        cleaned.append(name)
    return cleaned


def _looks_like_markdown(text: str) -> bool:
    stripped = text.strip()
    return stripped.startswith("#") or "\n## " in stripped


def _strip_fence(raw: str) -> str:
    text = raw.strip()
    match = re.match(r"^```(?:json|markdown|md)?\s*(.*?)\s*```$", text, flags=re.DOTALL | re.IGNORECASE)
    return match.group(1) if match else text
