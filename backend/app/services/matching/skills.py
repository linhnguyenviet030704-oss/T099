"""Deterministic skill normalize + Jaccard/coverage from skill_graph.json."""

from __future__ import annotations

import functools
import hashlib
import re
import unicodedata
from collections.abc import Iterable
from functools import lru_cache
from pathlib import Path

from rapidfuzz import fuzz, process

_GRAPH_PATH = Path(__file__).resolve().parent / "resources" / "skill_graph.json"

# Fuzzy fallback only kicks in for aliases/candidates long enough that a
# high similarity ratio is meaningful (short strings like "R" or "Go"
# would otherwise fuzzy-match all kinds of unrelated words).
_FUZZY_MIN_LEN = 4
_FUZZY_SCORE_CUTOFF = 88

# Sentence-ending punctuation glued to the previous word ("...and Flink.")
# must not block a substring match; strip it when it precedes whitespace
# or end-of-string. Deliberately narrow so it never touches punctuation
# that's part of a skill name itself (C++, C#, Node.js, .NET).
_TRAILING_PUNCT_RE = re.compile(r"[.,;:!?)\]]+(?=\s|$)")


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text)
    without_marks = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    without_marks = without_marks.replace("Đ", "D").replace("đ", "d")
    folded = _TRAILING_PUNCT_RE.sub(" ", without_marks.lower())
    return " ".join(folded.split())


@lru_cache(maxsize=1)
def load_skill_graph() -> dict:
    return __import__("json").loads(_GRAPH_PATH.read_text(encoding="utf-8"))


def _alias_list(skill_id: str) -> tuple[str, ...]:
    entry = _resolve_entry(skill_id)
    aliases = entry.get("aliases") or []
    return tuple(aliases)


def _resolve_entry(skill_id: str) -> dict:
    """Look up a skill entry by slug OR display name. Lets the rest of the
    module treat skill_id as opaque while the graph stores display keys."""
    skills = load_skill_graph().get("skills", {})
    if skill_id in skills:
        return skills[skill_id]
    for entry in skills.values():
        if entry.get("slug") == skill_id:
            return entry
    return {}


def _skill_variants(skill_id: str) -> tuple[str, ...]:
    """All textual variants of a canonical skill: display name, slug,
    space-form, and every alias. `skill_id` may be either the display
    name or the slug — both lookups hit the same entry."""
    entry = _resolve_entry(skill_id)
    if not entry:
        return (skill_id,)
    slug = entry.get("slug") or skill_id
    display_options = [d for d, e in load_skill_graph().get("skills", {}).items() if e.get("slug") == slug]
    display = display_options[0] if display_options else skill_id
    variants: tuple[str, ...] = (display, slug, slug.replace("_", " "))
    variants = variants + tuple(entry.get("aliases") or ())
    seen: list[str] = []
    out: list[str] = []
    for v in variants:
        token = v.strip()
        if token and token not in seen:
            seen.append(token)
            out.append(token)
    return tuple(out)


@lru_cache(maxsize=1)
def load_taxonomy_index() -> dict[str, str]:
    """Map normalized variant -> slug. Returns a slug (not display name)
    so callers and major_groups can compare against the same vocabulary."""
    index: dict[str, str] = {}
    for skill_id in load_skill_graph().get("skills", {}):
        entry = load_skill_graph()["skills"][skill_id]
        slug = entry.get("slug") or skill_id
        for variant in _skill_variants(skill_id):
            key = _normalize_text(variant)
            if key:
                index[key] = slug
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


def related_skills(canonical: str, *, depth: int = 2) -> list[str]:
    """Same-category siblings (programming language, web framework, etc.),
    surfaced from skill_graph.json's per-skill `category` field. depth=0
    returns no expansion; callers without an explicit budget get depth=2."""
    if depth <= 0:
        return []
    entry = _resolve_entry(canonical)
    if not entry:
        return []
    target = (entry.get("category") or "").strip()
    if not target:
        return []
    siblings: set[str] = set()
    for other_id, other_entry in load_skill_graph().get("skills", {}).items():
        if other_entry.get("slug") == entry.get("slug"):
            continue
        if (other_entry.get("category") or "").strip() == target:
            siblings.add(other_entry.get("slug") or other_id)
    return sorted(siblings)[:8]


def extract_skills(text: str, taxonomy_index: dict[str, str] | None = None) -> list[str]:
    """Scan text for known taxonomy terms (longest synonym first), then a
    bounded fuzzy pass for near-miss spellings not covered by any alias
    (e.g. "Kuberentes" typo, "Postgre SQL" spacing)."""
    index = taxonomy_index or load_taxonomy_index()
    normalized = _normalize_text(text)
    haystack = f" {normalized} "

    found: list[str] = []
    seen: set[str] = set()
    terms = sorted(index.items(), key=lambda item: len(item[0]), reverse=True)
    for variant, canonical in terms:
        needle = f" {variant} "
        if needle in haystack and canonical not in seen:
            found.append(canonical)
            seen.add(canonical)

    remaining = [(variant, canonical) for variant, canonical in terms if canonical not in seen and len(variant) >= _FUZZY_MIN_LEN]
    if remaining:
        variant_strings = [variant for variant, _ in remaining]
        words = normalized.split()
        candidates = {w for w in words if len(w) >= _FUZZY_MIN_LEN}
        candidates.update(f"{words[i]} {words[i + 1]}" for i in range(len(words) - 1))
        for candidate in candidates:
            match = process.extractOne(candidate, variant_strings, scorer=fuzz.ratio, score_cutoff=_FUZZY_SCORE_CUTOFF)
            if match is None:
                continue
            _matched_variant, _score, idx = match
            canonical = remaining[idx][1]
            if canonical not in seen:
                found.append(canonical)
                seen.add(canonical)

    return found


