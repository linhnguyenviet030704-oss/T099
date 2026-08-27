import pytest

from backend.app.config.env import Settings
from backend.app.shared_brain import (
    AgentBrain,
    BaseLLMProvider,
    BrainConfig,
    BrainProvider,
    GeminiProvider,
    OllamaProvider,
    OpenAIProvider,
    QwenProvider,
    get_brain,
    register_brain,
    reset_registry,
)


class _FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code
        self.request = None

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"http {self.status_code}")


@pytest.fixture(autouse=True)
def clean_registry():
    reset_registry()
    yield
    reset_registry()


def test_brain_provider_enum_parsing():
    assert BrainProvider.from_str("openai") == BrainProvider.OPENAI
    assert BrainProvider.from_str("gpt") == BrainProvider.OPENAI
    assert BrainProvider.from_str("qwen") == BrainProvider.QWEN
    assert BrainProvider.from_str("dashscope") == BrainProvider.QWEN
    assert BrainProvider.from_str("gemini") == BrainProvider.GEMINI
    assert BrainProvider.from_str("google") == BrainProvider.GEMINI
    assert BrainProvider.from_str("ollama") == BrainProvider.OLLAMA
    assert BrainProvider.from_str("local") == BrainProvider.OLLAMA
    assert BrainProvider.from_str("unknown") == BrainProvider.QWEN
    assert BrainProvider.from_str(None) == BrainProvider.QWEN


def test_openai_provider_chat_and_embed():
    calls: list[dict] = []

    def mock_post(url, json=None, headers=None, timeout=None):
        calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        if "/chat/completions" in url:
            return _FakeResponse({"choices": [{"message": {"content": '{"analysis": "good"}'}}]})
        if "/embeddings" in url:
            return _FakeResponse({"data": [{"embedding": [0.1, 0.2, 0.3]}]})
        return _FakeResponse({})

    provider = OpenAIProvider(
        BrainConfig(
            provider=BrainProvider.OPENAI,
            api_key="sk-test-openai",
            base_url="https://api.openai.com/v1",
            llm_model="gpt-4o-mini",
            embedding_model="text-embedding-3-small",
        )
    )

    # Test chat_complete
    ans = provider.chat_complete("Evaluate CV", json_object=True, post=mock_post)
    assert ans == '{"analysis": "good"}'
    assert calls[0]["url"] == "https://api.openai.com/v1/chat/completions"
    assert calls[0]["headers"]["Authorization"] == "Bearer sk-test-openai"
    assert calls[0]["json"]["model"] == "gpt-4o-mini"
    assert calls[0]["json"]["response_format"] == {"type": "json_object"}

    # Test embed_query
    emb = provider.embed_query("Python Developer", dimensions=1536, post=mock_post)
    assert emb == [0.1, 0.2, 0.3]
    assert calls[1]["url"] == "https://api.openai.com/v1/embeddings"
    assert calls[1]["json"]["dimensions"] == 1536


def test_qwen_provider_chat_embed_and_rerank():
    calls: list[dict] = []

    def mock_post(url, json=None, headers=None, timeout=None):
        calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        if "/chat/completions" in url:
            return _FakeResponse({"choices": [{"message": {"content": "qwen response"}}]})
        if "/embeddings" in url:
            return _FakeResponse({"data": [{"embedding": [0.5] * 1536}]})
        if "/reranks" in url:
            return _FakeResponse({"results": [{"index": 0, "relevance_score": 0.95}]})
        return _FakeResponse({})

    provider = QwenProvider(
        BrainConfig(
            provider=BrainProvider.QWEN,
            api_key="qwen-secret",
            base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
            llm_model="qwen3.7-flash",
            embedding_model="qwen3.7-text-embedding",
            rerank_base_url="https://dashscope-intl.aliyuncs.com/compatible-api/v1",
            rerank_model="qwen3-rerank",
        )
    )

    # Chat with thinking disabled
    chat_res = provider.chat_complete("Hello Qwen", post=mock_post)
    assert chat_res == "qwen response"
    assert calls[0]["json"]["enable_thinking"] is False
    assert calls[0]["headers"]["Authorization"] == "Bearer qwen-secret"

    # Embed
    emb_res = provider.embed_query("FastAPI backend", post=mock_post)
    assert len(emb_res) == 1536

    # Rerank
    rk_res = provider.rerank_query("Senior Python", ["CV1", "CV2"], post=mock_post)
    assert rk_res == [{"index": 0, "relevance_score": 0.95}]
    assert calls[2]["url"] == "https://dashscope-intl.aliyuncs.com/compatible-api/v1/reranks"
    assert calls[2]["json"]["model"] == "qwen3-rerank"


