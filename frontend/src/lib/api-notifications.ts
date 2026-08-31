/** API helpers cho notification endpoints (có fallback Supabase trực tiếp). */

import { apiJson } from './api';
import { supabase } from './supabase';

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
  // Ưu tiên truy vấn Supabase trực tiếp (đồng bộ realtime theo RLS)
  if (supabase) {
    const { data, error, count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (!error && data) {
      const { count: unreadCount } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);

      return {
        items: data as Notification[],
        unread_count: unreadCount ?? 0,
        total: count ?? data.length,
      };
    }
  }

  // Fallback sang API backend nếu có
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
  if (ids.length === 0) return { updated_count: 0 };

  if (supabase) {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', ids)
      .select('id');
    if (!error && data) {
      return { updated_count: data.length };
    }
  }

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
  if (supabase) {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('is_read', false)
      .select('id');
    if (!error && data) {
      return { updated_count: data.length };
    }
  }

  return apiJson<{ updated_count: number }>(
    '/notifications/mark-all-read',
    token,
    { method: 'POST' },
  );
}

