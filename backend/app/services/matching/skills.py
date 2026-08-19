"""Deterministic skill normalize + Jaccard/coverage from skills.json."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from collections.abc import Iterable
from functools import lru_cache
from pathlib import Path

_SKILLS_PATH = Path(__file__).resolve().parent / "resources" / "skills.json"
_MAJOR_PATH = Path(__file__).resolve().parent / "resources" / "major_group.json"
_GRAPH_PATH = Path(__file__).resolve().parent / "resources" / "skill_graph.json"

SPECIAL_ALIASES: dict[str, tuple[str, ...]] = {
    "c_plus_plus": ("c++", "cpp", "c plus plus"),
    "c_sharp": ("c#", "csharp", "c sharp"),
    "dotnet": (".net", "dotnet", "dot net"),
    "nodejs": ("node.js", "node js", "nodejs"),
    "spring_boot": ("spring-boot", "spring boot", "springboot"),
    "postgresql": ("postgres", "postgresql", "psql"),
    "golang": ("go", "golang", "golang"),
}


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text)
    without_marks = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    without_marks = without_marks.replace("Đ", "D").replace("đ", "d")
    return " ".join(without_marks.lower().split())


@lru_cache(maxsize=1)
def load_skills_catalog() -> dict[str, list[str]]:
    return json.loads(_SKILLS_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_major_group() -> list[str]:
    return list(json.loads(_MAJOR_PATH.read_text(encoding="utf-8"))["major_group"])


@lru_cache(maxsize=1)
def load_skill_graph() -> dict:
    return json.loads(_GRAPH_PATH.read_text(encoding="utf-8"))


def taxonomy_version() -> str:
    payload = _SKILLS_PATH.read_bytes() + b"\0" + _MAJOR_PATH.read_bytes() + b"\0" + repr(SPECIAL_ALIASES).encode()
    return hashlib.sha256(payload).hexdigest()[:12]


def categories_for(skill_id: str) -> list[str]:
    return list(_categories_by_skill().get(skill_id, ()))


@lru_cache(maxsize=1)
def _categories_by_skill() -> dict[str, tuple[str, ...]]:
    mapping: dict[str, list[str]] = defaultdict(list)
    for category, ids in load_skills_catalog().items():
        for skill_id in ids:
            if category not in mapping[skill_id]:
                mapping[skill_id].append(category)
    return {key: tuple(vals) for key, vals in mapping.items()}


def skill_variants(skill_id: str) -> list[str]:
    variants = {skill_id, skill_id.replace("_", " "), *SPECIAL_ALIASES.get(skill_id, ())}
    return sorted(variants, key=len, reverse=True)


@lru_cache(maxsize=1)
def load_taxonomy_index() -> dict[str, str]:
    index: dict[str, str] = {}
    for ids in load_skills_catalog().values():
        for skill_id in ids:
            for variant in skill_variants(skill_id):
                key = _normalize_text(variant)
                if key:
                    index[key] = skill_id
    return index


def allowlist_token(raw: str) -> str | None:
    slug = _normalize_text(raw).replace(" ", "_").replace("-", "_")
    ids = _categories_by_skill()
    if slug in ids:
        return slug
    return normalize_skill(raw, load_taxonomy_index())


def related_skills(canonical: str, *, depth: int = 2) -> list[str]:
    if depth < 1:
        return []
    cats = _categories_by_skill().get(canonical, ())
    siblings: set[str] = set()
    catalog = load_skills_catalog()
    for cat in cats:
        siblings.update(catalog.get(cat, ()))
    siblings.discard(canonical)
    return sorted(siblings)[:8]


def normalize_skill(raw: str, taxonomy_index: dict[str, str]) -> str | None:
    return taxonomy_index.get(_normalize_text(raw))


def _normalized_skill_set(skills: Iterable[str], taxonomy_index: dict[str, str]) -> set[str]:
    return {canonical for raw in skills if (canonical := normalize_skill(raw, taxonomy_index)) is not None}


def jaccard_score(cv_skills: Iterable[str], jd_must_have: Iterable[str], taxonomy_index: dict[str, str]) -> float:
    cv_set = _normalized_skill_set(cv_skills, taxonomy_index)
    jd_set = _normalized_skill_set(jd_must_have, taxonomy_index)
    union = cv_set | jd_set
    if not union:
        return 0.0
    return len(cv_set & jd_set) / len(union)


def coverage_score(cv_skills: Iterable[str], jd_must_have: Iterable[str], taxonomy_index: dict[str, str]) -> float:
    cv_set = _normalized_skill_set(cv_skills, taxonomy_index)
    jd_set = _normalized_skill_set(jd_must_have, taxonomy_index)
    if not jd_set:
        return 0.0
    return len(cv_set & jd_set) / len(jd_set)


def extract_skills(text: str, taxonomy_index: dict[str, str] | None = None) -> list[str]:
    index = taxonomy_index or load_taxonomy_index()
    stripped = re.sub(r"[,;:!?]+", " ", text)
    stripped = re.sub(r"\.(?:\s|$)", " ", stripped)
    haystack = f" {_normalize_text(stripped)} "
    found: list[str] = []
    seen: set[str] = set()
    terms = sorted(index.items(), key=lambda item: len(item[0]), reverse=True)
    for variant, canonical in terms:
        needle = f" {variant} "
        if needle in haystack and canonical not in seen:
            found.append(canonical)
            seen.add(canonical)
    return found


def skill_quote(clean: str, skill_id: str, *, max_len: int = 160) -> str:
    if not clean.strip() or not skill_id:
        return ""
    lowered = clean.casefold()
    for variant in skill_variants(skill_id):
        idx = lowered.find(variant.casefold())
        if idx < 0:
            continue
        end = idx + len(variant)
        extra = max(0, max_len - (end - idx))
        left = extra // 2
        start = max(0, idx - left)
        stop = min(len(clean), end + (extra - left))
        snippet = clean[start:stop].strip()
        if start > 0:
            snippet = snippet.lstrip()
        return snippet[:max_len]
    return ""


def expand_query(text: str, *, depth: int = 2) -> str:
    del depth
    found = extract_skills(text)
    if not found:
        return text
    labels = [skill_id.replace("_", " ") for skill_id in found]
    cats: list[str] = []
    by_skill = _categories_by_skill()
    for skill_id in found:
        for cat in by_skill.get(skill_id, ()):
            display = cat.replace("_", " ")
            if display not in cats:
                cats.append(display)
            if len(cats) >= 3:
                break
        if len(cats) >= 3:
            break
    extra = " ".join([*labels, *cats])
    return f"{text}\n{extra}"


def merge_skill_records(
    clean: str,
    llm_skills: list[str],
    summary_body: str,
) -> tuple[list[dict], list[str], list[str]]:
    records: list[dict] = []
    verified: list[str] = []
    inferred: list[str] = []
    seen: set[str] = set()
    for skill_id in extract_skills(clean):
        quote = skill_quote(clean, skill_id)
        if not quote:
            continue
        seen.add(skill_id)
        verified.append(skill_id)
        records.append({"id": skill_id, "status": "verified", "origin": "clean", "quote": quote[:160]})
    llm_canonical: list[str] = []
    for raw in llm_skills:
        canonical = allowlist_token(str(raw))
        if canonical and canonical not in llm_canonical:
            llm_canonical.append(canonical)
    for skill_id in llm_canonical:
        if skill_id in seen:
            continue
        seen.add(skill_id)
        inferred.append(skill_id)
        records.append({"id": skill_id, "status": "inferred", "origin": "llm", "quote": ""})
    for skill_id in extract_skills(summary_body):
        if skill_id in seen:
            continue
        seen.add(skill_id)
        inferred.append(skill_id)
        records.append({"id": skill_id, "status": "inferred", "origin": "summary", "quote": ""})
    return records, verified, inferred
