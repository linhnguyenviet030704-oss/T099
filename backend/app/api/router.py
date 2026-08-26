from fastapi import APIRouter

from backend.app.api.routes import admin, candidates, chat, evaluation, health, profiles, resumes

router = APIRouter()
router.include_router(health.router)
router.include_router(profiles.router)
router.include_router(chat.router)
router.include_router(candidates.router)
router.include_router(resumes.router)
router.include_router(evaluation.router)
router.include_router(admin.router)
