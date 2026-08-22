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
