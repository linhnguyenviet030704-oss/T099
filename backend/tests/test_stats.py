# Kiểm thử cho endpoint thống kê Landing Page GET /api/v1/stats/landing
from __future__ import annotations

from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from backend.app.clients.supabase import get_supabase_client
from backend.app.main import app


class TestLandingStatsEndpoint:
    # Kiểm tra endpoint trả về mã 200 và cấu trúc dữ liệu chính xác khi RPC hoạt động
    def test_get_landing_stats_rpc_success(self):
        mock_supabase = MagicMock()
        mock_rpc_exec = MagicMock()
        mock_rpc_exec.data = {
            "jobs_count": 15,
            "candidates_count": 80,
            "companies_count": 10,
            "success_rate": 85,
            "total_applications": 20,
            "successful_applications": 17,
        }
        mock_supabase.rpc.return_value.execute.return_value = mock_rpc_exec

        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase

        try:
            client = TestClient(app)
            response = client.get("/api/v1/stats/landing")
            assert response.status_code == 200
            data = response.json()
            assert data["jobs_count"] == 15
            assert data["candidates_count"] == 80
            assert data["companies_count"] == 10
            assert data["success_rate"] == 85
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)

    # Kiểm tra cơ chế fallback khi RPC thất bại và truy vấn đếm trực tiếp bảng
    def test_get_landing_stats_fallback_table_counts(self):
        mock_supabase = MagicMock()
        # Giả lập RPC gặp lỗi
        mock_supabase.rpc.side_effect = Exception("RPC function not found")

        # Mock các lệnh table select count
        mock_table = MagicMock()
        mock_select = MagicMock()
        mock_table.select.return_value = mock_select
        mock_select.eq.return_value.execute.return_value = MagicMock(count=12, data=[])
        mock_select.execute.return_value = MagicMock(
            count=5,
            data=[
                {"current_status": "offer"},
                {"current_status": "accepted"},
                {"current_status": "rejected"},
                {"current_status": "pending"},
            ],
        )

        mock_supabase.table.return_value = mock_table

        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase

        try:
            client = TestClient(app)
            response = client.get("/api/v1/stats/landing")
            assert response.status_code == 200
            data = response.json()
            assert "jobs_count" in data
            assert "candidates_count" in data
            assert "companies_count" in data
            assert "success_rate" in data
        finally:
            app.dependency_overrides.pop(get_supabase_client, None)
