from backend.app.services.matching.rrf import RRF_K, rrf_fuse, rrf_normalize


def test_rrf_prefers_doc_ranked_first_on_more_lists():
    fused = rrf_fuse(
        {
            "original": ["ada", "bob"],
            "expanded": ["bob", "ada"],
            "skill": ["bob", "ada"],
        }
    )
    assert [row[0] for row in fused] == ["bob", "ada"]
    assert fused[0][1] > fused[1][1]


def test_rrf_equal_ranks_tie_break_by_id_order_stable():
    fused = rrf_fuse({"a": ["x", "y"], "b": ["x", "y"]})
    assert fused[0][0] == "x"
    expected = 2 / (RRF_K + 1)
    assert fused[0][1] == expected


def test_rrf_normalize_maps_all_rank_one_to_one():
    raw = 3 / (RRF_K + 1)
    assert rrf_normalize(raw, n_lists=3) == 1.0
    assert rrf_normalize(0.0, n_lists=3) == 0.0
