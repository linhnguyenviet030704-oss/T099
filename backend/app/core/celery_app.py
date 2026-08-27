import os

from celery import Celery

broker_url = os.environ.get("CELERY_BROKER_URL", "")
result_backend = os.environ.get("CELERY_RESULT_BACKEND", "")

celery_app = Celery(
    "recruitment",
    broker=broker_url,
    backend=result_backend,
    include=["backend.app.tasks.eval_tasks", "backend.app.tasks.interview_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)
