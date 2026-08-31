from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from backend.app.services.notification_service import NotificationService


@pytest.mark.asyncio
async def test_list_for_user():
    """Lấy danh sách thông báo và số lượng chưa đọc của người dùng."""
    user_id = uuid4()
    notif_id1 = uuid4()
    notif_id2 = uuid4()

    repo = AsyncMock()
    repo.list_for_user.return_value = [
        {
            "id": str(notif_id1),
            "notification_type": "application_submitted",
            "title": "CV mới",
            "message": "Có ứng viên nộp CV",
            "link_url": "/applications/1",
            "metadata": {},
            "is_read": False,
            "read_at": None,
            "created_at": "2026-08-30T10:00:00Z",
        },
        {
            "id": str(notif_id2),
            "notification_type": "application_status_changed",
            "title": "Cập nhật đơn",
            "message": "Đã đổi sang phỏng vấn",
            "link_url": "/applications/2",
            "metadata": {},
            "is_read": True,
            "read_at": "2026-08-30T10:30:00Z",
            "created_at": "2026-08-30T10:00:00Z",
        },
    ]
    repo.count_unread.return_value = 1
    repo.count_total.return_value = 2

    service = NotificationService(repo)
    result = await service.list_for_user(user_id, limit=20, offset=0)

    assert len(result.items) == 2
    assert result.unread_count == 1
    assert result.total == 2
    assert result.items[0].id == notif_id1
    assert result.items[0].is_read is False
    assert result.items[1].is_read is True


@pytest.mark.asyncio
async def test_mark_as_read():
    """Đánh dấu danh sách thông báo đã đọc."""
    user_id = uuid4()
    notif_ids = [uuid4(), uuid4()]

    repo = AsyncMock()
    repo.mark_as_read.return_value = 2

    service = NotificationService(repo)
    result = await service.mark_as_read(user_id, notif_ids)

    assert result.updated_count == 2
    repo.mark_as_read.assert_called_once_with(user_id, notif_ids)


@pytest.mark.asyncio
async def test_mark_all_read():
    """Đánh dấu tất cả thông báo của người dùng là đã đọc."""
    user_id = uuid4()

    repo = AsyncMock()
    repo.mark_all_read.return_value = 5

    service = NotificationService(repo)
    result = await service.mark_all_read(user_id)

    assert result.updated_count == 5
    repo.mark_all_read.assert_called_once_with(user_id)
