import React, { useState, useEffect, useCallback, useRef } from "react";
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
  History,
  Trash2,
  Eye,
  CheckSquare,
  Square,
  Plus,
  ListChecks,
  X,
  Filter,
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

// Cấu trúc bản ghi lịch sử đánh giá CV
interface CvAssessmentHistoryRecord {
  id: string;
  user_id?: string;
  target_role: string;
  target_level: string;
  overall_score: number;
  resume_id?: string;
  cv_title?: string;
  cv_preview?: string;
  assessment_data: CvAssessmentData;
  checklist_state?: Record<string, boolean>;
  created_at: string;
  updated_at?: string;
}

// Cấu trúc một mục checklist hành động
interface ChecklistItem {
  id: string;
  category: "skill_gap" | "ghost_skill" | "roadmap" | "cv_prep" | "custom";
  categoryLabel: string;
  title: string;
  description?: string;
  isCustom?: boolean;
}

export default function CVAssessmentPage() {
  const { user, session } = useAuth();
  const { lang } = useLang();
  const { error: toastError, success: toastSuccess, info: toastInfo } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  // Tham chiếu các phần tử DOM để auto-scroll
  const progressSectionRef = useRef<HTMLDivElement>(null);
  const resultSectionRef = useRef<HTMLDivElement>(null);

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

  // State lịch sử đánh giá
  const [historyList, setHistoryList] = useState<CvAssessmentHistoryRecord[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

  // State checklist kiểm tra hành động
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [customChecklistItems, setCustomChecklistItems] = useState<ChecklistItem[]>([]);
  const [newCustomTaskText, setNewCustomTaskText] = useState<string>("");
  const [isAddingCustomTask, setIsAddingCustomTask] = useState<boolean>(false);
  const [checklistFilter, setChecklistFilter] = useState<"all" | "pending" | "completed">("all");

  // Tải danh sách CV từ tủ hồ sơ
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

  // Tải lịch sử đánh giá từ backend API và Supabase
  const loadAssessmentHistory = useCallback(async () => {
    if (!session?.access_token) return;
    setLoadingHistory(true);
    try {
      const records = await apiJson<CvAssessmentHistoryRecord[]>(
        "/cv-assessment/history",
        session.access_token
      );
      if (Array.isArray(records)) {
        setHistoryList(records);
        // Lưu cache local
        try {
          localStorage.setItem(`cv_assess_history_${user?.id || "guest"}`, JSON.stringify(records));
        } catch (_) {}
      }
    } catch (err) {
      // Fallback lấy từ localStorage
      try {
        const cached = localStorage.getItem(`cv_assess_history_${user?.id || "guest"}`);
        if (cached) {
          setHistoryList(JSON.parse(cached));
        }
      } catch (_) {}
    } finally {
      setLoadingHistory(false);
    }
  }, [session, user]);

  useEffect(() => {
    void loadResumes();
    void loadAssessmentHistory();
  }, [loadResumes, loadAssessmentHistory]);

  // Lưu bản ghi đánh giá vào Lịch sử
  const persistAssessmentHistory = async (
    resultData: CvAssessmentData,
    targetRole: string,
    targetLevel: string,
    resumeId?: string,
    cvTitle?: string,
    cvPreview?: string
  ): Promise<string | null> => {
    if (!session?.access_token) return null;
    try {
      const res = await apiJson<{ id: string; status: string }>(
        "/cv-assessment/history",
        session.access_token,
        {
          method: "POST",
          body: JSON.stringify({
            user_id: user?.id || null,
            target_role: targetRole,
            target_level: targetLevel,
            overall_score: resultData.overall_score,
            resume_id: resumeId || null,
            cv_title: cvTitle || null,
            cv_preview: cvPreview ? cvPreview.slice(0, 300) : null,
            assessment_data: resultData,
            checklist_state: {},
          }),
        }
      );
      if (res?.id) {
        void loadAssessmentHistory();
        return res.id;
      }
    } catch (err) {
      console.warn("Không thể lưu lịch sử vào Supabase:", err);
    }
    return null;
  };

  // Xóa bản ghi lịch sử đánh giá
  const handleDeleteHistoryItem = async (historyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(lang === "en" ? "Are you sure you want to delete this assessment history?" : "Bạn có chắc chắn muốn xóa bản ghi đánh giá này?")) {
      return;
    }
    try {
      if (session?.access_token) {
        await apiJson(`/cv-assessment/history/${historyId}`, session.access_token, {
          method: "DELETE",
        });
      }
      setHistoryList((prev) => prev.filter((item) => item.id !== historyId));
      if (currentHistoryId === historyId) {
        setCurrentHistoryId(null);
      }
      toastSuccess(lang === "en" ? "Deleted history record successfully" : "Đã xóa bản ghi lịch sử thành công");
    } catch (err) {
      toastError(lang === "en" ? "Failed to delete history" : "Xóa lịch sử thất bại");
    }
  };

  // Khôi phục xem lại một bản ghi lịch sử
  const handleRestoreHistoryItem = (item: CvAssessmentHistoryRecord) => {
    setAssessmentResult(item.assessment_data);
    setCurrentHistoryId(item.id);
    setChecklistState(item.checklist_state || {});
    setShowHistoryModal(false);
    toastInfo(lang === "en" ? `Loaded assessment: ${item.target_role}` : `Đã tải lại kết quả: ${item.target_role} (${item.target_level})`);

    // Cuộn xuống xem kết quả báo cáo
    setTimeout(() => {
      if (resultSectionRef.current) {
        resultSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  };

  // Sinh danh sách checklist từ kết quả đánh giá hiện tại
  const generateChecklistItems = useCallback((): ChecklistItem[] => {
    if (!assessmentResult) return [];
    const items: ChecklistItem[] = [];

    // 1. Nhóm Kỹ năng còn thiếu (Skill Gap Actions)
    if (assessmentResult.skill_gap?.missing && assessmentResult.skill_gap.missing.length > 0) {
      assessmentResult.skill_gap.missing.forEach((skill) => {
        items.push({
          id: `gap_${skill.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
          category: "skill_gap",
          categoryLabel: lang === "en" ? "Missing Skill Gap" : "Lỗ hổng kỹ năng cần bổ sung",
          title: lang === "en" ? `Master skill: ${skill}` : `Bổ sung & Nâng cao kỹ năng: ${skill}`,
          description: lang === "en" ? `Complete real-world projects or tutorials mastering ${skill}.` : `Thực hành xây dựng tính năng hoặc mini-project có ứng dụng ${skill}.`,
        });
      });
    }

    // 2. Nhóm Kỹ năng ma chưa có bằng chứng dự án (Ghost Skills Actions)
    const ghostSkills = assessmentResult.authenticity?.ghost_skills || [];
    if (ghostSkills.length > 0) {
      ghostSkills.forEach((skill: string) => {
        items.push({
          id: `ghost_${skill.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
          category: "ghost_skill",
          categoryLabel: lang === "en" ? "Evidence Verification" : "Bổ sung bằng chứng dự án",
          title: lang === "en" ? `Add project proof for: ${skill}` : `Thêm dự án minh chứng cho kỹ năng: ${skill}`,
          description: lang === "en" ? `Link GitHub repo or describe measurable impact using ${skill}.` : `Cập nhật mô tả dự án và đính kèm link repository thể hiện việc dùng ${skill}.`,
        });
      });
    }

    // 3. Nhóm Cột mốc lộ trình 3 giai đoạn (Roadmap Milestones)
    if (assessmentResult.learning_roadmap && assessmentResult.learning_roadmap.length > 0) {
      assessmentResult.learning_roadmap.forEach((phase) => {
        items.push({
          id: `phase_${phase.phase}_core`,
          category: "roadmap",
          categoryLabel: lang === "en" ? `Phase ${phase.phase} Milestone` : `Giai đoạn ${phase.phase} (${phase.duration_weeks} tuần)`,
          title: `${phase.title}`,
          description: lang === "en" ? `Focus: ${phase.focus_skills.join(", ")}` : `Trọng tâm: ${phase.focus_skills.join(", ")}`,
        });

        phase.recommended_topics_or_projects.forEach((proj, idx) => {
          items.push({
            id: `phase_${phase.phase}_proj_${idx}`,
            category: "roadmap",
            categoryLabel: lang === "en" ? `Phase ${phase.phase} Project` : `Dự án Giai đoạn ${phase.phase}`,
            title: proj,
            description: lang === "en" ? "Complete this recommended project topic." : "Hoàn thành mục tiêu dự án thực hành này.",
          });
        });
      });
    }

    // 4. Nhóm Tối ưu CV & Chuẩn bị phỏng vấn (CV & Interview Prep)
    items.push({
      id: "cv_prep_metrics",
      category: "cv_prep",
      categoryLabel: lang === "en" ? "CV Optimization" : "Chuẩn hóa hồ sơ & Phỏng vấn",
      title: lang === "en" ? "Quantify project results with STAR/XYZ format" : "Bổ sung số liệu định lượng (STAR/XYZ format) vào phần kinh nghiệm dự án",
      description: lang === "en" ? "Highlight metrics (e.g. reduced latency by 30%, served 10k users)." : "Ghi rõ kết quả đo lường (VD: giảm 30% latency, phục vụ 10k người dùng).",
    });
    items.push({
      id: "cv_prep_interview",
      category: "cv_prep",
      categoryLabel: lang === "en" ? "CV Optimization" : "Chuẩn hóa hồ sơ & Phỏng vấn",
      title: lang === "en" ? `Practice technical interview questions for ${assessmentResult.target_role}` : `Luyện tập bộ câu hỏi phỏng vấn chuyên sâu cho vị trí ${assessmentResult.target_role}`,
      description: lang === "en" ? "Prepare architecture trade-offs and code deep-dives." : "Chuẩn bị sẵn sàng giải thích kiến trúc và phân tích code mẫu.",
    });

    // 5. Kết hợp các mục do người dùng tự thêm
    return [...items, ...customChecklistItems];
  }, [assessmentResult, customChecklistItems, lang]);

  // Cập nhật trạng thái một mục trong checklist
  const handleToggleChecklistItem = async (itemId: string) => {
    const nextState = {
      ...checklistState,
      [itemId]: !checklistState[itemId],
    };
    setChecklistState(nextState);

    // Lưu vào localStorage
    try {
      const storageKey = currentHistoryId
        ? `cv_checklist_${currentHistoryId}`
        : `cv_checklist_current_${assessmentResult?.target_role || "general"}`;
      localStorage.setItem(storageKey, JSON.stringify(nextState));
    } catch (_) {}

    // Đồng bộ lên Supabase nếu có history record ID
    if (currentHistoryId && session?.access_token) {
      try {
        await apiJson(
          `/cv-assessment/history/${currentHistoryId}/checklist`,
          session.access_token,
          {
            method: "PATCH",
            body: JSON.stringify({ checklist_state: nextState }),
          }
        );
      } catch (err) {
        console.warn("Không thể đồng bộ checklist lên cloud:", err);
      }
    }
  };

  // Thêm mục checklist tùy chỉnh của người dùng
  const handleAddCustomTask = () => {
    if (!newCustomTaskText.trim()) return;
    const newItem: ChecklistItem = {
      id: `custom_${Date.now()}`,
      category: "custom",
      categoryLabel: lang === "en" ? "My Custom Goal" : "Mục tiêu cá nhân",
      title: newCustomTaskText.trim(),
      isCustom: true,
    };
    setCustomChecklistItems((prev) => [...prev, newItem]);
    setNewCustomTaskText("");
    setIsAddingCustomTask(false);
    toastSuccess(lang === "en" ? "Added custom checklist item" : "Đã thêm mục kiểm tra cá nhân mới");
  };

  // Khôi phục checklist về trạng thái ban đầu
  const handleResetChecklist = () => {
    if (!confirm(lang === "en" ? "Reset all checklist checkmarks?" : "Bạn có muốn bỏ chọn tất cả các mục trong bảng kiểm tra?")) return;
    setChecklistState({});
    if (currentHistoryId && session?.access_token) {
      void apiJson(
        `/cv-assessment/history/${currentHistoryId}/checklist`,
        session.access_token,
        {
          method: "PATCH",
          body: JSON.stringify({ checklist_state: {} }),
        }
      );
    }
    toastInfo(lang === "en" ? "Checklist reset" : "Đã đặt lại bảng kiểm tra");
  };

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

    // Xác thực đầu vào hợp lệ
    let cvTitleToSave = "";
    let cvPreviewToSave = "";

    if (inputMode === "vault") {
      if (!selectedResumeId) {
        toastError("Vui lòng chọn 1 CV trong Tủ hồ sơ.");
        return;
      }
      const foundResume = resumes.find((r) => r.id === selectedResumeId);
      cvTitleToSave = foundResume?.title || foundResume?.original_filename || "CV Tủ hồ sơ";
    } else if (inputMode === "file") {
      if (!uploadedFile) {
        toastError("Vui lòng chọn tệp CV (.pdf, .docx, .txt).");
        return;
      }
      cvTitleToSave = uploadedFile.name;
    } else {
      if (!pastedCvText.trim() || pastedCvText.trim().length < 30) {
        toastError("Vui lòng dán nội dung CV có độ dài hợp lệ (tối thiểu 30 ký tự).");
        return;
      }
      cvTitleToSave = "Văn bản CV tự dán";
      cvPreviewToSave = pastedCvText.trim().slice(0, 200);
    }

    // Bắt đầu trạng thái phân tích
    setAnalyzing(true);
    setAssessmentResult(null);
    setCurrentHistoryId(null);
    setChecklistState({});
    setCurrentStep("init");
    setStepLabel("Đang khởi tạo Agent đánh giá hồ sơ...");

    // Tự động cuộn xuống phần Progress ngay lập tức để người dùng không còn thấy nút bắt đầu
    setTimeout(() => {
      if (progressSectionRef.current) {
        progressSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);

    try {
      let finalData: CvAssessmentData | null = null;

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

        finalData = (await response.json()) as CvAssessmentData;
      } else {
        // Sử dụng Stream SSE cho Resume ID hoặc Text
        const requestPayload: Record<string, any> = {
          target_role: effectiveRole,
          target_level: selectedLevel,
        };

        if (inputMode === "vault") {
          requestPayload.resume_id = selectedResumeId;
        } else {
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
              finalData = event.data as unknown as CvAssessmentData;
            } else if (event.event === "error") {
              throw new Error(event.data.error || "Lỗi trong quá trình xử lý");
            }
          }
        );
      }

      if (finalData) {
        setAssessmentResult(finalData);
        toastSuccess("Đánh giá CV & Tổng hợp lộ trình thành công!");

        // Tự động lưu vào lịch sử đánh giá
        const savedId = await persistAssessmentHistory(
          finalData,
          effectiveRole,
          selectedLevel,
          inputMode === "vault" ? selectedResumeId : undefined,
          cvTitleToSave,
          cvPreviewToSave
        );
        if (savedId) {
          setCurrentHistoryId(savedId);
        }

        // Tự động cuộn xuống phần kết quả báo cáo
        setTimeout(() => {
          if (resultSectionRef.current) {
            resultSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 100);
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

  // Tính toán số lượng mục checklist
  const allChecklistItems = generateChecklistItems();
  const completedCount = allChecklistItems.filter((it) => checklistState[it.id]).length;
  const totalCount = allChecklistItems.length;
  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const filteredChecklistItems = allChecklistItems.filter((item) => {
    if (checklistFilter === "completed") return !!checklistState[item.id];
    if (checklistFilter === "pending") return !checklistState[item.id];
    return true;
  });

  return (
    <AnimatedPage>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-5">
        {/* Banner tiêu đề tinh gọn (Thu nhỏ banner để nút bắt đầu nằm gọn trong màn hình) */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 text-white p-4 sm:p-5 md:p-6 shadow-xl">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="max-w-3xl space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 text-xs font-medium backdrop-blur-md">
                  <Sparkles size={13} className="text-indigo-300" />
                  Candidate AI Agent
                </div>
                <span className="text-xs text-indigo-200/80 hidden sm:inline">•</span>
                <span className="text-xs text-indigo-200/90 font-medium">
                  Đánh giá độ mạnh CV theo chuẩn ngành & gợi ý lộ trình
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight font-display">
                Đánh Giá Năng Lực CV & Lộ Trình Phát Triển
              </h1>
              <p className="text-indigo-100/85 text-xs sm:text-sm leading-relaxed max-w-2xl">
                Đối chiếu hồ sơ với tiêu chuẩn tuyển dụng thực tế, phát hiện khoảng trống kỹ năng & kỹ năng ma để bứt phá sự nghiệp.
              </p>
            </div>

            {/* Nút xem lịch sử đánh giá */}
            <div className="shrink-0 flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowHistoryModal(true)}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md flex items-center gap-2 text-xs py-2 px-3.5"
              >
                <History size={15} className="text-indigo-200" />
                <span>{lang === "en" ? "Assessment History" : "Lịch sử đánh giá"}</span>
                {historyList.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-indigo-400/40 text-white text-[10px] font-bold">
                    {historyList.length}
                  </span>
                )}
              </Button>
            </div>
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-purple-500/10 to-transparent pointer-events-none" />
        </div>

        {/* Khu vực Lựa chọn cấu hình đánh giá (Form được tối ưu chiều cao) */}
        {!assessmentResult && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Cột trái: Chọn nguồn CV */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-4 sm:p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                      1
                    </div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      Chọn Hồ sơ / CV của bạn
                    </h2>
                  </div>
                  {/* Tab chọn cách nạp CV */}
                  <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl text-xs font-medium">
                    <button
                      onClick={() => setInputMode("vault")}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        inputMode === "vault"
                          ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Tủ hồ sơ CV
                    </button>
                    <button
                      onClick={() => setInputMode("file")}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        inputMode === "file"
                          ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Tải tệp mới
                    </button>
                    <button
                      onClick={() => setInputMode("text")}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
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
                      <div className="py-6 text-center text-xs text-slate-400">
                        {lang === "en" ? "Loading CVs..." : "Đang tải danh sách CV..."}
                      </div>
                    ) : resumes.length === 0 ? (
                      <div className="p-4 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                        <FileText size={28} className="mx-auto text-slate-400" />
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {lang === "en" ? "You don't have any CVs in your Vault." : "Bạn chưa có CV nào trong Tủ hồ sơ."}
                        </p>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setInputMode("file")}
                          className="text-xs"
                        >
                          {lang === "en" ? "Upload CV File Now" : "Tải tệp CV lên ngay"}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {resumes.map((cv) => (
                          <div
                            key={cv.id}
                            onClick={() => setSelectedResumeId(cv.id)}
                            className={`p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                              selectedResumeId === cv.id
                                ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 dark:border-indigo-500"
                                : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-300 shrink-0">
                                <FileText size={16} />
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-slate-900 dark:text-white text-xs">
                                    {cv.title || cv.original_filename}
                                  </span>
                                  {cv.is_default && (
                                    <span className="px-1.5 py-0.2 text-[9px] font-bold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                      {lang === "en" ? "Default" : "Mặc định"}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  {lang === "en" ? "Uploaded:" : "Tải lên:"} {new Date(cv.created_at).toLocaleDateString(lang === "en" ? "en-US" : "vi-VN")}
                                </p>
                              </div>
                            </div>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                              selectedResumeId === cv.id
                                ? "border-indigo-600 bg-indigo-600 text-white"
                                : "border-slate-300 dark:border-slate-600"
                            }`}>
                              {selectedResumeId === cv.id && <CheckCircle2 size={12} />}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Tải file mới */}
                {inputMode === "file" && (
                  <div className="space-y-3">
                    <label className="block p-5 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors cursor-pointer text-center bg-slate-50/50 dark:bg-slate-900/20">
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
                      <Upload size={26} className="mx-auto text-indigo-500 mb-1.5" />
                      <p className="font-medium text-slate-700 dark:text-slate-300 text-xs">
                        {uploadedFile ? uploadedFile.name : (lang === "en" ? "Click to select or drag CV file here" : "Nhấn để chọn tệp hoặc kéo thả file CV vào đây")}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{lang === "en" ? "PDF, DOCX, TXT (Max 10MB)" : "Hỗ trợ PDF, DOCX, TXT (Tối đa 10MB)"}</p>
                    </label>
                  </div>
                )}

                {/* Tab 3: Dán văn bản */}
                {inputMode === "text" && (
                  <div>
                    <textarea
                      rows={5}
                      value={pastedCvText}
                      onChange={(e) => setPastedCvText(e.target.value)}
                      placeholder={lang === "en" ? "Paste full CV content here..." : "Dán toàn bộ nội dung CV của bạn tại đây (Kinh nghiệm, kỹ năng, dự án)..."}
                      className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Cột phải: Chọn Ngành nghề & Cấp bậc mục tiêu */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-4 sm:p-5 shadow-sm space-y-3.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-xs">
                    2
                  </div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Ngành nghề & Cấp bậc mục tiêu
                  </h2>
                </div>

                {/* Danh mục ngành nghề phổ biến */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Vị trí muốn ứng tuyển:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {POPULAR_ROLES.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => {
                          setSelectedRole(role.title);
                          setCustomRole("");
                        }}
                        className={`p-2 rounded-xl border text-left text-[11px] transition-all flex items-center gap-1.5 ${
                          selectedRole === role.title && !customRole
                            ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold shadow-sm"
                            : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                        }`}
                      >
                        <span className="text-sm">{role.icon}</span>
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
                    className="w-full mt-1 px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Chọn cấp bậc */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Cấp bậc kỳ vọng:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SENIORITY_LEVELS.map((lvl) => (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => setSelectedLevel(lvl.id)}
                        className={`p-1.5 rounded-xl border text-center transition-all ${
                          selectedLevel === lvl.id
                            ? "border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold shadow-sm"
                            : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300"
                        }`}
                      >
                        <div className="text-[11px] font-bold">{lvl.label}</div>
                        <div className="text-[9px] text-slate-400">{lvl.exp}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Nút kích hoạt Đánh giá */}
                <Button
                  variant="primary"
                  size="md"
                  className="w-full py-3 text-sm sm:text-base font-bold shadow-md shadow-indigo-500/25 flex items-center justify-center gap-2"
                  disabled={analyzing}
                  onClick={handleStartAssessment}
                >
                  <Sparkles size={18} className="animate-pulse" />
                  Bắt đầu Đánh Giá Năng Lực CV
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Khu vực Tiến trình Phân tích (Progress Section - Mục tiêu auto-scroll) */}
        <div ref={progressSectionRef} className="scroll-mt-6">
          {analyzing && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-8 text-center shadow-lg space-y-5 max-w-2xl mx-auto"
            >
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-indigo-200 dark:border-indigo-900 border-t-indigo-600 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Compass size={26} className="animate-pulse" />
                </div>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  AI Agent đang phân tích và đối chuẩn hồ sơ...
                </h3>
                <p className="text-xs sm:text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                  {stepLabel || "Đang xử lý dữ liệu..."}
                </p>
              </div>
              {/* Tiến trình 4 bước */}
              <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-[11px]">
                <div className={`p-2 rounded-lg ${currentStep === "parse" ? "bg-indigo-100 dark:bg-indigo-900/50 font-bold text-indigo-700 dark:text-indigo-300 shadow-sm" : "text-slate-400"}`}>
                  1. Trích xuất CV
                </div>
                <div className={`p-2 rounded-lg ${currentStep === "retrieve" ? "bg-indigo-100 dark:bg-indigo-900/50 font-bold text-indigo-700 dark:text-indigo-300 shadow-sm" : "text-slate-400"}`}>
                  2. Knowledge Graph
                </div>
                <div className={`p-2 rounded-lg ${currentStep === "score" ? "bg-indigo-100 dark:bg-indigo-900/50 font-bold text-indigo-700 dark:text-indigo-300 shadow-sm" : "text-slate-400"}`}>
                  3. Tính điểm 4 trục
                </div>
                <div className={`p-2 rounded-lg ${currentStep === "report" ? "bg-indigo-100 dark:bg-indigo-900/50 font-bold text-indigo-700 dark:text-indigo-300 shadow-sm" : "text-slate-400"}`}>
                  4. Tạo lộ trình
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Dashboard Hiển Thị Kết Quả Đánh Giá Chi Tiết */}
        <div ref={resultSectionRef} className="scroll-mt-6">
          {assessmentResult && !analyzing && (
            <div className="space-y-6 print:space-y-4">
              {/* Thanh công cụ hành động kết quả */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                <div className="flex items-center gap-2">
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
                    onClick={() => setShowHistoryModal(true)}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <History size={14} />
                    {lang === "en" ? "History" : "Lịch sử"} ({historyList.length})
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setAssessmentResult(null);
                      setCurrentHistoryId(null);
                    }}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <RefreshCw size={14} />
                    Đánh giá lại
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Printer size={14} />
                    In / Lưu PDF
                  </Button>
                </div>
              </div>

              {/* Khối 1: Điểm tổng thể & Radar Chart */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Card Điểm tổng thể & Nhận xét nhanh */}
                <div className="lg:col-span-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-sm flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Điểm Tương Thích Thực Tế
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        Độ tin cậy: {(assessmentResult.confidence * 100).toFixed(0)}%
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2.5">
                      <span className="text-5xl font-extrabold text-indigo-600 dark:text-indigo-400 font-display">
                        {assessmentResult.overall_score.toFixed(0)}
                      </span>
                      <span className="text-xl font-bold text-slate-400">/ 100</span>
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
                  <div className="grid grid-cols-2 gap-2.5 mt-5 pt-5 border-t border-slate-100 dark:border-slate-700/60">
                    {Object.entries(assessmentResult.breakdown).map(([key, metric]) => (
                      <div key={key} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800">
                        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 capitalize">
                          {key === "technical" ? (lang === "en" ? "Technical" : "Kỹ thuật") : key === "experience" ? (lang === "en" ? "Experience" : "Kinh nghiệm") : key === "culture_fit" ? (lang === "en" ? "Culture" : "Văn hóa") : (lang === "en" ? "Seniority" : "Cấp bậc")}
                        </div>
                        <div className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                          {metric.score.toFixed(0)} <span className="text-xs text-slate-400 font-normal">pts</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Radar Chart SVG */}
                <div className="lg:col-span-7 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-sm flex flex-col items-center justify-center">
                  <div className="w-full flex items-center justify-between mb-2">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      {lang === "en" ? "4-Axis Competency Radar Chart" : "Biểu đồ Năng lực 4 Trục (Radar Chart)"}
                    </h3>
                    <span className="text-[11px] text-slate-400">Technical • Experience • Culture • Seniority</span>
                  </div>
                  {renderRadarChart(assessmentResult.radar_chart)}
                </div>
              </div>

              {/* Khối 2: Điểm mạnh & Điểm hạn chế */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Điểm mạnh */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/40 p-5 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                    <Award size={18} />
                    <h3>{lang === "en" ? "Key Strengths" : "Điểm Mạnh Nổi Bật Của Bạn"}</h3>
                  </div>
                  <ul className="space-y-2">
                    {assessmentResult.strengths.map((str, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                        <CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Điểm yếu & Cần cải thiện */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-amber-200/80 dark:border-amber-900/40 p-5 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-sm">
                    <AlertTriangle size={18} />
                    <h3>{lang === "en" ? "Areas for Improvement" : "Điểm Cần Bổ Sung & Cải Thiện"}</h3>
                  </div>
                  <ul className="space-y-2">
                    {assessmentResult.weaknesses.map((w, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Khối 3: Khoảng trống Kỹ năng (Skill Gap Matrix) & Cảnh báo Ghost Skills */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers size={18} className="text-indigo-600 dark:text-indigo-400" />
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      {lang === "en" ? "Skill Gap Matrix" : "Ma Trận Khoảng Trống Kỹ Năng (Skill Gap Matrix)"}
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500">
                    {lang === "en" ? "Skill Match Rate:" : "Tỷ lệ đáp ứng kỹ năng:"} {assessmentResult.skill_analysis.match_rate}%
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {/* Kỹ năng đã có */}
                  <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 space-y-2">
                    <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                      <span>{lang === "en" ? `Matched (${assessmentResult.skill_gap.matched.length})` : `Đã Đáp Ứng (${assessmentResult.skill_gap.matched.length})`}</span>
                      <CheckCircle2 size={14} />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {assessmentResult.skill_gap.matched.map((s, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-[11px] font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Kỹ năng còn thiếu */}
                  <div className="p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 space-y-2">
                    <div className="text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center justify-between">
                      <span>{lang === "en" ? `Missing (${assessmentResult.skill_gap.missing.length})` : `Cần Bổ Sung (${assessmentResult.skill_gap.missing.length})`}</span>
                      <AlertTriangle size={14} />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {assessmentResult.skill_gap.missing.map((s, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 text-[11px] font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Kỹ năng tiên quyết */}
                  <div className="p-3.5 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 space-y-2">
                    <div className="text-xs font-bold text-purple-800 dark:text-purple-300 flex items-center justify-between">
                      <span>{lang === "en" ? "Prerequisites" : "Nền Tảng Tiên Quyết"}</span>
                      <Zap size={14} />
                    </div>
                    <div className="flex flex-wrap gap-1">
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
                  <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 flex items-start gap-3">
                    <ShieldAlert size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
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
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-6 shadow-sm space-y-5">
                <div className="flex items-center gap-2">
                  <TrendingUp size={20} className="text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      {lang === "en" ? "3-Phase Learning & Capability Upgrade Roadmap" : "Lộ Trình Học Tập & Nâng Cấp Năng Lực 3 Giai Đoạn"}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {lang === "en" ? `Step-by-step strategy to bridge skill gaps and master the ${assessmentResult.target_role} role.` : `Chiến lược từng bước giúp bạn hoàn thiện khoảng trống kỹ năng và sẵn sàng chinh phục vị trí ${assessmentResult.target_role}.`}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {assessmentResult.learning_roadmap.map((phase) => (
                    <div
                      key={phase.phase}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col justify-between space-y-3 hover:shadow-md transition-shadow"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                            P{phase.phase}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-md">
                            <Clock size={12} />
                            {phase.duration_weeks} {lang === "en" ? "weeks" : "tuần"}
                          </span>
                        </div>

                        <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white leading-snug">
                          {phase.title}
                        </h4>

                        {/* Focus skills */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {lang === "en" ? "Focus Skills:" : "Trọng tâm kỹ năng:"}
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {phase.focus_skills.map((sk, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-medium text-slate-700 dark:text-slate-300">
                                {sk}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Gợi ý hành động & Dự án */}
                        <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {lang === "en" ? "Suggested Topics & Projects:" : "Nội dung & Dự án đề xuất:"}
                          </span>
                          <ul className="space-y-1">
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
                <div className="bg-gradient-to-br from-indigo-50/60 to-purple-50/60 dark:from-slate-800/80 dark:to-indigo-950/40 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 p-6 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-bold text-sm">
                    <Sparkles size={18} />
                    <h3>{lang === "en" ? "In-depth Feedback from AI Career Advisor" : "Nhận Xét Chuyên Sâu Từ Cố Vấn Nghề Nghiệp AI"}</h3>
                  </div>
                  <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line space-y-1.5">
                    {assessmentResult.natural_language_summary}
                  </div>
                </div>
              )}

              {/* Khối 6: BẢNG KIỂM TRA HÀNH ĐỘNG (CHECKLIST) Ở CUỐI PHIẾU ĐÁNH GIÁ */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 p-6 shadow-md space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-700/60">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-base">
                      <ListChecks size={20} />
                      <h3>{lang === "en" ? "Actionable Career Growth Checklist" : "Bảng Kiểm Tra Hành Động & Khắc Phục (Action Checklist)"}</h3>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {lang === "en"
                        ? "Check off tasks as you complete projects, build skills, and prepare for interviews. Progress is automatically saved."
                        : "Đánh dấu hoàn thành các mục tiêu cải thiện kỹ năng, hoàn thiện dự án và chuẩn bị phỏng vấn. Tiến độ được lưu tự động."}
                    </p>
                  </div>

                  {/* Thống kê tiến độ & Nút hành động */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">
                        {completedCount}/{totalCount}
                      </span>
                      <span className="text-slate-400">({completionPercentage}%)</span>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsAddingCustomTask(!isAddingCustomTask)}
                      className="flex items-center gap-1.5 text-xs py-1.5 px-3"
                    >
                      <Plus size={14} />
                      {lang === "en" ? "Add Item" : "Thêm mục"}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResetChecklist}
                      className="text-xs py-1.5 px-2 text-slate-400 hover:text-slate-600"
                    >
                      <RefreshCw size={13} />
                    </Button>
                  </div>
                </div>

                {/* Thanh tiến độ trực quan */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-semibold">
                    <span className="text-slate-600 dark:text-slate-400">
                      {lang === "en" ? "Checklist Completion:" : "Tiến độ hoàn thành mục tiêu:"}
                    </span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                      {completionPercentage}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Form thêm mục kiểm tra riêng */}
                <AnimatePresence>
                  {isAddingCustomTask && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/40 space-y-2.5"
                    >
                      <label className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                        {lang === "en" ? "Add Custom Checklist Goal:" : "Thêm mục tiêu kiểm tra cá nhân mới:"}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newCustomTaskText}
                          onChange={(e) => setNewCustomTaskText(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddCustomTask()}
                          placeholder={lang === "en" ? "e.g. Read Clean Code Chapter 4, deploy demo to AWS..." : "VD: Đọc tài liệu kiến trúc Microservices, Deploy demo lên AWS..."}
                          className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleAddCustomTask}
                          className="text-xs py-2 px-3"
                        >
                          {lang === "en" ? "Add" : "Thêm"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsAddingCustomTask(false)}
                          className="text-xs py-2 px-2"
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bộ lọc Checklist */}
                <div className="flex items-center justify-between gap-2 pt-2">
                  <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl text-xs font-medium">
                    <button
                      onClick={() => setChecklistFilter("all")}
                      className={`px-3 py-1 rounded-lg transition-all ${
                        checklistFilter === "all"
                          ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      {lang === "en" ? `All (${totalCount})` : `Tất cả (${totalCount})`}
                    </button>
                    <button
                      onClick={() => setChecklistFilter("pending")}
                      className={`px-3 py-1 rounded-lg transition-all ${
                        checklistFilter === "pending"
                          ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      {lang === "en" ? `To Do (${totalCount - completedCount})` : `Cần làm (${totalCount - completedCount})`}
                    </button>
                    <button
                      onClick={() => setChecklistFilter("completed")}
                      className={`px-3 py-1 rounded-lg transition-all ${
                        checklistFilter === "completed"
                          ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm font-semibold"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      {lang === "en" ? `Completed (${completedCount})` : `Đã xong (${completedCount})`}
                    </button>
                  </div>
                </div>

                {/* Danh sách các mục Checklist */}
                <div className="space-y-2.5 pt-1">
                  {filteredChecklistItems.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-900/30 rounded-xl">
                      {lang === "en" ? "No items matching the selected filter." : "Không có mục nào trong danh sách lọc này."}
                    </div>
                  ) : (
                    filteredChecklistItems.map((item) => {
                      const isChecked = !!checklistState[item.id];
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleToggleChecklistItem(item.id)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 select-none ${
                            isChecked
                              ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 opacity-80"
                              : "bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700"
                          }`}
                        >
                          <div className="pt-0.5 shrink-0 text-indigo-600 dark:text-indigo-400">
                            {isChecked ? (
                              <CheckCircle2 size={18} className="text-emerald-500" />
                            ) : (
                              <div className="w-4 h-4 rounded-md border-2 border-slate-300 dark:border-slate-600 hover:border-indigo-500 transition-colors" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                {item.categoryLabel}
                              </span>
                              {item.isCustom && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                                  Tùy chỉnh
                                </span>
                              )}
                            </div>
                            <h4
                              className={`text-xs font-semibold ${
                                isChecked
                                  ? "line-through text-slate-400 dark:text-slate-500"
                                  : "text-slate-900 dark:text-white"
                              }`}
                            >
                              {item.title}
                            </h4>
                            {item.description && (
                              <p
                                className={`text-[11px] ${
                                  isChecked
                                    ? "line-through text-slate-400/80 dark:text-slate-600"
                                    : "text-slate-500 dark:text-slate-400"
                                }`}
                              >
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Danh sách Lịch sử Đánh giá CV */}
        <AnimatePresence>
          {showHistoryModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
              >
                {/* Header Modal */}
                <div className="p-5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                      <History size={18} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {lang === "en" ? "Assessment History" : "Lịch Sử Đánh Giá CV"}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {lang === "en"
                          ? `Total ${historyList.length} past assessments saved`
                          : `Tổng cộng ${historyList.length} lần đánh giá đã lưu`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowHistoryModal(false)}
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-slate-600"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Danh sách bản ghi */}
                <div className="p-5 overflow-y-auto space-y-3 flex-1">
                  {loadingHistory ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      {lang === "en" ? "Loading history..." : "Đang tải lịch sử..."}
                    </div>
                  ) : historyList.length === 0 ? (
                    <div className="py-12 text-center space-y-2">
                      <History size={36} className="mx-auto text-slate-300 dark:text-slate-600" />
                      <p className="text-xs text-slate-500">
                        {lang === "en"
                          ? "No assessment history yet. Run an assessment to see records here."
                          : "Chưa có lịch sử đánh giá nào. Hãy thực hiện đánh giá để lưu lại kết quả."}
                      </p>
                    </div>
                  ) : (
                    historyList.map((item) => {
                      const score = item.overall_score || item.assessment_data?.overall_score || 0;
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleRestoreHistoryItem(item)}
                          className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600 bg-slate-50/50 dark:bg-slate-900/30 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-900 dark:text-white">
                                {item.target_role}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[10px] font-bold uppercase">
                                {item.target_level}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                              <span>
                                {item.cv_title || "Hồ sơ CV"}
                              </span>
                              <span>•</span>
                              <span>
                                {new Date(item.created_at).toLocaleString(lang === "en" ? "en-US" : "vi-VN")}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                            <div className="flex items-baseline gap-1">
                              <span className={`text-xl font-bold font-display ${
                                score >= 80
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : score >= 60
                                  ? "text-indigo-600 dark:text-indigo-400"
                                  : "text-amber-600 dark:text-amber-400"
                              }`}>
                                {score.toFixed(0)}
                              </span>
                              <span className="text-xs text-slate-400">/ 100</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRestoreHistoryItem(item);
                                }}
                                className="text-xs py-1.5 px-2.5 flex items-center gap-1 group-hover:bg-indigo-600 group-hover:text-white transition-colors"
                              >
                                <Eye size={13} />
                                <span>{lang === "en" ? "View" : "Xem lại"}</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                                className="text-xs py-1.5 px-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer Modal */}
                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-700/60 flex justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowHistoryModal(false)}
                  >
                    {lang === "en" ? "Close" : "Đóng"}
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </AnimatedPage>
  );
}
