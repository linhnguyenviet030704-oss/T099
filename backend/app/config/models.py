DEFAULT_LLM_MODEL = "qwen3.7-flash"
DEFAULT_EMBED_MODEL = "qwen3.7-text-embedding"
DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
DEFAULT_EMBED_DIM = 1536  # HNSW max 2000; richest qwen3.7-text-embedding size under that
REQUEST_TIMEOUT = 120.0
DEFAULT_RERANK_MODEL = "qwen3-rerank"
DEFAULT_RERANK_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-api/v1"
DEFAULT_RERANK_INSTRUCT = (
    "Rank how well the resume facts match the job skills and experience. "
    "Do not use name, email, age, graduation year, school, or employer prestige as signals."
)
RERANK_CONFIG_VERSION = "2026-08-17.1"
RETRIEVE_CANDIDATE_K = 50
RERANK_CANDIDATE_K = 10
FINAL_CANDIDATE_K = 10
RERANK_DOC_MAX_CHARS = 2000
