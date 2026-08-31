from scripts.build_vietjobs_it_seed import COMPANY_NAMES, GROUPS


def test_groups_quota_is_one_for_the_ten_kept_groups_and_zero_for_the_rest():
    quotas = {gid: quota for gid, _name, _inc, _exc, quota in GROUPS}
    assert sum(quotas.values()) == 10
    for gid in range(1, 11):
        assert quotas[gid] == 1, f"group {gid} should have quota 1"
    for gid in range(11, 16):
        assert quotas[gid] == 0, f"group {gid} should have quota 0"


def test_company_names_has_exactly_ten_entries():
    assert len(COMPANY_NAMES) == 10
    assert len(set(COMPANY_NAMES)) == 10
