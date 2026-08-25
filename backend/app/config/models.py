DEFAULT_BRAIN_PROVIDER = "qwen"

# OpenAI Defaults
DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"

# Qwen Cloud Defaults (DashScope)
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

# Gemini API Defaults (Google AI - OpenAI Compatible Endpoint)
DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
DEFAULT_GEMINI_MODEL = "gemini-2.0-flash"
DEFAULT_GEMINI_EMBEDDING_MODEL = "text-embedding-004"

# Local Ollama Defaults
DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434/v1"
DEFAULT_OLLAMA_MODEL = "llama3.2"
DEFAULT_OLLAMA_EMBEDDING_MODEL = "nomic-embed-text"

REQUEST_TIMEOUT = 120.0
RERANK_CONFIG_VERSION = "2026-08-17.1"
RETRIEVE_CANDIDATE_K = 50
RERANK_CANDIDATE_K = 50
FINAL_CANDIDATE_K = 10
RERANK_DOC_MAX_CHARS = 2000

