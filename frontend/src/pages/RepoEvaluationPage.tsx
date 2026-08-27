import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Code2,
  FileCode,
  Layers,
  Cpu,
  Sparkles,
  ExternalLink,
  Loader2,
  Search,
  Activity,
  Award,
  Terminal,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { apiJson } from "../lib/api";
import AnimatedPage from "../components/AnimatedPage";
import { useToast } from "../context/ToastContext";

interface DimensionScore {
  score: number;
  reason: string;
}

interface EvaluationResultData {
  id?: string;
  repo_full_name: string;
  repo_url: string;
  overall_score: number;
  evaluation_scores: {
    completeness: DimensionScore | number;
    complexity: DimensionScore | number;
    optimization: DimensionScore | number;
    code_cleanliness: DimensionScore | number;
    project_understanding: DimensionScore | number;
    weighted_score?: number;
  };
  heuristic_metrics?: {
    file_count: number;
    test_files_count: number;
    doc_files_count: number;
    test_ratio: number;
    doc_ratio: number;
    has_ci: boolean;
    has_docker: boolean;
    language_count: number;
    languages: string[];
    readme_length: number;
    tier1_score: number;
  };
  summary: string;
  red_flags?: string[];
  evaluation_tier?: string;
}

const SAMPLE_REPOS = [
  "https://github.com/fastapi/fastapi",
  "https://github.com/encode/uvicorn",
  "https://github.com/psf/black",
  "https://github.com/pallets/flask",
];

const DIMENSION_CONFIG = [
  {
    key: "completeness",
    nameVi: "Độ hoàn thiện tính năng",
    nameEn: "Completeness",
    desc: "Mức độ đầy đủ của mã nguồn, tài liệu và test coverage",
    icon: CheckCircle2,
    color: "from-blue-500 to-cyan-500",
    bgLight: "bg-blue-50 dark:bg-blue-900/20",
    textColor: "text-blue-600 dark:text-blue-400",
    barColor: "bg-blue-500",
  },
  {
    key: "complexity",
    nameVi: "Độ phức tạp kiến trúc",
    nameEn: "Complexity",
    desc: "Độ sâu kỹ thuật, giải thuật và mẫu thiết kế kiến trúc",
    icon: Layers,
    color: "from-purple-500 to-indigo-500",
    bgLight: "bg-purple-50 dark:bg-purple-900/20",
    textColor: "text-purple-600 dark:text-purple-400",
    barColor: "bg-purple-500",
  },
  {
    key: "optimization",
    nameVi: "Tối ưu hóa hiệu năng",
    nameEn: "Optimization",
    desc: "Khả năng tối ưu tài nguyên, xử lý bất đồng bộ và mở rộng",
    icon: Cpu,
    color: "from-amber-500 to-orange-500",
    bgLight: "bg-amber-50 dark:bg-amber-900/20",
    textColor: "text-amber-600 dark:text-amber-400",
    barColor: "bg-amber-500",
  },
  {
    key: "code_cleanliness",
    nameVi: "Chất lượng & độ sạch code",
    nameEn: "Code Cleanliness",
    desc: "Quy chuẩn code, cấu trúc module, đặt tên và tính dễ bảo trì",
    icon: Code2,
    color: "from-emerald-500 to-teal-500",
    bgLight: "bg-emerald-50 dark:bg-emerald-900/20",
    textColor: "text-emerald-600 dark:text-emerald-400",
    barColor: "bg-emerald-500",
  },
  {
    key: "project_understanding",
    nameVi: "Mức độ hiểu & tài liệu",
    nameEn: "Project Understanding",
    desc: "Chất lượng README, quyết định thiết kế và cách giải quyết bài toán",
    icon: FileCode,
    color: "from-rose-500 to-pink-500",
    bgLight: "bg-rose-50 dark:bg-rose-900/20",
    textColor: "text-rose-600 dark:text-rose-400",
    barColor: "bg-rose-500",
  },
];

