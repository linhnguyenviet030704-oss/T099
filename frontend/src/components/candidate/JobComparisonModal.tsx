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
  ExternalLink,
  Loader2,
  RefreshCw,
  MapPin,
  DollarSign,
  FileText,
  Building2,
  Calendar,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { apiJson } from "../../lib/api";
import { formatCurrency, formatDate, ENUM_LABELS } from "../../lib/format";
import type { CompareJobsResponse, ComparedJob } from "../../types";

interface JobComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobIds: string[];
  resumeId?: string | null;
  resumes?: { id: string; title: string; is_default?: boolean }[];
}

const JOB_THEMES = [
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
    description: "Mức độ khớp giữa số năm và tính chất kinh nghiệm của bạn so với yêu cầu JD",
  },
  {
    key: "hard_skills" as const,
    label: "Kỹ năng chuyên môn",
    shortLabel: "Kỹ năng cứng",
    icon: Cpu,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/40",
    description: "Mức độ bạn sở hữu các kỹ năng cứng và công nghệ mà JD yêu cầu",
  },
  {
    key: "education" as const,
    label: "Học vấn & Chứng chỉ",
    shortLabel: "Học vấn",
    icon: GraduationCap,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
    description: "Sự đáp ứng của bạn về bằng cấp, chứng chỉ và nền tảng đào tạo chuyên môn",
  },
  {
    key: "overall_fit" as const,
    label: "Độ phù hợp tổng thể",
    shortLabel: "Phù hợp chung",
    icon: Target,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/40",
    description: "Khả năng bạn có thể đảm nhận tốt và phát triển xuất sắc ở vị trí công việc này",
  },
];

const LOADING_STEPS = [
  "Ẩn danh hóa CV (PII Redaction) để bảo mật thông tin cá nhân...",
  "Trích xuất mô tả & yêu cầu cốt lõi của các việc làm...",
  "Chuyên gia AI Career Advisor đối chiếu và chấm điểm 4 tiêu chí...",
  "Tổng hợp biểu đồ so sánh trực quan đa chiều...",
];

