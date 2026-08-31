import { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Gọi khi user xác nhận. sendEmail = giá trị checkbox gửi email. */
  onConfirm: (sendEmail: boolean) => Promise<void>;
  candidateName: string;
  newStatus: string;
  loading?: boolean;
}

/** Modal xác nhận đổi trạng thái application.
 *
 * Yêu cầu 2 checkboxes:
 * 1. Xác nhận đổi trạng thái (bắt buộc)
 * 2. Gửi email thông báo cho ứng viên (tùy chọn)
 */
export function ApplicationStatusModal({
  isOpen,
  onClose,
  onConfirm,
  candidateName,
  newStatus,
  loading = false,
}: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusLabels: Record<string, string> = {
    screening: 'sàng lọc',
    interview: 'mời phỏng vấn',
    offer: 'đề xuất công việc',
    accepted: 'chấp nhận',
    rejected: 'từ chối',
    withdrawn: 'rút đơn',
  };

  const statusLabel = statusLabels[newStatus] ?? newStatus;

  const handleConfirm = async () => {
    if (!confirmed) {
      setError('Vui lòng xác nhận đổi trạng thái');
      return;
    }
    setError(null);
    try {
      await onConfirm(sendEmail);
      // Reset state khi modal đóng thành công
      setConfirmed(false);
      setSendEmail(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
    }
  };

  const handleClose = () => {
    if (!loading) {
      setConfirmed(false);
      setSendEmail(false);
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
          Xác nhận {statusLabel}
        </h2>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
          Bạn đang chuyển trạng thái ứng viên{' '}
          <strong>{candidateName}</strong> sang{' '}
          <strong>{statusLabel}</strong>.
        </p>

        <div className="space-y-3 mb-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
              disabled={loading}
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Tôi xác nhận đổi trạng thái này và hiểu rằng hành động không thể hoàn tác
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
              disabled={loading}
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Gửi email thông báo cho ứng viên
            </span>
          </label>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleConfirm}
            disabled={!confirmed || loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Đang xử lý...' : 'Xác nhận'}
          </button>
        </div>
      </div>
    </div>
  );
}
