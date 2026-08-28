import React, { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  X,
  Trophy,
  BarChart3,
  Radar as RadarIcon,
  LineChart as LineChartIcon,
  Table as TableIcon,
  Briefcase,
  GraduationCap,
  Cpu,
  Target,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Award,
} from "lucide-react";
import { useAuth } from "../../auth/AuthProvider";
import { apiJson, apiStream, type StreamEvent } from "../../lib/api";
import { getResumeSignedUrl } from "../../lib/storage";
import SuggestionStatusIndicator, { type StatusStep } from "../SuggestionStatusIndicator";
import type { CompareCandidatesResponse, ComparedCandidate } from "../../types";

interface CVComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle?: string;
  applicationIds: string[];
}

const CANDIDATE_THEMES = [
  {
    name: "A",
    color: "#6366F1", // Indigo
    bgClass: "bg-indigo-500",
    textClass: "text-indigo-600 dark:text-indigo-400",
    borderClass: "border-indigo-400",
    bgSoft: "bg-indigo-50 dark:bg-indigo-950/40",
    borderSoft: "border-indigo-200 dark:border-indigo-800",
    badge: "bg-indigo-600 text-white",
  },
  {
    name: "B",
    color: "#10B981", // Emerald
    bgClass: "bg-emerald-500",
    textClass: "text-emerald-600 dark:text-emerald-400",
    borderClass: "border-emerald-400",
    bgSoft: "bg-emerald-50 dark:bg-emerald-950/40",
    borderSoft: "border-emerald-200 dark:border-emerald-800",
    badge: "bg-emerald-600 text-white",
  },
  {
    name: "C",
    color: "#F59E0B", // Amber
    bgClass: "bg-amber-500",
    textClass: "text-amber-600 dark:text-amber-400",
    borderClass: "border-amber-400",
    bgSoft: "bg-amber-50 dark:bg-amber-950/40",
    borderSoft: "border-amber-200 dark:border-amber-800",
    badge: "bg-amber-600 text-white",
  },
  {
    name: "D",
    color: "#8B5CF6", // Purple
    bgClass: "bg-purple-500",
    textClass: "text-purple-600 dark:text-purple-400",
    borderClass: "border-purple-400",
    bgSoft: "bg-purple-50 dark:bg-purple-950/40",
    borderSoft: "border-purple-200 dark:border-purple-800",
    badge: "bg-purple-600 text-white",
  },
  {
    name: "E",
    color: "#F43F5E", // Rose
    bgClass: "bg-rose-500",
    textClass: "text-rose-600 dark:text-rose-400",
    borderClass: "border-rose-400",
    bgSoft: "bg-rose-50 dark:bg-rose-950/40",
    borderSoft: "border-rose-200 dark:border-rose-800",
    badge: "bg-rose-600 text-white",
  },
];

const METRIC_DEFINITIONS = [
  {
    key: "experience" as const,
    label: "Kinh nghiệm làm việc",
    shortLabel: "Kinh nghiệm",
    icon: Briefcase,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/40",
    description: "Độ dài thời gian và tính liên quan của kinh nghiệm so với JD",
  },
  {
    key: "hard_skills" as const,
    label: "Kỹ năng chuyên môn",
    shortLabel: "Kỹ năng cứng",
    icon: Cpu,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/40",
    description: "Mức độ đáp ứng các kỹ năng cứng mà JD yêu cầu",
  },
  {
    key: "education" as const,
    label: "Học vấn & Chứng chỉ",
    shortLabel: "Học vấn",
    icon: GraduationCap,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
    description: "Bằng cấp, chứng chỉ và nền tảng đào tạo chuyên môn",
  },
  {
    key: "overall_fit" as const,
    label: "Độ phù hợp tổng thể",
    shortLabel: "Phù hợp chung",
    icon: Target,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/40",
    description: "Khả năng đáp ứng yêu cầu công việc và văn hóa công ty",
  },
];

