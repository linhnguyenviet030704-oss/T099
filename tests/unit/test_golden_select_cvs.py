from evaluation.golden.select_cvs import load_metadata, load_vi_cv_ids


def test_load_metadata_returns_432_rows_with_expected_columns():
    rows = load_metadata()
    assert len(rows) == 432
    row = rows[0]
    for col in ("cv_id", "group_id", "subgroup", "quality_profile", "md_path", "pdf_path"):
        assert col in row


def test_load_vi_cv_ids_returns_known_ids():
    vi_ids = load_vi_cv_ids()
    # spot-checked in design doc: these VI files are translations of exact
    # EN cv_ids already in metadata.csv
    for cv_id in ("G1-GM-03", "G2-SA-06", "G3-NA-02", "G4-PT-09"):
        assert cv_id in vi_ids
    assert 30 <= len(vi_ids) <= 40


from evaluation.golden.select_cvs import pick_candidate

_FAKE_ROWS = [
    {"cv_id": "G1-BE-01", "group_id": "1", "subgroup": "Backend Developer", "quality_profile": "polished"},
    {"cv_id": "G1-BE-02", "group_id": "1", "subgroup": "Backend Developer", "quality_profile": "sparse"},
    {"cv_id": "G1-FE-01", "group_id": "1", "subgroup": "Frontend Developer", "quality_profile": "polished"},
    {"cv_id": "G1-FE-02", "group_id": "1", "subgroup": "Frontend Developer", "quality_profile": "cross_domain"},
]


def test_pick_candidate_exact_subgroup_and_quality():
    result = pick_candidate(_FAKE_ROWS, 1, "Backend Developer", ["polished"], set())
    assert result["cv_id"] == "G1-BE-01"


def test_pick_candidate_falls_back_through_quality_preference_list():
    # Frontend Developer has no "sparse" row, only "cross_domain"
    result = pick_candidate(_FAKE_ROWS, 1, "Frontend Developer", ["sparse", "cross_domain"], set())
    assert result["cv_id"] == "G1-FE-02"


def test_pick_candidate_falls_back_to_other_subgroup_in_same_group():
    # No "cross_domain" anywhere in Backend Developer; falls back to any
    # subgroup in group 1 with a "cross_domain" row.
    result = pick_candidate(_FAKE_ROWS, 1, "Backend Developer", ["cross_domain"], set())
    assert result["cv_id"] == "G1-FE-02"


def test_pick_candidate_respects_exclude_ids():
    # G1-BE-01 is the only "polished" row in Backend Developer; G1-FE-01 is
    # the only "polished" row anywhere else in group 1. Excluding both
    # leaves no polished candidate in the whole group -> None.
    result = pick_candidate(_FAKE_ROWS, 1, "Backend Developer", ["polished"], {"G1-BE-01", "G1-FE-01"})
    assert result is None


def test_pick_candidate_deterministic_lowest_cv_id():
    rows = _FAKE_ROWS + [
        {"cv_id": "G1-BE-00", "group_id": "1", "subgroup": "Backend Developer", "quality_profile": "polished"},
    ]
    result = pick_candidate(rows, 1, "Backend Developer", ["polished"], set())
    assert result["cv_id"] == "G1-BE-00"
