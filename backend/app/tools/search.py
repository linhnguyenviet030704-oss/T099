"""Vector and hybrid search tools using Supabase pgvector.

ponytail: Direct function calls instead of agent tool-calling for speed and determinism.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.app.clients.supabase import get_supabase_client
from backend.app.services.matching.embed import embed_text


@dataclass
class SearchResult:
    id: str
    type: str  # 'resume' | 'job'
    title: str | None
    content: str
    metadata: dict[str, Any]
    similarity: float


def _build_vector_search_query(
    query_embedding: list[float],
    table: str,
    embedding_column: str = "embedding",
    match_count: int = 10,
    content_columns: tuple[str, ...] = ("markdown", "clean_markdown"),
    metadata_columns: tuple[str, ...] = ("metadata",),
) -> dict[str, Any]:
    """Build Supabase RPC call for vector similarity search."""
    return {
        "query_embedding": query_embedding,
        "match_count": match_count,
        "table": table,
        "embedding_column": embedding_column,
        "content_columns": list(content_columns),
        "metadata_columns": list(metadata_columns),
    }


async def vector_search(
    query: str,
    *,
    table: str = "embedded_resumes",
    match_count: int = 10,
    min_similarity: float = 0.5,
    encode=None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> list[SearchResult]:
    """
    Semantic vector search against Supabase pgvector.

    Args:
        query: Natural language query
        table: Table to search ('embedded_resumes' or 'job_posts')
        match_count: Max results to return
        min_similarity: Minimum cosine similarity threshold
        encode: Optional embedding function override
        api_key: LLM API key for embedding
        base_url: LLM base URL

    Returns:
        List of SearchResult sorted by similarity descending
    """
    client = get_supabase_client()

    # Generate query embedding
    query_embedding = embed_text(query, encode=encode, api_key=api_key, base_url=base_url)

    # Determine content/metadata columns based on table
    if table == "embedded_resumes":
        content_cols = ("markdown", "clean_markdown")
        metadata_cols = ("metadata",)
        type_val = "resume"
    elif table == "job_posts":
        content_cols = ("description", "requirements")
        metadata_cols = ("title", "skills")
        type_val = "job"
    else:
        content_cols = ("content",)
        metadata_cols = ()
        type_val = "unknown"

    def _search() -> list[SearchResult]:
        # Use Supabase pgvector match_documents function if available
        try:
            result = client.rpc(
                "match_documents",
                {
                    "query_embedding": query_embedding,
                    "match_count": match_count,
                    "table_name": table,
                    "embedding_column": "embedding",
                    "min_similarity": min_similarity,
                },
            ).execute()
            rows = result.data or []
        except Exception:
            # Fallback: manual cosine similarity
            result = client.table(table).select("*").execute()
            rows = result.data or []

        results: list[SearchResult] = []
        for row in rows:
            embedding = row.get("embedding")
            if not embedding:
                continue

            # Calculate cosine similarity
            similarity = _cosine_similarity(query_embedding, embedding)
            if similarity < min_similarity:
                continue

            content_parts = []
            for col in content_cols:
                if val := row.get(col):
                    content_parts.append(str(val))
            content = "\n".join(content_parts)

            metadata = {}
            for col in metadata_cols:
                if val := row.get(col):
                    metadata[col] = val

            results.append(
                SearchResult(
                    id=str(row.get("id", "")),
                    type=type_val,
                    title=metadata.get("title"),
                    content=content[:5000],  # Limit content length
                    metadata=metadata,
                    similarity=float(similarity),
                )
            )

        results.sort(key=lambda x: x.similarity, reverse=True)
        return results[:match_count]

    import asyncio
    return await asyncio.to_thread(_search)


async def hybrid_search(
    query: str,
    *,
    table: str = "embedded_resumes",
    match_count: int = 10,
    alpha: float = 0.7,
    encode=None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> list[SearchResult]:
    """
    Hybrid search combining vector similarity + BM25 keyword matching.

    Args:
        query: Search query
        table: Table to search
        match_count: Max results
        alpha: Weight for vector (1-alpha for BM25), default 0.7
        encode: Embedding function override
        api_key: LLM API key
        base_url: LLM base URL

    Returns:
        Combined results using RRF fusion
    """
    from backend.app.services.matching.bm25 import bm25_scores

    client = get_supabase_client()

    # Vector search component
    vector_results = await vector_search(
        query,
        table=table,
        match_count=match_count * 2,  # Fetch more for fusion
        min_similarity=0.3,
        encode=encode,
        api_key=api_key,
        base_url=base_url,
    )

    # BM25 component
    def _bm25_search() -> list[tuple[str, float]]:
        result = client.table(table).select("id, markdown, clean_markdown, description, requirements").execute()
        rows = result.data or []

        docs = []
        ids = []
        for row in rows:
            ids.append(str(row.get("id", "")))
            text_parts = []
            for col in ("markdown", "clean_markdown", "description", "requirements"):
                if val := row.get(col):
                    text_parts.append(str(val))
            docs.append("\n".join(text_parts))

        if not docs:
            return []

        scores = bm25_scores(docs, query)
        return list(zip(ids, scores))

    import asyncio
    bm25_results = await asyncio.to_thread(_bm25_search)

    # Build BM25 ranking
    bm25_ranked = sorted(bm25_results, key=lambda x: x[1], reverse=True)
    bm25_ranks = {rid: rank + 1 for rank, (rid, _) in enumerate(bm25_ranked)}

    # Combine with RRF
    rrf_k = 60
    vector_ranks = {r.id: rank + 1 for rank, r in enumerate(vector_results)}

    combined: dict[str, float] = {}
    for r in vector_results:
        vec_rank = vector_ranks.get(r.id, match_count)
        bm25_rank = bm25_ranks.get(r.id, match_count)
        rrf_score = (1 / (rrf_k + vec_rank)) * alpha + (1 / (rrf_k + bm25_rank)) * (1 - alpha)
        combined[r.id] = rrf_score

    # Re-rank results
    for r in vector_results:
        r.similarity = combined.get(r.id, r.similarity)

    final_results = sorted(vector_results, key=lambda x: x.similarity, reverse=True)
    return final_results[:match_count]


async def semantic_cache_search(
    query: str,
    *,
    cache_table: str = "semantic_cache",
    encode=None,
    api_key: str | None = None,
    base_url: str | None = None,
) -> list[dict[str, Any]]:
    """
    Check semantic cache for similar previously cached queries.

    Returns cached results if similarity > threshold, else empty list.
    """
    client = get_supabase_client()
    query_embedding = embed_text(query, encode=encode, api_key=api_key, base_url=base_url)

    def _search() -> list[dict[str, Any]]:
        try:
            result = client.table(cache_table).select("*").execute()
            rows = result.data or []

            cached = []
            for row in rows:
                cached_emb = row.get("query_embedding")
                if not cached_emb:
                    continue
                sim = _cosine_similarity(query_embedding, cached_emb)
                if sim > 0.95:  # High threshold for cache hit
                    cached.append({**row, "cache_similarity": sim})

            cached.sort(key=lambda x: x["cache_similarity"], reverse=True)
            return cached[:3]
        except Exception:
            return []

    import asyncio
    return await asyncio.to_thread(_search)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    import math

    if len(a) != len(b) or not a:
        return 0.0

    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return dot / (norm_a * norm_b)
