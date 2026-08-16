from backend.app.services.matching.llm import chat_complete, embed_query


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


def test_chat_complete_sends_bearer_and_model():
    calls: list[dict] = []

    def post(url, json, headers, timeout):
        calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        return _FakeResponse(
            {"choices": [{"message": {"content": "  hello world  "}}]}
        )

    text = chat_complete(
        "summarize this cv",
        model="qwen3.7-flash",
        base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        api_key="secret-key",
        json_object=True,
        post=post,
    )
    assert text == "hello world"
    assert calls[0]["url"] == "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions"
    assert calls[0]["headers"]["Authorization"] == "Bearer secret-key"
    assert calls[0]["json"]["model"] == "qwen3.7-flash"
    assert calls[0]["json"]["response_format"] == {"type": "json_object"}
    assert calls[0]["json"]["enable_thinking"] is False
    assert calls[0]["json"]["messages"][0]["content"] == "summarize this cv"


def test_chat_complete_omits_authorization_when_api_key_blank():
    calls: list[dict] = []

    def post(url, json, headers, timeout):
        calls.append({"headers": headers})
        return _FakeResponse({"choices": [{"message": {"content": "ok"}}]})

    chat_complete("hi", api_key="", post=post)
    assert "Authorization" not in calls[0]["headers"]


def test_embed_query_returns_1536_vector_and_passes_api_key():
    calls: list[dict] = []
    vector = [0.1] * 1536

    def post(url, json, headers, timeout):
        calls.append({"url": url, "json": json, "headers": headers})
        return _FakeResponse({"data": [{"embedding": vector}]})

    out = embed_query(
        "docker linux",
        model="qwen3.7-text-embedding",
        base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        api_key="emb-key",
        post=post,
    )
    assert out == vector
    assert calls[0]["url"] == "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/embeddings"
    assert calls[0]["json"]["model"] == "qwen3.7-text-embedding"
    assert calls[0]["json"]["dimensions"] == 1536
    assert calls[0]["headers"]["Authorization"] == "Bearer emb-key"
