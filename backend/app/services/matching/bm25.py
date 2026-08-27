"""Okapi BM25 over matching tokens. No extra deps."""

from __future__ import annotations

import math
import re
from functools import lru_cache

from backend.app.services.matching.skills import _normalize_text, extract_skills, load_taxonomy_index

K1 = 1.5
B = 0.75

_SPLIT = re.compile(r"[^a-z0-9_+#.]+")
STOPWORDS = frozenset(
    {
        "experience",
        "experienced",
        "team",
        "development",
        "developer",
        "required",
        "requirement",
        "requirements",
        "responsible",
        "responsibility",
        "looking",
        "need",
        "needs",
        "work",
        "working",
        "role",
        "skills",
        "skill",
        "knowledge",
        "ability",
        "strong",
        "good",
        "using",
        "used",
        "use",
        "and",
        "the",
        "for",
        "with",
        "kinh",
        "nghiem",
        "yeu",
        "cau",
        "lam",
        "viec",
        "co",
        "kha",
        "nang",
        "uu",
        "tien",
        "diem",
        "cong",
        "bat",
        "buoc",
    }
)


def competition_ranks(keys: list) -> list[int]:
    order = sorted(range(len(keys)), key=lambda i: keys[i])
    ranks = [0] * len(keys)
    last = object()
    last_rank = 0
    for pos, idx in enumerate(order, start=1):
        value = keys[idx]
        if value != last:
            last_rank = pos
            last = value
        ranks[idx] = last_rank
    return ranks


@lru_cache(maxsize=1)
def _sorted_alias_pairs() -> tuple[tuple[str, str], ...]:
    """(variant, canonical_slug) for every taxonomy variant, longest first.
    Sourced from load_taxonomy_index() (variant -> slug) rather than
    rebuilding the mapping from load_skills_catalog(), whose keys are
    display names (e.g. "Node.js") — using those display names as the
    replacement token instead of the canonical slug ("nodejs") meant a
    literal "Node.js" mention got substituted right back as "Node.js"
    (a no-op with padding), leaving the dot exposed for the shorter "node"
    and "js" alias patterns to still match afterwards and fragment the
    token into spurious "node" + "javascript" hits."""
    pairs = [(variant, slug) for variant, slug in load_taxonomy_index().items() if len(variant) >= 2]
    pairs.sort(key=lambda item: len(item[0]), reverse=True)
    return tuple(pairs)


def _alias_regex(variant: str) -> str:
    if re.fullmatch(r"[a-z0-9]+", variant, flags=re.IGNORECASE):
        return rf"(?<![a-z0-9_]){re.escape(variant)}(?![a-z0-9_])"
    return re.escape(variant)


@lru_cache(maxsize=1)
def _combined_alias_matcher() -> tuple[re.Pattern, dict[str, str]]:
    """One alternation over every alias, matched in a single left-to-right
    scan instead of one sequential full-text re.sub pass per alias (~1500
    of them, each copying the entire document string). Alternatives stay
    longest-variant-first (from _sorted_alias_pairs) so overlapping aliases
    at the same position resolve the same way sequential substitution did
    — longest specific alias wins over a shorter one."""
    pairs = _sorted_alias_pairs()
    combined = re.compile("|".join(f"(?:{_alias_regex(variant)})" for variant, _ in pairs), re.IGNORECASE)
    lookup: dict[str, str] = {}
    for variant, skill_id in pairs:
        lookup.setdefault(variant.casefold(), skill_id)
    return combined, lookup


def _protect_aliases(text: str) -> str:
    if not text:
        return text
    combined, lookup = _combined_alias_matcher()

    def repl(match: re.Match) -> str:
        skill_id = lookup.get(match.group(0).casefold())
        return f" {skill_id} " if skill_id else match.group(0)

    return combined.sub(repl, text)


@lru_cache(maxsize=4096)
def matching_tokens(text: str, *, drop_stopwords: bool = False) -> list[str]:
    """Cached because bm25_scores() is routinely called with a corpus that's
    unchanged from the previous call (the same ~200 published-job pool scored
    per recommend request, the same candidate pool re-scored on every matching
    re-run) — re-running extract_skills' taxonomy scan + _protect_aliases'
    alias substitution over identical text is pure waste. Safe to cache: pure
    function of its arguments, and every caller (bm25_scores) only iterates
    the returned list, never mutates it."""
    injected = extract_skills(text)
    protected = _protect_aliases(text)

    normalized = _normalize_text(protected)
    tokens = [tok for tok in _SPLIT.split(normalized) if tok]
    tokens = [*injected, *tokens]
    if drop_stopwords:
        tokens = [tok for tok in tokens if tok not in STOPWORDS]
    return tokens


def bm25_document(clean: str, skill_ids: list[str]) -> str:
    extras = list(skill_ids)
    for skill_id in skill_ids:
        extras.append(skill_id.replace("_", " "))
    return f"{clean}\n{' '.join(extras)}".strip()


def bm25_query(title: str, skill_ids: list[str]) -> str:
    parts = [title, *skill_ids, *[skill_id.replace("_", " ") for skill_id in skill_ids]]
    return " ".join(part for part in parts if part).strip()


def bm25_scores(docs: list[str], query: str, *, k1: float = K1, b: float = B) -> list[float]:
    doc_tokens = [matching_tokens(doc) for doc in docs]
    query_tokens = matching_tokens(query, drop_stopwords=True)
    n_docs = len(docs)
    if n_docs == 0:
        return []
    lengths = [len(tokens) for tokens in doc_tokens]
    avgdl = sum(lengths) / n_docs
    df: dict[str, int] = {}
    for tokens in doc_tokens:
        for term in set(tokens):
            df[term] = df.get(term, 0) + 1
    scores: list[float] = []
    for tokens, doc_len in zip(doc_tokens, lengths, strict=True):
        if avgdl <= 0:
            scores.append(0.0)
            continue
        tf: dict[str, int] = {}
        for term in tokens:
            tf[term] = tf.get(term, 0) + 1
        score = 0.0
        for term in query_tokens:
            freq = tf.get(term)
            if not freq:
                continue
            n_df = df.get(term, 0)
            idf = math.log((n_docs - n_df + 0.5) / (n_df + 0.5) + 1)
            denom = freq + k1 * (1 - b + b * doc_len / avgdl)
            score += idf * freq * (k1 + 1) / denom
        scores.append(score)
    return scores


def bm25_ranking_ids(ids: list[str], scores: list[float]) -> list[str]:
    ranked = [
        (doc_id, score)
        for doc_id, score in zip(ids, scores, strict=True)
        if score > 0
    ]
    ranked.sort(key=lambda item: (-item[1], item[0]))
    return [doc_id for doc_id, _ in ranked]
