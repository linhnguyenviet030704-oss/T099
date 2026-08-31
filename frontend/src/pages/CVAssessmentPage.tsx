import React, { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  FileText,
  Upload,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Award,
  BookOpen,
  ArrowRight,
  RefreshCw,
  Layers,
  TrendingUp,
  ShieldAlert,
  Zap,
  Target,
  Clock,
  Printer,
  ChevronRight,
  Info,
} from "lucide-react";
import AnimatedPage from "../components/AnimatedPage";
import Button from "../components/ui/Button";
import { useAuth } from "../auth/AuthProvider";
import { useLang } from "../context/LangContext";
import { useToast } from "../context/ToastContext";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { apiStream, apiJson, type StreamEvent } from "../lib/api";
import { API_BASE_URL } from "../lib/env";
import type { Resume } from "../types";

// Danh mục ngành nghề mẫu phổ biến
const POPULAR_ROLES = [
  { id: "backend", title: "Backend Developer", icon: "💻", skills: "Python, FastAPI, PostgreSQL, Docker" },
  { id: "frontend", title: "Frontend Developer", icon: "🎨", skills: "React, TypeScript, Next.js, Tailwind" },
  { id: "fullstack", title: "Fullstack Developer", icon: "⚡", skills: "React, Node/Python, SQL, Cloud" },
  { id: "mobile", title: "Mobile Developer", icon: "📱", skills: "Flutter, React Native, Dart, iOS/Android" },
  { id: "ai_ml", title: "AI / Machine Learning Engineer", icon: "🤖", skills: "Python, PyTorch, LLM, MLOps" },
  { id: "data_engineer", title: "Data Engineer", icon: "📊", skills: "Python, Spark, Kafka, SQL, Data Lake" },
  { id: "devops", title: "DevOps / Cloud Engineer", icon: "☁️", skills: "Docker, K8s, CI/CD, Linux, AWS" },
  { id: "data_analyst", title: "Data Analyst", icon: "📈", skills: "SQL, Python, PowerBI, Statistics" },
  { id: "qa_qc", title: "QA / QC & Automation Tester", icon: "🔍", skills: "Selenium, Playwright, API Test" },
  { id: "business_analyst", title: "Business Analyst (IT BA)", icon: "📋", skills: "UML, Agile, User Stories, SQL" },
  { id: "security", title: "Security Engineer", icon: "🛡️", skills: "OWASP, Penetration Test, Linux, SIEM" },
];

const SENIORITY_LEVELS = [
  { id: "intern", label: "Intern", exp: "0 năm", desc: "Thực tập sinh & Người bắt đầu" },
  { id: "fresher", label: "Fresher", exp: "< 1 năm", desc: "Mới tốt nghiệp / Đã có kiến thức cơ bản" },
  { id: "junior", label: "Junior", exp: "1 - 2 năm", desc: "1-2 năm kinh nghiệm thực chiến" },
  { id: "middle", label: "Middle", exp: "2 - 4 năm", desc: "2-4 năm làm chủ công nghệ và độc lập xử lý" },
  { id: "senior", label: "Senior", exp: "5+ năm", desc: "5+ năm kinh nghiệm & Thiết kế kiến trúc" },
  { id: "lead", label: "Lead / Principal", exp: "7+ năm", desc: "Trưởng nhóm kỹ thuật & Quản trị giải pháp" },
];

interface MetricScoreData {
  score: number;
  weight: number;
  details: Record<string, any>;
  confidence: number;
}

interface SkillAnalysisData {
  matched: string[];
  missing: string[];
  unexpected: string[];
  match_rate: number;
}

interface RoadmapPhaseData {
  phase: number;
  title: string;
  duration_weeks: number;
  focus_skills: string[];
  recommended_topics_or_projects: string[];
}

interface CvAssessmentData {
  target_role: string;
  target_level: string;
  overall_score: number;
  breakdown: Record<string, MetricScoreData>;
  skill_analysis: SkillAnalysisData;
  authenticity: Record<string, any>;
  red_flags: string[];
  strengths: string[];
  weaknesses: string[];
  skill_gap: {
    matched: string[];
    missing: string[];
    prerequisites: string[];
  };
  radar_chart: {
    type: string;
    labels: string[];
    datasets: Array<{ label: string; data: number[] }>;
  } | null;
  recommendations: string[];
  learning_roadmap: RoadmapPhaseData[];
  natural_language_summary: string | null;
  confidence: number;
}

