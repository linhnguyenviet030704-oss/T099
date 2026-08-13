"""Deterministic skill normalize + Jaccard/coverage. No LLM."""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable

# ponytail: in-process taxonomy; ceiling = stale vs DB table; upgrade: skill_taxonomy rows.
_TAXONOMY: dict[str, tuple[str, ...]] = {
    "Python": ("python", "py"),
    "FastAPI": ("fastapi", "fast api"),
    "PostgreSQL": ("postgresql", "postgres", "psql"),
    "Docker": ("docker",),
    "JavaScript": ("javascript", "js"),
    "TypeScript": ("typescript", "ts"),
    "React": ("react", "reactjs"),
    "SQL": ("sql",),
    "Git": ("git",),
    "Linux": ("linux",),
}


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text)
    without_marks = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    without_marks = without_marks.replace("Đ", "D").replace("đ", "d")
    return " ".join(without_marks.lower().split())


def load_taxonomy_index() -> dict[str, str]:
    index: dict[str, str] = {}
    for canonical, synonyms in _TAXONOMY.items():
        index[_normalize_text(canonical)] = canonical
        for synonym in synonyms:
            index[_normalize_text(synonym)] = canonical
    return index


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
    """Scan text for known taxonomy terms (longest synonym first)."""
    index = taxonomy_index or load_taxonomy_index()
    haystack = f" {_normalize_text(text)} "
    found: list[str] = []
    seen: set[str] = set()
    terms = sorted(index.items(), key=lambda item: len(item[0]), reverse=True)
    for variant, canonical in terms:
        needle = f" {variant} "
        if needle in haystack and canonical not in seen:
            found.append(canonical)
            seen.add(canonical)
    return found
