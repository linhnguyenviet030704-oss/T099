import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch,
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
  CheckCircle,
  FileText,
  Upload,
  Link as LinkIcon,
  HelpCircle,
  Clock,
  ArrowRight,
  RefreshCw,
  FolderGit2,
  UserCheck,
  History,
  Trash2,
  Eye,
  X,
  Briefcase,
  Users,
  Calendar,
  Mail,
  User,
  Check,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useCurrentProfile } from "../profile/ProfileProvider";
import { supabase } from "../lib/supabase";
import { apiJson, apiStream, type StreamEvent } from "../lib/api";
import { canBrowseJobApplications } from "../lib/roleGuard";
import AnimatedPage from "../components/AnimatedPage";
import SuggestionStatusIndicator, { type StatusStep } from "../components/SuggestionStatusIndicator";
import { useToast } from "../context/ToastContext";
import { useLang } from "../context/LangContext";

interface DimensionScore {
  score: number;
  reason: string;
}

interface EvaluationResultData {
  id?: string;
  repo_full_name: string;
  repo_url: string;
  project_name?: string;
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
  status?: string;
  error?: string | null;
}

interface ExtractedRepoItem {
  repo_url: string;
  repo_name: string;
  repo_full_name: string;
  project_name: string;
  match_type: "direct_url" | "profile_match";
  match_reason: string;
  description: string;
  language: string;
  stars: number;
}

interface UserResumeOption {
  id: string;
  title: string;
  original_filename?: string;
  is_default?: boolean;
  created_at: string;
}

interface RecruiterJobOption {
  id: string;
  title: string;
  status: string;
  location?: string;
  created_at: string;
  application_count?: number;
}

interface SubmittedApplicationOption {
  id: string;
  job_post_id: string;
  applicant_user_id: string;
  resume_id: string;
  cover_letter?: string;
  current_status: string;
  applied_at: string;
  resume_title_snapshot?: string;
  applicant_name: string;
  applicant_email: string;
}

interface RepoSearchHistoryItem {
  id: string;
  user_id?: string;
  search_type: "cv" | "direct_url";
  title: string;
  resume_id?: string;
  cv_preview?: string;
  profile_url?: string;
  extracted_repos?: ExtractedRepoItem[];
  evaluation_results?: EvaluationResultData[];
  status: "starting" | "evaluating" | "completed" | "no_repos" | "failed";
  report_message?: string;
  created_at: string;
}

const SAMPLE_REPOS = [
  "https://github.com/fastapi/fastapi",
  "https://github.com/encode/uvicorn",
  "https://github.com/psf/black",
  "https://github.com/pallets/flask",
];

