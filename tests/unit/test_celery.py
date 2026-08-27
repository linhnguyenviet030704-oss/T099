import pytest


def test_celery_app_exists():
    from backend.app.core.celery_app import celery_app

    assert celery_app is not None
    assert celery_app.main == "recruitment"


def test_celery_config_includes_task_modules():
    from backend.app.core.celery_app import celery_app

    included = celery_app.conf.include
    assert "backend.app.tasks.eval_tasks" in included
    assert "backend.app.tasks.interview_tasks" in included


def test_celery_serializers():
    from backend.app.core.celery_app import celery_app

    assert celery_app.conf.task_serializer == "json"
    assert celery_app.conf.result_serializer == "json"
    assert celery_app.conf.accept_content == ["json"]


def test_celery_task_acks_late_and_prefetch():
    from backend.app.core.celery_app import celery_app

    assert celery_app.conf.task_acks_late is True
    assert celery_app.conf.worker_prefetch_multiplier == 1
