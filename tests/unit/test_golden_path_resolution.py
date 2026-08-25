from pathlib import Path

import pytest

from evaluation.golden.judge_relevance import load_cv_body

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.skipif(
    not (ROOT / "data_find/generated_cv/group-01-software-development/02-backend-developer/g1-be-01-do-hoang-nam.md").exists(),
    reason="Requires local data_find dataset (gitignored)",
)
def test_load_cv_body_resolves_relative_to_repo_root():
    # A real EN CV file that exists under data_find/, well outside
    # evaluation/golden/ -- load_cv_body must resolve against ROOT, not
    # GOLDEN_DIR, or this raises FileNotFoundError.
    rel_path = "data_find/generated_cv/group-01-software-development/02-backend-developer/g1-be-01-do-hoang-nam.md"
    assert (ROOT / rel_path).exists(), "fixture CV moved or renamed"

    body = load_cv_body(rel_path)
    assert isinstance(body, str)
    assert len(body) > 0


def test_load_cv_body_parses_frontmatter(tmp_path: Path, monkeypatch):
    # Tests that load_cv_body correctly resolves relative to ROOT and strips YAML frontmatter
    test_file = tmp_path / "test_cv.md"
    test_file.write_text("---\ntitle: Test\n---\nActual CV body content", encoding="utf-8")
    monkeypatch.setattr("evaluation.golden.judge_relevance.ROOT", tmp_path)
    body = load_cv_body("test_cv.md")
    assert body == "Actual CV body content"
