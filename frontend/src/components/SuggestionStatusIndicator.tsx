import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

export type StatusStep = {
  step: string;
  label: string;
  timestamp?: number;
};

interface SuggestionStatusIndicatorProps {
  currentLabel: string;
  steps: StatusStep[];
  isGenerating: boolean;
  theme?: "candidate" | "recruiter";
}

export default function SuggestionStatusIndicator({
  currentLabel,
  steps,
  isGenerating,
  theme = "candidate",
}: SuggestionStatusIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  const isRecruiter = theme === "recruiter";
  const primaryBg = isRecruiter ? "bg-purple-50 dark:bg-purple-950/40" : "bg-indigo-50 dark:bg-indigo-950/40";
  const primaryBorder = isRecruiter ? "border-purple-200 dark:border-purple-800" : "border-indigo-200 dark:border-indigo-800";
  const primaryText = isRecruiter ? "text-purple-700 dark:text-purple-300" : "text-indigo-700 dark:text-indigo-300";
  const badgeBg = isRecruiter ? "bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200" : "bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className={`rounded-2xl border ${primaryBorder} ${primaryBg} p-3.5 mb-2 shadow-xs transition-all`}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-6 h-6 rounded-lg ${badgeBg} flex items-center justify-center shrink-0`}>
            {isGenerating ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <CheckCircle2 size={13} className="text-emerald-500" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold ${primaryText} truncate`}>
                {currentLabel || (isGenerating ? "AI đang xử lý..." : "Hoàn tất")}
              </span>
              {isGenerating && (
                <span className="flex h-1.5 w-1.5 relative shrink-0">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isRecruiter ? "bg-purple-400" : "bg-indigo-400"}`} />
                  <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isRecruiter ? "bg-purple-500" : "bg-indigo-500"}`} />
                </span>
              )}
            </div>
          </div>
        </div>

        {steps.length > 1 && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <span>{steps.length} bước</span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      {/* Expandable Step History */}
      <AnimatePresence>
        {expanded && steps.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1.5 overflow-hidden"
          >
            {steps.map((s, idx) => {
              const isLast = idx === steps.length - 1;
              return (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  {isLast && isGenerating ? (
                    <Loader2 size={11} className={`animate-spin shrink-0 ${isRecruiter ? "text-purple-500" : "text-indigo-500"}`} />
                  ) : (
                    <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                  )}
                  <span className={isLast ? "font-medium text-slate-800 dark:text-slate-200" : "text-slate-500 dark:text-slate-400"}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
