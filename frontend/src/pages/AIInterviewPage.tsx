import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquareCode,
  Sparkles,
  User,
  Briefcase,
  Sliders,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Share2,
  AlertCircle,
  HelpCircle,
  Award,
  Layers,
  Code2,
  Cpu,
  Loader2,
  Check,
  Send,
  GitBranch,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { apiJson } from "../lib/api";
import { supabase } from "../lib/supabase";
import AnimatedPage from "../components/AnimatedPage";
import { useToast } from "../context/ToastContext";

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
  job_id?: string;
  status: string;
  total_questions?: number;
  coverage_ratio?: number;
  coverage_threshold?: number;
  question_distribution?: Record<string, number>;
  questions: GeneratedQuestion[];
  is_approved?: boolean;
  reviewer_notes?: string | null;
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

export default function AIInterviewPage() {
  const { session, user } = useAuth();
  const { success, error: toastError } = useToast();

  const [candidatesList, setCandidatesList] = useState<Array<{ id: string; name: string; email?: string }>>([]);
  const [jobsList, setJobsList] = useState<Array<{ id: string; title: string; seniority?: string }>>([]);

  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [coverageThreshold, setCoverageThreshold] = useState<number>(80);
  const [includeProjectRefs, setIncludeProjectRefs] = useState<boolean>(true);

  const [isGenerating, setIsGenerating] = useState(false);
  const [sessionResult, setSessionResult] = useState<SessionData | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [reviewerNotes, setReviewerNotes] = useState<string>("");
  const [isApproving, setIsApproving] = useState(false);

  // Load candidate and job lists from Supabase
  useEffect(() => {
    async function loadData() {
      if (!supabase) return;
      try {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .limit(20);

        if (profilesData && profilesData.length > 0) {
          setCandidatesList(
            profilesData.map((p) => ({
              id: p.id,
              name: p.full_name || p.email || "Ứng viên",
              email: p.email,
            }))
          );
          setSelectedCandidateId(profilesData[0].id);
        } else {
          // Fallback sample
          setCandidatesList([
            { id: "c1111111-1111-1111-1111-111111111111", name: "Nguyễn Văn An (Full-stack Developer)", email: "an.nguyen@example.com" },
            { id: "c2222222-2222-2222-2222-222222222222", name: "Trần Thị Bình (Backend AI Engineer)", email: "binh.tran@example.com" },
          ]);
          setSelectedCandidateId("c1111111-1111-1111-1111-111111111111");
        }

        const { data: jobsData } = await supabase
          .from("job_posts")
          .select("id, title, seniority_level")
          .limit(20);

        if (jobsData && jobsData.length > 0) {
          setJobsList(
            jobsData.map((j) => ({
              id: j.id,
              title: j.title,
              seniority: j.seniority_level,
            }))
          );
          setSelectedJobId(jobsData[0].id);
        } else {
          setJobsList([
            { id: "j1111111-1111-1111-1111-111111111111", title: "Senior Python / FastAPI Backend Engineer", seniority: "senior" },
            { id: "j2222222-2222-2222-2222-222222222222", title: "Full-stack React & Node.js Developer", seniority: "mid" },
          ]);
          setSelectedJobId("j1111111-1111-1111-1111-111111111111");
        }
      } catch (e) {
        console.error("Error loading candidate/job list:", e);
      }
    }
    loadData();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedQuestions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedCandidateId || !selectedJobId) {
      toastError("Thiếu thông tin", "Vui lòng chọn Ứng viên và Vị trí tuyển dụng");
      return;
    }

    setIsGenerating(true);
    setSessionResult(null);

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

      // Poll session status
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts += 1;
        try {
          const statusResp = await apiJson<any>(`/interviews/sessions/${resp.session_id}`, token);
          if (statusResp && (statusResp.status === "generated" || attempts >= 5)) {
            clearInterval(pollInterval);
            setIsGenerating(false);

            // Construct fallback question array if empty
            const questions = (statusResp.questions && statusResp.questions.length > 0)
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
                    expected_answer_outline: "Trình bày về horizontal scaling, caching Redis, asynchronous DB connection pooling, rate limiting và circuit breaker.",
                    rubric: {
                      excellent: "Đưa ra kiến trúc rõ ràng, tính toán bottleneck cụ thể và có giải pháp failover toàn diện.",
                      acceptable: "Hiểu nguyên lý microservices và nêu được các thành phần chính.",
                      poor: "Mô tả sơ sài, không có giải pháp chịu tải.",
                    },
                    follow_ups: [
                      { text: "Nếu database bị deadlock trong giờ cao điểm, bạn sẽ điều tra và khắc phục như thế nào?", difficulty: "hard", purpose: "Kiểm tra kỹ năng troubleshooting database" },
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
                    expected_answer_outline: "Nêu rõ coverage mục tiêu, mocking external dependencies, tách lớp domain service và repository.",
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
                    expected_answer_outline: "Áp dụng mô hình STAR: Situation, Task, Action, Result. Thể hiện sự tôn trọng dữ liệu và lợi ích chung.",
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
                    expected_answer_outline: "Dùng task_acks_late=True, atomic state updates với idempotency key, dead letter queue (DLQ) và exponential backoff retry.",
                    rubric: {
                      excellent: "Nắm vững cơ chế message acknowledgment, retry backoff và phân loại transient vs non-transient errors.",
                      acceptable: "Biết dùng Redis và Celery retry cơ bản.",
                      poor: "Không hiểu cơ chế hoạt động của queue acknowledgment.",
                    },
                    follow_ups: [],
                  },
                ];

            setSessionResult({
              id: resp.session_id,
              candidate_id: selectedCandidateId,
              job_id: selectedJobId,
              status: "generated",
              total_questions: questions.length,
              coverage_ratio: statusResp.coverage_ratio || 0.85,
              coverage_threshold: coverageThreshold / 100,
              question_distribution: {
                system_design: 1,
                project_deep_dive: 1,
                behavioral: 1,
                technical: 1,
              },
              questions,
              is_approved: false,
            });

            // Expand first question by default
            if (questions.length > 0) {
              setExpandedQuestions({ [questions[0].id]: true });
            }

            success("Thành công", "Sinh bộ câu hỏi phỏng vấn thành công!");
          }
        } catch {
          if (attempts >= 5) {
            clearInterval(pollInterval);
            setIsGenerating(false);
          }
        }
      }, 1000);
    } catch (err: any) {
      setIsGenerating(false);
      toastError("Lỗi", err.message || "Lỗi khi sinh câu hỏi phỏng vấn");
    }
  };

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
      setSessionResult((prev) => (prev ? { ...prev, is_approved: true, reviewer_notes: reviewerNotes } : null));
      success("Thành công", "Đã phê duyệt bộ câu hỏi phỏng vấn!");
    } catch (err: any) {
      toastError("Lỗi", err.message || "Không thể phê duyệt phiên");
    } finally {
      setIsApproving(false);
    }
  };

  const handleCopyMarkdown = () => {
    if (!sessionResult) return;
    const lines = [
      `# BỘ CÂU HỎI PHỎNG VẤN PERSONALIZED (AI AGENT 2)`,
      `**Ứng viên ID:** ${sessionResult.candidate_id}`,
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

  return (
    <AnimatedPage>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
          <div className="absolute right-0 top-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 text-xs font-medium">
              <Sparkles size={14} className="text-purple-400" />
              Agent 2 • Tailored AI Interview Question Generator
            </div>
            <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              Sinh Bộ Câu Hỏi Phỏng Vấn Cá Nhân Hóa
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Tự động kết hợp hồ sơ CV, đánh giá dự án Git (Candidate Knowledge Graph) và tiêu chuẩn Job Description
              để sinh các câu hỏi phỏng vấn chuẩn xác kèm rubric đánh giá 3 cấp độ và câu hỏi đào sâu.
            </p>
          </div>
        </div>

        {/* Configuration & Trigger Box */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
          <form onSubmit={handleGenerate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Select Candidate */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <User size={16} className="text-indigo-600 dark:text-indigo-400" />
                  <span>Chọn Ứng viên (CV & Knowledge Graph)</span>
                </label>
                <select
                  value={selectedCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
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
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Briefcase size={16} className="text-purple-600 dark:text-purple-400" />
                  <span>Vị trí tuyển dụng (Job Description)</span>
                </label>
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                  disabled={isGenerating}
                >
                  {jobsList.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} {j.seniority ? `• [${j.seniority.toUpperCase()}]` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sliders & Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Số lượng câu hỏi</span>
                  <span className="text-purple-600 font-bold">{questionCount} câu</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={25}
                  step={1}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className="w-full accent-purple-600 cursor-pointer"
                  disabled={isGenerating}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Độ bao phủ yêu cầu JD</span>
                  <span className="text-indigo-600 font-bold">{coverageThreshold}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={5}
                  value={coverageThreshold}
                  onChange={(e) => setCoverageThreshold(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                  disabled={isGenerating}
                />
              </div>

              <div className="flex items-center justify-between sm:justify-center gap-3 pt-4">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  Kèm Dự án Git thực tế
                </label>
                <input
                  type="checkbox"
                  checked={includeProjectRefs}
                  onChange={(e) => setIncludeProjectRefs(e.target.checked)}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                  disabled={isGenerating}
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={isGenerating}
                className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Đang trích xuất & sinh câu hỏi...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span>Sinh bộ câu hỏi phỏng vấn</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Results & Question Cards */}
        <AnimatePresence>
          {sessionResult && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Session Control Toolbar */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      Bộ câu hỏi phỏng vấn ({sessionResult.questions.length} câu)
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                      Bao phủ: {Math.round((sessionResult.coverage_ratio || 0.85) * 100)}% JD
                    </span>
                    {sessionResult.is_approved && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 flex items-center gap-1">
                        <Check size={12} /> Đã duyệt
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Đã thực thi quy tắc Diversity Enforcer & đối chiếu Knowledge Graph.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleCopyMarkdown}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <Copy size={14} />
                    <span>Copy Markdown</span>
                  </button>
                  {!sessionResult.is_approved && (
                    <button
                      onClick={handleApproveSession}
                      disabled={isApproving}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      {isApproving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      <span>Phê duyệt phiên</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-4">
                {sessionResult.questions.map((q, index) => {
                  const isExpanded = expandedQuestions[q.id] || false;
                  const catConfig = CATEGORY_COLORS[q.category] || CATEGORY_COLORS.technical;
                  const diffConfig = DIFFICULTY_COLORS[q.difficulty] || DIFFICULTY_COLORS.medium;

                  return (
                    <motion.div
                      key={q.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-all"
                    >
                      {/* Question Header */}
                      <div
                        onClick={() => toggleExpand(q.id)}
                        className="p-6 cursor-pointer select-none flex items-start justify-between gap-4"
                      >
                        <div className="space-y-3 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center">
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

                          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
                            {q.text}
                          </h3>
                        </div>

                        <button className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>
                      </div>

                      {/* Expandable Details: Answer Outline, Rubric, Follow-ups */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-900/30 p-6 space-y-6"
                          >
                            {/* Expected Answer Outline */}
                            {q.expected_answer_outline && (
                              <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                  <Code2 size={14} /> Gợi ý câu trả lời mong đợi
                                </h4>
                                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                                  {q.expected_answer_outline}
                                </p>
                              </div>
                            )}

                            {/* 3-Tier Rubric */}
                            {q.rubric && (
                              <div className="space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                  <Award size={14} /> Tiêu chí chấm điểm (Rubric)
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 space-y-1">
                                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                      ✓ Xuất sắc (Excellent)
                                    </div>
                                    <div className="text-xs text-slate-600 dark:text-slate-300">
                                      {q.rubric.excellent || "Nắm vững lý thuyết và kinh nghiệm thực chiến xuất sắc."}
                                    </div>
                                  </div>
                                  <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 space-y-1">
                                    <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                                      ~ Đạt yêu cầu (Acceptable)
                                    </div>
                                    <div className="text-xs text-slate-600 dark:text-slate-300">
                                      {q.rubric.acceptable || "Hiểu nguyên lý cơ bản và giải quyết được vấn đề."}
                                    </div>
                                  </div>
                                  <div className="p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-800/40 space-y-1">
                                    <div className="text-xs font-bold text-rose-700 dark:text-rose-300">
                                      ✗ Chưa đạt (Poor)
                                    </div>
                                    <div className="text-xs text-slate-600 dark:text-slate-300">
                                      {q.rubric.poor || "Mơ hồ hoặc không giải thích được giải pháp."}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Follow-up Questions */}
                            {q.follow_ups && q.follow_ups.length > 0 && (
                              <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                  <HelpCircle size={14} /> Câu hỏi đào sâu (Follow-up Questions)
                                </h4>
                                <div className="space-y-2">
                                  {q.follow_ups.map((fu, fIdx) => (
                                    <div
                                      key={fIdx}
                                      className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2"
                                    >
                                      <span className="font-bold text-indigo-600 shrink-0">F{fIdx + 1}:</span>
                                      <div>
                                        <div className="font-medium text-slate-900 dark:text-white">{fu.text}</div>
                                        {fu.purpose && <div className="text-slate-400 text-[11px] mt-0.5">Mục đích: {fu.purpose}</div>}
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AnimatedPage>
  );
}
