import asyncio
from collections.abc import Callable, Sequence

from backend.app.agents.state import AgentState
from backend.app.core.exceptions import BadRequestError
from backend.app.guardrails.gates import gate_context
from backend.app.guardrails.output import validate_embedding
from backend.app.services.matching.embed import EMBEDDING_DIM, embed_text


def make_embed_node(
    *,
    encode: Callable[[str], Sequence[float]] | None = None,
    api_key: str | None = None,
    base_url: str | None = None,
):
    async def embed_node(state: AgentState) -> dict:
        metadata = state.get("metadata") or {}
        quotes: list[str] = []
        for record in metadata.get("skill_records") or []:
            if record.get("status") != "verified":
                continue
            quote = str(record.get("quote") or "").strip()
            if quote:
                quotes.append(quote)
            if len(quotes) >= 8:
                break
        blob = state.get("markdown") or " "
        if quotes:
            blob = blob + "\n" + "\n".join(quotes)
        context = gate_context(blob, source="cv", max_chars=50_000)
        if context.action == "block" or not context.value:
            code = context.codes[0] if context.codes else "DATA_LOW_CONTENT"
            raise BadRequestError("Nội dung CV không an toàn để embedding", code=code)
        vector = await asyncio.to_thread(
            embed_text,
            str(context.value),
            encode=encode,
            api_key=api_key,
            base_url=base_url,
        )
        guarded = validate_embedding(vector, expected_dimension=EMBEDDING_DIM)
        if guarded.action == "block":
            raise BadRequestError("Embedding không hợp lệ", code="OUTPUT_INVALID_SCHEMA")
        return {
            "embedding": guarded.value,
            "guardrail_codes": list(
                dict.fromkeys(
                    [
                        *state.get("guardrail_codes", []),
                        *metadata.get("guardrail_codes", []),
                        *context.codes,
                        *guarded.codes,
                    ]
                )
            ),
        }

    return embed_node
