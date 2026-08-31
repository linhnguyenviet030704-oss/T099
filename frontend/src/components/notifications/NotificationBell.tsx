import { useState, useEffect, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  listNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
  type Notification,
} from '@/lib/api-notifications';

/** NotificationBell - Hiển thị số thông báo chưa đọc + dropdown.
 *
 * Subscribe Supabase Realtime để nhận notification mới real-time.
 * User được resolve từ supabase.auth (không dùng biến userId cứng).
 */
export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Lấy session từ supabase auth
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
      setUserId(data.session?.user?.id ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!token || !userId) return;
    try {
      const data = await listNotifications(token, 1, 0);
      setUnreadCount(data.unread_count);
    } catch {
      // ignore
    }
  }, [token, userId]);

  // Subscribe Supabase Realtime cho notifications
  useEffect(() => {
    if (!supabase || !userId) return;

    fetchUnreadCount();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          setUnreadCount((prev) => prev + 1);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Refresh count khi có update (mark read)
          fetchUnreadCount();
        },
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [userId, fetchUnreadCount]);

  const handleOpen = async () => {
    if (!isOpen) {
      setIsOpen(true);
      if (!token) return;
      setLoading(true);
      try {
        const data = await listNotifications(token, 20, 0);
        setNotifications(data.items);
        setUnreadCount(data.unread_count);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    } else {
      setIsOpen(false);
    }
  };

  const handleNotificationClick = async (notif: Notification) => {
    if (!token) return;
    // Mark as read + navigate
    try {
      await markNotificationsRead(token, [notif.id]);
    } catch {
      // ignore
    }
    setUnreadCount((prev) => Math.max(0, prev - 1));
    if (notif.link_url && notif.link_url.startsWith('/')) {
      window.location.href = notif.link_url;
    }
    setIsOpen(false);
  };

  const handleMarkAllRead = async () => {
    if (!token) return;
    try {
      await markAllNotificationsRead(token);
      setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true })),
      );
    } catch {
      // ignore
    }
  };

  if (!userId) return null;

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
        aria-label={`Thông báo (${unreadCount} chưa đọc)`}
      >
        <Bell size={20} className="text-slate-600 dark:text-slate-300" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute right-0 mt-1.5 w-80 bg-white dark:bg-slate-800 shadow-xl rounded-xl z-50 border border-slate-200 dark:border-slate-700 max-h-[480px] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center flex-shrink-0">
              <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                Thông báo
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Đánh dấu tất cả đã đọc
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {loading ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  Đang tải...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">
                  Không có thông báo mới
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`px-4 py-3 border-b border-slate-50 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors ${
                      !notif.is_read
                        ? 'bg-blue-50/50 dark:bg-indigo-900/20'
                        : ''
                    }`}
                    onClick={() => handleNotificationClick(notif)}
                  >
                    <div className="flex items-start gap-2">
                      {!notif.is_read && (
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-xs text-slate-800 dark:text-slate-100 leading-tight">
                          {notif.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                          {notif.message}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {new Date(notif.created_at).toLocaleString('vi-VN', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
