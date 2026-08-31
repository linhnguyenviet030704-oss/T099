"""Internal endpoints (chỉ dùng cho cron job, xác thực qua secret header)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel

from backend.app.config.env import settings
from backend.app.observability.logger import get_logger
from supabase import Client

logger = get_logger(__name__)
router = APIRouter(prefix="/internal", tags=["internal"])


class AutoRejectResponse(BaseModel):
    success: bool
    rejected_count: int
    applications: list[dict[str, Any]] = []


@router.post("/cron/auto-reject-expired", response_model=AutoRejectResponse)
def trigger_auto_reject_expired(
    x_cron_secret: str = Header(..., description="Cron secret key"),
    batch_size: int = 100,
    client: Client = Depends(lambda: None),  # placeholder, replaced below
) -> AutoRejectResponse:
    """Trigger auto-reject expired applications. Được gọi bởi cron job.

    Auth: header `X-Cron-Secret` phải khớp `settings.cron_secret`.
    """
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid cron secret",
        )

    # Lazy import để tránh circular
    from backend.app.clients.supabase import get_supabase_client

    db = get_supabase_client()
    result = db.rpc(
        "auto_reject_expired_applications",
        {"p_batch_size": batch_size},
    ).execute()
    data = result.data if isinstance(result.data, list) else []
    logger.info("Auto-rejected %d expired applications", len(data))
    return AutoRejectResponse(
        success=True,
        rejected_count=len(data),
        applications=data,
    )
