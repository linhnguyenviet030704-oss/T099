"""Deterministic (non-LLM) metrics over one ingest pipeline run.

Reuses the real regexes/functions the pipeline itself uses (backend.app.services.matching.parse
and .skills) rather than re-implementing PII/skill detection, so a metric failure here reflects
the same logic the running system uses -- not a second, possibly-divergent implementation.
"""

from __future__ import annotations

import math
import re
import unicodedata
from typing import Any

from backend.app.services.matching.parse import (
    DOB_RE,
    EMAIL_RE,
    LABELED_PII_RE,
    PHONE_RE,
    URL_RE,
)
from backend.app.services.matching.skills import extract_skills, load_skill_graph, load_taxonomy_index

EMBED_DIM = 1536


def _pii_regex_hits(text: str) -> dict[str, int]:
    labeled = sum(1 for line in text.splitlines() if LABELED_PII_RE.match(line))
    return {
        "email": len(EMAIL_RE.findall(text)),
        "phone": len(PHONE_RE.findall(text)),
        "url": len(URL_RE.findall(text)),
        "dob": len(DOB_RE.findall(text)),
        "labeled_line": labeled,
    }


def _name_tokens(name: str) -> list[str]:
    normalized = unicodedata.normalize("NFD", name or "")
    ascii_name = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return [t for t in re.findall(r"[A-Za-z]+", ascii_name) if len(t) > 2]


def _name_leak(text: str, candidate_name: str) -> list[str]:
    tokens = _name_tokens(candidate_name)
    if not tokens:
        return []
    haystack = text.casefold()
    return [t for t in tokens if re.search(rf"\b{re.escape(t.casefold())}\b", haystack)]


def _embedding_stats(embedding: list[float]) -> dict[str, Any]:
    dim_ok = len(embedding) == EMBED_DIM
    norm = math.sqrt(sum(x * x for x in embedding)) if embedding else 0.0
    return {"dim": len(embedding), "dim_ok": dim_ok, "norm": round(norm, 4), "nonzero": norm > 1e-6}


def taxonomy_canonical_skills() -> list[str]:
    return sorted(load_skill_graph()["skills"].keys())


def compute_metrics(cv_entry: dict, run: dict) -> dict[str, Any]:
    pre_md = run["pre_summarize_markdown"]
    post_body = run["post_summarize_body"]
    metadata = run["metadata"]
    prod_skills = run["skills"]

    taxonomy_index = load_taxonomy_index()
    full_text_skills = extract_skills(pre_md, taxonomy_index)
    lost_to_summarization = sorted(set(full_text_skills) - set(prod_skills))
    gained_after_summarization = sorted(set(prod_skills) - set(full_text_skills))

    pii_hits = _pii_regex_hits(post_body)
    leaked_name_tokens = _name_leak(post_body, cv_entry.get("candidate_name", ""))

    summary = metadata.get("summary") or ""
    titles = metadata.get("titles") or []

    return {
        "cv_id": cv_entry["cv_id"],
        "parse": {
            "success": bool(run["raw_parsed_markdown"].strip()),
            "chars": len(run["raw_parsed_markdown"]),
            "words": len(run["raw_parsed_markdown"].split()),
        },
        "pii": {
            "regex_hits": pii_hits,
            "regex_hits_total": sum(pii_hits.values()),
            "leaked_name_tokens": leaked_name_tokens,
        },
        "skills": {
            "production_count": len(prod_skills),
            "production": prod_skills,
            "full_text_count": len(full_text_skills),
            "lost_to_summarization": lost_to_summarization,
            "gained_after_summarization": gained_after_summarization,
            "recall_vs_full_text": (
                round(len(prod_skills) / len(full_text_skills), 3) if full_text_skills else None
            ),
        },
        "summary": {
            "chars": len(summary),
            "words": len(summary.split()),
            "empty": not summary.strip(),
            "titles_count": len(titles),
        },
        "embedding": _embedding_stats(run["embedding"]),
        "timings_ms": run["timings_ms"],
        "total_ms": run["total_ms"],
    }
