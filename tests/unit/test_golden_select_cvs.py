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
