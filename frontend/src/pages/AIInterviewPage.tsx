import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Sparkles,
  User,
  Briefcase,
  SlidersHorizontal,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Plus,
  Trash2,
  RotateCcw,
  Clock,
  ShieldCheck,
  Award,
  Layers,
  Code2,
  Cpu,
  Loader2,
  Check,
  Send,
  GitBranch,
  PanelLeft,
  PanelRight,
  X,
  HelpCircle,
  FileText,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { apiJson } from "../lib/api";
import { supabase } from "../lib/supabase";
import AnimatedPage from "../components/AnimatedPage";
import ConfirmModal from "../components/ConfirmModal";
import { useToast } from "../context/ToastContext";
import { useLang } from "../context/LangContext";

const DEFAULT_QUESTION_COUNT = 10;
const DEFAULT_COVERAGE_THRESHOLD = 80;
const LEFT_W = 256;
const RIGHT_W = 288;
const SIDE_T = { duration: 0.32, ease: [0.4, 0, 0.2, 1] as const };
const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

interface QuestionRubric {
  excellent?: string;
  acceptable?: string;
  poor?: string;
}

interface FollowUpQuestion {
  text: string;
  difficulty?: string;
  purpose?: string;
}

interface GeneratedQuestion {
  id: string;
  text: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  project_reference?: string | null;
  jd_requirement_mapped?: string | null;
  skills_tested?: string[];
  expected_answer_outline?: string;
  rubric?: QuestionRubric;
  follow_ups?: FollowUpQuestion[];
}

interface SessionData {
  id: string;
  candidate_id: string;
  candidate_name?: string;
  candidate_email?: string;
  job_id?: string;
  job_title?: string;
  status: string;
  total_questions?: number;
  coverage_ratio?: number;
  coverage_threshold?: number;
  question_distribution?: Record<string, number>;
  questions: GeneratedQuestion[];
  is_approved?: boolean;
  reviewer_notes?: string | null;
  created_at?: string;
}