export const JobComparisonModal: React.FC<JobComparisonModalProps> = ({
  isOpen,
  onClose,
  jobIds,
  resumeId,
  resumes = [],
}) => {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"column" | "radar" | "line" | "matrix">("column");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CompareJobsResponse | null>(null);
  const [hoveredJob, setHoveredJob] = useState<string | null>(null);
  const [activeResumeId, setActiveResumeId] = useState<string | null>(resumeId || null);

  useEffect(() => {
    if (resumeId) {
      setActiveResumeId(resumeId);
    } else if (resumes.length > 0 && !activeResumeId) {
      const def = resumes.find((r) => r.is_default);
      setActiveResumeId(def?.id || resumes[0]?.id || null);
    }
  }, [resumeId, resumes]);

  // Fetch comparison data
  const runComparison = async (overrideResumeId?: string | null) => {
    if (!session?.access_token || jobIds.length < 2) return;

    try {
      setLoading(true);
      setError(null);
      setLoadingStep(0);

      const targetResume = overrideResumeId !== undefined ? overrideResumeId : activeResumeId;

      const res = await apiJson<CompareJobsResponse>(
        "/jobs/compare",
        session.access_token,
        {
          method: "POST",
          body: JSON.stringify({
            job_ids: jobIds,
            resume_id: targetResume || undefined,
          }),
        }
      );

      setData(res);

      if (res.resume_id) {
        setActiveResumeId(res.resume_id);
      }
    } catch (err: any) {
      setError(err?.message || "Không thể so sánh việc làm. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  // Trigger comparison when modal opens or jobIds change
  useEffect(() => {
    if (isOpen && jobIds.length >= 2) {
      void runComparison();
    } else if (!isOpen) {
      setData(null);
      setError(null);
    }
  }, [isOpen, jobIds.join(",")]);

  // Loading animation step timer
  useEffect(() => {
    let timer: any;
    if (loading) {
      timer = setInterval(() => {
        setLoadingStep((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
      }, 1500);
    }
    return () => clearInterval(timer);
  }, [loading]);

  const jobs = useMemo(() => data?.jobs || [], [data]);
  const topJob = useMemo(
    () => (data?.top_job_id ? jobs.find((j) => j.job_id === data.top_job_id) || jobs[0] : jobs[0]),
    [data, jobs]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 20 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white">
                  So sánh trực quan việc làm AI
                </h2>
                <span className="bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                  {jobIds.length} vị trí
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                AI Career Advisor đối chiếu năng lực CV với yêu cầu từng vị trí để chấm điểm và phân tích đa chiều
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end">
            {/* CV Switcher */}
            {resumes.length > 1 && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 shadow-sm">
                <FileText size={13} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="text-[11px] text-slate-400 shrink-0">CV:</span>
                <select
                  value={activeResumeId || ""}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setActiveResumeId(newId);
                    void runComparison(newId);
                  }}
                  disabled={loading}
                  className="bg-transparent border-0 text-xs font-semibold text-slate-900 dark:text-white focus:ring-0 focus:outline-none cursor-pointer max-w-[140px] truncate"
                >
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                      {r.title || "CV của bạn"} {r.is_default ? "(Mặc định)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => void runComparison()}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
              title="Phân tích lại"
            >
              <RefreshCw size={16} className={loading ? "animate-spin text-indigo-600" : ""} />
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* View Mode Navigation Tabs */}
        {!loading && !error && data && jobs.length > 0 && (
          <div className="px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4 overflow-x-auto shrink-0">
            <div className="flex items-center gap-1.5">
              {[
                { id: "column" as const, label: "Biểu đồ cột", icon: BarChart3 },
                { id: "radar" as const, label: "Biểu đồ mạng nhện", icon: RadarIcon },
                { id: "line" as const, label: "Biểu đồ đường", icon: LineChartIcon },
                { id: "matrix" as const, label: "Bảng ma trận so sánh", icon: TableIcon },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon size={14} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Quick Job Badges Legend */}
            <div className="hidden sm:flex items-center gap-2 overflow-x-auto no-scrollbar">
              {jobs.map((job, idx) => {
                const theme = JOB_THEMES[idx % JOB_THEMES.length];
                const isHovered = hoveredJob === job.job_id;
                return (
                  <div
                    key={job.job_id}
                    onMouseEnter={() => setHoveredJob(job.job_id)}
                    onMouseLeave={() => setHoveredJob(null)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                      isHovered ? "ring-2 ring-indigo-400 scale-105" : ""
                    } ${theme.bgSoft} ${theme.borderSoft} ${theme.textClass}`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full ${theme.bgClass} text-white flex items-center justify-center text-[9px] font-bold`}
                    >
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="font-semibold truncate max-w-[120px]" title={job.title}>
                      {job.title}
                    </span>
                    <span className="text-[10px] opacity-80 font-bold">({job.average_score}/10)</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Loading State */}
          {loading && (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/60 border-2 border-indigo-500 flex items-center justify-center text-indigo-600 animate-pulse">
                  <Sparkles size={28} className="text-purple-500 animate-spin" />
                </div>
                <Loader2 size={36} className="absolute inset-0 m-auto text-indigo-500 animate-spin opacity-40" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-slate-800 dark:text-slate-200">
                  AI Career Advisor đang phân tích & so sánh các việc làm...
                </h3>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-1 transition-all">
                  {LOADING_STEPS[loadingStep]}
                </p>
              </div>
              {/* Progress bar */}
              <div className="w-64 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"
                  initial={{ width: "15%" }}
                  animate={{ width: `${(loadingStep + 1) * 25}%` }}
                  transition={{ duration: 0.5 }}
                />
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
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-medium hover:bg-red-700 transition-colors"
              >
                Thử lại
              </button>
            </div>
          )}

          {/* Main Content Display */}
          {!loading && !error && data && jobs.length > 0 && (
            <>
              {/* Top Job Recommendation Banner */}
              {topJob && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-amber-50 via-orange-50 to-indigo-50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-indigo-950/30 border border-amber-200/80 dark:border-amber-800/60 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm"
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                      <Trophy size={24} className="text-white" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded-md">
                          Việc làm phù hợp nhất #1
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white">{topJob.title}</h4>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {data.summary ||
                          `Vị trí '${topJob.title}' đạt điểm trung bình cao nhất (${topJob.average_score}/10) với sự phù hợp vượt trội về kỹ năng và kinh nghiệm.`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">Điểm đánh giá AI</p>
                      <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                        {topJob.average_score}
                        <span className="text-xs text-slate-400">/10</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate(`/jobs/${topJob.job_id}`);
                      }}
                      className="px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl flex items-center gap-1.5 shadow-md shadow-orange-500/20 transition-all cursor-pointer"
                    >
                      <span>Xem tin & Ứng tuyển</span>
                      <ExternalLink size={13} />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Tab Views */}
              <AnimatePresence mode="wait">
                {/* 1. COLUMN / BAR CHART TAB */}
                {activeTab === "column" && (
                  <motion.div
                    key="column"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm">
                      <div className="mb-6">
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                          <BarChart3 size={16} className="text-indigo-600" />
                          Biểu đồ cột so sánh 4 tiêu chí phù hợp (Thang điểm 10)
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Điểm số do AI Career Advisor đánh giá khách quan dựa trên CV đối chiếu với JD từng công việc
                        </p>
                      </div>

                      {/* Grouped Columns Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {METRIC_DEFINITIONS.map((metric) => {
                          const Icon = metric.icon;
                          return (
                            <div
                              key={metric.key}
                              className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/60 rounded-xl p-4 flex flex-col justify-between"
                            >
                              <div className="flex items-center gap-2 mb-3">
                                <div className={`p-1.5 rounded-lg ${metric.bgColor} ${metric.color}`}>
                                  <Icon size={15} />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                    {metric.shortLabel}
                                  </p>
                                  <p className="text-[10px] text-slate-400">Thang 10</p>
                                </div>
                              </div>

                              {/* Bars Canvas */}
                              <div className="h-44 flex items-end justify-around gap-2 px-1 pb-2 border-b border-slate-200 dark:border-slate-700 relative">
                                {/* Horizontal grid reference line at 5 and 10 */}
                                <div className="absolute inset-x-0 bottom-1/2 border-b border-dashed border-slate-200 dark:border-slate-700 pointer-events-none opacity-60" />
                                <div className="absolute inset-x-0 top-0 border-b border-dashed border-slate-200 dark:border-slate-700 pointer-events-none opacity-60" />

                                {jobs.map((job, idx) => {
                                  const theme = JOB_THEMES[idx % JOB_THEMES.length];
                                  const scoreVal = job.metrics[metric.key].score;
                                  const heightPct = Math.min(100, Math.max(8, (scoreVal / 10) * 100));
                                  const isHovered = hoveredJob === job.job_id;

                                  return (
                                    <div
                                      key={job.job_id}
                                      onMouseEnter={() => setHoveredJob(job.job_id)}
                                      onMouseLeave={() => setHoveredJob(null)}
                                      className="flex-1 flex flex-col items-center h-full justify-end group/bar relative cursor-pointer"
                                    >
                                      {/* Tooltip on Hover */}
                                      <div className="absolute bottom-full mb-2 hidden group-hover/bar:flex flex-col items-center z-30 pointer-events-none w-48">
                                        <div className="bg-slate-900 text-white text-[11px] p-2.5 rounded-xl shadow-xl border border-slate-700 space-y-1">
                                          <div className="flex items-center justify-between font-bold">
                                            <span className="truncate">{job.title}</span>
                                            <span className="text-amber-400">{scoreVal}/10</span>
                                          </div>
                                          <p className="text-[10px] text-slate-300 font-normal leading-tight">
                                            {job.metrics[metric.key].reason}
                                          </p>
                                        </div>
                                        <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1" />
                                      </div>

                                      {/* Score label above bar */}
                                      <span
                                        className={`text-[10px] font-bold mb-1 transition-all ${
                                          isHovered ? "scale-110 " + theme.textClass : "text-slate-600 dark:text-slate-400"
                                        }`}
                                      >
                                        {scoreVal}
                                      </span>

                                      {/* Animated Bar */}
                                      <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: `${heightPct}%` }}
                                        transition={{ duration: 0.6, delay: idx * 0.1 }}
                                        className={`w-full max-w-[28px] rounded-t-lg transition-all ${
                                          isHovered
                                            ? `${theme.bgClass} ring-2 ring-indigo-400 shadow-md`
                                            : `${theme.bgClass} opacity-80 group-hover/bar:opacity-100`
                                        }`}
                                      />

                                      {/* Job Letter Label */}
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

                {/* 2. RADAR CHART TAB */}
                {activeTab === "radar" && (
                  <motion.div
                    key="radar"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
                      <div className="mb-4">
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                          <RadarIcon size={16} className="text-indigo-600" />
                          Biểu đồ mạng nhện (Radar Chart) so sánh năng lực đa chiều
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Trực quan hóa hình đa giác so sánh mức độ đáp ứng 4 tiêu chí giữa các vị trí việc làm
                        </p>
                      </div>

                      {/* SVG Radar */}
                      <div className="flex flex-col lg:flex-row items-center justify-center gap-8 py-4">
                        <div className="relative w-72 h-72 sm:w-84 sm:h-84 shrink-0">
                          <svg viewBox="0 0 300 300" className="w-full h-full overflow-visible">
                            {/* Concentric circles */}
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

                            {/* Axes */}
                            <line x1="150" y1="40" x2="150" y2="260" stroke="currentColor" className="text-slate-200 dark:text-slate-700" />
                            <line x1="40" y1="150" x2="260" y2="150" stroke="currentColor" className="text-slate-200 dark:text-slate-700" />

                            {/* Labels */}
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

                            {/* Polygons */}
                            {jobs.map((job, idx) => {
                              const theme = JOB_THEMES[idx % JOB_THEMES.length];
                              const isHovered = hoveredJob === job.job_id;

                              const expR = (job.metrics.experience.score / 10) * 110;
                              const skillR = (job.metrics.hard_skills.score / 10) * 110;
                              const eduR = (job.metrics.education.score / 10) * 110;
                              const fitR = (job.metrics.overall_fit.score / 10) * 110;

                              const p1 = { x: 150, y: 150 - expR };
                              const p2 = { x: 150 + skillR, y: 150 };
                              const p3 = { x: 150, y: 150 + eduR };
                              const p4 = { x: 150 - fitR, y: 150 };

                              const pointsString = `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`;

                              return (
                                <g
                                  key={job.job_id}
                                  onMouseEnter={() => setHoveredJob(job.job_id)}
                                  onMouseLeave={() => setHoveredJob(null)}
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

                        {/* Breakdown Cards */}
                        <div className="flex-1 space-y-2.5 max-w-md w-full">
                          {jobs.map((job, idx) => {
                            const theme = JOB_THEMES[idx % JOB_THEMES.length];
                            const isHovered = hoveredJob === job.job_id;

                            return (
                              <div
                                key={job.job_id}
                                onMouseEnter={() => setHoveredJob(job.job_id)}
                                onMouseLeave={() => setHoveredJob(null)}
                                className={`p-3 rounded-xl border transition-all ${
                                  isHovered
                                    ? "ring-2 ring-indigo-400 bg-slate-50 dark:bg-slate-800"
                                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2 truncate">
                                    <span
                                      className={`w-5 h-5 rounded-full ${theme.bgClass} text-white text-xs font-bold flex items-center justify-center shrink-0`}
                                    >
                                      {String.fromCharCode(65 + idx)}
                                    </span>
                                    <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                      {job.title}
                                    </span>
                                  </div>
                                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                                    {job.average_score}/10
                                  </span>
                                </div>

                                <div className="grid grid-cols-4 gap-1 text-[10px] text-center">
                                  <div className="bg-slate-50 dark:bg-slate-800 p-1 rounded-lg">
                                    <span className="text-slate-400 block">K.Nghiệm</span>
                                    <b className="text-slate-700 dark:text-slate-300">{job.metrics.experience.score}</b>
                                  </div>
                                  <div className="bg-slate-50 dark:bg-slate-800 p-1 rounded-lg">
                                    <span className="text-slate-400 block">K.Năng</span>
                                    <b className="text-slate-700 dark:text-slate-300">{job.metrics.hard_skills.score}</b>
                                  </div>
                                  <div className="bg-slate-50 dark:bg-slate-800 p-1 rounded-lg">
                                    <span className="text-slate-400 block">Học vấn</span>
                                    <b className="text-slate-700 dark:text-slate-300">{job.metrics.education.score}</b>
                                  </div>
                                  <div className="bg-slate-50 dark:bg-slate-800 p-1 rounded-lg">
                                    <span className="text-slate-400 block">Phù hợp</span>
                                    <b className="text-slate-700 dark:text-slate-300">{job.metrics.overall_fit.score}</b>
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

                {/* 3. LINE CHART TAB */}
                {activeTab === "line" && (
                  <motion.div
                    key="line"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
                      <div className="mb-4">
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                          <LineChartIcon size={16} className="text-indigo-600" />
                          Biểu đồ đường (Trend Line) so sánh xu hướng điểm số
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Đường biểu diễn mức độ vượt trội qua 4 tiêu chí cốt lõi
                        </p>
                      </div>

                      {/* SVG Line Graph */}
                      <div className="h-64 sm:h-72 w-full py-4">
                        <svg viewBox="0 0 500 200" className="w-full h-full overflow-visible">
                          {/* Grid horizontal lines for scores 2, 4, 6, 8, 10 */}
                          {[2, 4, 6, 8, 10].map((score) => {
                            const y = 180 - (score / 10) * 150;
                            return (
                              <g key={score}>
                                <line
                                  x1="50"
                                  y1={y}
                                  x2="470"
                                  y2={y}
                                  stroke="currentColor"
                                  className="text-slate-100 dark:text-slate-800"
                                  strokeDasharray="4 4"
                                />
                                <text x="40" y={y + 3} textAnchor="end" className="fill-slate-400 text-[8px]">
                                  {score}
                                </text>
                              </g>
                            );
                          })}

                          {/* X-axis labels: 4 metrics */}
                          {["Kinh nghiệm", "Kỹ năng cứng", "Học vấn", "Phù hợp chung"].map((label, idx) => {
                            const x = 70 + idx * 130;
                            return (
                              <text
                                key={label}
                                x={x}
                                y="195"
                                textAnchor="middle"
                                className="fill-slate-600 dark:fill-slate-400 text-[9px] font-semibold"
                              >
                                {label}
                              </text>
                            );
                          })}

                          {/* Lines per Job */}
                          {jobs.map((job, idx) => {
                            const theme = JOB_THEMES[idx % JOB_THEMES.length];
                            const isHovered = hoveredJob === job.job_id;

                            const scores = [
                              job.metrics.experience.score,
                              job.metrics.hard_skills.score,
                              job.metrics.education.score,
                              job.metrics.overall_fit.score,
                            ];

                            const points = scores.map((sc, scIdx) => ({
                              x: 70 + scIdx * 130,
                              y: 180 - (sc / 10) * 150,
                              score: sc,
                            }));

                            const pathD = points.reduce(
                              (acc, pt, pIdx) => (pIdx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`),
                              ""
                            );

                            return (
                              <g
                                key={job.job_id}
                                onMouseEnter={() => setHoveredJob(job.job_id)}
                                onMouseLeave={() => setHoveredJob(null)}
                                className="cursor-pointer transition-all"
                              >
                                <motion.path
                                  initial={{ pathLength: 0 }}
                                  animate={{ pathLength: 1 }}
                                  transition={{ duration: 0.8, delay: idx * 0.15 }}
                                  d={pathD}
                                  fill="none"
                                  stroke={theme.color}
                                  strokeWidth={isHovered ? 4 : 2.5}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="transition-all"
                                />

                                {/* Dots */}
                                {points.map((pt, pIdx) => (
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
                    </div>
                  </motion.div>
                )}

                {/* 4. MATRIX TABLE TAB */}
                {activeTab === "matrix" && (
                  <motion.div
                    key="matrix"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                      <div className="p-5 border-b border-slate-200 dark:border-slate-700">
                        <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                          <TableIcon size={16} className="text-indigo-600" />
                          Bảng ma trận so sánh chi tiết công việc
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Đối chiếu trực tiếp từng tiêu chí, mức lương, địa điểm và nhận xét chuyên môn từ AI
                        </p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left border-collapse min-w-[650px]">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
                              <th className="p-3.5 font-bold text-slate-600 dark:text-slate-300 w-44">
                                Tiêu chí đối chiếu
                              </th>
                              {jobs.map((job, idx) => {
                                const theme = JOB_THEMES[idx % JOB_THEMES.length];
                                return (
                                  <th key={job.job_id} className="p-3.5 font-bold text-slate-900 dark:text-white min-w-[200px]">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={`w-4 h-4 rounded-full ${theme.bgClass} text-white text-[10px] font-bold flex items-center justify-center`}
                                      >
                                        {String.fromCharCode(65 + idx)}
                                      </span>
                                      <span className="truncate">{job.title}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                                      {job.company?.name || "Công ty đối tác"}
                                    </p>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {/* Row: Rank & Score */}
                            <tr className="bg-amber-50/30 dark:bg-amber-950/10">
                              <td className="p-3.5 font-bold text-slate-700 dark:text-slate-300">Xếp hạng & Điểm AI</td>
                              {jobs.map((job) => (
                                <td key={job.job_id} className="p-3.5">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                        job.rank === 1
                                          ? "bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-300"
                                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                                      }`}
                                    >
                                      Top #{job.rank}
                                    </span>
                                    <span className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                                      {job.average_score}/10
                                    </span>
                                  </div>
                                </td>
                              ))}
                            </tr>

                            {/* Row: Salary */}
                            <tr>
                              <td className="p-3.5 font-medium text-slate-500 dark:text-slate-400">
                                <div className="flex items-center gap-1.5">
                                  <DollarSign size={13} className="text-emerald-500" />
                                  <span>Mức lương</span>
                                </div>
                              </td>
                              {jobs.map((job) => (
                                <td key={job.job_id} className="p-3.5 font-semibold text-emerald-600 dark:text-emerald-400">
                                  {job.salary_min || job.salary_max
                                    ? `${formatCurrency(job.salary_min, job.currency)} - ${formatCurrency(
                                        job.salary_max,
                                        job.currency
                                      )}`
                                    : "Thoả thuận"}
                                </td>
                              ))}
                            </tr>

                            {/* Row: Location */}
                            <tr>
                              <td className="p-3.5 font-medium text-slate-500 dark:text-slate-400">
                                <div className="flex items-center gap-1.5">
                                  <MapPin size={13} className="text-slate-400" />
                                  <span>Địa điểm</span>
                                </div>
                              </td>
                              {jobs.map((job) => (
                                <td key={job.job_id} className="p-3.5 text-slate-700 dark:text-slate-300">
                                  {job.location || "Toàn quốc"}
                                </td>
                              ))}
                            </tr>

                            {/* Row: Employment Type */}
                            <tr>
                              <td className="p-3.5 font-medium text-slate-500 dark:text-slate-400">
                                <div className="flex items-center gap-1.5">
                                  <Building2 size={13} className="text-slate-400" />
                                  <span>Hình thức</span>
                                </div>
                              </td>
                              {jobs.map((job) => (
                                <td key={job.job_id} className="p-3.5 text-slate-700 dark:text-slate-300">
                                  {ENUM_LABELS.employment_type[job.employment_type as keyof typeof ENUM_LABELS.employment_type] ||
                                    job.employment_type ||
                                    "Toàn thời gian"}
                                </td>
                              ))}
                            </tr>

                            {/* Metric Rows */}
                            {METRIC_DEFINITIONS.map((metric) => {
                              const Icon = metric.icon;
                              return (
                                <tr key={metric.key}>
                                  <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300 align-top">
                                    <div className="flex items-center gap-1.5">
                                      <Icon size={14} className={metric.color} />
                                      <span>{metric.label}</span>
                                    </div>
                                  </td>
                                  {jobs.map((job) => {
                                    const m = job.metrics[metric.key];
                                    return (
                                      <td key={job.job_id} className="p-3.5 align-top space-y-1.5">
                                        <div className="flex items-center justify-between">
                                          <span className="font-bold text-slate-800 dark:text-slate-200">
                                            {m.score}/10
                                          </span>
                                        </div>
                                        <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                          <div
                                            className="bg-indigo-600 h-full rounded-full"
                                            style={{ width: `${m.score * 10}%` }}
                                          />
                                        </div>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                                          {m.reason}
                                        </p>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}

                            {/* Actions Row */}
                            <tr className="bg-slate-50/50 dark:bg-slate-900/50">
                              <td className="p-3.5 font-medium text-slate-500 dark:text-slate-400">Thao tác</td>
                              {jobs.map((job) => (
                                <td key={job.job_id} className="p-3.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onClose();
                                      navigate(`/jobs/${job.job_id}`);
                                    }}
                                    className="w-full py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 font-semibold text-xs rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <span>Xem chi tiết</span>
                                    <ExternalLink size={12} />
                                  </button>
                                </td>
                              ))}
                            </tr>
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
      </motion.div>
    </div>
  );
};

export default JobComparisonModal;
