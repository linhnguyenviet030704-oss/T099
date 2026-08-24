from evaluation.golden.select_jds import compute_group_quota


def test_compute_group_quota_matches_real_distribution():
    # Real group_id -> CV-pool-size counts from data_find/generated_cv/metadata.csv
    group_counts = {
        1: 55, 2: 55, 3: 36, 4: 60, 5: 44,
        6: 25, 7: 20, 8: 25, 9: 20, 10: 20,
        11: 12, 12: 12, 13: 16, 14: 16, 15: 16,
    }
    quota = compute_group_quota(group_counts, total=20)
    assert sum(quota.values()) == 20
    for g in (1, 2, 3, 4, 5):
        assert quota[g] == 2, f"group {g} expected quota 2, got {quota[g]}"
    for g in (6, 7, 8, 9, 10, 11, 12, 13, 14, 15):
        assert quota[g] == 1, f"group {g} expected quota 1, got {quota[g]}"


def test_compute_group_quota_every_group_gets_at_least_one_seat():
    group_counts = {1: 1000, 2: 1, 3: 1}
    quota = compute_group_quota(group_counts, total=3)
    assert quota == {1: 1, 2: 1, 3: 1}


def test_compute_group_quota_rejects_total_below_group_count():
    import pytest
    with pytest.raises(ValueError):
        compute_group_quota({1: 10, 2: 10, 3: 10}, total=2)
