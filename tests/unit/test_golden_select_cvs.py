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


from evaluation.golden.select_cvs import choose_vi_jd_ids


def test_choose_vi_jd_ids_spreads_across_groups_before_repeating():
    jd_group_ids = {
        "JD-01": 1, "JD-02": 1,   # group 1 has 2 eligible JDs
        "JD-03": 2,               # group 2 has 1 eligible JD
        "JD-04": 3,               # group 3 has 1 eligible JD
        "JD-05": 4,               # not eligible (no vi candidate)
    }
    jd_candidate_vi_ids = {
        "JD-01": {"G1-BE-01"},
        "JD-02": {"G1-FE-01"},
        "JD-03": {"G2-DO-01"},
        "JD-04": {"G3-NA-01"},
        "JD-05": set(),
    }
    vi_cv_ids = {"G1-BE-01", "G1-FE-01", "G2-DO-01", "G3-NA-01"}

    chosen = choose_vi_jd_ids(jd_group_ids, jd_candidate_vi_ids, vi_cv_ids, target_max=3)

    assert len(chosen) == 3
    chosen_groups = {jd_group_ids[jd_id] for jd_id in chosen}
    assert chosen_groups == {1, 2, 3}, "should prefer covering distinct groups first"


def test_choose_vi_jd_ids_never_exceeds_eligible_count():
    jd_group_ids = {"JD-01": 1}
    jd_candidate_vi_ids = {"JD-01": {"G1-BE-01"}}
    vi_cv_ids = {"G1-BE-01"}

    chosen = choose_vi_jd_ids(jd_group_ids, jd_candidate_vi_ids, vi_cv_ids, target_max=10)
    assert chosen == {"JD-01"}


from evaluation.golden.select_cvs import build_manifest


def _fake_jds():
    return [
        {
            "jd_id": "JD-01",
            "title": "Senior Backend Developer",
            "group_id": 1,
            "cv_subgroup_hint": "Backend Developer",
            "taxonomy_skills": ["Python"],
        },
        {
            "jd_id": "JD-02",
            "title": "Frontend Developer (React)",
            "group_id": 1,
            "cv_subgroup_hint": "Frontend Developer",
            "taxonomy_skills": ["React"],
        },
    ]


def test_build_manifest_produces_two_cvs_per_jd():
    from evaluation.golden.select_cvs import load_metadata, load_vi_cv_ids

    manifest = build_manifest(_fake_jds(), load_metadata(), load_vi_cv_ids())
    assert len(manifest) == 2
    for entry in manifest:
        assert len(entry["cvs"]) == 2
        variants = {cv["variant"] for cv in entry["cvs"]}
        assert variants == {"a", "b"}
        for cv in entry["cvs"]:
            assert cv["target_jd_id"] == entry["jd_id"]
            assert cv["language"] in ("en", "vi")
            assert cv["source"] in ("real_pool_en", "real_pool_vi")
            assert cv["md_path"].startswith("data_find/generated_cv")


def test_build_manifest_no_duplicate_cv_ids_across_whole_pool():
    from evaluation.golden.select_cvs import load_metadata, load_vi_cv_ids

    manifest = build_manifest(_fake_jds(), load_metadata(), load_vi_cv_ids())
    all_ids = [cv["cv_id"] for entry in manifest for cv in entry["cvs"]]
    assert len(all_ids) == len(set(all_ids))
