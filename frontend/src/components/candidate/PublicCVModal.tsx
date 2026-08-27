import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, AlertCircle, Clock, Check, X, Loader2 } from "lucide-react";
import Button from "../ui/Button";

interface PublicCVModalProps {
  isOpen: boolean;
  cvTitle: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isSubmitting?: boolean;
}

export default function PublicCVModal({
  isOpen,
  cvTitle,
  onClose,
  onConfirm,
  isSubmitting = false,
}: PublicCVModalProps) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(5);
      return;
    }
    setCountdown(5);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  const canConfirm = countdown === 0 && !isSubmitting;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={isSubmitting ? undefined : onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm cursor-pointer"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-700/80 overflow-hidden z-10 p-6 sm:p-7"
          >
            {/* Header Icon */}
            <div className="flex items-center justify-between mb-5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner">
                <Globe size={24} className="animate-pulse" />
              </div>
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Công khai CV - Đang tìm việc
                </h3>
                <span className="text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-full font-semibold">
                  Đang tìm việc
                </span>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                CV đang chọn: <span className="text-slate-700 dark:text-slate-200 font-semibold">{cvTitle}</span>
              </p>

              {/* Exact Requested Message */}
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex gap-3 text-amber-900 dark:text-amber-200 text-sm leading-relaxed shadow-sm">
                <AlertCircle size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">Xác nhận công khai hồ sơ</p>
                  <p className="text-slate-700 dark:text-slate-300">
                    Nhà tuyển dụng có thể nhìn thấy CV của bạn, kể cả khi bạn không ứng tuyển, bạn đồng ý chứ?
                  </p>
                </div>
              </div>

              {/* Countdown Progress indicator */}
              {!isSubmitting && countdown > 0 && (
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 px-1 pt-1">
                  <Clock size={14} className="text-indigo-500 animate-spin" style={{ animationDuration: "3s" }} />
                  <span>Vui lòng đọc kỹ thông tin, nút đồng ý sẽ mở sau <strong className="text-indigo-600 dark:text-indigo-400 font-bold">{countdown}s</strong></span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                Hủy
              </Button>

              <button
                onClick={() => void onConfirm()}
                disabled={!canConfirm}
                className={`px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 shadow-md ${
                  isSubmitting
                    ? "bg-emerald-600/80 text-white cursor-wait opacity-90"
                    : canConfirm
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer hover:shadow-emerald-500/25 scale-100"
                    : "bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-80"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Đang xác nhận...</span>
                  </>
                ) : canConfirm ? (
                  <>
                    <Check size={16} strokeWidth={2.5} />
                    <span>Đồng ý</span>
                  </>
                ) : (
                  <>
                    <Clock size={16} />
                    <span>Đồng ý ({countdown}s)</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