def test_gemini_provider_chat_and_embed():
    calls: list[dict] = []

    def mock_post(url, json=None, headers=None, timeout=None):
        calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        if "/chat/completions" in url:
            return _FakeResponse({"choices": [{"message": {"content": "gemini flash result"}}]})
        if "/embeddings" in url:
            return _FakeResponse({"data": [{"embedding": [0.7] * 768}]})
        return _FakeResponse({})

    provider = GeminiProvider(
        BrainConfig(
            provider=BrainProvider.GEMINI,
            api_key="gemini-api-key",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai",
            llm_model="gemini-2.0-flash",
            embedding_model="text-embedding-004",
        )
    )

    ans = provider.chat_complete("Review job post", post=mock_post)
    assert ans == "gemini flash result"
    assert calls[0]["url"] == "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    assert calls[0]["headers"]["Authorization"] == "Bearer gemini-api-key"
    assert calls[0]["json"]["model"] == "gemini-2.0-flash"

    emb = provider.embed_query("Text content", post=mock_post)
    assert len(emb) == 768
    assert calls[1]["url"] == "https://generativelanguage.googleapis.com/v1beta/openai/embeddings"


def test_ollama_provider_local():
    calls: list[dict] = []

    def mock_post(url, json=None, headers=None, timeout=None):
        calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        if "/chat/completions" in url:
            return _FakeResponse({"choices": [{"message": {"content": "ollama local response"}}]})
        if "/embeddings" in url:
            return _FakeResponse({"data": [{"embedding": [0.3] * 384}]})
        return _FakeResponse({})

    provider = OllamaProvider(
        BrainConfig(
            provider=BrainProvider.OLLAMA,
            base_url="http://localhost:11434/v1",
            llm_model="llama3.2",
            embedding_model="nomic-embed-text",
        )
    )

    ans = provider.chat_complete("Summarize locally", post=mock_post)
    assert ans == "ollama local response"
    assert calls[0]["url"] == "http://localhost:11434/v1/chat/completions"
    assert calls[0]["json"]["model"] == "llama3.2"

    emb = provider.embed_query("Offline text", post=mock_post)
    assert len(emb) == 384
    assert calls[1]["url"] == "http://localhost:11434/v1/embeddings"


def test_agent_brain_registration_and_dispatch():
    # Register different brains for different agents
    ingest_brain = register_brain(
        "ingest_agent",
        provider=BrainProvider.QWEN,
        model="qwen3.7-flash",
    )
    matching_brain = register_brain(
        "matching_agent",
        provider=BrainProvider.OPENAI,
        model="gpt-4o",
    )
    recommend_brain = register_brain(
        "recommend_agent",
        provider=BrainProvider.GEMINI,
        model="gemini-2.0-flash",
    )

    assert ingest_brain.agent_name == "ingest_agent"
    assert ingest_brain.provider_type == BrainProvider.QWEN
    assert ingest_brain.config.llm_model == "qwen3.7-flash"

    assert matching_brain.agent_name == "matching_agent"
    assert matching_brain.provider_type == BrainProvider.OPENAI
    assert matching_brain.config.llm_model == "gpt-4o"

    assert recommend_brain.agent_name == "recommend_agent"
    assert recommend_brain.provider_type == BrainProvider.GEMINI
    assert recommend_brain.config.llm_model == "gemini-2.0-flash"

    # Verify retrieval
    assert get_brain("ingest_agent") is ingest_brain
    assert get_brain("matching_agent") is matching_brain
    assert get_brain("recommend_agent") is recommend_brain

    # Default brain fallback
    default_brain = get_brain("unregistered_agent")
    assert isinstance(default_brain, AgentBrain)
    assert default_brain.agent_name == "unregistered_agent"


def test_settings_env_sync_and_defaults(monkeypatch):
    # Đảm bảo môi trường sạch để kiểm tra cơ chế fallback alias từ DASHSCOPE và GOOGLE API key
    monkeypatch.delenv("QWEN_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-live-test")
    monkeypatch.setenv("GOOGLE_API_KEY", "goog-key-123")
    monkeypatch.setenv("DASHSCOPE_API_KEY", "dash-key-456")
    monkeypatch.setenv("DEFAULT_BRAIN_PROVIDER", "gemini")

    s = Settings(_env_file=None)
    assert s.openai_api_key == "sk-live-test"
    assert s.gemini_api_key == "goog-key-123"  # mapped from GOOGLE_API_KEY
    assert s.qwen_api_key == "dash-key-456"    # mapped from DASHSCOPE_API_KEY
    assert s.default_brain_provider == "gemini"


def test_custom_provider_registration():
    class MockCustomProvider(BaseLLMProvider):
        def chat_complete(self, prompt, **kwargs):
            return f"custom echo: {prompt}"

        def embed_query(self, text, **kwargs):
            return [1.0, 2.0]

        def rerank_query(self, query, documents, **kwargs):
            return []

    custom = MockCustomProvider(BrainConfig())
    brain = register_brain("custom_agent", custom_provider=custom)
    assert brain.chat("testing custom") == "custom echo: testing custom"
    assert brain.embed("text") == [1.0, 2.0]
