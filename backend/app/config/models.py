"""Model configuration - per-agent model selection.

ponytail: Keep it simple. One file, explicit model names, no abstraction layers.
If a new agent is added, add it here explicitly.
"""

DEFAULT_BRAIN_PROVIDER = "qwen"

# === Qwen Model Tiers ===

# LIGHT: Fast, cheap, good for simple extraction/routing
QwenModelLight = "qwen3.7-flash"

# PRO: Balanced for structured extraction, explanation, moderate complexity
QwenModelPro = "qwen3.7-flash"  # ponytail: same model, override via env per-agent

# MAX: Most capable for complex reasoning (evaluation, scoring)
QwenModelMax = "qwen3.7-flash"  # ponytail: same model for now, can upgrade to larger variant


# === Agent → Model Mapping ===

# Each agent gets a tier. You can override via env vars:
#   MODEL_<AGENT_NAME_UPPER> = "qwen-turbo"
# e.g. MODEL_ROUTING = "qwen-turbo"

AGENT_MODELS: dict[str, str] = {
    # Routing agent - LIGHT (simple keyword/regex classification)
    "routing": QwenModelLight,

    # Recommend agent - PRO (job matching, explanation)
    "recommend": QwenModelPro,

    # Matching agent - PRO (candidate screening, explanation)
    "matching": QwenModelPro,

    # Evaluation agent - MAX (complex CV/JD scoring, skill gap analysis)
    "evaluation": QwenModelMax,

    # Ingest agent - PRO (CV summarization, entity extraction)
    "ingest": QwenModelPro,

    # Skill gap / advice agent - MAX (deep analysis)
    "skill_gap": QwenModelMax,
}


def get_agent_model(agent_name: str) -> str:
    """Get the configured model for an agent.

    Supports env override: MODEL_<AGENT_NAME_UPPER>
    e.g. MODEL_ROUTING, MODEL_EVALUATION, MODEL_RECOMMEND
    """
    import os

    # Check env override first
    env_key = f"MODEL_{agent_name.upper()}"
    env_value = os.environ.get(env_key)
    if env_value:
        return env_value

    # Fall back to config
    return AGENT_MODELS.get(agent_name, QwenModelLight)


# === Default OpenAI (for non-Qwen providers) ===

DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"

# === Default Qwen Cloud (DashScope) ===

DEFAULT_LLM_MODEL = "qwen3.7-flash"
DEFAULT_EMBED_MODEL = "qwen3.7-text-embedding"
DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
DEFAULT_EMBED_DIM = 1536  # HNSW max 2000; richest qwen3.7-text-embedding size under that
DEFAULT_RERANK_MODEL = "qwen3-rerank"
DEFAULT_RERANK_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-api/v1"
DEFAULT_RERANK_INSTRUCT = (
    "Rank how well the resume facts match the job skills and experience. "
    "Do not use name, email, age, graduation year, school, or employer prestige as signals."
)

# === Default Gemini ===

DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
DEFAULT_GEMINI_MODEL = "gemini-2.0-flash"
DEFAULT_GEMINI_EMBEDDING_MODEL = "text-embedding-004"

# === Default Ollama ===

DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1"
DEFAULT_OLLAMA_MODEL = "llama3.2"
DEFAULT_OLLAMA_EMBEDDING_MODEL = "nomic-embed-text"

# === Misc ===

REQUEST_TIMEOUT = 120.0
RERANK_CONFIG_VERSION = "2026-08-17.1"
RETRIEVE_CANDIDATE_K = 50
RERANK_CANDIDATE_K = 50
FINAL_CANDIDATE_K = 10
RERANK_DOC_MAX_CHARS = 2000
