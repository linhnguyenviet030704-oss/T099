import json

from backend.app.services.matching.summarize import (
    SUMMARIZE_PROMPT_TEMPLATE,
    grounded_titles,
    summarize_resume,
)


def test_grounded_titles_drops_fabricated_role():
    source = "Worked as Backend Engineer building APIs with FastAPI."
    titles = ["Backend Engineer", "Senior Data Scientist"]
    assert grounded_titles(titles, source) == ["Backend Engineer"]


def test_grounded_titles_keeps_titles_present_in_source():
    source = "Machine Learning Engineer at a startup, trained models."
    assert grounded_titles(["Machine Learning Engineer"], source) == ["Machine Learning Engineer"]


def test_summarize_prompt_asks_for_json_metadata():
    seen = {}

    def complete(prompt: str, **_kwargs) -> str:
        seen["prompt"] = prompt
        return json.dumps(
            {
                "summary": "Backend engineer with API work.",
                "titles": ["Backend Engineer", "role", "Education"],
                "skills": ["Cooking", "Excel"],
                "body": "## Experience\nBuilt APIs with FastAPI.",
            }
        )

    meta = summarize_resume("Python FastAPI engineer", complete=complete)
    prompt = seen["prompt"]
    assert "{cv_content}" not in prompt
    assert "Python FastAPI engineer" in prompt
    template = SUMMARIZE_PROMPT_TEMPLATE.casefold()
    assert "json" in template
    assert "summary" in template
    assert "titles" in template
    assert meta["summary"] == "Backend engineer with API work."
    assert meta["titles"] == ["Backend Engineer"]
    assert "FastAPI" in meta["body"]
    assert "skills" not in meta


def test_summarize_resume_falls_back_when_llm_garbage():
    def complete(_prompt: str, **_kwargs) -> str:
        return "not-json"

    meta = summarize_resume("Python", complete=complete)
    assert meta["summary"] == ""
    assert meta["titles"] == []
    assert meta["body"] == ""


def test_summarize_resume_accepts_plain_markdown_body():
    def complete(_prompt: str, **_kwargs) -> str:
        return "## Experience\nIntern who used Python."

    meta = summarize_resume("Python intern", complete=complete)
    assert "Python" in meta["body"]
    assert meta["summary"] == "Intern who used Python."


def test_placeholder_summary_is_dropped():
    def complete(_prompt: str, **_kwargs) -> str:
        return json.dumps(
            {
                "summary": "1-3 sentences",
                "titles": ["role"],
                "body": "## Experience\nBuilt APIs.",
            }
        )

    meta = summarize_resume("Python", complete=complete)
    assert meta["summary"] == ""
    assert meta["titles"] == []
    assert "Built APIs." in meta["body"]


def test_summarize_node_keeps_extract_skills_and_adds_match_schema():
    """Demo2 ingests skills from `extract` before summarize. Summarize must
    not overwrite them; it only verifies them and attaches major/sub."""
    import asyncio

    from backend.app.agents.ingest.nodes.summarize import make_summarize_node

    def complete(_prompt: str, **_kwargs) -> str:
        return json.dumps(
            {
                "summary": "Backend engineer.",
                "titles": ["Backend Engineer"],
                "body": "## Experience\nBuilt APIs with FastAPI.",
            }
        )

    state = {
        "markdown": "Built APIs with FastAPI and PostgreSQL.",
        "clean_markdown": "Built APIs with FastAPI and PostgreSQL.",
        "skills": ["FastAPI", "PostgreSQL"],
        "metadata": {"content_chars": 60},
    }
    node = make_summarize_node(complete=complete)
    out = asyncio.run(node(state))
    metadata = out["metadata"]

    # Skills from extract are preserved, not replaced by LLM output.
    assert set(metadata["skills"]) == {"FastAPI", "PostgreSQL"}
    # LLM dropped PostgreSQL from the body, so it is "inferred" (came from
    # extract / taxonomy, not confirmed by the rewrite). FastAPI survived.
    assert metadata["verified_skills"] == ["FastAPI"]
    assert metadata["inferred_skills"] == ["PostgreSQL"]
    # Schema matching fields are populated for downstream matching.
    assert isinstance(metadata["major_field"], str)
    assert isinstance(metadata["sub_field"], list)
    assert isinstance(metadata["skill_records"], list)
    assert {rec["skill"] for rec in metadata["skill_records"]} == {"FastAPI", "PostgreSQL"}
    sources = {rec["skill"]: rec["source"] for rec in metadata["skill_records"]}
    assert sources == {"FastAPI": "verified", "PostgreSQL": "inferred"}
    assert metadata["taxonomy_version"]


def test_summarize_node_marks_extract_skills_inferred_when_absent_from_body():
    import asyncio

    from backend.app.agents.ingest.nodes.summarize import make_summarize_node

    def complete(_prompt: str, **_kwargs) -> str:
        return json.dumps(
            {
                "summary": "Engineer.",
                "titles": [],
                "body": "## Experience\nWorked at Acme.",
            }
        )

    # extract found Python + FastAPI, but summarize stripped body down to
    # generic prose — those skills came from extract only, so they're
    # "inferred" (taxonomy-aware, not LLM-confirmed).
    state = {
        "markdown": "Built APIs with FastAPI and Python.",
        "clean_markdown": "Built APIs with FastAPI and Python.",
        "skills": ["Python", "FastAPI"],
        "metadata": {},
    }
    node = make_summarize_node(complete=complete)
    out = asyncio.run(node(state))
    metadata = out["metadata"]
    assert set(metadata["skills"]) == {"Python", "FastAPI"}
    assert metadata["verified_skills"] == []
    assert set(metadata["inferred_skills"]) == {"Python", "FastAPI"}
    sources = {rec["source"] for rec in metadata["skill_records"]}
    assert sources == {"inferred"}
