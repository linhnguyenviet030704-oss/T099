from evaluation.golden.run_eval import rank_jds_for_cv, transpose_qrels


def test_rank_jds_for_cv_ranks_closer_embedding_first():
    from backend.app.services.matching.skills import load_taxonomy_index

    ingest_results = {
        "CV-A": {"extracted_skills": ["Python", "FastAPI"], "embedding": [1.0, 0.0]},
    }
    jd_embeddings_expanded = {
        "JD-01": [1.0, 0.0],  # same direction as CV-A -> cosine distance 0
        "JD-02": [0.0, 1.0],  # orthogonal -> cosine distance 1
    }
    jds_by_id = {
        "JD-01": {"jd_id": "JD-01", "taxonomy_skills": ["Python", "FastAPI"]},
        "JD-02": {"jd_id": "JD-02", "taxonomy_skills": ["React"]},
    }

    ranked = rank_jds_for_cv("CV-A", ingest_results, jd_embeddings_expanded, jds_by_id, load_taxonomy_index())

    assert ranked[0] == "JD-01"
    assert set(ranked) == {"JD-01", "JD-02"}


def test_rank_jds_for_cv_returns_every_jd_exactly_once():
    from backend.app.services.matching.skills import load_taxonomy_index

    ingest_results = {"CV-A": {"extracted_skills": [], "embedding": [1.0, 0.0, 0.0]}}
    jd_embeddings_expanded = {
        "JD-01": [1.0, 0.0, 0.0],
        "JD-02": [0.0, 1.0, 0.0],
        "JD-03": [0.0, 0.0, 1.0],
    }
    jds_by_id = {
        jd_id: {"jd_id": jd_id, "taxonomy_skills": []} for jd_id in jd_embeddings_expanded
    }

    ranked = rank_jds_for_cv("CV-A", ingest_results, jd_embeddings_expanded, jds_by_id, load_taxonomy_index())

    assert sorted(ranked) == ["JD-01", "JD-02", "JD-03"]
    assert len(ranked) == len(set(ranked)) == 3


def test_transpose_qrels_flips_jd_cv_axes():
    qrels = {
        "JD-01": {
            "CV-A": {"grade": 2, "reason": "x", "is_own_jd": True},
            "CV-B": {"grade": 0, "reason": "y", "is_own_jd": False},
        },
        "JD-02": {
            "CV-A": {"grade": 1, "reason": "z", "is_own_jd": False},
            "CV-B": {"grade": 2, "reason": "w", "is_own_jd": True},
        },
    }

    by_cv = transpose_qrels(qrels)

    assert by_cv == {
        "CV-A": {"JD-01": 2, "JD-02": 1},
        "CV-B": {"JD-01": 0, "JD-02": 2},
    }
