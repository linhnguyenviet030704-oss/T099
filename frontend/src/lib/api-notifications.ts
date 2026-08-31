/** API helpers cho notification endpoints. */

import { apiJson } from './api';

export interface Notification {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  link_url: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListResponse {
  items: Notification[];
  unread_count: number;
  total: number;
}

/** Lấy danh sách notifications của user hiện tại. */
export async function listNotifications(
  token: string,
  limit = 20,
  offset = 0,
): Promise<NotificationListResponse> {
  return apiJson<NotificationListResponse>(
    `/notifications?limit=${limit}&offset=${offset}`,
    token,
  );
}

/** Đánh dấu đã đọc một số notifications. */
export async function markNotificationsRead(
  token: string,
  ids: string[],
): Promise<{ updated_count: number }> {
  return apiJson<{ updated_count: number }>(
    '/notifications/mark-read',
    token,
    {
      method: 'POST',
      body: JSON.stringify({ notification_ids: ids }),
    },
  );
}

/** Đánh dấu tất cả notifications là đã đọc. */
export async function markAllNotificationsRead(
  token: string,
): Promise<{ updated_count: number }> {
  return apiJson<{ updated_count: number }>(
    '/notifications/mark-all-read',
    token,
    { method: 'POST' },
  );
}