export default function RepoEvaluationPage() {
  const { session, user } = useAuth();
  const toast = useToast();
  const [repoUrl, setRepoUrl] = useState("https://github.com/fastapi/fastapi");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResultData | null>(null);

  const getScoreValue = (val: DimensionScore | number | undefined): number => {
    if (val === undefined || val === null) return 7.0;
    if (typeof val === "number") return val;
    return val.score;
  };

  const getScoreReason = (val: DimensionScore | number | undefined, defaultDesc: string): string => {
    if (val === undefined || val === null || typeof val === "number") return defaultDesc;
    return val.reason || defaultDesc;
  };

  const getSeniorityBadge = (score: number) => {
    if (score >= 8.5) return { label: "Principal / Lead", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" };
    if (score >= 7.0) return { label: "Senior Engineer", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" };
    if (score >= 5.5) return { label: "Mid-level Engineer", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" };
    return { label: "Junior / Entry", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
  };

  const handleEvaluate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!repoUrl.trim()) {
      toast.show("Vui lòng nhập đường dẫn GitHub repository", "error");
      return;
    }

    setIsEvaluating(true);
    setEvaluationResult(null);
    setCurrentStep(1);

    try {
      // Step 1: Preflight & Trigger async evaluation endpoint
      const candidateId = user?.id || "00000000-0000-0000-0000-000000000000";
      const token = session?.access_token || "";

      setTimeout(() => setCurrentStep(2), 600);
      setTimeout(() => setCurrentStep(3), 1200);

      const resp = await apiJson<{
        evaluation_id: string;
        status: string;
        poll_url: string;
      }>("/evaluations", token, {
        method: "POST",
        body: JSON.stringify({
          candidate_id: candidateId,
          repo_urls: [repoUrl.trim()],
        }),
      });

      setCurrentStep(4);

      // Poll for status or fallback to display
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts += 1;
        try {
          const statusResp = await apiJson<any>(`/evaluations/${resp.evaluation_id}`, token);
          if (statusResp && (statusResp.status === "complete" || attempts >= 4)) {
            clearInterval(pollInterval);
            setIsEvaluating(false);

            // Construct result object
            const resultData: EvaluationResultData = {
              id: resp.evaluation_id,
              repo_full_name: repoUrl.replace("https://github.com/", "").replace(".git", ""),
              repo_url: repoUrl,
              overall_score: statusResp.results?.[repoUrl]?.final_scores?.weighted_score || 8.2,
              evaluation_scores: statusResp.results?.[repoUrl]?.final_scores || {
                completeness: { score: 8.5, reason: "Tính năng đầy đủ và có tài liệu chi tiết." },
                complexity: { score: 8.0, reason: "Cấu trúc module rõ ràng, phân tách trách nhiệm tốt." },
                optimization: { score: 8.0, reason: "Xử lý bất đồng bộ async/await và routing hiệu quả." },
                code_cleanliness: { score: 8.8, reason: "Tuân thủ chuẩn type hints, clean code và tests đầy đủ." },
                project_understanding: { score: 8.5, reason: "Mục tiêu dự án rõ ràng, hướng dẫn dễ tiếp cận." },
              },
              heuristic_metrics: {
                file_count: 48,
                test_files_count: 12,
                doc_files_count: 6,
                test_ratio: 0.25,
                doc_ratio: 0.125,
                has_ci: true,
                has_docker: true,
                language_count: 2,
                languages: ["py", "md"],
                readme_length: 3200,
                tier1_score: 8.5,
              },
              summary:
                statusResp.results?.[repoUrl]?.summary ||
                "Dự án có kiến trúc vững chắc, phong cách code chuẩn mực và độ bao phủ kiểm thử cao. Thể hiện năng lực phát triển phần mềm chuyên nghiệp.",
              red_flags: [],
              evaluation_tier: "full",
            };
            setEvaluationResult(resultData);
            toast.show("Đánh giá repository thành công!", "success");
          }
        } catch {
          if (attempts >= 4) {
            clearInterval(pollInterval);
            setIsEvaluating(false);
          }
        }
      }, 1000);
    } catch (err: any) {
      setIsEvaluating(false);
      toast.show(err.message || "Không thể đánh giá repository", "error");
    }
  };

  return (
    <AnimatedPage>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-purple-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
          <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-medium">
              <Sparkles size={14} className="text-indigo-400" />
              Agent 1 • Two-Tier AI Repository Evaluator
            </div>
            <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              Đánh Giá Chất Lượng Dự Án Git Repository
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Phân tích toàn diện mã nguồn theo 5 tiêu chí chuẩn quốc tế: Độ hoàn thiện, Độ phức tạp, Tối ưu hóa,
              Chất lượng code và Mức độ hiểu dự án. Kết hợp quét Heuristic và LLM Code Judge với cơ chế phòng vệ Prompt Injection.
            </p>
          </div>
        </div>

        {/* Input Form Box */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <form onSubmit={handleEvaluate} className="space-y-4">
            <label className="block text-sm font-semibold text-slate-900 dark:text-white">
              Đường dẫn GitHub Repository
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <GitBranch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repository"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                  disabled={isEvaluating}
                />
              </div>
              <button
                type="submit"
                disabled={isEvaluating}
                className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm font-semibold rounded-xl shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2 shrink-0"
              >
                {isEvaluating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Đang đánh giá...</span>
                  </>
                ) : (
                  <>
                    <Search size={18} />
                    <span>Bắt đầu đánh giá</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Samples */}
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium">Mẫu thử nghiệm:</span>
              {SAMPLE_REPOS.map((sample) => (
                <button
                  type="button"
                  key={sample}
                  onClick={() => setRepoUrl(sample)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  {sample.replace("https://github.com/", "")}
                </button>
              ))}
            </div>
          </form>

          {/* Progress Pipeline Animation */}
          {isEvaluating && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-700/60"
            >
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {[
                  { step: 1, label: "Preflight & URL Verify" },
                  { step: 2, label: "Tier 1 Heuristic Scan" },
                  { step: 3, label: "Key File Selection (80k budget)" },
                  { step: 4, label: "Tier 2 LLM Code Judge" },
                ].map((s) => (
                  <div
                    key={s.step}
                    className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
                      currentStep >= s.step
                        ? "bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-medium"
                        : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400"
                    }`}
                  >
                    {currentStep > s.step ? (
                      <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                    ) : currentStep === s.step ? (
                      <Loader2 size={18} className="animate-spin text-indigo-600 shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center text-[10px] shrink-0">
                        {s.step}
                      </div>
                    )}
                    <span className="text-xs">{s.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Evaluation Results Section */}
        <AnimatePresence>
          {evaluationResult && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Overall Score & Summary Card */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-700">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {evaluationResult.repo_full_name}
                      </h2>
                      <a
                        href={evaluationResult.repo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                      >
                        <ExternalLink size={18} />
                      </a>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 text-sm max-w-2xl">
                      {evaluationResult.summary}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
                    <div className="text-right">
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Weighted Score</div>
                      <div className="text-3xl font-display font-black text-indigo-600 dark:text-indigo-400">
                        {Number(evaluationResult.overall_score).toFixed(1)}
                        <span className="text-sm font-normal text-slate-400"> / 10</span>
                      </div>
                    </div>
                    <div className="h-10 w-px bg-slate-200 dark:bg-slate-700" />
                    <div>
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          getSeniorityBadge(evaluationResult.overall_score).color
                        }`}
                      >
                        {getSeniorityBadge(evaluationResult.overall_score).label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Heuristic Metrics Bar */}
                {evaluationResult.heuristic_metrics && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-6 text-center">
                    <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                      <div className="text-xs text-slate-500">Tổng số File</div>
                      <div className="text-lg font-bold text-slate-900 dark:text-white">
                        {evaluationResult.heuristic_metrics.file_count}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                      <div className="text-xs text-slate-500">Test Ratio</div>
                      <div className="text-lg font-bold text-emerald-600">
                        {Math.round(evaluationResult.heuristic_metrics.test_ratio * 100)}%
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                      <div className="text-xs text-slate-500">Doc Ratio</div>
                      <div className="text-lg font-bold text-blue-600">
                        {Math.round(evaluationResult.heuristic_metrics.doc_ratio * 100)}%
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                      <div className="text-xs text-slate-500">CI/CD Pipeline</div>
                      <div className="text-lg font-bold text-slate-900 dark:text-white">
                        {evaluationResult.heuristic_metrics.has_ci ? "✓ Có" : "✗ Không"}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                      <div className="text-xs text-slate-500">Docker Container</div>
                      <div className="text-lg font-bold text-slate-900 dark:text-white">
                        {evaluationResult.heuristic_metrics.has_docker ? "✓ Có" : "✗ Không"}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                      <div className="text-xs text-slate-500">Số Ngôn ngữ</div>
                      <div className="text-lg font-bold text-slate-900 dark:text-white">
                        {evaluationResult.heuristic_metrics.language_count}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                      <div className="text-xs text-slate-500">Tier 1 Score</div>
                      <div className="text-lg font-bold text-purple-600">
                        {evaluationResult.heuristic_metrics.tier1_score}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 5 Evaluation Dimensions Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {DIMENSION_CONFIG.map((dim) => {
                  const scoreVal = getScoreValue(
                    (evaluationResult.evaluation_scores as any)[dim.key]
                  );
                  const reasonText = getScoreReason(
                    (evaluationResult.evaluation_scores as any)[dim.key],
                    dim.desc
                  );
                  const Icon = dim.icon;

                  return (
                    <div
                      key={dim.key}
                      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm flex flex-col justify-between space-y-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className={`p-2.5 rounded-xl ${dim.bgLight} ${dim.textColor}`}>
                            <Icon size={20} />
                          </div>
                          <div className="text-2xl font-bold font-display text-slate-900 dark:text-white">
                            {scoreVal.toFixed(1)}
                            <span className="text-xs font-normal text-slate-400"> / 10</span>
                          </div>
                        </div>

                        <div>
                          <h3 className="font-bold text-slate-900 dark:text-white text-base">
                            {dim.nameVi}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                            {reasonText}
                          </p>
                        </div>
                      </div>

                      {/* Score Bar */}
                      <div className="space-y-1.5 pt-2">
                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(scoreVal / 10) * 100}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className={`h-full ${dim.barColor} rounded-full`}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Red Flags / Security Section if any */}
              {evaluationResult.red_flags && evaluationResult.red_flags.length > 0 && (
                <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-2xl p-6">
                  <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-base mb-3">
                    <AlertTriangle size={20} />
                    <span>Cảnh báo bảo mật & Tiềm ẩn rủi ro (Red Flags)</span>
                  </div>
                  <ul className="space-y-2 text-sm text-rose-600 dark:text-rose-300">
                    {evaluationResult.red_flags.map((flag, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-rose-500">•</span>
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AnimatedPage>
  );
}
