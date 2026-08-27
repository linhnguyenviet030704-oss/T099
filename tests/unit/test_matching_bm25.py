from backend.app.services.matching.bm25 import (
    bm25_document,
    bm25_query,
    bm25_ranking_ids,
    bm25_scores,
    competition_ranks,
    matching_tokens,
)


def test_matching_tokens_keep_special_skills():
    tokens = matching_tokens("Used C++ and C# with Node.js, Spring-Boot, and Postgres")
    assert "c_plus_plus" in tokens
    assert "c_sharp" in tokens
    assert "nodejs" in tokens
    assert "spring_boot" in tokens
    assert "postgresql" in tokens


def test_matching_tokens_query_drops_stopwords():
    tokens = matching_tokens("Need experience on the team for development", drop_stopwords=True)
    assert "experience" not in tokens
    assert "team" not in tokens
    assert "development" not in tokens


def test_competition_ranks_ties_share_rank():
    assert competition_ranks([0.1, 0.2, 0.2, 0.5]) == [1, 2, 2, 4]


def test_bm25_all_zero_when_no_overlap():
    scores = bm25_scores(["alpha beta", "gamma"], "zzz")
    assert scores == [0.0, 0.0]
    assert bm25_ranking_ids(["a", "b"], scores) == []


def test_bm25_prefers_term_match_and_drops_zeros():
    docs = ["java", "java java spring", "unrelated"]
    scores = bm25_scores(docs, "java")
    assert scores[2] == 0.0
    assert scores[0] > 0.0
    assert scores[1] > 0.0
    assert scores[2] == 0.0
    ids = bm25_ranking_ids(["a", "b", "c"], scores)
    assert set(ids) == {"a", "b"}
    assert "c" not in ids


def test_bm25_query_and_document_append_skill_ids():
    assert "java" in bm25_query("Backend", ["java", "kotlin"])
    doc = bm25_document("Built APIs", ["fastapi"])
    assert "Built APIs" in doc
    assert "fastapi" in doc


def test_protect_aliases_patterns_are_cached():
    from backend.app.services.matching.bm25 import _combined_alias_matcher

    first_pattern, first_lookup = _combined_alias_matcher()
    second_pattern, second_lookup = _combined_alias_matcher()
    assert first_pattern is second_pattern
    assert first_lookup is second_lookup
    assert len(first_lookup) > 0
