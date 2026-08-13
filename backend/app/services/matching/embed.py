from __future__ import annotations

from collections.abc import Callable, Sequence

EMBEDDING_DIM = 384
DEFAULT_EMBEDDING_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"

EncodeFn = Callable[[str], Sequence[float]]


def embed_text(text: str, encode: EncodeFn | None = None) -> list[float]:
    fn = encode or default_encode
    vector = [float(x) for x in fn(text or " ")]
    if len(vector) != EMBEDDING_DIM:
        raise ValueError(f"embedding dim {len(vector)} != {EMBEDDING_DIM}")
    return vector


def default_encode(text: str) -> list[float]:
    """Lazy fastembed MiniLM. Tests must inject encode=."""
    from fastembed import TextEmbedding

    model = TextEmbedding(model_name=DEFAULT_EMBEDDING_MODEL)
    vectors = list(model.embed([text]))
    return [float(x) for x in vectors[0]]
