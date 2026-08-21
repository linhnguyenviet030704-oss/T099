"""LLM-as-judge quality checks for the Ingest Agent's LLM step (`summarize`) and the
downstream rule-based `extract` step.

Faithfulness follows RAGAS's method (decompose -> check each claim against the source),
implemented as a plain prompt per docs/superpowers/specs/2026-08-21-agent-eval-golden-dataset-design.md
section 7, rather than depending on the `ragas` package for one metric.

The faithfulness score itself is computed in Python from the returned claims list, not taken
from the model's self-report -- an LLM grading its own aggregate score is a weaker signal than
counting supported/total over claims it individually labeled.
"""

from __future__ import annotations

import json
from typing import Any

from evaluation.ingest_eval.cache import cached_call, content_hash
from evaluation.ingest_eval.llm_openai import CHAT_MODEL, openai_complete

PROMPT_VERSION = "v1"

FAITHFULNESS_PROMPT = """You are auditing an AI-generated resume summary for factual faithfulness.

SOURCE RESUME (ground truth):
---
{source}
---

GENERATED SUMMARY:
{summary}

GENERATED TITLES: {titles}

Task: break the summary and titles into short atomic claims (one fact each). For each claim,
decide if it is directly supported by the source resume above (entailed by it, not just
plausible). A claim about a title/role counts as supported if the source shows that role or
clearly equivalent responsibilities.

Return ONLY a JSON object:
{{"claims": [{{"claim": "...", "supported": true|false, "evidence": "short quote from source, or \\"none\\""}}]}}
"""

SKILL_PII_PROMPT = """You are auditing two things about an AI resume-ingest pipeline.

FULL SOURCE RESUME (before the pipeline's own PII redaction pass ran on it):
---
{source}
---

EXTRACTED SKILLS LIST (produced by a rule-based taxonomy matcher on the resume):
{skills}

FINAL STORED TEXT (after the pipeline's LLM rewrite + PII redaction -- this is what actually
gets embedded and stored):
---
{final_body}
---

Task 1 -- Skill extraction accuracy:
- false_positives: entries in EXTRACTED SKILLS LIST that are NOT actually evidenced anywhere
  in the source resume.
- false_negatives: concrete technical skills/tools/frameworks/languages clearly mentioned in
  the source resume that are MISSING from the extracted skills list. Ignore soft skills.

Task 2 -- Residual PII in FINAL STORED TEXT:
- pii_leak_found: true if FINAL STORED TEXT still contains any personally identifying
  information (full person name, email, phone number, physical address, birth date, social
  media handle/URL, national ID).
- pii_leak_examples: short quotes of the leaked content, empty list if none.

Return ONLY a JSON object:
{{"false_positives": [...], "false_negatives": [...], "pii_leak_found": true|false, "pii_leak_examples": [...]}}
"""


def _call_json(prompt: str) -> dict[str, Any]:
    raw = openai_complete(prompt, json_object=True)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"_parse_error": True, "_raw": raw}


def judge_faithfulness(cv_id: str, source: str, summary: str, titles: list[str]) -> dict[str, Any]:
    key = content_hash(PROMPT_VERSION, CHAT_MODEL, "faithfulness", source, summary, json.dumps(titles))

    def _run() -> dict[str, Any]:
        prompt = FAITHFULNESS_PROMPT.format(source=source, summary=summary or "(empty)", titles=titles)
        return _call_json(prompt)

    result = cached_call("judge_faithfulness", key, _run)
    claims = result.get("claims") or []
    total = len(claims)
    supported = sum(1 for c in claims if c.get("supported") is True)
    score = round(supported / total, 3) if total else None
    return {"cv_id": cv_id, "claims": claims, "supported": supported, "total": total, "score": score}


def judge_skills_and_pii(cv_id: str, source: str, skills: list[str], final_body: str) -> dict[str, Any]:
    key = content_hash(
        PROMPT_VERSION, CHAT_MODEL, "skills_pii", source, json.dumps(skills), final_body
    )

    def _run() -> dict[str, Any]:
        prompt = SKILL_PII_PROMPT.format(source=source, skills=skills, final_body=final_body)
        return _call_json(prompt)

    result = cached_call("judge_skills_pii", key, _run)
    fp = result.get("false_positives") or []
    fn = result.get("false_negatives") or []
    correct = max(len(skills) - len(fp), 0)
    precision = round(correct / len(skills), 3) if skills else None
    recall_denom = correct + len(fn)
    recall = round(correct / recall_denom, 3) if recall_denom else None
    return {
        "cv_id": cv_id,
        "false_positives": fp,
        "false_negatives": fn,
        "precision_est": precision,
        "recall_est": recall,
        "pii_leak_found": bool(result.get("pii_leak_found")),
        "pii_leak_examples": result.get("pii_leak_examples") or [],
    }
