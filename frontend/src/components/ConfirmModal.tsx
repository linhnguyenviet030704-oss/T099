import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { useLang } from "../context/LangContext";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useLang();
  const finalConfirmLabel = confirmLabel || t.confirm;
  const finalCancelLabel = cancelLabel || t.cancel;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded-xl ${danger ? "bg-red-100 dark:bg-red-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
                <AlertTriangle size={20} className={danger ? "text-red-600" : "text-amber-600"} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
              </div>
              <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button
                type="button"
                disabled={isLoading}
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                {finalCancelLabel}
              </button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                disabled={isLoading}
                onClick={onConfirm}
                className={`px-4 py-2 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-50 ${
                  danger
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {finalConfirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