const SAMPLE_CVS = [
  {
    label: "CV mẫu có link repo trực tiếp",
    text: `# Nguyễn Văn Minh - Senior Backend Engineer
Email: minh.nguyen@example.com | GitHub: https://github.com/fastapi

## Mục tiêu nghề nghiệp
Phát triển hệ thống microservices hiệu năng cao, tối ưu hóa API và xây dựng hạ tầng cloud quy mô lớn.

## Dự án nổi bật
### FastAPI High Performance Framework
Repository: https://github.com/fastapi/fastapi
- Xây dựng hệ thống web framework tốc độ cao với Python type hints và Pydantic.
- Tích hợp chuẩn OpenAPI và tự động sinh tài liệu Swagger/ReDoc.

### Uvicorn ASGI Server
Repository: https://github.com/encode/uvicorn
- Web server siêu nhanh chạy trên uvloop và httptools.
`,
  },
  {
    label: "CV mẫu có GitHub Profile (Tự động match public repos)",
    text: `# Trần Hoàng Nam - Fullstack Developer
GitHub: https://github.com/psf

## Kinh nghiệm làm việc & Dự án
### Black Code Formatter
- Dự án định dạng mã nguồn Python tự động theo chuẩn PEP 8.
- Xử lý phân tích cú pháp AST và tái cấu trúc code sạch.
`,
  },
  {
    label: "CV mẫu không có link GitHub (Kiểm tra báo cáo null)",
    text: `# Lê Bảo Quân - Data Analyst
Email: quan.le@example.com | Điện thoại: 0912345678

## Tóm tắt chuyên môn
Chuyên gia phân tích dữ liệu kinh doanh với 4 năm kinh nghiệm sử dụng SQL, Excel nâng cao và PowerBI.
Không tham gia lập trình phần mềm mã nguồn mở.
`,
  },
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

type StatusPhase = "idle" | "starting" | "evaluating" | "complete" | "no_repos" | "error";

export default function RepoEvaluationPage() {
  const { session, user } = useAuth();
  const { profile } = useCurrentProfile();
  const { success, error: toastError, info } = useToast();
  const { lang } = useLang();
  const canBrowse = canBrowseJobApplications(profile?.role);

  // Mode Selection: "cv" vs "url"
  const [activeTab, setActiveTab] = useState<"cv" | "url">("cv");

  // CV Input Mode: "job_applications" (Recruiter workflow) | "vault" | "text" | "upload"
  // Default = "job_applications" for recruiters, "vault" for candidates (who cannot
  // see other applicants' CV submissions).
  const [cvInputType, setCvInputType] = useState<"job_applications" | "vault" | "text" | "upload">(
    canBrowse ? "job_applications" : "vault",
  );

  // Recruiter Job & Application State
  const [recruiterJobs, setRecruiterJobs] = useState<RecruiterJobOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [jobApplications, setJobApplications] = useState<SubmittedApplicationOption[]>([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string>("");
  const [isLoadingJobs, setIsLoadingJobs] = useState<boolean>(false);
  const [isLoadingApps, setIsLoadingApps] = useState<boolean>(false);

  // Other CV Input states
  const [userResumes, setUserResumes] = useState<UserResumeOption[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [cvTextInput, setCvTextInput] = useState<string>(SAMPLE_CVS[0].text);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");

  // Direct URL state
  const [directRepoUrl, setDirectRepoUrl] = useState("https://github.com/fastapi/fastapi");

  // Pipeline execution states
  const [statusPhase, setStatusPhase] = useState<StatusPhase>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [extractedRepos, setExtractedRepos] = useState<ExtractedRepoItem[]>([]);
  const [currentRepoIndex, setCurrentRepoIndex] = useState<number>(0);
  const [noReposReport, setNoReposReport] = useState<string | null>(null);

  // Tiến trình streaming thời gian thực theo từng repo
  const [streamingSteps, setStreamingSteps] = useState<StatusStep[]>([]);
  const [currentStatusLabel, setCurrentStatusLabel] = useState<string>("");

  // Results state: appended in real-time as each repo finishes
  const [evaluatedResults, setEvaluatedResults] = useState<EvaluationResultData[]>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState<number>(0);

  // Search History from Supabase
  const [searchHistory, setSearchHistory] = useState<RepoSearchHistoryItem[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // 1. Fetch Recruiter Jobs
  const loadRecruiterJobs = useCallback(async () => {
    if (!supabase) return;
    setIsLoadingJobs(true);
    try {
      // First try jobs created by the current recruiter
      let query = supabase
        .from("job_posts")
        .select("id, title, status, location, created_at")
        .order("created_at", { ascending: false });

      if (user?.id) {
        const { data: userJobs } = await query.eq("created_by_user_id", user.id);
        if (userJobs && userJobs.length > 0) {
          // Count applications for each job
          const jobIds = userJobs.map((j) => j.id);
          const { data: appCounts } = await supabase
            .from("job_submits")
            .select("job_post_id")
            .in("job_post_id", jobIds);

          const countMap = new Map<string, number>();
          (appCounts || []).forEach((a) => {
            countMap.set(a.job_post_id, (countMap.get(a.job_post_id) || 0) + 1);
          });

          const formattedJobs: RecruiterJobOption[] = userJobs.map((j) => ({
            ...j,
            application_count: countMap.get(j.id) || 0,
          }));

          setRecruiterJobs(formattedJobs);
          // Pick the first job that has applications, or the first job
          const bestJob = formattedJobs.find((j) => (j.application_count || 0) > 0) || formattedJobs[0];
          setSelectedJobId(bestJob.id);
          setIsLoadingJobs(false);
          return;
        }
      }

      // Fallback: load public jobs in system so recruiter UI is always functional
      const { data: allJobs } = await supabase
        .from("job_posts")
        .select("id, title, status, location, created_at")
        .order("created_at", { ascending: false })
        .limit(20);

      if (allJobs && allJobs.length > 0) {
        const jobIds = allJobs.map((j) => j.id);
        const { data: appCounts } = await supabase
          .from("job_submits")
          .select("job_post_id")
          .in("job_post_id", jobIds);

        const countMap = new Map<string, number>();
        (appCounts || []).forEach((a) => {
          countMap.set(a.job_post_id, (countMap.get(a.job_post_id) || 0) + 1);
        });

        const formattedJobs: RecruiterJobOption[] = allJobs.map((j) => ({
          ...j,
          application_count: countMap.get(j.id) || 0,
        }));

        setRecruiterJobs(formattedJobs);
        const bestJob = formattedJobs.find((j) => (j.application_count || 0) > 0) || formattedJobs[0];
        setSelectedJobId(bestJob.id);
      }
    } catch (err) {
      console.warn("Could not load recruiter jobs:", err);
    } finally {
      setIsLoadingJobs(false);
    }
  }, [user]);

  // 2. Fetch Submitted CV Applications for Selected Job
  const loadJobApplications = useCallback(async (jobId: string) => {
    if (!supabase || !jobId) {
      setJobApplications([]);
      setSelectedApplicationId("");
      return;
    }
    setIsLoadingApps(true);
    try {
      const { data: appsData, error } = await supabase
        .from("job_submits")
        .select("id, job_post_id, applicant_user_id, resume_id, cover_letter, current_status, applied_at, resume_title_snapshot")
        .eq("job_post_id", jobId)
        .order("applied_at", { ascending: false });

      if (error) throw error;

      if (appsData && appsData.length > 0) {
        const applicantIds = Array.from(new Set(appsData.map((a) => a.applicant_user_id)));
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .in("id", applicantIds);

        const profMap = new Map((profs || []).map((p) => [p.id, p]));

        const formattedApps: SubmittedApplicationOption[] = appsData.map((a) => {
          const prof = profMap.get(a.applicant_user_id);
          return {
            ...a,
            applicant_name: prof?.full_name || prof?.email || "Ứng viên",
            applicant_email: prof?.email || "",
          };
        });

        setJobApplications(formattedApps);
        setSelectedApplicationId(formattedApps[0].id);
        setSelectedResumeId(formattedApps[0].resume_id);
      } else {
        setJobApplications([]);
        setSelectedApplicationId("");
      }
    } catch (err) {
      console.warn("Could not load job applications:", err);
      setJobApplications([]);
    } finally {
      setIsLoadingApps(false);
    }
  }, []);

  // Load recruiter jobs on mount — only for recruiter/admin; candidates
  // must not see other applicants' CV submissions.
  useEffect(() => {
    if (canBrowse) {
      void loadRecruiterJobs();
    }
  }, [loadRecruiterJobs, canBrowse]);

  // Load applications whenever selected job changes — same role guard.
  useEffect(() => {
    if (canBrowse && selectedJobId) {
      void loadJobApplications(selectedJobId);
    }
  }, [selectedJobId, loadJobApplications, canBrowse]);

  // Load user resumes from Supabase for personal vault tab
  useEffect(() => {
    async function loadResumes() {
      if (!supabase || !user) return;
      try {
        const { data, error } = await supabase
          .from("resumes")
          .select("id, title, original_filename, is_default, created_at")
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });

        if (!error && data && data.length > 0) {
          setUserResumes(data as UserResumeOption[]);
        }
      } catch (err) {
        console.warn("Could not load user resumes:", err);
      }
    }
    void loadResumes();
  }, [user]);

  // Load search history from Supabase table
  const loadSearchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const token = session?.access_token || "";
      const userIdParam = user?.id ? `?user_id=${user.id}` : "";
      const historyList = await apiJson<RepoSearchHistoryItem[]>(
        `/evaluations/history${userIdParam}`,
        token
      );
      setSearchHistory(historyList || []);
    } catch (err) {
      console.warn("Could not fetch search history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [session, user]);

  useEffect(() => {
    void loadSearchHistory();
  }, [loadSearchHistory]);

  // Persist search history to Supabase table
  const saveSearchToHistory = async (params: {
    searchType: "cv" | "direct_url";
    title: string;
    resumeId?: string;
    cvPreview?: string;
    profileUrl?: string;
    extractedReposList: ExtractedRepoItem[];
    resultsList: EvaluationResultData[];
    status: "completed" | "no_repos" | "failed";
    reportMessage?: string;
  }) => {
    try {
      const token = session?.access_token || "";
      await apiJson<{ id: string; status: string }>(
        "/evaluations/history",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            user_id: user?.id || null,
            search_type: params.searchType,
            title: params.title,
            resume_id: params.resumeId || null,
            cv_preview: params.cvPreview ? params.cvPreview.slice(0, 300) : null,
            profile_url: params.profileUrl || null,
            extracted_repos: params.extractedReposList,
            evaluation_results: params.resultsList,
            status: params.status,
            report_message: params.reportMessage || null,
          }),
        }
      );
      void loadSearchHistory();
    } catch (err) {
      console.warn("Error saving search history to Supabase:", err);
    }
  };

  // Restore previous search session from history
  const handleRestoreHistoryItem = (item: RepoSearchHistoryItem) => {
    setActiveTab(item.search_type === "direct_url" ? "url" : "cv");
    setExtractedRepos(item.extracted_repos || []);
    setEvaluatedResults(item.evaluation_results || []);
    setSelectedResultIndex(0);
    setNoReposReport(item.report_message || null);
    setStatusPhase(
      item.status === "no_repos"
        ? "no_repos"
        : item.evaluation_results && item.evaluation_results.length > 0
        ? "complete"
        : "idle"
    );
    setStatusMessage(
      item.status === "no_repos"
        ? (item.report_message || "Không tìm thấy repository trong CV.")
        : `Đã tải lại lịch sử nghiên cứu: ${item.title}`
    );
    setShowHistoryModal(false);
    info("Đã khôi phục lịch sử", item.title);
  };

  // Delete history item
  const handleDeleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const token = session?.access_token || "";
      await apiJson(`/evaluations/history/${id}`, token, { method: "DELETE" });
      setSearchHistory((prev) => prev.filter((h) => h.id !== id));
      success("Đã xóa", "Đã xóa bản ghi lịch sử tìm kiếm.");
    } catch (err: any) {
      toastError("Lỗi", err.message || "Không thể xóa lịch sử");
    }
  };

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
    if (score >= 8.5) return { label: "Principal / Lead", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200" };
    if (score >= 7.0) return { label: "Senior Engineer", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200" };
    if (score >= 5.5) return { label: "Mid-level Engineer", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200" };
    return { label: "Junior / Entry", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200" };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setCvInputType("upload");

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        setCvTextInput(text);
        info("Tải file thành công", `Đã đọc nội dung file: ${file.name}`);
      }
    };
    reader.readAsText(file);
  };

  // Main flow: CV Extraction -> Sequential Repo Evaluation -> Immediate Real-time Display
  const handleStartCVEvaluation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    setEvaluatedResults([]);
    setExtractedRepos([]);
    setNoReposReport(null);
    setSelectedResultIndex(0);
    setStatusPhase("starting");
    setStatusMessage("Bắt đầu: Đang bóc tách dự án và truy vết link GitHub repo / profile từ CV...");

    const token = session?.access_token || "";
    let candidateId = user?.id || "00000000-0000-0000-0000-000000000000";
    let searchTitle = "Nghiên cứu từ CV";

    const payload: { resume_id?: string; cv_text?: string } = {};

    // 1. Recruiter Job Application flow (Selected Job -> Submitted CV)
    if (cvInputType === "job_applications") {
      if (!canBrowse) {
        // ponytail: defense-in-depth — even if a candidate forces the tab via devtools,
        // the picker is unreachable for them. Reject with the user-facing policy message.
        setStatusPhase("idle");
        toastError(
          "Không có quyền truy cập",
          "Tính năng này chỉ dành cho nhà tuyển dụng — vui lòng liên hệ support nếu bạn là nhà tuyển dụng",
        );
        return;
      }
      const selectedApp = jobApplications.find((a) => a.id === selectedApplicationId);
      const selectedJob = recruiterJobs.find((j) => j.id === selectedJobId);

      if (!selectedApp) {
        setStatusPhase("idle");
        toastError("Chưa chọn CV", "Vui lòng chọn một CV đã được submit vào vị trí tuyển dụng");
        return;
      }

      payload.resume_id = selectedApp.resume_id;
      candidateId = selectedApp.applicant_user_id;
      searchTitle = `CV: ${selectedApp.applicant_name} • Job: ${selectedJob?.title || "Vị trí tuyển dụng"}`;
    }
    // 2. Personal Vault CV flow
    else if (cvInputType === "vault") {
      if (!selectedResumeId) {
        setStatusPhase("idle");
        toastError("Chưa chọn CV", "Vui lòng chọn CV từ kho CV đã lưu");
        return;
      }
      payload.resume_id = selectedResumeId;
      const foundResume = userResumes.find((r) => r.id === selectedResumeId);
      searchTitle = `Nghiên cứu CV: ${foundResume?.title || "CV đã lưu"}`;
    }
    // 3. Text / Upload flow
    else {
      if (!cvTextInput.trim()) {
        setStatusPhase("idle");
        toastError("Thiếu nội dung CV", "Vui lòng cung cấp nội dung hoặc chọn CV để bắt đầu");
        return;
      }
      payload.cv_text = cvTextInput.trim();
      if (uploadedFileName) {
        searchTitle = `Nghiên cứu tệp: ${uploadedFileName}`;
      }
    }

    try {
      // Step 1: Extract CV repos
      const extractResp = await apiJson<{
        found: boolean;
        repos: ExtractedRepoItem[] | null;
        profile_url: string | null;
        projects_found: string[];
        message: string;
      }>("/evaluations/extract-cv-repos", token, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // If no repos found, report back, save to history, and stop
      if (!extractResp.found || !extractResp.repos || extractResp.repos.length === 0) {
        const nullMsg = extractResp.message || "Không tìm thấy URL GitHub repository hoặc GitHub profile phù hợp trong CV.";
        setStatusPhase("no_repos");
        setNoReposReport(nullMsg);
        setStatusMessage("Đã xong: Không tìm thấy GitHub repository trong CV.");
        info("Kết quả bóc tách", "Không tìm thấy repository GitHub trong CV");

        // Save null report to Supabase table
        void saveSearchToHistory({
          searchType: "cv",
          title: searchTitle,
          resumeId: payload.resume_id || undefined,
          cvPreview: payload.cv_text || undefined,
          profileUrl: extractResp.profile_url || undefined,
          extractedReposList: [],
          resultsList: [],
          status: "no_repos",
          reportMessage: nullMsg,
        });

        return;
      }

      const reposList = extractResp.repos;
      setExtractedRepos(reposList);

      // Step 2: Sequential evaluation of each repo one by one
      setStatusPhase("evaluating");
      const total = reposList.length;
      const completedResults: EvaluationResultData[] = [];

      for (let i = 0; i < total; i++) {
        const repoItem = reposList[i];
        setCurrentRepoIndex(i + 1);
        setStreamingSteps([]);
        setCurrentStatusLabel(`Đang khởi tạo đánh giá: ${repoItem.repo_full_name}...`);
        setStatusMessage(
          `Đang tìm kiếm & Đánh giá (${i + 1}/${total}): ${repoItem.repo_full_name} (${repoItem.project_name})...`
        );

        try {
          let evalResp: EvaluationResultData | null = null;
          await apiStream(
            "/evaluations/evaluate-single/stream",
            token,
            {
              candidate_id: candidateId,
              repo_url: repoItem.repo_url,
              project_name: repoItem.project_name,
            },
            (event: StreamEvent) => {
              if (event.event === "status") {
                setCurrentStatusLabel(event.data.label);
                setStreamingSteps((prev) => {
                  const exists = prev.some((s) => s.step === event.data.step && s.label === event.data.label);
                  if (exists) return prev;
                  return [...prev, { step: event.data.step, label: event.data.label, timestamp: Date.now() }];
                });
              } else if (event.event === "complete") {
                evalResp = event.data as unknown as EvaluationResultData;
              } else if (event.event === "error") {
                throw new Error(event.data.error || "Lỗi xử lý đánh giá repository");
              }
            }
          );

          if (!evalResp) {
            evalResp = await apiJson<EvaluationResultData>(
              "/evaluations/evaluate-single",
              token,
              {
                method: "POST",
                body: JSON.stringify({
                  candidate_id: candidateId,
                  repo_url: repoItem.repo_url,
                  project_name: repoItem.project_name,
                }),
              }
            );
          }

          completedResults.push(evalResp);
          // IMMEDIATELY append this result to the list so user sees it right away!
          setEvaluatedResults((prev) => [...prev, evalResp!]);
          success("Hoàn thành đánh giá", repoItem.repo_name);
        } catch (err: any) {
          console.error(`Lỗi khi đánh giá repo ${repoItem.repo_url}:`, err);
          const fallbackResult: EvaluationResultData = {
            repo_full_name: repoItem.repo_full_name,
            repo_url: repoItem.repo_url,
            project_name: repoItem.project_name,
            overall_score: 5.0,
            evaluation_scores: {
              completeness: 5.0,
              complexity: 5.0,
              optimization: 5.0,
              code_cleanliness: 5.0,
              project_understanding: 5.0,
              weighted_score: 5.0,
            },
            summary: `Đánh giá dự án gặp sự cố: ${err.message || "Lỗi kết nối GitHub API"}.`,
            red_flags: ["Không thể phân tích toàn bộ mã nguồn do lỗi mạng."],
            evaluation_tier: "failed",
            status: "failed",
            error: err.message,
          };
          completedResults.push(fallbackResult);
          setEvaluatedResults((prev) => [...prev, fallbackResult]);
        }
      }

      // Step 3: Finished all repos in list
      setStatusPhase("complete");
      setStatusMessage(`Đã xong: Hoàn tất đánh giá toàn bộ ${total} repository tìm thấy trong CV!`);
      success("Đánh giá hoàn tất", `Đã hoàn tất đánh giá ${total} repository!`);

      // Save complete research history to Supabase table
      void saveSearchToHistory({
        searchType: "cv",
        title: searchTitle,
        resumeId: payload.resume_id || undefined,
        cvPreview: payload.cv_text || undefined,
        profileUrl: extractResp.profile_url || undefined,
        extractedReposList: reposList,
        resultsList: completedResults,
        status: "completed",
        reportMessage: `Đã đánh giá thành công ${completedResults.length} repository từ CV.`,
      });
    } catch (err: any) {
      setStatusPhase("error");
      setStatusMessage(`Lỗi trong quá trình xử lý: ${err.message || "Không xác định"}`);
      toastError("Lỗi đánh giá CV", err.message || "Không thể thực hiện đánh giá CV");
    }
  };

  // Direct URL Single Evaluation
  const handleStartDirectEvaluation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!directRepoUrl.trim()) {
      toastError("Thiếu thông tin", "Vui lòng nhập đường dẫn GitHub repository");
      return;
    }

    setEvaluatedResults([]);
    setExtractedRepos([]);
    setNoReposReport(null);
    setSelectedResultIndex(0);
    setStatusPhase("evaluating");
    setStreamingSteps([]);
    setCurrentStatusLabel(`Đang kết nối repository: ${directRepoUrl}...`);
    setStatusMessage(`Đang tìm kiếm & Đánh giá repository: ${directRepoUrl}...`);

    const token = session?.access_token || "";
    const candidateId = user?.id || "00000000-0000-0000-0000-000000000000";

    try {
      let evalResp: EvaluationResultData | null = null;
      await apiStream(
        "/evaluations/evaluate-single/stream",
        token,
        {
          candidate_id: candidateId,
          repo_url: directRepoUrl.trim(),
        },
        (event: StreamEvent) => {
          if (event.event === "status") {
            setCurrentStatusLabel(event.data.label);
            setStreamingSteps((prev) => {
              const exists = prev.some((s) => s.step === event.data.step && s.label === event.data.label);
              if (exists) return prev;
              return [...prev, { step: event.data.step, label: event.data.label, timestamp: Date.now() }];
            });
          } else if (event.event === "complete") {
            evalResp = event.data as unknown as EvaluationResultData;
          } else if (event.event === "error") {
            throw new Error(event.data.error || "Lỗi xử lý đánh giá repository");
          }
        }
      );

      if (!evalResp) {
        evalResp = await apiJson<EvaluationResultData>(
          "/evaluations/evaluate-single",
          token,
          {
            method: "POST",
            body: JSON.stringify({
              candidate_id: candidateId,
              repo_url: directRepoUrl.trim(),
            }),
          }
        );
      }

      setEvaluatedResults([evalResp]);
      setStatusPhase("complete");
      setStatusMessage("Đã xong: Hoàn thành đánh giá repository!");
      success("Thành công", "Đánh giá repository thành công!");

      // Save direct URL evaluation to Supabase table
      void saveSearchToHistory({
        searchType: "direct_url",
        title: `Đánh giá trực tiếp: ${evalResp.repo_full_name}`,
        extractedReposList: [
          {
            repo_url: evalResp.repo_url,
            repo_name: evalResp.repo_full_name.split("/")[1] || evalResp.repo_full_name,
            repo_full_name: evalResp.repo_full_name,
            project_name: evalResp.project_name || evalResp.repo_full_name,
            match_type: "direct_url",
            match_reason: "Đường dẫn nhập trực tiếp",
            description: "",
            language: "",
            stars: 0,
          },
        ],
        resultsList: [evalResp],
        status: "completed",
        reportMessage: `Đã đánh giá thành công repo ${evalResp.repo_full_name}.`,
      });
    } catch (err: any) {
      setStatusPhase("error");
      setStatusMessage(`Lỗi: ${err.message || "Không thể đánh giá repository"}`);
      toastError("Lỗi", err.message || "Không thể đánh giá repository");
    }
  };

  const isRunning = statusPhase === "starting" || statusPhase === "evaluating";
  const activeResult = evaluatedResults[selectedResultIndex] || evaluatedResults[0] || null;
  const activeSelectedApp = jobApplications.find((a) => a.id === selectedApplicationId);
  const activeSelectedJob = recruiterJobs.find((j) => j.id === selectedJobId);

  return (
    <AnimatedPage>
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4 space-y-3">
        {/* Header Banner - Super Compact */}
        <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-purple-900 rounded-2xl p-3.5 sm:p-4 text-white relative overflow-hidden shadow-sm">
          <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-[11px] font-medium">
                <Sparkles size={12} className="text-indigo-400" />
                Agent 1 • AI Repository Research & Evaluator
              </div>
              <h1 className="text-lg sm:text-xl font-display font-bold tracking-tight">
                Agent Nghiên Cứu & Đánh Giá Git Repository
              </h1>
              <p className="text-slate-300 text-xs leading-relaxed max-w-2xl">
                Bóc tách dự án, truy vết GitHub repository từ CV ứng viên và chấm điểm tự động theo 5 tiêu chuẩn quốc tế.
              </p>
            </div>

            {/* History Trigger Button */}
            <div className="shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void loadSearchHistory();
                  setShowHistoryModal(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-xs backdrop-blur-md transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <History size={14} className="text-indigo-300" />
                <span>Lịch sử ({searchHistory.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-1.5">
          <button
            type="button"
            onClick={() => { if (!isRunning) setActiveTab("cv"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-all cursor-pointer ${
              activeTab === "cv"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            <FileText size={14} />
            <span>Nghiên cứu từ CV (AI CV Repo Agent)</span>
          </button>

          <button
            type="button"
            onClick={() => { if (!isRunning) setActiveTab("url"); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-xs transition-all cursor-pointer ${
              activeTab === "url"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            }`}
          >
            <LinkIcon size={14} />
            <span>Nhập trực tiếp URL Repository</span>
          </button>
        </div>

        {/* Mode 1: CV Input Form Box - Compact 1-Screen */}
        {activeTab === "cv" && (
          <div className="bg-white dark:bg-slate-800/95 rounded-xl border border-slate-200/80 dark:border-slate-700/80 p-3.5 sm:p-4 shadow-xs space-y-3">
            {/* Sub-inputs Selector */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 dark:border-slate-700/60 pb-2 text-xs font-medium">
              {canBrowse && (
                <button
                  type="button"
                  onClick={() => setCvInputType("job_applications")}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-[11px] ${
                    cvInputType === "job_applications"
                      ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800 shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  <Briefcase size={13} />
                  <span>1. Ứng viên nộp vào Job ({recruiterJobs.length})</span>
                </button>
              )}

              {userResumes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCvInputType("vault")}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-[11px] ${
                    cvInputType === "vault"
                      ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800 shadow-2xs"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  <UserCheck size={13} />
                  <span>2. Kho CV ({userResumes.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setCvInputType("text")}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-[11px] ${
                  cvInputType === "text"
                    ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                <Code2 size={13} />
                <span>3. Dán văn bản CV</span>
              </button>

              <label
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-[11px] ${
                  cvInputType === "upload"
                    ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                <Upload size={13} />
                <span>{uploadedFileName ? `Tệp: ${uploadedFileName}` : "4. Tải tệp CV lên"}</span>
                <input
                  type="file"
                  accept=".md,.txt,.pdf,.docx,.doc"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isRunning}
                />
              </label>
            </div>

            {/* Workflow 1: Recruiter selects Job & selects submitted CV - 2 Columns Side-by-Side */}
            {cvInputType === "job_applications" && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Step 1: Select Job */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[10px] font-black">
                          1
                        </span>
                        <span>Vị trí tuyển dụng:</span>
                      </label>
                      {isLoadingJobs && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" /> Đang tải...
                        </span>
                      )}
                    </div>

                    {recruiterJobs.length === 0 && !isLoadingJobs ? (
                      <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs">
                        Chưa có tin tuyển dụng nào.
                      </div>
                    ) : (
                      <select
                        value={selectedJobId}
                        onChange={(e) => setSelectedJobId(e.target.value)}
                        disabled={isRunning}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs outline-hidden focus:ring-1 focus:ring-indigo-500 font-medium cursor-pointer"
                      >
                        {recruiterJobs.map((job) => (
                          <option key={job.id} value={job.id}>
                            {job.title} {job.location ? `(${job.location})` : ""} — {job.application_count || 0} ứng viên
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Step 2: Select Submitted CV from Candidates */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                        <span className="w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[10px] font-black">
                          2
                        </span>
                        <span>Chọn CV ứng viên đã nộp ({jobApplications.length}):</span>
                      </label>
                      {isLoadingApps && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" /> Đang tải...
                        </span>
                      )}
                    </div>

                    {isLoadingApps ? (
                      <div className="p-2.5 flex items-center justify-center gap-1.5 text-slate-400 text-xs bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700">
                        <Loader2 size={12} className="animate-spin text-indigo-600" />
                        <span>Đang tải danh sách...</span>
                      </div>
                    ) : jobApplications.length === 0 ? (
                      <div className="p-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 text-center text-xs text-slate-500">
                        Chưa có ứng viên nộp CV vào Job này.
                      </div>
                    ) : (
                      <select
                        value={selectedApplicationId || ""}
                        onChange={(e) => {
                          const app = jobApplications.find((a) => a.id === e.target.value);
                          if (app && !isRunning) {
                            setSelectedApplicationId(app.id);
                            setSelectedResumeId(app.resume_id);
                          }
                        }}
                        disabled={isRunning}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs outline-hidden focus:ring-1 focus:ring-indigo-500 font-semibold cursor-pointer"
                      >
                        {jobApplications.map((app) => (
                          <option key={app.id} value={app.id}>
                            {app.applicant_name} ({app.applicant_email || "Không có email"}) — {app.resume_title_snapshot || "CV Ứng viên"}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Active candidate summary pill & Quick Action */}
                {activeSelectedApp && activeSelectedJob && (
                  <div className="p-2 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/60 flex items-center justify-between text-xs text-indigo-900 dark:text-indigo-200">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <UserCheck size={14} className="text-indigo-600 shrink-0" />
                      <span className="truncate">
                        Ứng viên: <strong>{activeSelectedApp.applicant_name}</strong> • Vị trí: <strong>{activeSelectedJob.title}</strong>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Workflow 2: Personal Vault */}
            {cvInputType === "vault" && userResumes.length > 0 && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Chọn CV từ kho CV cá nhân:
                </label>
                <select
                  value={selectedResumeId}
                  onChange={(e) => setSelectedResumeId(e.target.value)}
                  disabled={isRunning}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs outline-hidden focus:ring-1 focus:ring-indigo-500"
                >
                  {userResumes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title || r.original_filename} {r.is_default ? "(Mặc định)" : ""} — Tạo ngày {new Date(r.created_at).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Workflow 3 & 4: Text & Upload */}
            {(cvInputType === "text" || cvInputType === "upload") && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Văn bản CV (Hỗ trợ Markdown hoặc Text):
                  </label>
                  {/* Sample Presets */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] text-slate-400">Mẫu:</span>
                    {SAMPLE_CVS.map((sample, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setCvTextInput(sample.text);
                          setCvInputType("text");
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 hover:bg-indigo-50 text-[10px] text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition-colors"
                      >
                        {sample.label.split(" (")[0]}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={cvTextInput}
                  onChange={(e) => setCvTextInput(e.target.value)}
                  placeholder="Dán nội dung CV có chứa thông tin dự án, link GitHub repo hoặc link GitHub Profile..."
                  disabled={isRunning}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono outline-hidden focus:ring-1 focus:ring-indigo-500 leading-relaxed resize-none"
                />
              </div>
            )}

            {/* Submit Button - Compact & Visible without scrolling */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => void handleStartCVEvaluation()}
                disabled={isRunning || (cvInputType === "job_applications" && jobApplications.length === 0)}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isRunning ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Đang nghiên cứu repos từ CV...</span>
                  </>
                ) : (
                  <>
                    <Search size={14} />
                    <span>Bắt đầu nghiên cứu từ CV</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Mode 2: Direct URL Input Box */}
        {activeTab === "url" && (
          <div className="bg-white dark:bg-slate-800/95 rounded-xl border border-slate-200/80 dark:border-slate-700/80 p-3.5 sm:p-4 shadow-xs space-y-2.5">
            <form onSubmit={handleStartDirectEvaluation} className="space-y-2.5">
              <label className="block text-xs font-bold text-slate-900 dark:text-white">
                Đường dẫn GitHub Repository
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    value={directRepoUrl}
                    onChange={(e) => setDirectRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repository"
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-1 focus:ring-indigo-500 transition-all outline-hidden"
                    disabled={isRunning}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isRunning}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-md disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {isRunning ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Đang đánh giá...</span>
                    </>
                  ) : (
                    <>
                      <Search size={14} />
                      <span>Đánh giá trực tiếp</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick Samples */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-medium">Mẫu thử:</span>
                {SAMPLE_REPOS.map((sample) => (
                  <button
                    type="button"
                    key={sample}
                    onClick={() => setDirectRepoUrl(sample)}
                    className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-slate-600 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    {sample.replace("https://github.com/", "")}
                  </button>
                ))}
              </div>
            </form>
          </div>
        )}

        {/* 3-Stage Progress Pipeline Status Bar */}
        {statusPhase !== "idle" && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-4"
          >
            {/* Status Steps Flow: Bắt đầu -> Đang tìm kiếm & Đánh giá -> Đã xong */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Step 1: Bắt đầu */}
              <div
                className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
                  statusPhase === "starting"
                    ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-semibold"
                    : statusPhase === "evaluating" || statusPhase === "complete" || statusPhase === "no_repos"
                    ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-medium"
                    : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400"
                }`}
              >
                {statusPhase === "starting" ? (
                  <Loader2 size={20} className="animate-spin text-indigo-600 shrink-0" />
                ) : statusPhase === "evaluating" || statusPhase === "complete" || statusPhase === "no_repos" ? (
                  <CheckCircle size={20} className="text-emerald-500 shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center text-xs shrink-0">
                    1
                  </div>
                )}
                <div>
                  <div className="text-xs uppercase tracking-wider font-bold">Giai đoạn 1</div>
                  <div className="text-sm">Bắt đầu & Bóc tách CV</div>
                </div>
              </div>

              {/* Step 2: Đang tìm kiếm */}
              <div
                className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
                  statusPhase === "evaluating"
                    ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-semibold"
                    : statusPhase === "complete"
                    ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-medium"
                    : statusPhase === "no_repos"
                    ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
                    : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400"
                }`}
              >
                {statusPhase === "evaluating" ? (
                  <Loader2 size={20} className="animate-spin text-indigo-600 shrink-0" />
                ) : statusPhase === "complete" ? (
                  <CheckCircle size={20} className="text-emerald-500 shrink-0" />
                ) : statusPhase === "no_repos" ? (
                  <AlertTriangle size={20} className="text-amber-500 shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center text-xs shrink-0">
                    2
                  </div>
                )}
                <div>
                  <div className="text-xs uppercase tracking-wider font-bold">Giai đoạn 2</div>
                  <div className="text-sm">
                    {statusPhase === "evaluating" && extractedRepos.length > 0
                      ? `Đang đánh giá (${currentRepoIndex}/${extractedRepos.length})`
                      : "Đang tìm kiếm & Đánh giá"}
                  </div>
                </div>
              </div>

              {/* Step 3: Đã xong */}
              <div
                className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
                  statusPhase === "complete"
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-semibold shadow-sm"
                    : statusPhase === "no_repos"
                    ? "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"
                    : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400"
                }`}
              >
                {statusPhase === "complete" ? (
                  <CheckCircle size={20} className="text-emerald-500 shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600 flex items-center justify-center text-xs shrink-0">
                    3
                  </div>
                )}
                <div>
                  <div className="text-xs uppercase tracking-wider font-bold">Giai đoạn 3</div>
                  <div className="text-sm">Đã xong & Báo cáo</div>
                </div>
              </div>
            </div>

            {/* Detailed Status description */}
            <div className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2">
                {isRunning ? (
                  <Loader2 size={14} className="animate-spin text-indigo-600 shrink-0" />
                ) : statusPhase === "complete" ? (
                  <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                )}
                <span className="font-medium">{statusMessage}</span>
              </div>

              {extractedRepos.length > 0 && (
                <span className="text-indigo-600 dark:text-indigo-400 font-semibold shrink-0">
                  {evaluatedResults.length} / {extractedRepos.length} repo hoàn tất
                </span>
              )}
            </div>

            {/* Live streaming status indicator for active repo evaluation */}
            {statusPhase === "evaluating" && streamingSteps.length > 0 && (
              <div className="pt-1">
                <SuggestionStatusIndicator
                  currentLabel={currentStatusLabel}
                  steps={streamingSteps}
                  isGenerating={true}
                  theme="candidate"
                />
              </div>
            )}
          </motion.div>
        )}

        {/* Report Card when NO Repos are found (null report) */}
        {statusPhase === "no_repos" && noReposReport && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-amber-50/90 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/80 rounded-2xl p-6 shadow-sm space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-100 dark:bg-amber-900/50 rounded-xl text-amber-700 dark:text-amber-300 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-bold text-amber-900 dark:text-amber-200">
                  Báo cáo: Không tìm thấy GitHub Repository phù hợp
                </h3>
                <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                  {noReposReport}
                </p>
                <div className="pt-2 text-xs text-amber-700/80 dark:text-amber-400 space-y-1">
                  <p className="font-semibold">Gợi ý khắc phục:</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    <li>Thêm đường dẫn GitHub repository trực tiếp (ví dụ: <code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">https://github.com/username/repo-name</code>) vào phần mô tả dự án trong CV.</li>
                    <li>Hoặc thêm đường dẫn GitHub Profile (<code className="bg-amber-100 dark:bg-amber-900 px-1 py-0.5 rounded">https://github.com/username</code>) và đảm bảo các repository công khai có tên hoặc mô tả trùng với dự án trong CV.</li>
                    <li>Hoặc chuyển sang tab <strong>"Nhập trực tiếp URL Repository"</strong> ở trên để đánh giá nhanh.</li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Real-time Progressive List of Evaluated Repos */}
        {evaluatedResults.length > 0 && (
          <div className="space-y-6">
            {/* Header with Extracted & Evaluated Repos selector */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FolderGit2 size={20} className="text-indigo-600" />
                    <span>Danh sách Repository Đã Nghiên Cứu ({evaluatedResults.length})</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Kết quả hiển thị ngay lập tức khi từng repo hoàn tất đánh giá. Chọn repo bên dưới để xem chi tiết 5 tiêu chí.
                  </p>
                </div>

                {isRunning && (
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold shrink-0">
                    <Loader2 size={12} className="animate-spin" />
                    <span>Đang phân tích thêm repo...</span>
                  </div>
                )}
              </div>

              {/* Repo Selector Chips */}
              <div className="flex flex-wrap gap-2 pt-2">
                {evaluatedResults.map((result, idx) => {
                  const isSelected = (selectedResultIndex === idx) || (selectedResultIndex === 0 && idx === 0 && evaluatedResults.length === 1);
                  const badge = getSeniorityBadge(result.overall_score);

                  return (
                    <motion.button
                      key={result.repo_full_name + idx}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      type="button"
                      onClick={() => setSelectedResultIndex(idx)}
                      className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                        isSelected
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20"
                          : "bg-slate-50 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      <GitBranch size={14} />
                      <span className="font-bold">{result.project_name || result.repo_full_name}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          isSelected ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                        }`}
                      >
                        {Number(result.overall_score).toFixed(1)} / 10
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Active Selected Repo Detailed Card */}
            <AnimatePresence mode="wait">
              {activeResult && (
                <motion.div
                  key={activeResult.repo_full_name + selectedResultIndex}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-6"
                >
                  {/* Overall Score & Summary Card */}
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-700">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            {activeResult.repo_full_name}
                          </h2>
                          <a
                            href={activeResult.repo_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 p-1 hover:bg-indigo-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            title="Xem trên GitHub"
                          >
                            <ExternalLink size={18} />
                          </a>
                        </div>
                        {activeResult.project_name && (
                          <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                            Khớp với dự án trong CV: {activeResult.project_name}
                          </div>
                        )}
                        <p className="text-slate-600 dark:text-slate-300 text-sm max-w-2xl leading-relaxed">
                          {activeResult.summary}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 shrink-0 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
                        <div className="text-right">
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Weighted Score</div>
                          <div className="text-3xl font-display font-black text-indigo-600 dark:text-indigo-400">
                            {Number(activeResult.overall_score).toFixed(1)}
                            <span className="text-sm font-normal text-slate-400"> / 10</span>
                          </div>
                        </div>
                        <div className="h-10 w-px bg-slate-200 dark:bg-slate-700" />
                        <div>
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${
                              getSeniorityBadge(activeResult.overall_score).color
                            }`}
                          >
                            {getSeniorityBadge(activeResult.overall_score).label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Heuristic Metrics Bar */}
                    {activeResult.heuristic_metrics && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-6 text-center">
                        <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                          <div className="text-xs text-slate-500">Tổng số File</div>
                          <div className="text-lg font-bold text-slate-900 dark:text-white">
                            {activeResult.heuristic_metrics.file_count}
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                          <div className="text-xs text-slate-500">Test Ratio</div>
                          <div className="text-lg font-bold text-emerald-600">
                            {Math.round(activeResult.heuristic_metrics.test_ratio * 100)}%
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                          <div className="text-xs text-slate-500">Doc Ratio</div>
                          <div className="text-lg font-bold text-blue-600">
                            {Math.round(activeResult.heuristic_metrics.doc_ratio * 100)}%
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                          <div className="text-xs text-slate-500">CI/CD Pipeline</div>
                          <div className="text-lg font-bold text-slate-900 dark:text-white">
                            {activeResult.heuristic_metrics.has_ci ? "✓ Có" : "✗ Không"}
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                          <div className="text-xs text-slate-500">Docker Container</div>
                          <div className="text-lg font-bold text-slate-900 dark:text-white">
                            {activeResult.heuristic_metrics.has_docker ? "✓ Có" : "✗ Không"}
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                          <div className="text-xs text-slate-500">Số Ngôn ngữ</div>
                          <div className="text-lg font-bold text-slate-900 dark:text-white">
                            {activeResult.heuristic_metrics.language_count}
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                          <div className="text-xs text-slate-500">Tier 1 Score</div>
                          <div className="text-lg font-bold text-purple-600">
                            {activeResult.heuristic_metrics.tier1_score}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 5 Evaluation Dimensions Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {DIMENSION_CONFIG.map((dim) => {
                      const scoreVal = getScoreValue(
                        (activeResult.evaluation_scores as any)[dim.key]
                      );
                      const reasonText = getScoreReason(
                        (activeResult.evaluation_scores as any)[dim.key],
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
                  {activeResult.red_flags && activeResult.red_flags.length > 0 && (
                    <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 rounded-2xl p-6">
                      <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-base mb-3">
                        <AlertTriangle size={20} />
                        <span>Cảnh báo bảo mật & Tiềm ẩn rủi ro (Red Flags)</span>
                      </div>
                      <ul className="space-y-2 text-sm text-rose-600 dark:text-rose-300">
                        {activeResult.red_flags.map((flag, idx) => (
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
        )}

        {/* Search History Modal / Slide-over Drawer */}
        <AnimatePresence>
          {showHistoryModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
              >
                {/* Modal Header */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                      <History size={22} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                        Lịch Sử Tìm Kiếm & Đánh Giá Repo
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Dữ liệu được lưu trữ tự động trong bảng Supabase <code className="bg-slate-100 dark:bg-slate-700 px-1 py-0.5 rounded">repo_search_history</code>.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowHistoryModal(false)}
                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto flex-1 space-y-3">
                  {isLoadingHistory ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                      <Loader2 size={28} className="animate-spin text-indigo-600" />
                      <span className="text-xs">Đang tải lịch sử từ cơ sở dữ liệu...</span>
                    </div>
                  ) : searchHistory.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 space-y-2">
                      <History size={36} className="mx-auto text-slate-300 dark:text-slate-600" />
                      <p className="text-sm font-medium">Chưa có lịch sử tìm kiếm nào được lưu.</p>
                      <p className="text-xs text-slate-500">Mỗi khi bạn thực hiện nghiên cứu từ CV hoặc đánh giá repo, hệ thống sẽ tự động lưu lại vào Supabase.</p>
                    </div>
                  ) : (
                    searchHistory.map((item) => {
                      const repoCount = item.extracted_repos?.length || item.evaluation_results?.length || 0;
                      const isNoRepos = item.status === "no_repos";

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleRestoreHistoryItem(item)}
                          className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 bg-slate-50 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-800 transition-all flex items-center justify-between gap-4 cursor-pointer group shadow-sm hover:shadow"
                        >
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  item.search_type === "cv"
                                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                                    : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                                }`}
                              >
                                {item.search_type === "cv" ? "Tìm theo CV" : "Nhập URL"}
                              </span>

                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isNoRepos
                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                }`}
                              >
                                {isNoRepos ? "Không có repo" : `${repoCount} Repo`}
                              </span>

                              <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                {item.title}
                              </h4>
                            </div>

                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {item.report_message || item.cv_preview || `Tìm kiếm ${repoCount} repository.`}
                            </p>

                            <div className="flex items-center gap-2 text-[11px] text-slate-400">
                              <Clock size={12} />
                              <span>{new Date(item.created_at).toLocaleString()}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                              className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                              title="Xóa bản ghi này"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-xs text-slate-500">
                  <span>Bấm vào một phiên để khôi phục lại kết quả đánh giá</span>
                  <button
                    type="button"
                    onClick={() => void loadSearchHistory()}
                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw size={13} className={isLoadingHistory ? "animate-spin" : ""} />
                    <span>Làm mới</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </AnimatedPage>
  );
}
