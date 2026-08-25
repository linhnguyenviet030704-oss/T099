import pytest

from backend.app.agents.ingest.nodes.clean import clean_node


@pytest.mark.asyncio
async def test_clean_node_passes_through_already_cleaned_markdown_unchanged():
    """parse_node already returns redact_pii(clean_markdown(...)) output, so
    clean_node must be a pure forward — not a second clean/redact pass."""
    already_clean = "# CV\n\n## Skills\n\nPython, FastAPI"
    result = await clean_node({"markdown": already_clean})
    assert result == {"markdown": already_clean, "clean_markdown": already_clean}


@pytest.mark.asyncio
async def test_clean_node_missing_markdown_returns_empty_strings():
    result = await clean_node({})
    assert result == {"markdown": "", "clean_markdown": ""}
