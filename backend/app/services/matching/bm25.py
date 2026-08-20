"""Okapi BM25 over matching tokens. No extra deps."""

from __future__ import annotations

import math
import re

from backend.app.services.matching.skills import _normalize_text, extract_skills, load_skills_catalog, skill_variants

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


def _protect_aliases(text: str) -> str:
    pairs: list[tuple[str, str]] = []
    for ids in load_skills_catalog().values():
        for skill_id in ids:
            for variant in skill_variants(skill_id):
                if len(variant) < 2:
                    continue
                pairs.append((variant, skill_id))
    pairs.sort(key=lambda item: len(item[0]), reverse=True)
    out = text
    for variant, skill_id in pairs:
        if re.fullmatch(r"[a-z0-9]+", variant, flags=re.IGNORECASE):
            pattern = rf"(?<![a-z0-9_]){re.escape(variant)}(?![a-z0-9_])"
        else:
            pattern = re.escape(variant)
        out = re.sub(pattern, f" {skill_id} ", out, flags=re.IGNORECASE)
    return out


def matching_tokens(text: str, *, drop_stopwords: bool = False) -> list[str]:
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