const LOADING_STEPS = [
  "Ẩn danh hóa CV (PII Redaction) để bảo mật thông tin...",
  "Trích xuất yêu cầu cốt lõi & tiêu chí đánh giá từ JD...",
  "Chuyên gia AI phân tích và chấm điểm khách quan 4 tiêu chí...",
  "Tổng hợp biểu đồ so sánh trực quan đa chiều...",
];

export const CVComparisonModal: React.FC<CVComparisonModalProps> = ({
  isOpen,
  onClose,
  jobId,
  jobTitle,
  applicationIds,
}) => {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<"column" | "radar" | "line" | "matrix">("column");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CompareCandidatesResponse | null>(null);
  const [hoveredCandidate, setHoveredCandidate] = useState<string | null>(null);

  // Streaming real-time status steps
  const [streamingSteps, setStreamingSteps] = useState<StatusStep[]>([]);
  const [currentStatusLabel, setCurrentStatusLabel] = useState<string>("");

  // Fetch comparison data
  const runComparison = async () => {
    if (!session?.access_token || !jobId || applicationIds.length < 2) return;
    setLoading(true);
    setError(null);
    setStreamingSteps([]);
    setCurrentStatusLabel("Khởi tạo so sánh ứng viên...");

    try {
      let completedData: CompareCandidatesResponse | null = null;

      await apiStream<CompareCandidatesResponse>(
        "/candidates/compare/stream",
        session.access_token,
        {
          job_id: jobId,
          application_ids: applicationIds,
        },
        (event: StreamEvent<CompareCandidatesResponse>) => {
          if (event.event === "status") {
            setCurrentStatusLabel(event.data.label);
            setStreamingSteps((prev) => {
              const exists = prev.some((s) => s.step === event.data.step && s.label === event.data.label);
              if (exists) return prev;
              return [...prev, { step: event.data.step, label: event.data.label, timestamp: Date.now() }];
            });
          } else if (event.event === "complete") {
            completedData = event.data as unknown as CompareCandidatesResponse;
          } else if (event.event === "error") {
            throw new Error(event.data.error || "Không thể so sánh CV lúc này");
          }
        }
      );

      if (!completedData) {
        completedData = await apiJson<CompareCandidatesResponse>(
          "/candidates/compare",
          session.access_token,
          {
            method: "POST",
            body: JSON.stringify({
              job_id: jobId,
              application_ids: applicationIds,
            }),
          }
        );
      }

      setData(completedData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không thể so sánh CV lúc này.");
    } finally {
      setLoading(false);
      setStreamingSteps([]);
      setCurrentStatusLabel("");
    }
  };

  useEffect(() => {
    if (isOpen && applicationIds.length >= 2) {
      void runComparison();
    } else {
      setData(null);
      setError(null);
    }
  }, [isOpen, jobId, applicationIds]);

  const candidates = data?.candidates || [];
  const topCandidate = useMemo(() => {
    if (!candidates.length) return null;
    return candidates.reduce((prev, curr) => (curr.total_score > prev.total_score ? curr : prev), candidates[0]);
  }, [candidates]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/70 backdrop-blur-md transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
          className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] z-10"
        >
          {/* Header */}
          <div className="px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-indigo-50/70 via-purple-50/50 to-pink-50/40 dark:from-slate-800/80 dark:via-indigo-950/30 dark:to-slate-800/80 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0">
                <Sparkles size={20} className="text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    So sánh trực quan CV ứng viên
                  </h2>
                  <span className="bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                    AI HR Expert
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-md">
                  Vị trí: <b className="text-slate-700 dark:text-slate-200">{data?.job_title || jobTitle || "Vị trí tuyển dụng"}</b> ({applicationIds.length} ứng viên)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void runComparison()}
                disabled={loading}
                className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-white/80 dark:hover:bg-slate-800 transition-colors"
                title="Đánh giá lại"
              >
                <RefreshCw size={16} className={loading ? "animate-spin text-indigo-600" : ""} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800 transition-colors"
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Navigation / Tabs Bar */}
          <div className="px-6 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* View Selector Tabs */}
            <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl">
              {[
                { id: "column" as const, label: "Biểu đồ Cột", icon: BarChart3 },
                { id: "radar" as const, label: "Biểu đồ Mạng nhện", icon: RadarIcon },
                { id: "line" as const, label: "Biểu đồ Đường", icon: LineChartIcon },
                { id: "matrix" as const, label: "Bảng so sánh chi tiết", icon: TableIcon },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                      active
                        ? "bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm font-semibold"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    <Icon size={14} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Candidate Legends */}
            {candidates.length > 0 && !loading && (
              <div className="flex items-center gap-2 flex-wrap">
                {candidates.map((cand, idx) => {
                  const theme = CANDIDATE_THEMES[idx % CANDIDATE_THEMES.length];
                  return (
                    <div
                      key={cand.application_id}
                      onMouseEnter={() => setHoveredCandidate(cand.application_id)}
                      onMouseLeave={() => setHoveredCandidate(null)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                        hoveredCandidate === cand.application_id
                          ? "ring-2 ring-indigo-400 scale-105"
                          : ""
                      } ${theme.bgSoft} ${theme.borderSoft} ${theme.textClass}`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full ${theme.bgClass} text-white flex items-center justify-center text-[9px] font-bold`}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="font-semibold truncate max-w-[110px]">
                        {cand.full_name || cand.anonymous_label}
                      </span>
                      <span className="text-[10px] opacity-75 font-bold">({cand.average_score}/10)</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Loading State */}
            {loading && (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 max-w-lg mx-auto w-full">
                <div className="w-full">
                  <SuggestionStatusIndicator
                    currentLabel={currentStatusLabel || "AI đang so sánh và chấm điểm CV..."}
                    steps={streamingSteps}
                    isGenerating={true}
                    theme="recruiter"
                  />
                </div>
                <div className="text-center space-y-1">
                  <h3 className="font-display font-bold text-base text-slate-800 dark:text-slate-200">
                    AI đang so sánh và chấm điểm khách quan hồ sơ ứng viên
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md">
                    Ẩn danh hóa thông tin PII, đối chiếu kỹ năng & kinh nghiệm với tiêu chuẩn JD để xếp hạng đa chiều.
                  </p>
                </div>
              </div>
            )}

            {/* Error State */}
            {!loading && error && (
              <div className="p-8 text-center bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">Đã xảy ra lỗi khi so sánh</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mb-4">{error}</p>
                <button
                  type="button"
                  onClick={() => void runComparison()}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-medium hover:bg-red-700"
                >
                  Thử lại
                </button>
              </div>
            )}

            {/* Content Display */}
            {!loading && !error && data && candidates.length > 0 && (
              <>
                {/* Highlights Banner */}
                {topCandidate && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-r from-amber-50 via-orange-50 to-indigo-50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-indigo-950/30 border border-amber-200/80 dark:border-amber-800/60 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                        <Trophy size={20} className="text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded-md">
                            Ứng viên nổi bật nhất #1
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {topCandidate.full_name || topCandidate.anonymous_label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                          {data.summary || `Đạt điểm trung bình cao nhất (${topCandidate.average_score}/10) với sự phù hợp vượt trội theo yêu cầu JD.`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Điểm trung bình</p>
                        <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                          {topCandidate.average_score}<span className="text-xs text-slate-400">/10</span>
                        </p>
                      </div>
                      {topCandidate.resume_storage_path && (
                        <button
                          type="button"
                          onClick={() =>
                            void getResumeSignedUrl(topCandidate.resume_storage_path!).then((url) =>
                              window.open(url, "_blank")
                            )
                          }
                          className="px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-100/80 dark:bg-amber-900/50 hover:bg-amber-200 rounded-xl flex items-center gap-1 transition-colors"
                        >
                          <ExternalLink size={12} /> Xem CV
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Tab Views */}
                <AnimatePresence mode="wait">
                  {activeTab === "column" && (
                    <motion.div
                      key="column"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-6"
                    >
                      {/* Grouped Column Chart */}
                      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                              <BarChart3 size={16} className="text-indigo-600" />
                              Biểu đồ cột so sánh theo 4 tiêu chí (Thang điểm 10)
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Điểm số được AI HR Expert chấm khách quan dựa trên phân tích chi tiết hồ sơ với JD
                            </p>
                          </div>
                        </div>

                        {/* Chart Canvas */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          {METRIC_DEFINITIONS.map((metric) => {
                            const Icon = metric.icon;
                            return (
                              <div
                                key={metric.key}
                                className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/60 rounded-xl p-4 flex flex-col justify-between"
                              >
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200/60 dark:border-slate-800">
                                  <div className={`p-1.5 rounded-lg ${metric.bgColor} ${metric.color}`}>
                                    <Icon size={14} />
                                  </div>
                                  <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                                    {metric.shortLabel}
                                  </span>
                                </div>

                                {/* Bars in this metric cluster */}
                                <div className="h-44 flex items-end justify-center gap-2.5 px-2 pb-2">
                                  {candidates.map((cand, idx) => {
                                    const score = cand.metrics[metric.key].score;
                                    const heightPct = Math.max(10, (score / 10) * 100);
                                    const theme = CANDIDATE_THEMES[idx % CANDIDATE_THEMES.length];
                                    const isHovered = hoveredCandidate === cand.application_id;

                                    return (
                                      <div
                                        key={cand.application_id}
                                        onMouseEnter={() => setHoveredCandidate(cand.application_id)}
                                        onMouseLeave={() => setHoveredCandidate(null)}
                                        className="flex flex-col items-center flex-1 max-w-[42px] group relative h-full justify-end"
                                      >
                                        {/* Tooltip on hover */}
                                        <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute bottom-full mb-2 w-48 bg-slate-900 text-white text-[11px] rounded-xl p-2.5 shadow-xl z-30 transition-opacity leading-relaxed border border-slate-700">
                                          <p className="font-bold text-indigo-300">
                                            {cand.full_name || cand.anonymous_label}: {score}/10
                                          </p>
                                          <p className="text-slate-300 mt-1 text-[10px]">
                                            "{cand.metrics[metric.key].reason}"
                                          </p>
                                        </div>

                                        {/* Score Badge above bar */}
                                        <span className={`text-[11px] font-bold mb-1 transition-transform ${isHovered ? "scale-110 " + theme.textClass : "text-slate-600 dark:text-slate-300"}`}>
                                          {score}
                                        </span>

                                        {/* Animated Bar */}
                                        <motion.div
                                          initial={{ height: 0 }}
                                          animate={{ height: `${heightPct}%` }}
                                          transition={{ duration: 0.6, delay: idx * 0.1 }}
                                          style={{ backgroundColor: theme.color }}
                                          className={`w-full rounded-t-lg transition-all ${
                                            isHovered ? "brightness-110 shadow-lg" : "opacity-90"
                                          }`}
                                        />

                                        {/* Candidate Label Below Bar */}
                                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-1.5">
                                          {String.fromCharCode(65 + idx)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>

                                <p className="text-[10px] text-slate-400 text-center mt-2 truncate" title={metric.description}>
                                  {metric.description}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "radar" && (
                    <motion.div
                      key="radar"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-6"
                    >
                      {/* Radar / Spider Chart */}
                      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                              <RadarIcon size={16} className="text-indigo-600" />
                              Biểu đồ mạng nhện (Radar Chart) so sánh năng lực đa chiều
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Trực quan hóa sự cân bằng giữa Kinh nghiệm, Kỹ năng cứng, Học vấn và Độ phù hợp tổng thể
                            </p>
                          </div>
                        </div>

                        {/* SVG Radar */}
                        <div className="flex flex-col md:flex-row items-center justify-center gap-8 py-4">
                          <div className="relative w-72 h-72 sm:w-80 sm:h-80 shrink-0">
                            <svg viewBox="0 0 300 300" className="w-full h-full overflow-visible">
                              {/* Background concentric circles */}
                              {[2, 4, 6, 8, 10].map((level) => {
                                const r = (level / 10) * 110;
                                return (
                                  <circle
                                    key={level}
                                    cx="150"
                                    cy="150"
                                    r={r}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeDasharray="3 3"
                                    className="text-slate-200 dark:text-slate-700"
                                  />
                                );
                              })}

                              {/* Axis lines */}
                              <line x1="150" y1="40" x2="150" y2="260" stroke="currentColor" className="text-slate-200 dark:text-slate-700" />
                              <line x1="40" y1="150" x2="260" y2="150" stroke="currentColor" className="text-slate-200 dark:text-slate-700" />

                              {/* Axis Labels */}
                              <text x="150" y="24" textAnchor="middle" className="fill-slate-700 dark:fill-slate-300 text-[10px] font-bold">
                                Kinh nghiệm
                              </text>
                              <text x="272" y="154" textAnchor="start" className="fill-slate-700 dark:fill-slate-300 text-[10px] font-bold">
                                Kỹ năng cứng
                              </text>
                              <text x="150" y="284" textAnchor="middle" className="fill-slate-700 dark:fill-slate-300 text-[10px] font-bold">
                                Học vấn
                              </text>
                              <text x="28" y="154" textAnchor="end" className="fill-slate-700 dark:fill-slate-300 text-[10px] font-bold">
                                Phù hợp chung
                              </text>

                              {/* Candidate Polygons */}
                              {candidates.map((cand, idx) => {
                                const theme = CANDIDATE_THEMES[idx % CANDIDATE_THEMES.length];
                                const isHovered = hoveredCandidate === cand.application_id;

                                // 4 points: Top (experience), Right (hard_skills), Bottom (education), Left (overall_fit)
                                const expR = (cand.metrics.experience.score / 10) * 110;
                                const skillR = (cand.metrics.hard_skills.score / 10) * 110;
                                const eduR = (cand.metrics.education.score / 10) * 110;
                                const fitR = (cand.metrics.overall_fit.score / 10) * 110;

                                const p1 = { x: 150, y: 150 - expR };
                                const p2 = { x: 150 + skillR, y: 150 };
                                const p3 = { x: 150, y: 150 + eduR };
                                const p4 = { x: 150 - fitR, y: 150 };

                                const pointsString = `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`;

                                return (
                                  <g
                                    key={cand.application_id}
                                    onMouseEnter={() => setHoveredCandidate(cand.application_id)}
                                    onMouseLeave={() => setHoveredCandidate(null)}
                                    className="cursor-pointer transition-all"
                                  >
                                    <motion.polygon
                                      initial={{ opacity: 0, scale: 0.5 }}
                                      animate={{ opacity: isHovered ? 0.6 : 0.25, scale: 1 }}
                                      transition={{ duration: 0.5 }}
                                      points={pointsString}
                                      fill={theme.color}
                                      stroke={theme.color}
                                      strokeWidth={isHovered ? 3 : 2}
                                    />
                                    {/* Points */}
                                    {[p1, p2, p3, p4].map((pt, pIdx) => (
                                      <circle
                                        key={pIdx}
                                        cx={pt.x}
                                        cy={pt.y}
                                        r={isHovered ? 5 : 3.5}
                                        fill={theme.color}
                                        stroke="#ffffff"
                                        strokeWidth="1.5"
                                      />
                                    ))}
                                  </g>
                                );
                              })}
                            </svg>
                          </div>

                          {/* Radar Breakdown Cards */}
                          <div className="flex-1 space-y-2.5 max-w-md w-full">
                            {candidates.map((cand, idx) => {
                              const theme = CANDIDATE_THEMES[idx % CANDIDATE_THEMES.length];
                              const isHovered = hoveredCandidate === cand.application_id;

                              return (
                                <div
                                  key={cand.application_id}
                                  onMouseEnter={() => setHoveredCandidate(cand.application_id)}
                                  onMouseLeave={() => setHoveredCandidate(null)}
                                  className={`p-3 rounded-xl border transition-all ${
                                    isHovered
                                      ? "ring-2 ring-indigo-400 bg-slate-50 dark:bg-slate-800"
                                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className={`w-4 h-4 rounded-full ${theme.bgClass} text-white text-[10px] font-bold flex items-center justify-center`}>
                                        {String.fromCharCode(65 + idx)}
                                      </span>
                                      <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                                        {cand.full_name || cand.anonymous_label}
                                      </span>
                                    </div>
                                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                                      {cand.average_score}/10
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-4 gap-1 text-[10px] text-center">
                                    <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                                      <span className="text-slate-400 block text-[9px]">Kinh nghiệm</span>
                                      <b className="text-slate-700 dark:text-slate-300">{cand.metrics.experience.score}</b>
                                    </div>
                                    <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                                      <span className="text-slate-400 block text-[9px]">Kỹ năng</span>
                                      <b className="text-slate-700 dark:text-slate-300">{cand.metrics.hard_skills.score}</b>
                                    </div>
                                    <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                                      <span className="text-slate-400 block text-[9px]">Học vấn</span>
                                      <b className="text-slate-700 dark:text-slate-300">{cand.metrics.education.score}</b>
                                    </div>
                                    <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                                      <span className="text-slate-400 block text-[9px]">Phù hợp</span>
                                      <b className="text-slate-700 dark:text-slate-300">{cand.metrics.overall_fit.score}</b>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "line" && (
                    <motion.div
                      key="line"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-6"
                    >
                      {/* Metric Profile Line Chart */}
                      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                              <LineChartIcon size={16} className="text-indigo-600" />
                              Biểu đồ đường so sánh quỹ đạo điểm số (Score Trajectory)
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              So sánh trực quan biến động điểm số theo 4 tiêu chí giữa các ứng viên
                            </p>
                          </div>
                        </div>

                        {/* SVG Line Chart */}
                        <div className="relative h-64 w-full px-4">
                          <svg viewBox="0 0 600 200" className="w-full h-full overflow-visible">
                            {/* Horizontal grid lines */}
                            {[0, 2.5, 5, 7.5, 10].map((score) => {
                              const y = 180 - (score / 10) * 160;
                              return (
                                <g key={score}>
                                  <line x1="40" y1={y} x2="580" y2={y} stroke="currentColor" strokeDasharray="2 2" className="text-slate-200 dark:text-slate-700" />
                                  <text x="30" y={y + 3} textAnchor="end" className="fill-slate-400 text-[9px]">
                                    {score}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Metric X Axis Labels */}
                            {METRIC_DEFINITIONS.map((m, idx) => {
                              const x = 70 + idx * 160;
                              return (
                                <text key={m.key} x={x} y="195" textAnchor="middle" className="fill-slate-700 dark:fill-slate-300 text-[10px] font-bold">
                                  {m.shortLabel}
                                </text>
                              );
                            })}

                            {/* Candidate Lines */}
                            {candidates.map((cand, idx) => {
                              const theme = CANDIDATE_THEMES[idx % CANDIDATE_THEMES.length];
                              const isHovered = hoveredCandidate === cand.application_id;

                              const points = METRIC_DEFINITIONS.map((m, mIdx) => {
                                const x = 70 + mIdx * 160;
                                const score = cand.metrics[m.key].score;
                                const y = 180 - (score / 10) * 160;
                                return { x, y, score, name: m.shortLabel };
                              });

                              const d = points.reduce((acc, pt, pIdx) => `${acc} ${pIdx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`, "");

                              return (
                                <g
                                  key={cand.application_id}
                                  onMouseEnter={() => setHoveredCandidate(cand.application_id)}
                                  onMouseLeave={() => setHoveredCandidate(null)}
                                  className="cursor-pointer"
                                >
                                  <motion.path
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 0.8, delay: idx * 0.1 }}
                                    d={d}
                                    fill="none"
                                    stroke={theme.color}
                                    strokeWidth={isHovered ? 4 : 2.5}
                                    className="transition-all"
                                  />
                                  {points.map((pt, pIdx) => (
                                    <g key={pIdx} className="group/pt relative">
                                      <circle
                                        cx={pt.x}
                                        cy={pt.y}
                                        r={isHovered ? 6 : 4.5}
                                        fill={theme.color}
                                        stroke="#ffffff"
                                        strokeWidth="2"
                                        className="transition-all"
                                      />
                                      <text
                                        x={pt.x}
                                        y={pt.y - 8}
                                        textAnchor="middle"
                                        className={`text-[9px] font-bold fill-slate-800 dark:fill-slate-200 ${isHovered ? "opacity-100" : "opacity-0"}`}
                                      >
                                        {pt.score}
                                      </text>
                                    </g>
                                  ))}
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "matrix" && (
                    <motion.div
                      key="matrix"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-6"
                    >
                      {/* Matrix Comparison Table */}
                      <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                                <th className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400 w-52 shrink-0">
                                  Tiêu chí đánh giá
                                </th>
                                {candidates.map((cand, idx) => {
                                  const theme = CANDIDATE_THEMES[idx % CANDIDATE_THEMES.length];
                                  const isTop = cand.rank === 1;

                                  return (
                                    <th key={cand.application_id} className="p-4 text-xs min-w-[200px]">
                                      <div className="flex items-center gap-2">
                                        <span className={`w-5 h-5 rounded-full ${theme.bgClass} text-white flex items-center justify-center font-bold text-[10px]`}>
                                          {String.fromCharCode(65 + idx)}
                                        </span>
                                        <div className="truncate">
                                          <p className="font-bold text-slate-900 dark:text-white truncate">
                                            {cand.full_name || cand.anonymous_label}
                                          </p>
                                          <p className="text-[10px] text-slate-400 truncate">{cand.email || "—"}</p>
                                        </div>
                                        {isTop && (
                                          <span className="p-1 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300 ml-auto shrink-0" title="Top 1">
                                            <Award size={14} />
                                          </span>
                                        )}
                                      </div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                              {/* Overall Score Row */}
                              <tr className="bg-indigo-50/40 dark:bg-indigo-950/20 font-semibold">
                                <td className="p-4 text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                                  <Trophy size={14} className="text-amber-500 shrink-0" />
                                  <span>Điểm tổng kết (Thang 10)</span>
                                </td>
                                {candidates.map((cand) => (
                                  <td key={cand.application_id} className="p-4">
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">
                                        {cand.average_score}
                                      </span>
                                      <span className="text-[10px] text-slate-400">/10 (Hạng #{cand.rank})</span>
                                    </div>
                                    {/* Mini Progress */}
                                    <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-1.5">
                                      <div
                                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full"
                                        style={{ width: `${cand.average_score * 10}%` }}
                                      />
                                    </div>
                                  </td>
                                ))}
                              </tr>

                              {/* 4 Metric Rows */}
                              {METRIC_DEFINITIONS.map((metric) => {
                                const Icon = metric.icon;
                                return (
                                  <tr key={metric.key} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                                    <td className="p-4 align-top">
                                      <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                                        <div className={`p-1 rounded-md ${metric.bgColor} ${metric.color}`}>
                                          <Icon size={12} />
                                        </div>
                                        <span>{metric.label}</span>
                                      </div>
                                      <span className="text-[10px] text-slate-400 block mt-1 leading-snug">
                                        {metric.description}
                                      </span>
                                    </td>

                                    {candidates.map((cand) => {
                                      const mData = cand.metrics[metric.key];
                                      return (
                                        <td key={cand.application_id} className="p-4 align-top space-y-1.5">
                                          <div className="flex items-center gap-2">
                                            <span className="font-bold text-xs px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                                              {mData.score}/10
                                            </span>
                                            {mData.score >= 8.5 && (
                                              <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                                                <CheckCircle2 size={11} /> Xuất sắc
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed italic bg-slate-50/80 dark:bg-slate-900/50 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                                            "{mData.reason}"
                                          </p>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Sparkles size={12} className="text-purple-600 dark:text-purple-400" />
              Đánh giá được tạo tự động bởi AI HR Expert dựa trên CV đã ẩn danh PII.
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl font-medium bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
            >
              Đóng
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
export default CVComparisonModal;
