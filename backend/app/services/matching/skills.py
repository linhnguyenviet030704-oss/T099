"""Deterministic skill normalize + Jaccard/coverage. Graph is a local JSON resource."""

from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict, deque
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
    return json.loads(_GRAPH_PATH.read_text(encoding="utf-8"))


def load_taxonomy_index() -> dict[str, str]:
    index: dict[str, str] = {}
    for canonical, payload in load_skill_graph()["skills"].items():
        index[_normalize_text(canonical)] = canonical
        for synonym in payload.get("aliases") or []:
            index[_normalize_text(synonym)] = canonical
    return index


def _adjacency() -> dict[str, set[str]]:
    edges: dict[str, set[str]] = defaultdict(set)
    for rel in load_skill_graph().get("relations") or []:
        src, dst = rel.get("from"), rel.get("to")
        if src and dst:
            edges[src].add(dst)
            edges[dst].add(src)
    return edges


def related_skills(canonical: str, *, depth: int = 2) -> list[str]:
    """BFS over the in-process skill graph. Ceiling = depth 2 (spec)."""
    if depth < 1:
        return []
    graph = _adjacency()
    seen = {canonical}
    queue: deque[tuple[str, int]] = deque([(canonical, 0)])
    related: list[str] = []
    while queue:
        node, level = queue.popleft()
        if level >= depth:
            continue
        for neighbor in sorted(graph.get(node, ())):
            if neighbor in seen:
                continue
            seen.add(neighbor)
            related.append(neighbor)
            queue.append((neighbor, level + 1))
    return related


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
    """Append related taxonomy terms (BFS) so the embedding query is broader."""
    found = extract_skills(text)
    extra: list[str] = []
    seen = set(found)
    for skill in found:
        for neighbor in related_skills(skill, depth=depth):
            if neighbor not in seen:
                seen.add(neighbor)
                extra.append(neighbor)
    if not extra:
        return text
    return f"{text}\n{' '.join(extra)}"
