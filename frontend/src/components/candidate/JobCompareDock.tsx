import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, Briefcase, Trash2, ArrowRight, FileText, ChevronDown } from "lucide-react";

export interface SelectedJobItem {
  id: string;
  title: string;
  companyName?: string;
  logoUrl?: string | null;
}

export interface CandidateResumeOption {
  id: string;
  title: string;
  is_default?: boolean;
}

interface JobCompareDockProps {
  selectedJobs: SelectedJobItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onCompare: () => void;
  isComparing?: boolean;
  resumes?: CandidateResumeOption[];
  selectedResumeId?: string | null;
  onSelectResume?: (resumeId: string) => void;
  maxAllowed?: number;
}

const JOB_LETTER_COLORS = [
  "bg-indigo-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-purple-600",
  "bg-rose-600",
];

export const JobCompareDock: React.FC<JobCompareDockProps> = ({
  selectedJobs,
  onRemove,
  onClear,
  onCompare,
  isComparing = false,
  resumes = [],
  selectedResumeId,
  onSelectResume,
  maxAllowed = 5,
}) => {
  const count = selectedJobs.length;
  const isReady = count >= 2 && count <= maxAllowed;

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 80, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="fixed bottom-6 inset-x-0 z-40 max-w-5xl mx-auto px-4 pointer-events-none"
        >
          <div className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-2 border-indigo-500/30 dark:border-indigo-400/30 rounded-2xl p-3.5 shadow-2xl shadow-indigo-500/10 dark:shadow-indigo-950/40 flex flex-col lg:flex-row items-center justify-between gap-3">
            {/* Left: Counter & Job Chips */}
            <div className="flex items-center gap-2.5 overflow-x-auto w-full lg:w-auto py-1">
              <div className="flex items-center gap-1.5 shrink-0 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold text-xs px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800">
                <Briefcase size={14} className="shrink-0" />
                <span>
                  Đã chọn: <b className="text-indigo-900 dark:text-indigo-100">{count}</b>/{maxAllowed}
                </span>
              </div>

              {/* Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {selectedJobs.map((job, idx) => (
                  <motion.div
                    key={job.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-xl text-xs text-slate-800 dark:text-slate-200 font-medium shrink-0 max-w-[170px]"
                  >
                    <span
                      className={`w-4 h-4 rounded-full ${
                        JOB_LETTER_COLORS[idx % JOB_LETTER_COLORS.length]
                      } text-[10px] text-white flex items-center justify-center font-bold shrink-0`}
                    >
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="truncate" title={job.title}>
                      {job.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(job.id)}
                      className="p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-full transition-colors shrink-0"
                      title="Bỏ chọn việc làm"
                    >
                      <X size={12} />
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Right: CV Selector & Actions */}
            <div className="flex items-center gap-2.5 w-full lg:w-auto justify-end shrink-0">
              {/* CV Selector */}
              {resumes.length > 0 && onSelectResume && (
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300">
                  <FileText size={13} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">Đối chiếu:</span>
                  <select
                    value={selectedResumeId || (resumes.find((r) => r.is_default)?.id || resumes[0]?.id)}
                    onChange={(e) => onSelectResume(e.target.value)}
                    className="bg-transparent border-0 text-xs font-semibold text-slate-900 dark:text-white focus:ring-0 focus:outline-none cursor-pointer max-w-[130px] truncate"
                  >
                    {resumes.map((r) => (
                      <option key={r.id} value={r.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                        {r.title || "CV của bạn"} {r.is_default ? "(Mặc định)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Clear button */}
              <button
                type="button"
                onClick={onClear}
                className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-1"
                title="Bỏ chọn tất cả"
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">Bỏ chọn</span>
              </button>

              {/* Compare Button */}
              <motion.button
                type="button"
                whileHover={isReady ? { scale: 1.02 } : {}}
                whileTap={isReady ? { scale: 0.98 } : {}}
                onClick={onCompare}
                disabled={!isReady || isComparing}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md transition-all ${
                  isReady
                    ? "bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 text-white shadow-indigo-500/25 cursor-pointer ring-2 ring-indigo-400/40"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                }`}
              >
                <Sparkles size={14} className={isReady ? "text-amber-300 animate-pulse" : ""} />
                <span>
                  {isComparing
                    ? "Đang phân tích..."
                    : count < 2
                    ? `Chọn thêm ${2 - count} việc`
                    : "So sánh trực quan (AI)"}
                </span>
                {isReady && <ArrowRight size={13} className="ml-0.5" />}
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default JobCompareDock;