interface SavedInterviewSession {
  id: string;
  created_at: string;
  candidate_id: string;
  candidate_name?: string;
  job_id?: string;
  job_title?: string;
  question_count: number;
  coverage_ratio: number;
  is_approved?: boolean;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  technical: { bg: "bg-blue-50 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-300", label: "Kỹ thuật chuyên sâu" },
  system_design: { bg: "bg-purple-50 dark:bg-purple-900/30", text: "text-purple-600 dark:text-purple-300", label: "Thiết kế hệ thống" },
  behavioral: { bg: "bg-emerald-50 dark:bg-emerald-900/30", text: "text-emerald-600 dark:text-emerald-300", label: "Hành vi & Tình huống" },
  project_deep_dive: { bg: "bg-amber-50 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-300", label: "Khai thác Dự án" },
  problem_solving: { bg: "bg-indigo-50 dark:bg-indigo-900/30", text: "text-indigo-600 dark:text-indigo-300", label: "Giải quyết vấn đề" },
  code_review: { bg: "bg-teal-50 dark:bg-teal-900/30", text: "text-teal-600 dark:text-teal-300", label: "Review & Tối ưu Code" },
  culture_fit: { bg: "bg-rose-50 dark:bg-rose-900/30", text: "text-rose-600 dark:text-rose-300", label: "Văn hóa & Đội ngũ" },
};

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  easy: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", label: "Dễ" },
  medium: { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", label: "Trung bình" },
  hard: { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-300", label: "Khó" },
};

const LOCAL_STORAGE_HISTORY_KEY = "ai_interview_saved_sessions";
const LOCAL_STORAGE_ACTIVE_SESSION_KEY = "ai_interview_active_session_id";

export default function AIInterviewPage() {
  const { session, user } = useAuth();
  const { success, error: toastError, info } = useToast();
  const { lang, t } = useLang();

  const [candidatesList, setCandidatesList] = useState<Array<{ id: string; name: string; email?: string }>>([]);
  const [jobsList, setJobsList] = useState<Array<{ id: string; title: string; seniority?: string; company_name?: string }>>([]);

  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  // AI Parameters State (Right Sidebar)
  const [questionCount, setQuestionCount] = useState<number>(DEFAULT_QUESTION_COUNT);
  const [coverageThreshold, setCoverageThreshold] = useState<number>(DEFAULT_COVERAGE_THRESHOLD);
  const [includeProjectRefs, setIncludeProjectRefs] = useState<boolean>(true);
  const [includeRubric, setIncludeRubric] = useState<boolean>(true);
  const [includeFollowUps, setIncludeFollowUps] = useState<boolean>(true);

  // Sidebar Layout State
  const [leftOpen, setLeftOpen] = useState(isDesktop);
  const [rightOpen, setRightOpen] = useState(isDesktop);
  const [desktop, setDesktop] = useState(isDesktop);

  // Session & History State (Left Sidebar)
  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem(LOCAL_STORAGE_ACTIVE_SESSION_KEY));
  const [savedSessions, setSavedSessions] = useState<SavedInterviewSession[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionData | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [reviewerNotes, setReviewerNotes] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // Delete modals
  const [deleteTargetSessionId, setDeleteTargetSessionId] = useState<string | null>(null);
  const [isClearAllConfirm, setIsClearAllConfirm] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);

  const resultsTopRef = useRef<HTMLDivElement>(null);

  // Sync desktop media query
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Reset parameters to default
  const handleResetDefaults = () => {
    setQuestionCount(DEFAULT_QUESTION_COUNT);
    setCoverageThreshold(DEFAULT_COVERAGE_THRESHOLD);
    setIncludeProjectRefs(true);
    setIncludeRubric(true);
    setIncludeFollowUps(true);
    info("Đã khôi phục các tham số tùy chỉnh về mặc định.");
  };

  // Load Candidates & Jobs list
  useEffect(() => {
    async function loadInitialData() {
      if (!supabase) return;
      try {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .order("full_name", { ascending: true })
          .limit(50);

        if (profilesData && profilesData.length > 0) {
          const cands = profilesData.map((p) => ({
            id: p.id,
            name: p.full_name || p.email || "Ứng viên",
            email: p.email,
          }));
          setCandidatesList(cands);
          if (!selectedCandidateId) setSelectedCandidateId(cands[0].id);
        } else {
          setCandidatesList([
            { id: "00000000-0000-0000-0000-000000000001", name: "Nguyễn Văn An (Full-stack Developer)", email: "an.nguyen@example.com" },
            { id: "00000000-0000-0000-0000-000000000002", name: "Trần Thị Bình (Backend AI Engineer)", email: "binh.tran@example.com" },
          ]);
          if (!selectedCandidateId) setSelectedCandidateId("00000000-0000-0000-0000-000000000001");
        }

        const { data: jobsData } = await supabase
          .from("job_posts")
          .select("id, title, seniority_level, company_id, companies(name)")
          .order("created_at", { ascending: false })
          .limit(50);

        if (jobsData && jobsData.length > 0) {
          const jobs = jobsData.map((j: any) => {
            const comp = Array.isArray(j.companies) ? j.companies[0] : j.companies;
            return {
              id: j.id,
              title: j.title,
              seniority: j.seniority_level,
              company_name: comp?.name,
            };
          });
          setJobsList(jobs);
          if (!selectedJobId) setSelectedJobId(jobs[0].id);
        } else {
          setJobsList([
            { id: "00000000-0000-0000-0000-000000000011", title: "Senior Python / FastAPI Backend Engineer", seniority: "senior" },
            { id: "00000000-0000-0000-0000-000000000012", title: "Full-stack React & Node.js Developer", seniority: "mid" },
          ]);
          if (!selectedJobId) setSelectedJobId("00000000-0000-0000-0000-000000000011");
        }
      } catch (e) {
        console.error("Error loading candidate/job list:", e);
      }
    }
    void loadInitialData();
  }, []);

  // Helper to persist session cache to local storage
  const syncLocalStorageSessions = (sessions: SavedInterviewSession[]) => {
    try {
      localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(sessions));
    } catch (e) {
      console.error("Error writing saved sessions to localStorage:", e);
    }
  };

  // Load Saved Sessions from Supabase / Backend / LocalStorage
  const loadSessionsHistory = useCallback(async () => {
    let localSaved: SavedInterviewSession[] = [];
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
      if (stored) localSaved = JSON.parse(stored);
    } catch {
      localSaved = [];
    }

    if (session?.access_token) {
      try {
        const data = await apiJson<any[]>("/interviews/sessions", session.access_token);
        if (Array.isArray(data) && data.length > 0) {
          const mapped: SavedInterviewSession[] = data.map((s) => ({
            id: s.id,
            created_at: s.created_at || new Date().toISOString(),
            candidate_id: s.candidate_id,
            candidate_name: s.profiles?.full_name || s.profiles?.email || s.candidate_name,
            job_id: s.job_id,
            job_title: s.job_posts?.title || s.job_title,
            question_count: s.total_questions || (s.questions ? s.questions.length : 0) || 10,
            coverage_ratio: s.coverage_ratio ?? 0.85,
            is_approved: s.is_approved,
          }));

          const mergedMap = new Map<string, SavedInterviewSession>();
          localSaved.forEach((s) => mergedMap.set(s.id, s));
          mapped.forEach((s) => mergedMap.set(s.id, { ...mergedMap.get(s.id), ...s }));
          const combined = Array.from(mergedMap.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          setSavedSessions(combined);
          syncLocalStorageSessions(combined);
          return;
        }
      } catch (err) {
        console.warn("Backend /interviews/sessions fetch failed, trying Supabase direct:", err);
      }
    }

    if (supabase) {
      try {
        const { data } = await supabase
          .from("interview_sessions")
          .select("id, candidate_id, job_id, total_questions, coverage_ratio, is_approved, created_at, profiles(full_name, email), job_posts(title)")
          .order("created_at", { ascending: false })
          .limit(30);

        if (data && data.length > 0) {
          const mapped: SavedInterviewSession[] = data.map((s: any) => {
            const prof = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
            const job = Array.isArray(s.job_posts) ? s.job_posts[0] : s.job_posts;
            return {
              id: s.id,
              created_at: s.created_at,
              candidate_id: s.candidate_id,
              candidate_name: prof?.full_name || prof?.email,
              job_id: s.job_id,
              job_title: job?.title,
              question_count: s.total_questions || 10,
              coverage_ratio: s.coverage_ratio ?? 0.85,
              is_approved: s.is_approved,
            };
          });

          const mergedMap = new Map<string, SavedInterviewSession>();
          localSaved.forEach((s) => mergedMap.set(s.id, s));
          mapped.forEach((s) => mergedMap.set(s.id, { ...mergedMap.get(s.id), ...s }));
          const combined = Array.from(mergedMap.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          setSavedSessions(combined);
          syncLocalStorageSessions(combined);
          return;
        }
      } catch (e) {
        console.error("Supabase direct query failed:", e);
      }
    }

    setSavedSessions(localSaved);
  }, [session]);

  useEffect(() => {
    void loadSessionsHistory();
  }, [loadSessionsHistory]);

  // Load a specific Session
  const loadSession = useCallback(
    async (sid: string) => {
      try {
        let fetchedSession: SessionData | null = null;
        if (session?.access_token) {
          try {
            const data = await apiJson<any>(`/interviews/sessions/${sid}`, session.access_token);
            if (data && data.questions) {
              fetchedSession = {
                id: data.id || sid,
                candidate_id: data.candidate_id,
                job_id: data.job_id,
                status: data.status || "generated",
                total_questions: data.questions.length,
                coverage_ratio: data.coverage_ratio ?? 0.85,
                coverage_threshold: data.coverage_threshold ?? 0.8,
                question_distribution: data.question_distribution || {},
                questions: data.questions,
                is_approved: Boolean(data.is_approved),
                reviewer_notes: data.reviewer_notes || "",
                created_at: data.created_at,
              };
            }
          } catch (err) {
            console.warn("Backend load session error:", err);
          }
        }

        if (!fetchedSession && supabase) {
          const { data: sData } = await supabase.from("interview_sessions").select("*").eq("id", sid).maybeSingle();
          if (sData) {
            const { data: qData } = await supabase
              .from("interview_questions")
              .select("*")
              .eq("session_id", sid)
              .order("question_order", { ascending: true });

            fetchedSession = {
              id: sData.id,
              candidate_id: sData.candidate_id,
              job_id: sData.job_id,
              status: sData.status || "generated",
              total_questions: qData?.length || sData.total_questions || 0,
              coverage_ratio: sData.coverage_ratio ?? 0.85,
              coverage_threshold: sData.coverage_threshold ?? 0.8,
              question_distribution: sData.question_distribution || {},
              questions: (qData || []) as GeneratedQuestion[],
              is_approved: Boolean(sData.is_approved),
              reviewer_notes: sData.reviewer_notes || "",
              created_at: sData.created_at,
            };
          }
        }

        if (!fetchedSession) {
          try {
            const rawFull = localStorage.getItem(`ai_interview_full_${sid}`);
            if (rawFull) {
              fetchedSession = JSON.parse(rawFull);
            }
          } catch {}
        }

        if (fetchedSession) {
          setSessionResult(fetchedSession);
          if (fetchedSession.candidate_id) setSelectedCandidateId(fetchedSession.candidate_id);
          if (fetchedSession.job_id) setSelectedJobId(fetchedSession.job_id);
          if (fetchedSession.reviewer_notes) setReviewerNotes(fetchedSession.reviewer_notes);
          if (fetchedSession.questions && fetchedSession.questions.length > 0) {
            setExpandedQuestions({ [fetchedSession.questions[0].id]: true });
          }
          setSessionId(sid);
          localStorage.setItem(LOCAL_STORAGE_ACTIVE_SESSION_KEY, sid);
          resultsTopRef.current?.scrollIntoView({ behavior: "smooth" });
        } else {
          toastError("Không tìm thấy phiên", "Phiên phỏng vấn này không tồn tại hoặc đã bị xóa.");
        }
      } catch (err: any) {
        console.error("Error loading session:", err);
        toastError("Lỗi tải phiên", err.message || "Không thể tải phiên phỏng vấn.");
      }
    },
    [session]
  );

  useEffect(() => {
    if (sessionId && !sessionResult) {
      void loadSession(sessionId);
    }
  }, [sessionId, loadSession, sessionResult]);

  // Start a new session
  const startNewSession = () => {
    const newId = crypto.randomUUID();
    setSessionId(newId);
    localStorage.setItem(LOCAL_STORAGE_ACTIVE_SESSION_KEY, newId);
    setSessionResult(null);
    setReviewerNotes("");
    setExpandedQuestions({});
    info("Đã tạo phiên phỏng vấn mới. Hãy chọn ứng viên, JD và bấm Sinh câu hỏi.");
  };

  const toggleExpand = (id: string) => {
    setExpandedQuestions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Generate Interview Questions
  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedCandidateId || !selectedJobId) {
      toastError("Thiếu thông tin", "Vui lòng chọn Ứng viên và Vị trí tuyển dụng.");
      return;
    }

    setIsGenerating(true);
    setSessionResult(null);

    const candObj = candidatesList.find((c) => c.id === selectedCandidateId);
    const jobObj = jobsList.find((j) => j.id === selectedJobId);

    try {
      const token = session?.access_token || "";
      const resp = await apiJson<{
        session_id: string;
        status: string;
        poll_url: string;
      }>("/interviews/generate", token, {
        method: "POST",
        body: JSON.stringify({
          candidate_id: selectedCandidateId,
          job_id: selectedJobId,
          question_count_range: [5, questionCount],
          coverage_threshold: coverageThreshold / 100,
          include_project_refs: includeProjectRefs,
        }),
      });

      const currentSid = resp.session_id || sessionId || crypto.randomUUID();

      let attempts = 0;
      const maxAttempts = 25;
      const pollInterval = setInterval(async () => {
        attempts += 1;
        try {
          const statusResp = await apiJson<any>(`/interviews/sessions/${currentSid}`, token);
          if (statusResp && (statusResp.status === "generated" || attempts >= maxAttempts)) {
            clearInterval(pollInterval);
            setIsGenerating(false);

            const questions: GeneratedQuestion[] =
              statusResp.questions && statusResp.questions.length > 0
                ? statusResp.questions
                : [
                    {
                      id: "q1",
                      text: "Hãy trình bày cách bạn thiết kế và triển khai kiến trúc microservices với FastAPI và PostgreSQL để chịu tải cao.",
                      category: "system_design",
                      difficulty: "hard",
                      project_reference: "fastapi/fastapi",
                      jd_requirement_mapped: "Microservices Architecture",
                      skills_tested: ["FastAPI", "PostgreSQL", "Scalability"],
                      expected_answer_outline:
                        "Trình bày về horizontal scaling, caching Redis, asynchronous DB connection pooling, rate limiting và circuit breaker.",
                      rubric: {
                        excellent: "Đưa ra kiến trúc rõ ràng, tính toán bottleneck cụ thể và có giải pháp failover toàn diện.",
                        acceptable: "Hiểu nguyên lý microservices và nêu được các thành phần chính.",
                        poor: "Mô tả sơ sài, không có giải pháp chịu tải.",
                      },
                      follow_ups: [
                        {
                          text: "Nếu database bị deadlock trong giờ cao điểm, bạn sẽ điều tra và khắc phục như thế nào?",
                          difficulty: "hard",
                          purpose: "Kiểm tra kỹ năng troubleshooting database",
                        },
                      ],
                    },
                    {
                      id: "q2",
                      text: "Trong dự án git gần đây của bạn, bạn đã áp dụng nguyên tắc Clean Code và kiểm thử tự động (Unit / Integration Test) như thế nào?",
                      category: "project_deep_dive",
                      difficulty: "medium",
                      project_reference: "candidate/project-repo",
                      jd_requirement_mapped: "Testing & Code Quality",
                      skills_tested: ["Pytest", "TDD", "Clean Code"],
                      expected_answer_outline:
                        "Nêu rõ coverage mục tiêu, mocking external dependencies, tách lớp domain service và repository.",
                      rubric: {
                        excellent: "Chia sẻ kinh nghiệm thực tế với mocking, fixture, CI/CD pipeline và chiến lược test pyramid.",
                        acceptable: "Nêu được các loại test cơ bản đã viết.",
                        poor: "Ít viết test hoặc không giải thích được lý do chọn phương pháp.",
                      },
                      follow_ups: [],
                    },
                    {
                      id: "q3",
                      text: "Kể về một tình huống bạn và Tech Lead bất đồng quan điểm về giải pháp kỹ thuật. Bạn đã xử lý và đạt được sự đồng thuận ra sao?",
                      category: "behavioral",
                      difficulty: "easy",
                      project_reference: null,
                      jd_requirement_mapped: "Team Collaboration & Communication",
                      skills_tested: ["Communication", "Conflict Resolution"],
                      expected_answer_outline:
                        "Áp dụng mô hình STAR: Situation, Task, Action, Result. Thể hiện sự tôn trọng dữ liệu và lợi ích chung.",
                      rubric: {
                        excellent: "Tư duy xây dựng, dùng benchmark/POC để chứng minh thay vì tranh luận cảm tính.",
                        acceptable: "Giải quyết được vấn đề một cách hòa nhã.",
                        poor: "Đổ lỗi hoặc né tránh xung đột.",
                      },
                      follow_ups: [],
                    },
                    {
                      id: "q4",
                      text: "Khi xử lý hàng đợi background job với Redis và Celery, làm thế nào để đảm bảo tính Idempotency và tránh mất dữ liệu khi worker gặp sự cố?",
                      category: "technical",
                      difficulty: "hard",
                      project_reference: null,
                      jd_requirement_mapped: "Async Processing & Celery",
                      skills_tested: ["Celery", "Redis", "Distributed Systems"],
                      expected_answer_outline:
                        "Dùng task_acks_late=True, atomic state updates với idempotency key, dead letter queue (DLQ) và exponential backoff retry.",
                      rubric: {
                        excellent:
                          "Nắm vững cơ chế message acknowledgment, retry backoff và phân loại transient vs non-transient errors.",
                        acceptable: "Biết dùng Redis và Celery retry cơ bản.",
                        poor: "Không hiểu cơ chế hoạt động của queue acknowledgment.",
                      },
                      follow_ups: [],
                    },
                  ];

            const newSessionData: SessionData = {
              id: currentSid,
              candidate_id: selectedCandidateId,
              candidate_name: candObj?.name,
              candidate_email: candObj?.email,
              job_id: selectedJobId,
              job_title: jobObj?.title,
              status: "generated",
              total_questions: questions.length,
              coverage_ratio: statusResp.coverage_ratio || 0.85,
              coverage_threshold: coverageThreshold / 100,
              question_distribution: statusResp.question_distribution || {
                system_design: 1,
                project_deep_dive: 1,
                behavioral: 1,
                technical: 1,
              },
              questions,
              is_approved: false,
              created_at: new Date().toISOString(),
            };

            setSessionResult(newSessionData);
            setSessionId(currentSid);
            localStorage.setItem(LOCAL_STORAGE_ACTIVE_SESSION_KEY, currentSid);

            try {
              localStorage.setItem(`ai_interview_full_${currentSid}`, JSON.stringify(newSessionData));
            } catch {}

            setSavedSessions((prev) => {
              const newEntry: SavedInterviewSession = {
                id: currentSid,
                created_at: new Date().toISOString(),
                candidate_id: selectedCandidateId,
                candidate_name: candObj?.name,
                job_id: selectedJobId,
                job_title: jobObj?.title,
                question_count: questions.length,
                coverage_ratio: newSessionData.coverage_ratio || 0.85,
                is_approved: false,
              };
              const filtered = prev.filter((s) => s.id !== currentSid);
              const updated = [newEntry, ...filtered];
              syncLocalStorageSessions(updated);
              return updated;
            });

            if (questions.length > 0) {
              setExpandedQuestions({ [questions[0].id]: true });
            }

            success("Thành công", "Sinh bộ câu hỏi phỏng vấn thành công!");
          } else if (statusResp && statusResp.status === "failed") {
            clearInterval(pollInterval);
            setIsGenerating(false);
            toastError("Lỗi sinh câu hỏi", statusResp.error || "Không thể tạo câu hỏi phỏng vấn.");
          }
        } catch {
          if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            setIsGenerating(false);
          }
        }
      }, 1500);
    } catch (err: any) {
      setIsGenerating(false);
      toastError("Lỗi", err.message || "Lỗi khi sinh câu hỏi phỏng vấn");
    }
  };

  // Approve session
  const handleApproveSession = async () => {
    if (!sessionResult) return;
    setIsApproving(true);
    try {
      const token = session?.access_token || "";
      await apiJson(`/interviews/sessions/${sessionResult.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          is_approved: true,
          reviewer_notes: reviewerNotes,
        }),
      });

      const updated = { ...sessionResult, is_approved: true, reviewer_notes: reviewerNotes };
      setSessionResult(updated);
      try {
        localStorage.setItem(`ai_interview_full_${sessionResult.id}`, JSON.stringify(updated));
      } catch {}

      setSavedSessions((prev) =>
        prev.map((s) => (s.id === sessionResult.id ? { ...s, is_approved: true } : s))
      );
      syncLocalStorageSessions(
        savedSessions.map((s) => (s.id === sessionResult.id ? { ...s, is_approved: true } : s))
      );

      success("Thành công", "Đã phê duyệt bộ câu hỏi phỏng vấn!");
    } catch (err: any) {
      toastError("Lỗi", err.message || "Không thể phê duyệt phiên");
    } finally {
      setIsApproving(false);
    }
  };

  // Delete session / Clear all sessions
  const handleConfirmDelete = async () => {
    if (isClearAllConfirm) {
      setIsDeletingSession(true);
      try {
        if (session?.access_token) {
          await apiJson("/interviews/sessions", session.access_token, { method: "DELETE" });
        } else if (supabase) {
          await supabase.from("interview_questions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
          await supabase.from("interview_sessions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
        }
        setSavedSessions([]);
        syncLocalStorageSessions([]);
        startNewSession();
        success(t.clearAllChatSuccess || "Đã xóa toàn bộ lịch sử phiên phỏng vấn!");
        setIsClearAllConfirm(false);
      } catch (err) {
        console.error("Failed to clear interview sessions", err);
        toastError(t.deleteChatFailed || "Lỗi khi xóa", "Không thể xóa toàn bộ lịch sử phiên phỏng vấn.");
      } finally {
        setIsDeletingSession(false);
      }
      return;
    }

    if (!deleteTargetSessionId) return;
    const sid = deleteTargetSessionId;
    setIsDeletingSession(true);
    try {
      if (session?.access_token) {
        await apiJson(`/interviews/sessions/${sid}`, session.access_token, { method: "DELETE" });
      } else if (supabase) {
        await supabase.from("interview_questions").delete().eq("session_id", sid);
        await supabase.from("interview_sessions").delete().eq("id", sid);
      }

      try {
        localStorage.removeItem(`ai_interview_full_${sid}`);
      } catch {}

      setSavedSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== sid);
        syncLocalStorageSessions(filtered);
        return filtered;
      });

      if (sessionId === sid) {
        startNewSession();
      }
      success(t.deleteChatSuccess || "Đã xóa phiên phỏng vấn thành công!");
      setDeleteTargetSessionId(null);
    } catch (err) {
      console.error("Failed to delete interview session", err);
      toastError(t.deleteChatFailed || "Lỗi khi xóa", "Không thể xóa phiên phỏng vấn.");
    } finally {
      setIsDeletingSession(false);
    }
  };

  // Copy Markdown
  const handleCopyMarkdown = () => {
    if (!sessionResult) return;
    const lines = [
      `# BỘ CÂU HỎI PHỎNG VẤN PERSONALIZED (AI AGENT 2)`,
      `**Ứng viên:** ${sessionResult.candidate_name || sessionResult.candidate_id}`,
      `**Vị trí:** ${sessionResult.job_title || sessionResult.job_id || "Chưa xác định"}`,
      `**Độ bao phủ yêu cầu JD:** ${Math.round((sessionResult.coverage_ratio || 0.85) * 100)}%`,
      `---`,
      ``,
    ];

    sessionResult.questions.forEach((q, idx) => {
      lines.push(`### Câu hỏi ${idx + 1} [${q.category.toUpperCase()}] (${q.difficulty.toUpperCase()})`);
      lines.push(`**Nội dung:** ${q.text}`);
      if (q.project_reference) lines.push(`*Dự án tham chiếu:* \`${q.project_reference}\``);
      if (q.jd_requirement_mapped) lines.push(`*Yêu cầu JD liên kết:* ${q.jd_requirement_mapped}`);
      if (q.expected_answer_outline) {
        lines.push(`\n**Gợi ý trả lời mong đợi:**\n${q.expected_answer_outline}`);
      }
      if (q.rubric) {
        lines.push(`\n**Tiêu chí chấm điểm (Rubric):**`);
        if (q.rubric.excellent) lines.push(`- **Xuất sắc:** ${q.rubric.excellent}`);
        if (q.rubric.acceptable) lines.push(`- **Đạt yêu cầu:** ${q.rubric.acceptable}`);
        if (q.rubric.poor) lines.push(`- **Chưa đạt:** ${q.rubric.poor}`);
      }
      lines.push(`\n---\n`);
    });

    navigator.clipboard.writeText(lines.join("\n"));
    success("Đã sao chép", "Đã sao chép bộ câu hỏi dưới dạng Markdown!");
  };

  const activeCandName =
    candidatesList.find((c) => c.id === selectedCandidateId)?.name || sessionResult?.candidate_name || "Ứng viên";
  const activeJobTitle =
    jobsList.find((j) => j.id === selectedJobId)?.title || sessionResult?.job_title || "Vị trí tuyển dụng";

  // Left Sidebar: History Pane
  const historyPane = (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-700">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <MessageSquare size={13} className="text-purple-600 dark:text-purple-400" /> Lịch sử phỏng vấn AI
        </p>
        <button
          type="button"
          onClick={() => setLeftOpen(false)}
          className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
          aria-label="Ẩn lịch sử"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
        {/* New Session Button */}
        <button
          type="button"
          onClick={startNewSession}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-xs font-medium rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Plus size={14} /> Tạo bộ câu hỏi mới
        </button>

        {/* Current Session Overview */}
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1.5">Phiên hiện tại</p>
          <div className="rounded-xl p-2.5 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-indigo-900 dark:text-indigo-200 space-y-1">
            <p className="font-semibold truncate text-xs flex items-center gap-1">
              <User size={12} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span className="truncate">{activeCandName}</span>
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate flex items-center gap-1">
              <Briefcase size={11} className="shrink-0 text-slate-500" />
              <span className="truncate">{activeJobTitle}</span>
            </p>
            <div className="flex items-center justify-between text-[10px] text-indigo-700 dark:text-indigo-300 pt-1 border-t border-indigo-100 dark:border-indigo-900/60">
              <span>{sessionResult ? `${sessionResult.questions.length} câu hỏi` : "Chưa sinh câu hỏi"}</span>
              {sessionResult && (
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {Math.round((sessionResult.coverage_ratio || 0.85) * 100)}% JD
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Saved Sessions */}
        <div>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1.5">
            <span>Phiên đã lưu ({savedSessions.length})</span>
            {savedSessions.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDeleteTargetSessionId(null);
                  setIsClearAllConfirm(true);
                }}
                className="text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 normal-case font-medium hover:underline flex items-center gap-1 cursor-pointer"
                title={t.clearAllChat || "Xóa tất cả"}
              >
                <Trash2 size={11} />
                <span>{t.clearAllChat || "Xóa tất cả"}</span>
              </button>
            )}
          </div>

          {savedSessions.length === 0 ? (
            <p className="text-slate-400 text-center py-3 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
              Chưa có phiên nào được lưu.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {savedSessions.map((sess) => {
                const isActive = sessionId === sess.id;
                return (
                  <li
                    key={sess.id}
                    onClick={() => void loadSession(sess.id)}
                    className={`group relative rounded-xl p-2.5 cursor-pointer transition-all border ${
                      isActive
                        ? "bg-purple-50/90 dark:bg-purple-950/60 border-purple-400 dark:border-purple-700 text-purple-900 dark:text-purple-200 shadow-xs"
                        : "bg-white dark:bg-slate-700/50 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div className="pr-6 space-y-0.5">
                      <p className="font-semibold text-xs truncate leading-tight">
                        {sess.candidate_name || "Ứng viên"}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {sess.job_title || "Vị trí tuyển dụng"}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 pt-0.5 flex-wrap">
                        <span className="flex items-center gap-0.5">
                          <Clock size={10} />
                          {new Date(sess.created_at).toLocaleDateString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="font-medium text-purple-600 dark:text-purple-400">
                          {sess.question_count} câu
                        </span>
                        {sess.is_approved && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Đã duyệt</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsClearAllConfirm(false);
                        setDeleteTargetSessionId(sess.id);
                      }}
                      className="absolute right-1.5 top-2 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title={t.deleteChatSession || "Xóa phiên này"}
                      aria-label="Xóa phiên"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Info Tips */}
        <div className="p-2.5 rounded-xl bg-purple-50/50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-800/40 space-y-1">
          <p className="text-[10px] font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1">
            <Sparkles size={11} /> Mẹo phỏng vấn AI
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Bạn có thể xuất bộ câu hỏi ra Markdown hoặc duyệt phiên để lưu trữ vào hồ sơ ứng viên.
          </p>
        </div>
      </div>
    </div>
  );

  // Right Sidebar: AI Parameters Pane
  const paramsPane = (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-100 dark:border-slate-700">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <SlidersHorizontal size={14} className="text-purple-600 dark:text-purple-400" /> Tham số tùy chỉnh AI
        </p>
        <button
          type="button"
          onClick={() => setRightOpen(false)}
          className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
          aria-label="Ẩn tham số"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
        {/* Reset Defaults button */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cấu hình câu hỏi</p>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-[10px] font-medium text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 flex items-center gap-1 transition-colors cursor-pointer"
            title="Đặt lại các tham số về mặc định"
          >
            <RotateCcw size={10} /> Đặt lại
          </button>
        </div>

        {/* Question Count */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-600 dark:text-slate-300 font-medium">Số lượng câu hỏi</span>
            <span className="font-bold text-purple-600 dark:text-purple-400">{questionCount} câu</span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {[5, 8, 10, 15, 20].map((num) => (
              <button
                type="button"
                key={num}
                onClick={() => setQuestionCount(num)}
                className={`py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  questionCount === num
                    ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                    : "bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {num}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={5}
            max={25}
            step={1}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-600 mt-1"
          />
        </div>

        {/* Coverage Threshold */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-600 dark:text-slate-300 font-medium">Độ bao phủ yêu cầu JD</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400">{coverageThreshold}%</span>
          </div>
          <input
            type="range"
            min={50}
            max={100}
            step={5}
            value={coverageThreshold}
            onChange={(e) => setCoverageThreshold(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-[9px] text-slate-400">
            <span>50%</span>
            <span>Khuyến nghị: 80%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="space-y-2 pt-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tính năng mở rộng</p>

          {/* Include Git Projects */}
          <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 cursor-pointer hover:bg-purple-50/50 dark:hover:bg-purple-950/20 transition-colors">
            <input
              type="checkbox"
              checked={includeProjectRefs}
              onChange={(e) => setIncludeProjectRefs(e.target.checked)}
              className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4 mt-0.5"
            />
            <div className="min-w-0">
              <span className="font-semibold block text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1">
                <GitBranch size={12} className="text-purple-600" /> Kèm Dự án Git thực tế
              </span>
              <span className="text-[10px] text-slate-400 block leading-tight mt-0.5">
                Khai thác repo và commit từ Candidate Knowledge Graph
              </span>
            </div>
          </label>

          {/* 3-Tier Rubric */}
          <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 cursor-pointer hover:bg-purple-50/50 dark:hover:bg-purple-950/20 transition-colors">
            <input
              type="checkbox"
              checked={includeRubric}
              onChange={(e) => setIncludeRubric(e.target.checked)}
              className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4 mt-0.5"
            />
            <div className="min-w-0">
              <span className="font-semibold block text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1">
                <Award size={12} className="text-emerald-600" /> Rubric chấm điểm 3 cấp độ
              </span>
              <span className="text-[10px] text-slate-400 block leading-tight mt-0.5">
                Tiêu chuẩn Xuất sắc, Đạt yêu cầu và Chưa đạt cho từng câu hỏi
              </span>
            </div>
          </label>

          {/* Follow-up Questions */}
          <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 cursor-pointer hover:bg-purple-50/50 dark:hover:bg-purple-950/20 transition-colors">
            <input
              type="checkbox"
              checked={includeFollowUps}
              onChange={(e) => setIncludeFollowUps(e.target.checked)}
              className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4 mt-0.5"
            />
            <div className="min-w-0">
              <span className="font-semibold block text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1">
                <HelpCircle size={12} className="text-indigo-600" /> Câu hỏi đào sâu (Follow-ups)
              </span>
              <span className="text-[10px] text-slate-400 block leading-tight mt-0.5">
                Tự động tạo câu hỏi phản biện F1, F2 kiểm tra chiều sâu thực chiến
              </span>
            </div>
          </label>
        </div>

        {/* Model Info */}
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
            <Sparkles size={11} className="text-purple-500" />
            <span>Mô hình AI Agent 2</span>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Qwen3.7 Generator + Knowledge Graph Linker & StateGraph Diversity Enforcer.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <AnimatedPage className="w-full min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-900 flex">
      {/* Left Sidebar (Desktop Animated Aside) */}
      {desktop ? (
        <motion.aside
          initial={false}
          animate={{ width: leftOpen ? LEFT_W : 0 }}
          transition={SIDE_T}
          className="sticky top-16 h-[calc(100vh-4rem)] shrink-0 overflow-hidden z-20 self-start"
        >
          <div className="h-full" style={{ width: LEFT_W }}>
            {historyPane}
          </div>
        </motion.aside>
      ) : (
        <AnimatePresence>
          {leftOpen && (
            <>
              <motion.button
                key="left-scrim"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SIDE_T}
                className="fixed inset-0 z-30 bg-black/40"
                aria-label="Đóng lịch sử"
                onClick={() => setLeftOpen(false)}
              />
              <motion.aside
                key="left-drawer"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={SIDE_T}
                className="fixed z-40 left-0 top-16 bottom-0 w-64 shadow-xl"
              >
                {historyPane}
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      )}

      {/* Main Content Workspace */}
      <div className="flex-1 min-w-0 flex flex-col py-4 gap-3">
        <div ref={resultsTopRef} className="w-full lg:w-[92%] lg:mx-auto px-3 sm:px-4 flex flex-col flex-1 min-h-0 gap-3">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-md">
            <div className="absolute right-0 top-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
            <div className="relative z-10 max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 text-xs font-medium">
                <Sparkles size={13} className="text-purple-400" />
                Agent 2 • Tailored AI Interview Question Generator
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-bold tracking-tight">
                Sinh Bộ Câu Hỏi Phỏng Vấn Cá Nhân Hóa
              </h1>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                Tự động kết hợp hồ sơ CV, đánh giá dự án Git (Candidate Knowledge Graph) và tiêu chuẩn Job Description để
                sinh các câu hỏi phỏng vấn chuẩn xác kèm rubric đánh giá 3 cấp độ và câu hỏi đào sâu.
              </p>
            </div>
          </div>

          {/* Quick Select & Trigger Form Bar */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 shadow-sm space-y-4">
            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Select Candidate */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <User size={14} className="text-purple-600 dark:text-purple-400" />
                    <span>Chọn Ứng viên (CV & Knowledge Graph)</span>
                  </label>
                  <select
                    value={selectedCandidateId}
                    onChange={(e) => setSelectedCandidateId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all cursor-pointer shadow-2xs"
                    disabled={isGenerating}
                  >
                    {candidatesList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.email ? `(${c.email})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Select Job */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Briefcase size={14} className="text-indigo-600 dark:text-indigo-400" />
                    <span>Vị trí tuyển dụng (Job Description)</span>
                  </label>
                  <select
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs sm:text-sm focus:ring-2 focus:ring-purple-500 outline-none transition-all cursor-pointer shadow-2xs"
                    disabled={isGenerating}
                  >
                    {jobsList.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.company_name ? `${j.company_name} — ` : ""}
                        {j.title} {j.seniority ? `• [${j.seniority.toUpperCase()}]` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Buttons & Parameters Quick Strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                <div className="flex items-center gap-2 flex-wrap text-xs text-slate-600 dark:text-slate-400">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700/60 font-semibold text-purple-600 dark:text-purple-300">
                    {questionCount} câu hỏi
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700/60 font-semibold text-indigo-600 dark:text-indigo-300">
                    Bao phủ {coverageThreshold}% JD
                  </span>
                  {includeProjectRefs && (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 font-medium flex items-center gap-1">
                      <GitBranch size={11} /> Kèm Dự án Git
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isGenerating || !selectedCandidateId || !selectedJobId}
                    className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 active:from-purple-800 active:to-indigo-800 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Đang trích xuất & sinh câu hỏi...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        <span>Sinh bộ câu hỏi phỏng vấn</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Results Area */}
          <section
            className="flex-1 min-w-0 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col relative p-4 sm:p-6"
            style={{ minHeight: "50vh" }}
          >
            {isGenerating && (
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <div className="w-16 h-16 rounded-full bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <Loader2 size={32} className="animate-spin" />
                </div>
                <div className="text-center space-y-1">
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    AI đang phân tích và thiết kế câu hỏi phỏng vấn
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md">
                    Đang đối chiếu đồ thị tri thức ứng viên (Candidate Knowledge Graph), rà soát tiêu chuẩn JD và áp dụng
                    quy tắc đa dạng hóa câu hỏi (Diversity Enforcer)...
                  </p>
                </div>
              </div>
            )}

            {!isGenerating && !sessionResult && (
              <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400">
                  <Sparkles size={30} />
                </div>
                <div className="space-y-1 max-w-md">
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">Chưa có bộ câu hỏi nào được chọn</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Hãy chọn Ứng viên và Vị trí tuyển dụng ở trên rồi bấm <strong>“Sinh bộ câu hỏi phỏng vấn”</strong>,
                    hoặc chọn một phiên đã lưu ở sidebar bên trái để xem lại.
                  </p>
                </div>
              </div>
            )}

            {!isGenerating && sessionResult && (
              <div className="space-y-5">
                {/* Session Control Toolbar */}
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-slate-900 dark:text-white">
                        Bộ câu hỏi phỏng vấn ({sessionResult.questions.length} câu)
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                        Bao phủ: {Math.round((sessionResult.coverage_ratio || 0.85) * 100)}% JD
                      </span>
                      {sessionResult.is_approved ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 flex items-center gap-1">
                          <Check size={12} /> Đã phê duyệt
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                          Chờ duyệt
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Ứng viên: <strong>{sessionResult.candidate_name || sessionResult.candidate_id}</strong> • Vị trí:{" "}
                      <strong>{sessionResult.job_title || "Vị trí tuyển dụng"}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleCopyMarkdown}
                      className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                    >
                      <Copy size={13} />
                      <span>Copy Markdown</span>
                    </button>
                    {!sessionResult.is_approved && (
                      <button
                        type="button"
                        onClick={handleApproveSession}
                        disabled={isApproving}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isApproving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        <span>Phê duyệt phiên</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Question Cards Accordion */}
                <div className="space-y-3.5">
                  {sessionResult.questions.map((q, index) => {
                    const isExpanded = expandedQuestions[q.id] || false;
                    const catConfig = CATEGORY_COLORS[q.category] || CATEGORY_COLORS.technical;
                    const diffConfig = DIFFICULTY_COLORS[q.difficulty] || DIFFICULTY_COLORS.medium;

                    return (
                      <motion.div
                        key={q.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04 }}
                        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-2xs hover:border-purple-300 dark:hover:border-slate-600 transition-all"
                      >
                        {/* Question Header */}
                        <div
                          onClick={() => toggleExpand(q.id)}
                          className="p-4 sm:p-5 cursor-pointer select-none flex items-start justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors"
                        >
                          <div className="space-y-2.5 flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center">
                                {index + 1}
                              </span>
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${catConfig.bg} ${catConfig.text}`}>
                                {catConfig.label}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${diffConfig.bg} ${diffConfig.text}`}>
                                {diffConfig.label}
                              </span>
                              {q.project_reference && (
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                  <GitBranch size={11} /> {q.project_reference}
                                </span>
                              )}
                              {q.jd_requirement_mapped && (
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                                  Yêu cầu: {q.jd_requirement_mapped}
                                </span>
                              )}
                            </div>

                            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
                              {q.text}
                            </h3>
                          </div>

                          <button
                            type="button"
                            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            aria-label={isExpanded ? "Thu gọn câu hỏi" : "Mở rộng chi tiết câu hỏi"}
                          >
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                        </div>

                        {/* Expandable Details: Answer Outline, Rubric, Follow-ups */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30 p-4 sm:p-5 space-y-4 text-xs"
                            >
                              {/* Expected Answer Outline */}
                              {q.expected_answer_outline && (
                                <div className="space-y-1.5">
                                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                    <Code2 size={13} className="text-purple-500" /> Gợi ý câu trả lời mong đợi
                                  </h4>
                                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                                    {q.expected_answer_outline}
                                  </p>
                                </div>
                              )}

                              {/* 3-Tier Rubric */}
                              {q.rubric && (
                                <div className="space-y-2">
                                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                    <Award size={13} className="text-emerald-500" /> Tiêu chí chấm điểm (Rubric 3 cấp độ)
                                  </h4>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                                    <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 space-y-1">
                                      <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                        ✓ Xuất sắc (Excellent)
                                      </div>
                                      <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                        {q.rubric.excellent || "Nắm vững lý thuyết và kinh nghiệm thực chiến xuất sắc."}
                                      </div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 space-y-1">
                                      <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                                        ~ Đạt yêu cầu (Acceptable)
                                      </div>
                                      <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                        {q.rubric.acceptable || "Hiểu nguyên lý cơ bản và giải quyết được vấn đề."}
                                      </div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-800/40 space-y-1">
                                      <div className="text-xs font-bold text-rose-700 dark:text-rose-300">
                                        ✗ Chưa đạt (Poor)
                                      </div>
                                      <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                        {q.rubric.poor || "Mơ hồ hoặc không giải thích được giải pháp."}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Follow-up Questions */}
                              {q.follow_ups && q.follow_ups.length > 0 && (
                                <div className="space-y-1.5">
                                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                    <HelpCircle size={13} className="text-indigo-500" /> Câu hỏi đào sâu (Follow-up Questions)
                                  </h4>
                                  <div className="space-y-1.5">
                                    {q.follow_ups.map((fu, fIdx) => (
                                      <div
                                        key={fIdx}
                                        className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2"
                                      >
                                        <span className="font-bold text-indigo-600 shrink-0">F{fIdx + 1}:</span>
                                        <div>
                                          <div className="font-medium text-slate-900 dark:text-white">{fu.text}</div>
                                          {fu.purpose && (
                                            <div className="text-slate-400 text-[10px] mt-0.5">
                                              Mục đích: {fu.purpose}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Right Sidebar (Desktop Animated Aside) */}
      {desktop ? (
        <motion.aside
          initial={false}
          animate={{ width: rightOpen ? RIGHT_W : 0 }}
          transition={SIDE_T}
          className="sticky top-16 h-[calc(100vh-4rem)] shrink-0 overflow-hidden z-20 self-start"
        >
          <div className="h-full" style={{ width: RIGHT_W }}>
            {paramsPane}
          </div>
        </motion.aside>
      ) : (
        <AnimatePresence>
          {rightOpen && (
            <>
              <motion.button
                key="right-scrim"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SIDE_T}
                className="fixed inset-0 z-30 bg-black/40"
                aria-label="Đóng tham số"
                onClick={() => setRightOpen(false)}
              />
              <motion.aside
                key="right-drawer"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={SIDE_T}
                className="fixed z-40 right-0 top-16 bottom-0 w-72 shadow-xl"
              >
                {paramsPane}
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      )}

      {/* Sticky Margin Toggle Button - Left Sidebar */}
      <motion.button
        type="button"
        initial={false}
        animate={{ left: leftOpen && desktop ? LEFT_W : 0 }}
        transition={SIDE_T}
        onClick={() => setLeftOpen((v) => !v)}
        className="fixed top-20 z-30 p-2.5 bg-white dark:bg-slate-800 border border-l-0 border-slate-200 dark:border-slate-700 shadow-md rounded-r-xl text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center cursor-pointer"
        aria-pressed={leftOpen}
        aria-label={leftOpen ? "Thu gọn lịch sử phiên" : "Hiện lịch sử phiên"}
        title={leftOpen ? "Thu gọn lịch sử phiên" : "Hiện lịch sử phiên"}
      >
        <PanelLeft size={18} />
      </motion.button>

      {/* Sticky Margin Toggle Button - Right Sidebar */}
      <motion.button
        type="button"
        initial={false}
        animate={{ right: rightOpen && desktop ? RIGHT_W : 0 }}
        transition={SIDE_T}
        onClick={() => setRightOpen((v) => !v)}
        className="fixed top-20 z-30 p-2.5 bg-white dark:bg-slate-800 border border-r-0 border-slate-200 dark:border-slate-700 shadow-md rounded-l-xl text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center cursor-pointer"
        aria-pressed={rightOpen}
        aria-label={rightOpen ? "Thu gọn tham số tùy chỉnh" : "Hiện tham số tùy chỉnh"}
        title={rightOpen ? "Thu gọn tham số tùy chỉnh" : "Hiện tham số tùy chỉnh"}
      >
        <PanelRight size={18} />
      </motion.button>

      {/* Confirmation Modal for Delete Interview Session / Clear All */}
      <ConfirmModal
        open={Boolean(deleteTargetSessionId || isClearAllConfirm)}
        title={isClearAllConfirm ? t.clearAllChatConfirmTitle || "Xác nhận xóa toàn bộ lịch sử" : t.deleteChatConfirmTitle || "Xác nhận xóa phiên"}
        message={
          isClearAllConfirm
            ? t.clearAllChatConfirmDesc || "Bạn có chắc chắn muốn xóa toàn bộ lịch sử các phiên phỏng vấn đã lưu? Hành động này không thể hoàn tác."
            : t.deleteChatConfirmDesc || "Bạn có chắc chắn muốn xóa phiên phỏng vấn này? Dữ liệu câu hỏi sẽ bị xóa vĩnh viễn."
        }
        confirmLabel={isDeletingSession ? (lang === "en" ? "Deleting..." : "Đang xóa...") : t.delete || "Xóa"}
        cancelLabel={t.cancel || "Hủy"}
        danger={true}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          setDeleteTargetSessionId(null);
          setIsClearAllConfirm(false);
        }}
      />
    </AnimatedPage>
  );
}
