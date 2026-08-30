# Router cung cấp API số liệu thống kê công khai cho Landing Page
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends

from backend.app.api.schemas.stats import LandingStatsResponse
from backend.app.clients.supabase import get_supabase_client
from backend.app.observability.logger import get_logger
from supabase import Client

router = APIRouter(prefix="/stats", tags=["stats"])
logger = get_logger(__name__)


def _fetch_landing_stats_from_db(client: Client) -> dict[str, Any]:
    # 1. Thử gọi hàm RPC get_landing_stats đã được tối ưu trong cơ sở dữ liệu
    try:
        rpc_result = client.rpc("get_landing_stats", {}).execute()
        if rpc_result.data and isinstance(rpc_result.data, dict):
            return rpc_result.data
    except Exception as rpc_err:
        logger.warning("Không thể gọi RPC get_landing_stats, chuyển sang đếm trực tiếp bảng: %s", rpc_err)

    # 2. Cơ chế fallback: Truy vấn đếm trực tiếp từng bảng qua Supabase client
    jobs_count = 0
    candidates_count = 0
    companies_count = 0
    total_apps = 0
    successful_apps = 0
    success_rate = 0

    try:
        # Đếm tin tuyển dụng đang mở
        jobs_res = client.table("job_posts").select("id", count="exact").eq("status", "published").execute()
        jobs_count = jobs_res.count if jobs_res.count is not None else len(jobs_res.data or [])
    except Exception as e:
        logger.warning("Lỗi đếm job_posts: %s", e)

    try:
        # Đếm ứng viên đã đăng ký
        cand_res = client.table("profiles").select("id", count="exact").eq("role", "candidate").execute()
        candidates_count = cand_res.count if cand_res.count is not None else len(cand_res.data or [])
        if candidates_count == 0:
            all_prof = client.table("profiles").select("id", count="exact").neq("role", "admin").execute()
            candidates_count = all_prof.count if all_prof.count is not None else len(all_prof.data or [])
    except Exception as e:
        logger.warning("Lỗi đếm profiles: %s", e)

    try:
        # Đếm công ty đối tác
        comp_res = client.table("companies").select("id", count="exact").eq("verification_status", "verified").execute()
        companies_count = comp_res.count if comp_res.count is not None else len(comp_res.data or [])
        if companies_count == 0:
            all_comp = client.table("companies").select("id", count="exact").execute()
            companies_count = all_comp.count if all_comp.count is not None else len(all_comp.data or [])
    except Exception as e:
        logger.warning("Lỗi đếm companies: %s", e)

    try:
        # Đếm đơn ứng tuyển và tính tỷ lệ thành công
        apps_res = client.table("job_submits").select("current_status").execute()
        apps_data = apps_res.data or []
        total_apps = len(apps_data)
        if total_apps > 0:
            successful_apps = sum(1 for a in apps_data if a.get("current_status") in ("offer", "accepted"))
            success_rate = round((successful_apps / total_apps) * 100)
    except Exception as e:
        logger.warning("Lỗi tính tỷ lệ đơn ứng tuyển job_submits: %s", e)

    return {
        "jobs_count": jobs_count,
        "candidates_count": candidates_count,
        "companies_count": companies_count,
        "success_rate": success_rate,
        "total_applications": total_apps,
        "successful_applications": successful_apps,
    }


@router.get("/landing", response_model=LandingStatsResponse)
async def get_landing_stats(
    client: Client = Depends(get_supabase_client),
) -> LandingStatsResponse:
    """Lấy số liệu thống kê thực tế cho trang Landing Page (công khai)."""
    try:
        data = await asyncio.to_thread(_fetch_landing_stats_from_db, client)
        return LandingStatsResponse(
            jobs_count=int(data.get("jobs_count", 0)),
            candidates_count=int(data.get("candidates_count", 0)),
            companies_count=int(data.get("companies_count", 0)),
            success_rate=int(data.get("success_rate", 0)),
            total_applications=int(data.get("total_applications", 0)),
            successful_applications=int(data.get("successful_applications", 0)),
        )
    except Exception as err:
        logger.error("Lỗi khi lấy số liệu thống kê landing page: %s", err)
        # Trả về kết quả mặc định an toàn nếu có lỗi
        return LandingStatsResponse()
