from fastapi import APIRouter

from backend.app.api.routes import admin, candidates, chat, evaluation, health, profiles, resumes, stats
from backend.app.api.v1 import evaluations, interviews

# Khởi tạo API router v1 và đăng ký các sub-router
router = APIRouter()
router.include_router(health.router)
router.include_router(stats.router)
router.include_router(profiles.router)
router.include_router(chat.router)
router.include_router(candidates.router)
router.include_router(resumes.router)
router.include_router(evaluation.router)
router.include_router(admin.router)
router.include_router(evaluations.router)
router.include_router(interviews.router)