export default function CVAssessmentPage() {
  const { user, session } = useAuth();
  const { lang } = useLang();
  const { error: toastError, success: toastSuccess } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  // State lựa chọn đầu vào
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [inputMode, setInputMode] = useState<"vault" | "file" | "text">("vault");

  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [pastedCvText, setPastedCvText] = useState<string>("");

  const [selectedRole, setSelectedRole] = useState<string>("Backend Developer");
  const [customRole, setCustomRole] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<string>("middle");

  // State quá trình phân tích
  const [analyzing, setAnalyzing] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [stepLabel, setStepLabel] = useState<string>("");
  const [assessmentResult, setAssessmentResult] = useState<CvAssessmentData | null>(null);

  // Load danh sách CV từ tủ hồ sơ
  const loadResumes = useCallback(async () => {
    if (!supabase || !user) return;
    setLoadingResumes(true);
    try {
      const { data, error } = await supabase
        .from("resumes")
        .select("*")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      const list = (data || []) as Resume[];
      setResumes(list);

      // Tự động chọn CV mặc định hoặc từ query param
      const params = new URLSearchParams(location.search);
      const paramResumeId = params.get("resumeId");
      if (paramResumeId && list.some((r) => r.id === paramResumeId)) {
        setSelectedResumeId(paramResumeId);
      } else if (list.length > 0) {
        const defaultCv = list.find((r) => r.is_default) || list[0];
        setSelectedResumeId(defaultCv.id);
      }
    } catch (err) {
      toastError(handleSupabaseError(err));
    } finally {
      setLoadingResumes(false);
    }
  }, [user, location.search, toastError]);

  useEffect(() => {
    void loadResumes();
  }, [loadResumes]);

  // Thực hiện phân tích CV
  const handleStartAssessment = async () => {
    if (!session?.access_token) {
      toastError("Vui lòng đăng nhập để sử dụng tính năng đánh giá CV.");
      return;
    }

    const effectiveRole = customRole.trim() || selectedRole;
    if (!effectiveRole) {
      toastError("Vui lòng chọn hoặc nhập ngành nghề/vị trí mục tiêu.");
      return;
    }

    setAnalyzing(true);
    setAssessmentResult(null);
    setCurrentStep("init");
    setStepLabel("Đang khởi tạo Agent đánh giá hồ sơ...");

    try {
      if (inputMode === "file" && uploadedFile) {
        // Gọi endpoint Upload File
        setStepLabel("Đang tải lên và trích xuất dữ liệu tệp CV...");
        const formData = new FormData();
        formData.append("cv_file", uploadedFile);
        formData.append("target_role", effectiveRole);
        formData.append("target_level", selectedLevel);

        const response = await fetch(`${API_BASE_URL}/api/v1/cv-assessment/file`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || errData.message || "Đánh giá tệp CV thất bại");
        }

        const data = (await response.json()) as CvAssessmentData;
        setAssessmentResult(data);
        toastSuccess("Đánh giá CV hoàn tất thành công!");
      } else {
        // Sử dụng Stream SSE cho Resume ID hoặc Text
        const requestPayload: Record<string, any> = {
          target_role: effectiveRole,
          target_level: selectedLevel,
        };

        if (inputMode === "vault") {
          if (!selectedResumeId) {
            toastError("Vui lòng chọn 1 CV trong Tủ hồ sơ.");
            setAnalyzing(false);
            return;
          }
          requestPayload.resume_id = selectedResumeId;
        } else {
          if (!pastedCvText.trim() || pastedCvText.trim().length < 30) {
            toastError("Vui lòng dán nội dung CV có độ dài hợp lệ (tối thiểu 30 ký tự).");
            setAnalyzing(false);
            return;
          }
          requestPayload.cv_text = pastedCvText.trim();
        }

        await apiStream(
          "/cv-assessment/stream",
          session.access_token,
          requestPayload,
          (event: StreamEvent<CvAssessmentData>) => {
            if (event.event === "status") {
              setCurrentStep(event.data.step);
              setStepLabel(event.data.label);
            } else if (event.event === "complete") {
              setAssessmentResult(event.data as unknown as CvAssessmentData);
              toastSuccess("Đánh giá CV & Tổng hợp lộ trình thành công!");
            } else if (event.event === "error") {
              throw new Error(event.data.error || "Lỗi trong quá trình xử lý");
            }
          }
        );
      }
    } catch (err: any) {
      toastError(err.message || "Đánh giá CV gặp sự cố. Vui lòng thử lại.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Render SVG Radar Chart đơn giản và tương thích cao
  const renderRadarChart = (data: CvAssessmentData["radar_chart"]) => {
    if (!data || !data.labels || data.labels.length === 0) return null;

    const size = 300;
    const center = size / 2;
    const radius = 100;
    const numPoints = data.labels.length;
    const values = data.datasets?.[0]?.data || [70, 70, 70, 70];

    const getCoordinates = (index: number, val: number) => {
      const angle = (Math.PI * 2 / numPoints) * index - Math.PI / 2;
      const r = (val / 100) * radius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return { x, y };
    };

    // Tạo các đường đa giác lưới nền
    const gridLevels = [0.25, 0.5, 0.75, 1.0];
    const polygonPoints = values.map((val, i) => {
      const { x, y } = getCoordinates(i, val);
      return `${x},${y}`;
    }).join(" ");

    return (
      <div className="flex flex-col items-center justify-center p-4">
        <svg width={size} height={size} className="overflow-visible">
          {/* Vòng lưới nền */}
          {gridLevels.map((lvl, idx) => {
            const pts = Array.from({ length: numPoints }).map((_, i) => {
              const { x, y } = getCoordinates(i, lvl * 100);
              return `${x},${y}`;
            }).join(" ");
            return (
              <polygon
                key={idx}
                points={pts}
                className="stroke-slate-200 dark:stroke-slate-700 fill-transparent"
                strokeWidth="1"
              />
            );
          })}

          {/* Trục từ tâm */}
          {Array.from({ length: numPoints }).map((_, i) => {
            const { x, y } = getCoordinates(i, 100);
            return (
              <line
                key={i}
                x1={center}
                y1={center}
                x2={x}
                y2={y}
                className="stroke-slate-200 dark:stroke-slate-700"
                strokeWidth="1"
              />
            );
          })}

          {/* Vùng dữ liệu điểm số */}
          <polygon
            points={polygonPoints}
            className="fill-indigo-500/30 stroke-indigo-600 dark:stroke-indigo-400 stroke-2"
          />

          {/* Các điểm nút và nhãn */}
          {values.map((val, i) => {
            const { x, y } = getCoordinates(i, val);
            const labelCoord = getCoordinates(i, 125);
            return (
              <g key={i}>
                <circle cx={x} cy={y} r="5" className="fill-indigo-600 dark:fill-indigo-400" />
                <text
                  x={labelCoord.x}
                  y={labelCoord.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="text-xs font-semibold fill-slate-700 dark:fill-slate-300"
                >
                  {data.labels[i]} ({val}%)
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <AnimatedPage>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Banner tiêu đề */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 text-white p-8 md:p-10 shadow-2xl">
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 text-xs font-medium backdrop-blur-md">
              <Sparkles size={14} className="text-indigo-300" />
              Tính năng Độc quyền cho Ứng viên (Candidate AI Agent)
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-display">
              Đánh Giá Độ Mạnh / Yếu CV & Lộ Trình Phát Triển
            </h1>
            <p className="text-indigo-100/90 text-sm sm:text-base leading-relaxed">
              AI quét toàn diện hồ sơ của bạn, đối chiếu với tiêu chuẩn thực tế của ngành nghề và cấp bậc mục tiêu.
              Phát hiện khoảng trống kỹ năng, các kỹ năng ma (chưa có dự án chứng minh) và gợi ý lộ trình bứt phá sự nghiệp.
            </p>
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-purple-500/10 to-transparent pointer-events-none" />
        </div>

        {/* Khu vực Lựa chọn cấu hình đánh giá (Form) */}
        {!assessmentResult && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Cột trái: Chọn nguồn CV */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                      1
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Chọn Hồ sơ / CV của bạn
                    </h2>
                  </div>
                  {/* Tab chọn cách nạp CV */}
                  <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl text-xs font-medium">
                    <button
                      onClick={() => setInputMode("vault")}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        inputMode === "vault"
                          ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Tủ hồ sơ CV
                    </button>
                    <button
                      onClick={() => setInputMode("file")}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        inputMode === "file"
                          ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Tải tệp mới
                    </button>
                    <button
                      onClick={() => setInputMode("text")}
                      className={`px-3 py-1.5 rounded-lg transition-all ${
                        inputMode === "text"
                          ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Dán văn bản
                    </button>
                  </div>
                </div>

                {/* Tab 1: Chọn từ Tủ hồ sơ CV */}
                {inputMode === "vault" && (
                  <div>
                    {loadingResumes ? (
                      <div className="py-8 text-center text-slate-400">{lang === "en" ? "Loading CVs..." : "Đang tải danh sách CV..."}</div>
                    ) : resumes.length === 0 ? (
                      <div className="p-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                        <FileText size={36} className="mx-auto text-slate-400" />
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {lang === "en" ? "You don't have any CVs in your Vault." : "Bạn chưa có CV nào trong Tủ hồ sơ."}
                        </p>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setInputMode("file")}
                        >
                          {lang === "en" ? "Upload CV File Now" : "Tải tệp CV lên ngay"}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                        {resumes.map((cv) => (
                          <div
                            key={cv.id}
                            onClick={() => setSelectedResumeId(cv.id)}
                            className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                              selectedResumeId === cv.id
                                ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 dark:border-indigo-500"
                                : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-300">
                                <FileText size={20} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-900 dark:text-white text-sm">
                                    {cv.title || cv.original_filename}
                                  </span>
                                  {cv.is_default && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                      {lang === "en" ? "Default" : "Mặc định"}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                  {lang === "en" ? "Uploaded:" : "Tải lên:"} {new Date(cv.created_at).toLocaleDateString(lang === "en" ? "en-US" : "vi-VN")}
                                </p>
                              </div>
                            </div>
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                              selectedResumeId === cv.id
                                ? "border-indigo-600 bg-indigo-600 text-white"
                                : "border-slate-300 dark:border-slate-600"
                            }`}>
                              {selectedResumeId === cv.id && <CheckCircle2 size={14} />}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Tải file mới */}
                {inputMode === "file" && (
                  <div className="space-y-4">
                    <label className="block p-8 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors cursor-pointer text-center bg-slate-50/50 dark:bg-slate-900/20">
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setUploadedFile(e.target.files[0]);
                          }
                        }}
                      />
                      <Upload size={32} className="mx-auto text-indigo-500 mb-2" />
                      <p className="font-medium text-slate-700 dark:text-slate-300 text-sm">
                        {uploadedFile ? uploadedFile.name : (lang === "en" ? "Click to select or drag and drop your CV file here" : "Nhấn để chọn tệp hoặc kéo thả file CV vào đây")}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">{lang === "en" ? "Supports PDF, DOCX, TXT (Max 10MB)" : "Hỗ trợ PDF, DOCX, TXT (Tối đa 10MB)"}</p>
                    </label>
                  </div>
                )}

                {/* Tab 3: Dán văn bản */}
                {inputMode === "text" && (
                  <div>
                    <textarea
                      rows={8}
                      value={pastedCvText}
                      onChange={(e) => setPastedCvText(e.target.value)}
                      placeholder={lang === "en" ? "Paste full CV content here (including experience, skills, real projects)..." : "Dán toàn bộ nội dung CV của bạn tại đây (Bao gồm kinh nghiệm, kỹ năng, các dự án thực tế đã làm)..."}
                      className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Cột phải: Chọn Ngành nghề & Cấp bậc mục tiêu */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-sm space-y-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold">
                    2
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Ngành nghề & Cấp bậc mục tiêu
                  </h2>
                </div>

                {/* Danh mục ngành nghề phổ biến */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Vị trí muốn ứng tuyển:
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {POPULAR_ROLES.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => {
                          setSelectedRole(role.title);
                          setCustomRole("");
                        }}
                        className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center gap-2 ${
                          selectedRole === role.title && !customRole
                            ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold shadow-sm"
                            : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                        }`}
                      >
                        <span className="text-base">{role.icon}</span>
                        <span className="truncate">{role.title}</span>
                      </button>
                    ))}
                  </div>
                  {/* Nhập vị trí tùy chỉnh */}
                  <input
                    type="text"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    placeholder="Hoặc nhập vị trí tùy chỉnh (VD: Rust Developer)..."
                    className="w-full mt-2 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Chọn cấp bậc */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Cấp bậc kỳ vọng:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {SENIORITY_LEVELS.map((lvl) => (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => setSelectedLevel(lvl.id)}
                        className={`p-2 rounded-xl border text-center transition-all ${
                          selectedLevel === lvl.id
                            ? "border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold shadow-sm"
                            : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                        }`}
                      >
                        <div className="text-xs font-bold">{lvl.label}</div>
                        <div className="text-[10px] text-slate-400">{lvl.exp}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Nút kích hoạt Đánh giá */}
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full py-4 text-base font-bold shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
                  disabled={analyzing}
                  onClick={handleStartAssessment}
                >
                  <Sparkles size={20} className="animate-pulse" />
                  Bắt đầu Đánh Giá Năng Lực CV
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Trạng thái Phân tích Đang chạy (Streaming State) */}
        {analyzing && (
          <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 p-12 text-center shadow-lg space-y-6 max-w-2xl mx-auto">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-200 dark:border-indigo-900 border-t-indigo-600 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Compass size={32} className="animate-pulse" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                AI Agent đang phân tích và đối chuẩn hồ sơ...
              </h3>
              <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                {stepLabel || "Đang xử lý dữ liệu..."}
              </p>
            </div>
            {/* Tiến trình 4 bước */}
            <div className="grid grid-cols-4 gap-2 pt-4 border-t border-slate-100 dark:border-slate-700/60 text-xs">
              <div className={`p-2 rounded-lg ${currentStep === "parse" ? "bg-indigo-100 dark:bg-indigo-900/50 font-bold text-indigo-700 dark:text-indigo-300" : "text-slate-400"}`}>
                1. Trích xuất CV
              </div>
              <div className={`p-2 rounded-lg ${currentStep === "retrieve" ? "bg-indigo-100 dark:bg-indigo-900/50 font-bold text-indigo-700 dark:text-indigo-300" : "text-slate-400"}`}>
                2. Knowledge Graph
              </div>
              <div className={`p-2 rounded-lg ${currentStep === "score" ? "bg-indigo-100 dark:bg-indigo-900/50 font-bold text-indigo-700 dark:text-indigo-300" : "text-slate-400"}`}>
                3. Tính điểm 4 trục
              </div>
              <div className={`p-2 rounded-lg ${currentStep === "report" ? "bg-indigo-100 dark:bg-indigo-900/50 font-bold text-indigo-700 dark:text-indigo-300" : "text-slate-400"}`}>
                4. Tạo lộ trình
              </div>
            </div>
          </div>
        )}

        {/* Dashboard Hiển Thị Kết Quả Đánh Giá Chi Tiết */}
        {assessmentResult && !analyzing && (
          <div className="space-y-8 print:space-y-4">
            {/* Thanh công cụ hành động kết quả */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-100 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider">
                  {assessmentResult.target_role}
                </span>
                <span className="px-3 py-1 bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 rounded-lg text-xs font-bold uppercase">
                  Cấp bậc: {assessmentResult.target_level}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAssessmentResult(null)}
                  className="flex items-center gap-1.5"
                >
                  <RefreshCw size={14} />
                  Đánh giá lại
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5"
                >
                  <Printer size={14} />
                  In / Lưu báo cáo
                </Button>
              </div>
            </div>

            {/* Khối 1: Điểm tổng thể & Radar Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Card Điểm tổng thể & Nhận xét nhanh */}
              <div className="lg:col-span-5 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 p-8 shadow-sm flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Điểm Tương Thích Thực Tế
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      Độ tin cậy: {(assessmentResult.confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  <div className="flex items-baseline gap-3">
                    <span className="text-6xl font-extrabold text-indigo-600 dark:text-indigo-400 font-display">
                      {assessmentResult.overall_score.toFixed(0)}
                    </span>
                    <span className="text-2xl font-bold text-slate-400">/ 100</span>
                  </div>

                  {/* Đánh giá cấp độ */}
                  <div>
                    {assessmentResult.overall_score >= 80 ? (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs font-medium">
                        ✨ <strong>{lang === "en" ? "Excellent Profile:" : "Hồ sơ Rất Xuất Sắc:"}</strong> {lang === "en" ? "Very strong match for target role requirements and experience." : "Đáp ứng rất tốt yêu cầu chuyên môn và kinh nghiệm của vị trí mục tiêu."}
                      </div>
                    ) : assessmentResult.overall_score >= 60 ? (
                      <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/40 rounded-xl text-indigo-800 dark:text-indigo-300 text-xs font-medium">
                        🎯 <strong>{lang === "en" ? "Promising Profile:" : "Hồ sơ Khá Tiềm Năng:"}</strong> {lang === "en" ? "Good foundation, only needs minor skill focus and deeper project exposure." : "Nền tảng tốt, chỉ cần bổ sung 1 số kỹ năng trọng tâm và tăng cường chiều sâu dự án."}
                      </div>
                    ) : (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl text-amber-800 dark:text-amber-300 text-xs font-medium">
                        🚀 <strong>{lang === "en" ? "Needs Growth:" : "Cần Bồi Dưỡng Thêm:"}</strong> {lang === "en" ? "Follow the 3-phase roadmap to build real-world capabilities." : "Cần tập trung theo lộ trình 3 giai đoạn để hoàn thiện kỹ năng thực chiến."}
                      </div>
                    )}
                  </div>
                </div>

                {/* Điểm 4 trục con */}
                <div className="grid grid-cols-2 gap-3 mt-6 pt-6 border-t border-slate-100 dark:border-slate-700/60">
                  {Object.entries(assessmentResult.breakdown).map(([key, metric]) => (
                    <div key={key} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 capitalize">
                        {key === "technical" ? (lang === "en" ? "Technical" : "Kỹ thuật") : key === "experience" ? (lang === "en" ? "Experience" : "Kinh nghiệm") : key === "culture_fit" ? (lang === "en" ? "Culture" : "Văn hóa") : (lang === "en" ? "Seniority" : "Cấp bậc")}
                      </div>
                      <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                        {metric.score.toFixed(0)} <span className="text-xs text-slate-400 font-normal">pts</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Radar Chart SVG */}
              <div className="lg:col-span-7 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 p-8 shadow-sm flex flex-col items-center justify-center">
                <div className="w-full flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    {lang === "en" ? "4-Axis Competency Radar Chart" : "Biểu đồ Năng lực 4 Trục (Radar Chart)"}
                  </h3>
                  <span className="text-xs text-slate-400">Technical • Experience • Culture • Market</span>
                </div>
                {renderRadarChart(assessmentResult.radar_chart)}
              </div>
            </div>

            {/* Khối 2: Điểm mạnh & Điểm hạn chế */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Điểm mạnh */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/40 p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold">
                  <Award size={20} />
                  <h3>{lang === "en" ? "Key Strengths" : "Điểm Mạnh Nổi Bật Của Bạn"}</h3>
                </div>
                <ul className="space-y-2.5">
                  {assessmentResult.strengths.map((str, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                      <span>{str}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Điểm yếu & Cần cải thiện */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-amber-200/80 dark:border-amber-900/40 p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold">
                  <AlertTriangle size={20} />
                  <h3>{lang === "en" ? "Areas for Improvement" : "Điểm Cần Bổ Sung & Cải Thiện"}</h3>
                </div>
                <ul className="space-y-2.5">
                  {assessmentResult.weaknesses.map((w, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Khối 3: Khoảng trống Kỹ năng (Skill Gap Matrix) & Cảnh báo Ghost Skills */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 p-8 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers size={20} className="text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {lang === "en" ? "Skill Gap Matrix" : "Ma Trận Khoảng Trống Kỹ Năng (Skill Gap Matrix)"}
                  </h3>
                </div>
                <span className="text-xs text-slate-500">
                  {lang === "en" ? "Skill Match Rate:" : "Tỷ lệ đáp ứng kỹ năng:"} {assessmentResult.skill_analysis.match_rate}%
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Kỹ năng đã có */}
                <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 space-y-2">
                  <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                    <span>{lang === "en" ? `Matched (${assessmentResult.skill_gap.matched.length})` : `Đã Đáp Ứng (${assessmentResult.skill_gap.matched.length})`}</span>
                    <CheckCircle2 size={14} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {assessmentResult.skill_gap.matched.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-[11px] font-medium">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Kỹ năng còn thiếu */}
                <div className="p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 space-y-2">
                  <div className="text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center justify-between">
                    <span>{lang === "en" ? `Missing (${assessmentResult.skill_gap.missing.length})` : `Cần Bổ Sung (${assessmentResult.skill_gap.missing.length})`}</span>
                    <AlertTriangle size={14} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {assessmentResult.skill_gap.missing.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 text-[11px] font-medium">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Kỹ năng tiên quyết */}
                <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 space-y-2">
                  <div className="text-xs font-bold text-purple-800 dark:text-purple-300 flex items-center justify-between">
                    <span>{lang === "en" ? "Prerequisites" : "Nền Tảng Tiên Quyết"}</span>
                    <Zap size={14} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(assessmentResult.skill_gap.prerequisites || []).map((s, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 text-[11px] font-medium">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Cảnh báo Ghost Skills nếu có */}
              {assessmentResult.authenticity?.ghost_skills && assessmentResult.authenticity.ghost_skills.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 flex items-start gap-3">
                  <ShieldAlert size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      {lang === "en" ? "Unverified skills detected (Ghost Skills):" : "Phát hiện kỹ năng chưa có bằng chứng dự án (Ghost Skills):"}
                    </h4>
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      {lang === "en"
                        ? `The skills: ${assessmentResult.authenticity.ghost_skills.join(", ")} are listed as keywords but lack descriptive project evidence. Consider adding real projects to increase credibility.`
                        : `Các kỹ năng: ${assessmentResult.authenticity.ghost_skills.join(", ")} chỉ mới được liệt kê từ khóa mà thiếu dự án mô tả cụ thể. Hãy bổ sung dự án thực tế để tăng độ uy tín với nhà tuyển dụng.`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Khối 4: Lộ trình Phát triển 3 Giai đoạn (Learning Roadmap) */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200/80 dark:border-slate-700/80 p-8 shadow-sm space-y-6">
              <div className="flex items-center gap-2">
                <TrendingUp size={22} className="text-indigo-600 dark:text-indigo-400" />
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {lang === "en" ? "3-Phase Learning & Capability Upgrade Roadmap" : "Lộ Trình Học Tập & Nâng Cấp Năng Lực 3 Giai Đoạn"}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lang === "en" ? `Step-by-step strategy to bridge skill gaps and master the ${assessmentResult.target_role} role.` : `Chiến lược từng bước giúp bạn hoàn thiện khoảng trống kỹ năng và sẵn sàng chinh phục vị trí ${assessmentResult.target_role}.`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {assessmentResult.learning_roadmap.map((phase) => (
                  <div
                    key={phase.phase}
                    className="p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                          P{phase.phase}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">
                          <Clock size={12} />
                          {phase.duration_weeks} {lang === "en" ? "weeks" : "tuần"}
                        </span>
                      </div>

                      <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-snug">
                        {phase.title}
                      </h4>

                      {/* Focus skills */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {lang === "en" ? "Focus Skills:" : "Trọng tâm kỹ năng:"}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {phase.focus_skills.map((sk, i) => (
                            <span key={i} className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-medium text-slate-700 dark:text-slate-300">
                              {sk}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Gợi ý hành động & Dự án */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {lang === "en" ? "Suggested Topics & Projects:" : "Nội dung & Dự án đề xuất:"}
                        </span>
                        <ul className="space-y-1.5">
                          {phase.recommended_topics_or_projects.map((topic, i) => (
                            <li key={i} className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                              <ChevronRight size={12} className="text-indigo-500 shrink-0 mt-0.5" />
                              <span>{topic}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Khối 5: Báo cáo Nhận xét Tổng thể từ Cố vấn AI */}
            {assessmentResult.natural_language_summary && (
              <div className="bg-gradient-to-br from-indigo-50/60 to-purple-50/60 dark:from-slate-800/80 dark:to-indigo-950/40 rounded-3xl border border-indigo-100 dark:border-indigo-900/40 p-8 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold">
                  <Sparkles size={20} />
                  <h3>{lang === "en" ? "In-depth Feedback from AI Career Advisor" : "Nhận Xét Chuyên Sâu Từ Cố Vấn Nghề Nghiệp AI"}</h3>
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line space-y-2">
                  {assessmentResult.natural_language_summary}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AnimatedPage>
  );
}