def expand_query(text: str, *, depth: int = 2) -> str:
    """Expand a query with found skills and their natural-language labels for
    better recall in semantic search. Slugs (snake_case) are intentionally
    absent — embedding spaces care about meaning, not identifiers."""
    del depth
    found = extract_skills(text)
    if not found:
        return text
    extras: list[str] = []
    seen: set[str] = set()
    for slug in found:
        # natural-language form of the slug itself: c_plus_plus -> c plus plus
        slug_words = slug.replace("_", " ")
        if slug_words and slug_words not in seen:
            extras.append(slug_words)
            seen.add(slug_words)
        for token in categories_for(slug):
            if token == slug:
                continue
            natural = token.replace("_", " ")
            if natural and natural not in seen:
                extras.append(natural)
                seen.add(natural)
    if not extras:
        return text
    return f"{text}\n{' '.join(extras)}"


@functools.lru_cache(maxsize=1)
def load_major_groups() -> dict[str, tuple[str, ...]]:
    """Major-field mapping declared in skill_graph.json. Demo2 keeps it in
    the taxonomy asset so the source of truth stays next to skills/relations."""
    graph = load_skill_graph()
    return {major: tuple(skills) for major, skills in (graph.get("major_groups") or {}).items()}


def major_for_skills(skills: Iterable[str]) -> str:
    """Pick the major whose markers overlap the candidate skills most. Ties
    resolve to first-encountered major in skill_graph.json. Empty input
    yields empty string so callers can store it without special-casing."""
    skill_set = {s for s in skills if s}
    if not skill_set:
        return ""
    best_major = ""
    best_overlap = 0
    for major, markers in load_major_groups().items():
        overlap = len(skill_set.intersection(markers))
        if overlap > best_overlap:
            best_overlap = overlap
            best_major = major
    return best_major


def taxonomy_version() -> str:
    """Stable short hash of the taxonomy asset. Recomputed when skills,
    relations, or major_groups change so downstream caches invalidate."""
    return hashlib.sha256(_GRAPH_PATH.read_bytes()).hexdigest()[:12]


def categories_for(skill_id: str) -> list[str]:
    """Group memberships for a canonical skill. Returns the canonical slug,
    the explicit `category` field (coarse grouping for `related_skills`),
    and the explicit `role` field (function/STRONG_SUB label used for
    sub_field classification). Matching consumers iterate this list; the
    schema is intentionally permissive rather than raising on missing data.
    """
    entry = _resolve_entry(skill_id)
    if not entry:
        return []
    slug = entry.get("slug") or skill_id
    out: list[str] = [slug]
    for key in ("category", "role"):
        val = (entry.get(key) or "").strip()
        if val and val not in out:
            out.append(val)
    return out


def allowlist_token(raw: str) -> str | None:
    return normalize_skill(raw, load_taxonomy_index())


def load_skills_catalog() -> dict[str, list[str]]:
    """Adapter over skill_graph.json for callers that want a category-style
    index. Each canonical skill is its own pseudo-category so callers that
    iterate categories still see every skill."""
    return {skill_id: [skill_id] for skill_id in load_skill_graph().get("skills", {})}


def skill_variants(skill_id: str) -> list[str]:
    """All textual variants of a canonical skill (the id, its space form,
    and every alias declared in skill_graph.json)."""
    return list(_skill_variants(skill_id))


def _skill_in_text(skill_id: str, text: str) -> bool:
    """Loose presence check used to verify whether an extract-found skill
    survived LLM rewriting into the final body. Uses the same normalized
    scan as extract_skills so aliases count."""
    if not text:
        return False
    haystack = f" {_normalize_text(text)} "
    index = load_taxonomy_index()
    canonical = index.get(_normalize_text(skill_id))
    if canonical and f" {_normalize_text(canonical)} " in haystack:
        return True
    for alias in _alias_list(skill_id):
        if f" {_normalize_text(alias)} " in haystack:
            return True
    return False


def merge_skill_records(
    extract_skills_: list[str],
    body: str,
    *,
    taxonomy_index: dict[str, str] | None = None,
) -> tuple[list[dict], list[str], list[str]]:
    """Split extract-first skills into "verified" (still present in the LLM
    body) and "inferred" (dropped by summarization but known to taxonomy).
    Returns (records, verified, inferred). Caller owns the final skill list
    ordering; this function never throws."""
    records: list[dict] = []
    verified: list[str] = []
    inferred: list[str] = []
    seen: set[str] = set()
    for raw in extract_skills_:
        canonical = normalize_skill(raw, taxonomy_index or load_taxonomy_index())
        if not canonical or canonical in seen:
            continue
        seen.add(canonical)
        present = _skill_in_text(canonical, body)
        record = {"skill": canonical, "source": "verified" if present else "inferred"}
        records.append(record)
        (verified if present else inferred).append(canonical)
    return records, verified, inferred
