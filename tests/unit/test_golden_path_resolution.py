from pathlib import Path

from evaluation.golden.judge_relevance import load_cv_body

ROOT = Path(__file__).resolve().parents[2]


def test_load_cv_body_resolves_relative_to_repo_root():
    # A real EN CV file that exists under data_find/, well outside
    # evaluation/golden/ -- load_cv_body must resolve against ROOT, not
    # GOLDEN_DIR, or this raises FileNotFoundError.
    rel_path = "data_find/generated_cv/group-01-software-development/02-backend-developer/g1-be-01-do-hoang-nam.md"
    assert (ROOT / rel_path).exists(), "fixture CV moved or renamed"

    body = load_cv_body(rel_path)
    assert isinstance(body, str)
    assert len(body) > 0
