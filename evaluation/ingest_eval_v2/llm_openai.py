"""OpenAI-compatible complete()/encode() functions injected into build_ingest_graph().

Kept eval-local (not touching backend/app/clients/llm.py, which is Qwen/DashScope-specific
and sends fields like "enable_thinking" that OpenAI's API rejects with 400
"Unrecognized request argument"). build_ingest_graph() already accepts `complete`/`encode`
callables for dependency injection (see backend/app/agents/ingest/nodes/{summarize,embed}.py),
so this reuses the real graph/nodes/prompt unmodified.
"""

from __future__ import annotations

import os

import httpx

OPENAI_BASE_URL = "https://api.openai.com/v1"
CHAT_MODEL = os.environ.get("EVAL_OPENAI_CHAT_MODEL", "gpt-4o-mini")
EMBED_MODEL = os.environ.get("EVAL_OPENAI_EMBED_MODEL", "text-embedding-3-small")
EMBED_DIM = 1536
REQUEST_TIMEOUT = 120.0


def _load_api_key() -> str:
    key = os.environ.get("OPENAI_API_KEY", "")
    if key:
        return key
    for env_path in (".env", "backend/.env"):
        if not os.path.exists(env_path):
            continue
        for line in open(env_path, encoding="utf-8"):
            line = line.strip()
            if line.startswith("OPENAI_API_KEY="):
                return line.split("=", 1)[1].strip()
    return ""


_API_KEY = _load_api_key()

if not _API_KEY:
    raise RuntimeError("OPENAI_API_KEY not set in environment or .env / backend/.env")


def openai_complete(prompt: str, *, json_object: bool = False, **_kwargs) -> str:
    payload = {
        "model": CHAT_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
    }
    if json_object:
        payload["response_format"] = {"type": "json_object"}
    response = httpx.post(
        f"{OPENAI_BASE_URL}/chat/completions",
        json=payload,
        headers={"Authorization": f"Bearer {_API_KEY}", "Content-Type": "application/json"},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return str(response.json()["choices"][0]["message"]["content"]).strip()


def openai_encode(text: str) -> list[float]:
    payload = {
        "model": EMBED_MODEL,
        "input": text or " ",
        "dimensions": EMBED_DIM,
        "encoding_format": "float",
    }
    response = httpx.post(
        f"{OPENAI_BASE_URL}/embeddings",
        json=payload,
        headers={"Authorization": f"Bearer {_API_KEY}", "Content-Type": "application/json"},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return [float(x) for x in response.json()["data"][0]["embedding"]]
