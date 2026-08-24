import pytest

from backend.app.services.matching.skills import load_taxonomy_index
from evaluation.golden.select_jds import (
    METADATA_CSV_PATH,
    VIETJOBS_CSV_PATH,
    compute_group_quota,
    guess_subgroup,
    load_metadata_rows,
    select_jds,
)


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
    with pytest.raises(ValueError):
        compute_group_quota({1: 10, 2: 10, 3: 10}, total=2)


_FAKE_GROUP1_ROWS = [
    {"group_id": "1", "subgroup": "Backend Developer", "target_role": "Backend Engineer"},
    {"group_id": "1", "subgroup": "Backend Developer", "target_role": ".NET Backend Developer"},
    {"group_id": "1", "subgroup": "Frontend Developer", "target_role": "Frontend Engineer"},
    {"group_id": "1", "subgroup": "Frontend Developer", "target_role": "React Developer"},
    {"group_id": "1", "subgroup": "Frontend Developer", "target_role": "React Developer"},
]


def test_guess_subgroup_matches_subgroup_name_in_title():
    result = guess_subgroup("Senior Backend Developer (Python/FastAPI)", 1, _FAKE_GROUP1_ROWS)
    assert result == "Backend Developer"


def test_guess_subgroup_matches_target_role_when_subgroup_name_absent():
    result = guess_subgroup("React Developer - 2 years experience", 1, _FAKE_GROUP1_ROWS)
    assert result == "Frontend Developer"


def test_guess_subgroup_falls_back_to_largest_subgroup():
    result = guess_subgroup("IT Generalist, mixed duties", 1, _FAKE_GROUP1_ROWS)
    assert result == "Frontend Developer"  # 3 rows vs 2 for Backend Developer


def test_guess_subgroup_raises_on_unknown_group():
    with pytest.raises(ValueError):
        guess_subgroup("anything", 999, _FAKE_GROUP1_ROWS)


@pytest.mark.skipif(
    not (METADATA_CSV_PATH.exists() and VIETJOBS_CSV_PATH.exists()),
    reason="Requires local data_find dataset (gitignored)",
)
def test_select_jds_produces_20_jds_matching_quota():
    metadata_rows = load_metadata_rows()
    index = load_taxonomy_index()
    jds = select_jds(VIETJOBS_CSV_PATH, metadata_rows, index, n=20)

    assert len(jds) == 20
    assert [jd["jd_id"] for jd in jds] == [f"JD-{i:02d}" for i in range(1, 21)]

    group_counts: dict[int, int] = {}
    for jd in jds:
        group_counts[jd["group_id"]] = group_counts.get(jd["group_id"], 0) + 1
    for g in (1, 2, 3, 4, 5):
        assert group_counts.get(g) == 2, f"group {g}: expected 2 JDs, got {group_counts.get(g)}"
    for g in range(6, 16):
        assert group_counts.get(g) == 1, f"group {g}: expected 1 JD, got {group_counts.get(g)}"

    for jd in jds:
        assert jd["cv_subgroup_hint"]
        assert len(jd["taxonomy_skills"]) >= 1
        assert len(jd["description"]) >= 250


@pytest.mark.skipif(
    not (METADATA_CSV_PATH.exists() and VIETJOBS_CSV_PATH.exists()),
    reason="Requires local data_find dataset (gitignored)",
)
def test_select_jds_group1_picks_distinct_subgroups_when_possible():
    metadata_rows = load_metadata_rows()
    index = load_taxonomy_index()
    jds = select_jds(VIETJOBS_CSV_PATH, metadata_rows, index, n=20)

    group1_jds = [jd for jd in jds if jd["group_id"] == 1]
    assert len(group1_jds) == 2
    subgroups = {jd["cv_subgroup_hint"] for jd in group1_jds}
    assert len(subgroups) == 2, f"expected 2 distinct subgroups, got {subgroups}"
