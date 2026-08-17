from collections.abc import Callable, Sequence

from backend.app.clients.llm import embed_query
from backend.app.config.models import DEFAULT_EMBED_DIM, DEFAULT_EMBED_MODEL

EMBEDDING_DIM = DEFAULT_EMBED_DIM
DEFAULT_EMBEDDING_MODEL = DEFAULT_EMBED_MODEL

EncodeFn = Callable[[str], Sequence[float]]


def embed_text(
    text: str,
    encode: EncodeFn | None = None,
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> list[float]:
    if encode is not None:
        vector = [float(x) for x in encode(text or " ")]
    else:
        vector = embed_query(text or " ", model=model, base_url=base_url, api_key=api_key)
    if len(vector) != EMBEDDING_DIM:
        raise ValueError(f"embedding dim {len(vector)} != {EMBEDDING_DIM}")
    return vector
