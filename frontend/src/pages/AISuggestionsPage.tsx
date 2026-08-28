import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Sparkles, MapPin, DollarSign, ExternalLink, Bot, User,
  PanelLeft, PanelRight, X, MessageSquare, SlidersHorizontal, Loader2, FileText,
  Layers, Check, Plus, Trash2, Clock, RotateCcw, ChevronDown, Star, CheckCircle2,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { apiJson, apiStream, type StreamEvent } from "../lib/api";
import { supabase } from "../lib/supabase";
import { ENUM_LABELS, formatCurrency } from "../lib/format";
import AnimatedPage from "../components/AnimatedPage";
import Badge from "../components/Badge";
import ConfirmModal from "../components/ConfirmModal";
import { useToast } from "../context/ToastContext";
import { useLang } from "../context/LangContext";
import SuggestionStatusIndicator, { type StatusStep } from "../components/SuggestionStatusIndicator";
import JobCompareDock, { type CandidateResumeOption } from "../components/candidate/JobCompareDock";
import JobComparisonModal from "../components/candidate/JobComparisonModal";


const QUICK_PROMPT = "Gợi ý việc phù hợp";
const DEFAULT_FIT_GOOD = 45;
const DEFAULT_FIT_OK = 30;
const DEFAULT_MAX_JOBS = 10;
const DEFAULT_SKILL_WEIGHT = 0.6;
const LEFT_W = 256;
const RIGHT_W = 288;
const SIDE_T = { duration: 0.32, ease: [0.4, 0, 0.2, 1] as const };
const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

type RerankStatus = "success" | "fallback" | "not_requested";

type ChatJob = {
  id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  score: number;
  rerank_score?: number | null;
  rerank_status?: RerankStatus;
  match_reason?: string | null;
};

type Message = { id: string; role: "user" | "system"; text: string; jobs?: ChatJob[] };
type ChatHistoryItem = {
  id: string;
  first_message: string;
  last_message?: string | null;
  created_at: string;
  updated_at?: string;
  message_count?: number;
};
type FitKey = "good" | "ok" | "poor";
type ResumeInfo = {
  id: string;
  title: string;
  filename: string;
  created_at: string;
  is_default?: boolean;
  storage_path?: string;
};

function formatSessionDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const timeStr = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    if (isToday) return `Hôm nay ${timeStr}`;
    if (isYesterday) return `Hôm qua ${timeStr}`;
    return `${d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })} ${timeStr}`;
  } catch {
    return dateStr;
  }
}


const FIT_GROUPS: { key: FitKey; label: string; className: string }[] = [
  { key: "good", label: "Phù hợp cao", className: "text-emerald-600 dark:text-emerald-400" },
  { key: "ok", label: "Bình thường", className: "text-amber-600 dark:text-amber-400" },
  { key: "poor", label: "Chưa phù hợp", className: "text-rose-600 dark:text-rose-400" },
];

const displayScore = (job: ChatJob) =>
  job.rerank_status === "success" && job.rerank_score != null ? job.rerank_score : job.score;

function getFitBand(score: number, goodPct: number, okPct: number): FitKey {
  if (score >= goodPct / 100) return "good";
  if (score >= okPct / 100) return "ok";
  return "poor";
}

function groupJobs(jobs: ChatJob[], goodPct: number, okPct: number, maxLimit?: number) {
  const list = maxLimit ? jobs.slice(0, maxLimit) : jobs;
  const buckets: Record<FitKey, ChatJob[]> = { good: [], ok: [], poor: [] };
  for (const j of list) buckets[getFitBand(displayScore(j), goodPct, okPct)].push(j);
  return buckets;
}

function JobRecommendationCard({
  job,
  onNavigate,
  selectedForCompare = false,
  compareLabel,
  onToggleCompare,
  goodThreshold = DEFAULT_FIT_GOOD,
  okThreshold = DEFAULT_FIT_OK,
}: {
  job: ChatJob;
  onNavigate: (id: string) => void;
  selectedForCompare?: boolean;
  compareLabel?: string;
  onToggleCompare?: (job: ChatJob) => void;
  goodThreshold?: number;
  okThreshold?: number;
}) {
  const score = displayScore(job);
  const band = getFitBand(score, goodThreshold, okThreshold);
  const pct = Math.round(score * 100);
  const badgeColor =
    band === "good"
      ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300"
      : band === "ok"
      ? "text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300"
      : "text-rose-600 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-300";

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl p-4 w-full flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
      <div>
        <div className="flex items-center justify-between mb-2 gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{pct}% phù hợp</span>
          {job.employment_type && (
            <Badge variant="primary" className="shrink-0">
              {ENUM_LABELS.employment_type[job.employment_type as keyof typeof ENUM_LABELS.employment_type] || job.employment_type}
            </Badge>
          )}
        </div>
        <p className="font-semibold text-sm truncate" title={job.title}>{job.title}</p>
        <p className="text-xs text-slate-500 truncate" title={job.company_name || "Công ty đối tác"}>{job.company_name || "Công ty đối tác"}</p>
        <div className="flex items-center justify-between gap-2 mt-2.5 text-xs text-slate-500">
          <span className="flex items-center gap-1 truncate"><MapPin size={11} className="shrink-0" />{job.location || "Toàn quốc"}</span>
          <span className="flex items-center gap-1 text-emerald-600 font-medium shrink-0"><DollarSign size={11} />{formatCurrency(job.salary_min, job.currency)}</span>
        </div>

        {/* Dynamic AI Match Reason / Score Explanation */}
        <div className="mt-3 p-2.5 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl text-xs space-y-1">
          <div className="flex items-center gap-1 font-semibold text-indigo-700 dark:text-indigo-300 text-[11px]">
            <Sparkles size={12} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Giải thích điểm phù hợp ({pct}%):</span>
          </div>
          <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-normal line-clamp-3" title={job.match_reason || undefined}>
            {job.match_reason || `Được AI đánh giá ${pct}% phù hợp với CV của bạn dựa trên phân tích kỹ năng và kinh nghiệm.`}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => onNavigate(job.id)}
          className="flex-1 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center justify-center gap-1 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
        >
          Xem chi tiết <ExternalLink size={11} />
        </button>

        {onToggleCompare && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCompare(job);
            }}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl border flex items-center gap-1 transition-all shrink-0 ${
              selectedForCompare
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
            }`}
            title={selectedForCompare ? "Bỏ chọn so sánh" : "Thêm vào so sánh việc làm"}
          >
            {selectedForCompare ? (
              <>
                <Check size={12} className="stroke-[3]" />
                <span>{compareLabel || "Đã chọn"}</span>
              </>
            ) : (
              <>
                <Layers size={12} />
                <span>So sánh</span>
              </>
            )}
          </motion.button>
        )}
      </div>
    </div>
  );
}
export default function AISuggestionsPage() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const { info, error: toastError, success } = useToast();
  const { lang, t } = useLang();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [rerank, setRerank] = useState<"qwen" | "agent">("qwen");
  const [defaultCv, setDefaultCv] = useState<ResumeInfo | null>(null);

  // Algorithm configuration state
  const [maxJobs, setMaxJobs] = useState<number>(DEFAULT_MAX_JOBS);
  const [fitGoodThreshold, setFitGoodThreshold] = useState<number>(DEFAULT_FIT_GOOD);
  const [fitOkThreshold, setFitOkThreshold] = useState<number>(DEFAULT_FIT_OK);
  const [skillWeight, setSkillWeight] = useState<number>(DEFAULT_SKILL_WEIGHT);

  // Compare states
  const [selectedCompareJobs, setSelectedCompareJobs] = useState<ChatJob[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [resumes, setResumes] = useState<ResumeInfo[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);

  const [leftOpen, setLeftOpen] = useState(isDesktop);
  const [rightOpen, setRightOpen] = useState(isDesktop);
  const [desktop, setDesktop] = useState(isDesktop);

  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "system", text: "Xin chào! Bấm “Gợi ý việc phù hợp” hoặc nhập yêu cầu để AI tìm việc làm phù hợp cho bạn." },
  ]);
  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem("chat_session_id"));
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [deleteTargetSessionId, setDeleteTargetSessionId] = useState<string | null>(null);
  const [isClearAllConfirm, setIsClearAllConfirm] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [isSettingDefaultCv, setIsSettingDefaultCv] = useState(false);

  // Trạng thái streaming tiến trình và văn bản thời gian thực
  const [streamingSteps, setStreamingSteps] = useState<StatusStep[]>([]);
  const [currentStatusLabel, setCurrentStatusLabel] = useState<string>("");
  const [streamingText, setStreamingText] = useState<string>("");

  const bottomRef = useRef<HTMLDivElement>(null);


  // Ensure session exists
  useEffect(() => {
    if (!sessionId) {
      const newId = crypto.randomUUID();
      setSessionId(newId);
      localStorage.setItem("chat_session_id", newId);
    }
  }, [sessionId]);

  // Load session list from API
  const loadChatHistory = useCallback(async () => {
    if (!session?.access_token && (!supabase || !user)) return;
    try {
      if (session?.access_token) {
        const data = await apiJson<{ sessions: ChatHistoryItem[] }>(
          "/chat/sessions",
          session.access_token
        );
        if (data?.sessions) {
          setChatHistory(data.sessions);
          return;
        }
      }
      if (supabase && user) {
        const { data } = await supabase
          .from("chat_messages")
          .select("id, session_id, created_at, content, role")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100);
        if (data) {
          const sessionsMap = new Map<string, ChatHistoryItem>();
          for (const m of data) {
            const sid = m.session_id;
            if (!sessionsMap.has(sid)) {
              sessionsMap.set(sid, {
                id: sid,
                created_at: m.created_at,
                updated_at: m.created_at,
                first_message: m.role === "user" ? m.content : "Cuộc trò chuyện",
                message_count: 1,
              });
            } else {
              const item = sessionsMap.get(sid)!;
              item.message_count = (item.message_count || 1) + 1;
              if (m.role === "user") item.first_message = m.content;
            }
          }
          setChatHistory(Array.from(sessionsMap.values()));
        }
      }
    } catch (err) {
      console.error("Failed to load chat history", err);
    }
  }, [session, user]);

  useEffect(() => { void loadChatHistory(); }, [loadChatHistory]);

  // Load session messages
  const loadSession = useCallback(async (sid: string) => {
    if (!session?.access_token) return;
    try {
      const data = await apiJson<{ session_id: string; messages: { id: string; role: string; content: string; recommendations: any[] }[] }>(
        `/chat/history/${sid}`,
        session.access_token
      );
      if (data?.messages && data.messages.length > 0) {
        setMessages(
          data.messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "system",
            text: m.content,
            jobs: m.recommendations?.filter((r) => r.type === "job").map((r) => r.data) || [],
          }))
        );
      } else {
        setMessages([{ id: "welcome", role: "system", text: "Xin chào! Bấm “Gợi ý việc phù hợp” hoặc nhập yêu cầu để AI tìm việc làm phù hợp cho bạn." }]);
      }
      setSessionId(sid);
      localStorage.setItem("chat_session_id", sid);
    } catch (err) {
      console.error("Failed to load session", err);
    }
  }, [session]);

  // Restore active session on mount
  useEffect(() => {
    const savedSid = localStorage.getItem("chat_session_id");
    if (savedSid && session?.access_token) {
      void loadSession(savedSid);
    }
  }, [session, loadSession]);

  // Delete session trigger
  const handleDeleteSession = (e: React.MouseEvent, sid: string) => {
    e.stopPropagation();
    setIsClearAllConfirm(false);
    setDeleteTargetSessionId(sid);
  };

  const handleConfirmDelete = async () => {
    if (isClearAllConfirm) {
      setIsDeletingSession(true);
      try {
        if (session?.access_token) {
          await apiJson("/chat/history", session.access_token, { method: "DELETE" });
        } else if (supabase && user) {
          await supabase.from("chat_messages").delete().eq("user_id", user.id);
        }
        setChatHistory([]);
        startNewChat();
        success(t.clearAllChatSuccess);
        setIsClearAllConfirm(false);
      } catch (err) {
        console.error("Failed to clear chat history", err);
        toastError(t.deleteChatFailed, "Không thể xóa toàn bộ lịch sử trò chuyện");
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
        await apiJson(`/chat/sessions/${sid}`, session.access_token, { method: "DELETE" });
      } else if (supabase && user) {
        await supabase.from("chat_messages").delete().eq("user_id", user.id).eq("session_id", sid);
      }
      setChatHistory((prev) => prev.filter((s) => s.id !== sid));
      if (sessionId === sid) {
        startNewChat();
      }
      success(t.deleteChatSuccess);
      setDeleteTargetSessionId(null);
    } catch (err) {
      console.error("Failed to delete session", err);
      toastError(t.deleteChatFailed, "Không thể xóa cuộc trò chuyện");
    } finally {
      setIsDeletingSession(false);
    }
  };


  // New chat
  const startNewChat = () => {
    const newId = crypto.randomUUID();
    setSessionId(newId);
    localStorage.setItem("chat_session_id", newId);
    setMessages([{ id: "welcome", role: "system", text: "Xin chào! Bấm “Gợi ý việc phù hợp” hoặc nhập yêu cầu để AI tìm việc làm phù hợp cho bạn." }]);
  };

  // Load candidate default resume info and all resumes
  const loadDefaultCv = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      const { data: allResumes } = await supabase
        .from("resumes")
        .select("id, title, storage_path, created_at, is_default, original_filename")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (allResumes && allResumes.length > 0) {
        const formatted: ResumeInfo[] = allResumes.map((r: any) => {
          const fn = r.original_filename || (r.storage_path ? r.storage_path.split("/").pop() : "CV.pdf");
          return {
            id: r.id,
            title: r.title || "Hồ sơ CV",
            filename: fn || "CV.pdf",
            created_at: r.created_at,
            is_default: Boolean(r.is_default),
            storage_path: r.storage_path,
          };
        });
        setResumes(formatted);
        const def = formatted.find((r) => r.is_default) || formatted[0];
        setDefaultCv(def || null);
        setSelectedResumeId((prev) => prev || def?.id || null);
      } else {
        setResumes([]);
        setDefaultCv(null);
        setSelectedResumeId(null);
      }
    } catch (err) {
      console.error("Failed to load CVs", err);
    }
  }, [user]);

  // Set selected CV as default
  const handleSetDefaultResume = async (resumeId: string) => {
    if (!supabase || !user || isSettingDefaultCv) return;
    setIsSettingDefaultCv(true);
    try {
      await supabase.from("resumes").update({ is_default: false }).eq("user_id", user.id);
      const { error } = await supabase.from("resumes").update({ is_default: true }).eq("id", resumeId);
      if (error) throw error;
      success("Đã đặt làm CV mặc định cho hệ thống AI");
      await loadDefaultCv();
    } catch (err) {
      console.error("Failed to set default CV", err);
      toastError("Lỗi", "Không thể cập nhật CV mặc định");
    } finally {
      setIsSettingDefaultCv(false);
    }
  };

  const handleResetDefaults = () => {
    setMaxJobs(DEFAULT_MAX_JOBS);
    setFitGoodThreshold(DEFAULT_FIT_GOOD);
    setFitOkThreshold(DEFAULT_FIT_OK);
    setSkillWeight(DEFAULT_SKILL_WEIGHT);
    setRerank("qwen");
    info("Đã khôi phục các thông số thuật toán về mặc định.");
  };

  const activeCv = resumes.find((r) => r.id === selectedResumeId) || defaultCv;

  const handleToggleCompare = (job: ChatJob) => {
    setSelectedCompareJobs((prev) => {
      const exists = prev.some((j) => j.id === job.id);
      if (exists) {
        return prev.filter((j) => j.id !== job.id);
      }
      if (prev.length >= 5) {
        info("Chỉ có thể so sánh tối đa 5 việc làm cùng lúc");
        return prev;
      }
      return [...prev, job];
    });
  };

  const handleRemoveCompare = (jobId: string) => {
    setSelectedCompareJobs((prev) => prev.filter((j) => j.id !== jobId));
  };

  const handleClearCompare = () => {
    setSelectedCompareJobs([]);
  };

  const handleOpenCompareModal = () => {
    if (!user) {
      info("Vui lòng đăng nhập để sử dụng tính năng so sánh việc làm với CV");
      return;
    }
    if (selectedCompareJobs.length < 2) {
      info("Vui lòng chọn từ 2 đến 5 việc làm để so sánh");
      return;
    }
    setIsCompareModalOpen(true);
  };

  useEffect(() => { void loadDefaultCv(); }, [loadDefaultCv]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const handleSend = async (text?: string) => {
    const msgText = (text || input).trim();
    if (!msgText) {
      toastError("Nội dung trống", "Vui lòng nhập câu hỏi hoặc bấm nút gợi ý!");
      return;
    }
    if (sending || !session?.access_token) return;
    setInput("");
    setSending(true);
    setStreamingSteps([]);
    setCurrentStatusLabel("Đang khởi tạo gợi ý việc làm...");
    setStreamingText("");

    let sid = sessionId;
    if (!sid) {
      sid = crypto.randomUUID();
      setSessionId(sid);
      localStorage.setItem("chat_session_id", sid);
    }
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: msgText }]);
    try {
      let accumulatedText = "";
      let finalJobs: ChatJob[] = [];
      let finalSessionId = sid;

      await apiStream(
        "/chat/stream",
        session.access_token,
        {
          message: msgText,
          rerank,
          session_id: sid,
          resume_id: selectedResumeId || defaultCv?.id,
          max_results: maxJobs,
          skill_weight: skillWeight,
          experience_weight: Number((1 - skillWeight).toFixed(2)),
        },
        (event: StreamEvent) => {
          if (event.event === "status") {
            setCurrentStatusLabel(event.data.label);
            setStreamingSteps((prev) => {
              const exists = prev.some((s) => s.step === event.data.step && s.label === event.data.label);
              if (exists) return prev;
              return [...prev, { step: event.data.step, label: event.data.label, timestamp: Date.now() }];
            });
          } else if (event.event === "token") {
            accumulatedText += event.data.delta;
            setStreamingText(accumulatedText);
          } else if (event.event === "complete") {
            finalJobs = (event.data.jobs || []) as ChatJob[];
            accumulatedText = event.data.response || accumulatedText;
            if (event.data.session_id && event.data.session_id !== sid) {
              finalSessionId = event.data.session_id;
              setSessionId(finalSessionId);
              localStorage.setItem("chat_session_id", finalSessionId);
            }
          } else if (event.event === "error") {
            throw new Error(event.data.error || "Lỗi xử lý luồng gợi ý");
          }
        }
      );

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "system",
          text: accumulatedText || "Đã tìm thấy các công việc phù hợp:",
          jobs: finalJobs,
        },
      ]);
      // Cập nhật lại lịch sử chat bên thanh sidebar
      void loadChatHistory();
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "system", text: err instanceof Error ? err.message : "Không gửi được tin nhắn." },
      ]);
    } finally {
      setSending(false);
      setStreamingSteps([]);
      setCurrentStatusLabel("");
      setStreamingText("");
    }
  };

  // Left Sidebar: Chat History / Sessions List
  const historyPane = (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-100 dark:border-slate-700">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <MessageSquare size={15} className="text-indigo-600 dark:text-indigo-400" />
          <span>Lịch sử trò chuyện</span>
        </p>
        <button
          type="button"
          onClick={() => setLeftOpen(false)}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          aria-label="Ẩn lịch sử"
        >
          <X size={14} />
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-3 border-b border-slate-100 dark:border-slate-700">
        <button
          type="button"
          onClick={startNewChat}
          className="w-full py-2 px-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
        >
          <Plus size={14} className="stroke-[2.5]" />
          <span>Cuộc trò chuyện mới</span>
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1 text-xs">
        <div className="px-1 py-1 flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-slate-400">
          <span>Danh sách phiên chat ({chatHistory.length})</span>
          {chatHistory.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDeleteTargetSessionId(null);
                setIsClearAllConfirm(true);
              }}
              className="text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 normal-case font-medium hover:underline flex items-center gap-1 cursor-pointer"
              title={t.clearAllChat}
            >
              <Trash2 size={11} />
              <span>{t.clearAllChat}</span>
            </button>
          )}
        </div>


        {chatHistory.length === 0 ? (
          <div className="px-3 py-6 text-center text-slate-400 space-y-1">
            <MessageSquare size={22} className="mx-auto opacity-40 mb-2 text-indigo-400" />
            <p className="font-semibold text-xs text-slate-600 dark:text-slate-300">Chưa có lịch sử chat</p>
            <p className="text-[11px] text-slate-400">Gửi câu hỏi để tạo phiên trò chuyện mới.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {chatHistory.map((s) => {
              const isActive = sessionId === s.id;
              return (
                <li key={s.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => void loadSession(s.id)}
                    className={`w-full text-left rounded-xl p-2.5 transition-all pr-8 flex flex-col gap-1 border ${
                      isActive
                        ? "bg-indigo-50/90 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-slate-900 dark:text-white shadow-xs font-medium"
                        : "bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-700/60 border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-400">
                      <Clock size={11} className="shrink-0 text-slate-400" />
                      <span>{formatSessionDate(s.updated_at || s.created_at)}</span>
                      {s.message_count !== undefined && s.message_count > 0 && (
                        <span className="ml-auto text-[9px] px-1.5 py-0.2 rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
                          {s.message_count} tin
                        </span>
                      )}
                    </div>
                    <p className="text-xs line-clamp-2 leading-snug break-words">
                      {s.first_message || "Cuộc trò chuyện"}
                    </p>
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={(e) => void handleDeleteSession(e, s.id)}
                    className="absolute right-2 top-2.5 p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Xóa cuộc trò chuyện này"
                    aria-label="Xóa cuộc trò chuyện"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  // Right Sidebar: CV Info & AI Matching Settings
  const paramsPane = (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-100 dark:border-slate-700">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <SlidersHorizontal size={14} className="text-indigo-600 dark:text-indigo-400" /> Thông tin CV & Cấu hình
        </p>
        <button type="button" onClick={() => setRightOpen(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Ẩn thông số">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
        {/* CV Selector & Details */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 dark:bg-indigo-900/40 dark:text-indigo-300 px-2 py-0.5 rounded-md">
              CV dùng để matching AI
            </p>
            {resumes.length > 1 && (
              <span className="text-[10px] text-slate-400">{resumes.length} CV sẵn sàng</span>
            )}
          </div>

          {resumes.length > 0 ? (
            <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600 space-y-2.5">
              {/* Selector dropdown if multiple resumes */}
              {resumes.length > 1 && (
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Chọn CV phân tích:</label>
                  <div className="relative">
                    <select
                      value={selectedResumeId || ""}
                      onChange={(e) => setSelectedResumeId(e.target.value)}
                      className="w-full appearance-none px-2.5 py-1.5 pr-7 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {resumes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} {r.is_default ? "★ (Mặc định)" : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-2.5 pointer-events-none text-slate-400" />
                  </div>
                </div>
              )}

              {/* Active CV Info Card */}
              {activeCv && (
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 min-w-0">
                      <FileText size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span className="truncate" title={activeCv.title}>{activeCv.title}</span>
                    </div>
                    {activeCv.is_default && (
                      <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-800 flex items-center gap-0.5">
                        <Star size={9} className="fill-amber-500 text-amber-500" /> Mặc định
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 truncate" title={activeCv.filename}>{activeCv.filename}</p>
                  <p className="text-[10px] text-slate-400">Cập nhật: {new Date(activeCv.created_at).toLocaleDateString("vi-VN")}</p>

                  {/* Set default button if not default */}
                  {!activeCv.is_default && (
                    <button
                      type="button"
                      disabled={isSettingDefaultCv}
                      onClick={() => void handleSetDefaultResume(activeCv.id)}
                      className="w-full py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 transition-colors flex items-center justify-center gap-1"
                    >
                      <Star size={11} /> Đặt làm CV mặc định
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => navigate("/cv-vault")}
                className="w-full py-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors flex items-center justify-center gap-1"
              >
                Quản lý CV kho <ExternalLink size={11} />
              </button>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl text-amber-800 dark:text-amber-300 space-y-2">
              <p className="text-[11px]">Bạn chưa tải CV lên kho. AI sẽ gợi ý dựa trên yêu cầu trò chuyện trực tiếp.</p>
              <button
                type="button"
                onClick={() => navigate("/cv-vault")}
                className="w-full py-1.5 text-[11px] font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors shadow-xs"
              >
                Tải CV lên kho ngay
              </button>
            </div>
          )}
        </div>

        {/* Model & Reranker Config */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Chế độ Rerank AI</p>
          <div className="space-y-1.5">
            {(["qwen", "agent"] as const).map((mode) => (
              <button
                type="button"
                key={mode}
                onClick={() => setRerank(mode)}
                className={`w-full px-3 py-2 text-left rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                  rerank === mode
                    ? "bg-indigo-50/90 dark:bg-indigo-950/60 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-semibold ring-1 ring-indigo-500/20"
                    : "bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                <div>
                  <p className="capitalize text-xs">{mode === "qwen" ? "Qwen AI Reranker" : "RRF Fusion Match"}</p>
                  <p className="text-[10px] text-slate-400 font-normal">{mode === "qwen" ? "Dùng mô hình Deep Reranking" : "Trộn điểm vector + từ khóa BM25"}</p>
                </div>
                {rerank === mode ? (
                  <CheckCircle2 size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-500 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Algorithm Settings */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Thông số thuật toán</p>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="text-[10px] font-medium text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition-colors cursor-pointer"
              title="Đặt lại các thông số về mặc định"
            >
              <RotateCcw size={10} /> Đặt lại
            </button>
          </div>

          {/* Max Jobs Displayed */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-600 dark:text-slate-300 font-medium">Số việc làm hiển thị</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">Top {maxJobs}</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[5, 10, 15, 20].map((num) => (
                <button
                  type="button"
                  key={num}
                  onClick={() => setMaxJobs(num)}
                  className={`py-1 text-xs font-semibold rounded-lg border transition-all ${
                    maxJobs === num
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                      : "bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* High Fit Threshold */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-600 dark:text-slate-300 font-medium">Ngưỡng Phù hợp cao</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{fitGoodThreshold}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={80}
              step={5}
              value={fitGoodThreshold}
              onChange={(e) => {
                const val = Number(e.target.value);
                setFitGoodThreshold(val);
                if (val <= fitOkThreshold) {
                  setFitOkThreshold(Math.max(5, val - 10));
                }
              }}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <div className="flex justify-between text-[9px] text-slate-400">
              <span>20%</span>
              <span>Khuyến nghị: 45%</span>
              <span>80%</span>
            </div>
          </div>

          {/* Normal Fit Threshold */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-600 dark:text-slate-300 font-medium">Ngưỡng Bình thường</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">{fitOkThreshold}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={60}
              step={5}
              value={fitOkThreshold}
              onChange={(e) => {
                const val = Number(e.target.value);
                setFitOkThreshold(val);
                if (val >= fitGoodThreshold) {
                  setFitGoodThreshold(Math.min(90, val + 10));
                }
              }}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-600"
            />
            <div className="flex justify-between text-[9px] text-slate-400">
              <span>10%</span>
              <span>Khuyến nghị: 30%</span>
              <span>60%</span>
            </div>
          </div>

          {/* Skill vs Experience / Semantic Weight */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-600 dark:text-slate-300 font-medium">Trọng số kỹ năng vs Ngữ nghĩa</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                {Math.round(skillWeight * 100)}% / {Math.round((1 - skillWeight) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.2}
              max={0.8}
              step={0.1}
              value={skillWeight}
              onChange={(e) => setSkillWeight(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-[9px] text-slate-400">
              <span>Thiên ngữ nghĩa</span>
              <span>Cân bằng</span>
              <span>Thiên từ khóa kỹ năng</span>
            </div>
          </div>

          {/* Model info banner */}
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
              <Sparkles size={11} className="text-indigo-500" />
              <span>Mô hình & Không gian Vector</span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Qwen3.7 Embed 1536d + BM25 Hybrid Reciprocal Rank Fusion.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <AnimatedPage className="w-full min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-900 flex">
      {/* Left Drawer (Mobile & Desktop) */}
      {desktop ? (
        <motion.aside
          initial={false}
          animate={{ width: leftOpen ? LEFT_W : 0 }}
          transition={SIDE_T}
          className="sticky top-16 h-[calc(100vh-4rem)] shrink-0 overflow-hidden z-20 self-start"
        >
          <div className="h-full" style={{ width: LEFT_W }}>{historyPane}</div>
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

      {/* Main Center Area */}
      <div className="flex-1 min-w-0 flex flex-col py-4 gap-3">
        <div className="w-full max-w-[1600px] mx-auto px-3 sm:px-4 flex flex-col flex-1 min-h-0 gap-3">
          {/* Header Bar */}
          <div className="flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shrink-0 shadow-sm">
                <Sparkles size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">Gợi ý việc làm AI</h1>
                <p className="text-xs text-slate-500 hidden sm:block">Chat matching theo kỹ năng & trải nghiệm CV</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRightOpen((v) => !v)}
                className={`p-2 rounded-xl border transition-colors ${rightOpen ? "bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"}`}
                aria-pressed={rightOpen}
                aria-label="Hiện/ẩn thông tin CV & cấu hình"
              >
                <PanelRight size={16} />
              </button>
            </div>
          </div>

          {/* Main Chat Box Container */}
          <section className="flex-1 min-w-0 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col relative" style={{ minHeight: "60vh" }}>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((msg) => {
                  const groups = msg.jobs?.length ? groupJobs(msg.jobs, fitGoodThreshold, fitOkThreshold, maxJobs) : null;
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white ${msg.role === "system" ? "bg-gradient-to-br from-indigo-500 to-purple-600" : "bg-gradient-to-br from-orange-400 to-pink-500"}`}>
                        {msg.role === "system" ? <Bot size={14} /> : <User size={14} />}
                      </div>
                      <div className={`min-w-0 ${groups ? "flex-1" : "max-w-[80%]"} flex flex-col gap-3`}>
                        <div className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-line w-fit max-w-full ${msg.role === "user" ? "bg-indigo-600 text-white ml-auto" : "bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200"}`}>
                          {msg.text}
                        </div>

                        {groups && FIT_GROUPS.map((g) => {
                          const list = groups[g.key];
                          if (list.length === 0) return null;
                          return (
                            <div key={g.key} className="min-w-0 pt-2">
                              <h2 className={`text-base sm:text-lg font-bold mb-3 flex items-center gap-2 ${g.className}`}>
                                <span>{g.label}</span>
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                  {list.length}
                                </span>
                              </h2>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {list.map((job) => {
                                  const compareIdx = selectedCompareJobs.findIndex((j) => j.id === job.id);
                                  const isSelected = compareIdx !== -1;
                                  const letterLabel = isSelected ? String.fromCharCode(65 + compareIdx) : undefined;

                                  return (
                                    <JobRecommendationCard
                                      key={job.id}
                                      job={job}
                                      onNavigate={(id) => navigate(`/jobs/${id}`)}
                                      selectedForCompare={isSelected}
                                      compareLabel={letterLabel}
                                      onToggleCompare={handleToggleCompare}
                                      goodThreshold={fitGoodThreshold}
                                      okThreshold={fitOkThreshold}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  );

                })}
              </AnimatePresence>

              {sending && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white bg-gradient-to-br from-indigo-500 to-purple-600">
                    <Bot size={14} />
                  </div>
                  <div className="flex-1 min-w-0 max-w-[85%] flex flex-col gap-2">
                    <SuggestionStatusIndicator
                      currentLabel={currentStatusLabel}
                      steps={streamingSteps}
                      isGenerating={sending}
                      theme="candidate"
                    />
                    {streamingText && (
                      <div className="rounded-2xl px-4 py-3 text-sm whitespace-pre-line w-fit max-w-full bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                        {streamingText}
                        <span className="inline-block w-1.5 h-3.5 ml-1 bg-indigo-600 animate-pulse align-middle" />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Bottom Sticky Input Container */}
            <div className="sticky bottom-0 z-10 bg-white dark:bg-slate-800 rounded-b-2xl border-t border-slate-100 dark:border-slate-700 shadow-md">
              {/* Quick Suggestions & Rerank Pills */}
              <div className="px-4 py-2.5 flex gap-2 flex-wrap items-center">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  disabled={sending}
                  onClick={() => void handleSend(QUICK_PROMPT)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-xs font-semibold rounded-full border border-indigo-200 dark:border-indigo-800 disabled:opacity-50 transition-colors"
                >
                  <Sparkles size={13} className={sending ? "animate-pulse" : ""} /> {QUICK_PROMPT}
                </motion.button>
                {(["qwen", "agent"] as const).map((mode) => (
                  <motion.button
                    key={mode}
                    whileTap={{ scale: 0.95 }}
                    disabled={sending}
                    onClick={() => setRerank(mode)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${rerank === mode ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" : "bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600"}`}
                  >
                    {mode === "qwen" ? "Qwen Rerank" : "Agent Match"}
                  </motion.button>
                ))}
              </div>

              {/* Bottom Text Input */}
              <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-700 flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleSend()}
                  disabled={sending}
                  placeholder="Nhắn tin với AI (VD: Tìm việc Backend Python Remote...)"
                  className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm"
                />
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => void handleSend()}
                  disabled={!input.trim() || sending}
                  className="p-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white rounded-xl transition-colors shadow-md shadow-indigo-200 dark:shadow-none"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </motion.button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Right Drawer (Mobile & Desktop) */}
      {desktop ? (
        <motion.aside
          initial={false}
          animate={{ width: rightOpen ? RIGHT_W : 0 }}
          transition={SIDE_T}
          className="sticky top-16 h-[calc(100vh-4rem)] shrink-0 overflow-hidden z-20 self-start"
        >
          <div className="h-full" style={{ width: RIGHT_W }}>{paramsPane}</div>
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
                aria-label="Đóng thông số"
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
        className="fixed top-20 z-30 p-2.5 bg-white dark:bg-slate-800 border border-l-0 border-slate-200 dark:border-slate-700 shadow-md rounded-r-xl text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
        aria-pressed={leftOpen}
        aria-label={leftOpen ? "Thu gọn lịch sử trò chuyện" : "Hiện lịch sử trò chuyện"}
        title={leftOpen ? "Thu gọn lịch sử trò chuyện" : "Hiện lịch sử trò chuyện"}
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
        className="fixed top-20 z-30 p-2.5 bg-white dark:bg-slate-800 border border-r-0 border-slate-200 dark:border-slate-700 shadow-md rounded-l-xl text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
        aria-pressed={rightOpen}
        aria-label={rightOpen ? "Thu gọn thông tin & cấu hình" : "Hiện thông tin & cấu hình"}
        title={rightOpen ? "Thu gọn thông tin & cấu hình" : "Hiện thông tin & cấu hình"}
      >
        <PanelRight size={18} />
      </motion.button>

      {/* Floating Job Compare Dock */}
      <JobCompareDock
        selectedJobs={selectedCompareJobs.map((j) => ({
          id: j.id,
          title: j.title,
          companyName: j.company_name || undefined,
        }))}
        onRemove={handleRemoveCompare}
        onClear={handleClearCompare}
        onCompare={handleOpenCompareModal}
        resumes={resumes}
        selectedResumeId={selectedResumeId}
        onSelectResume={setSelectedResumeId}
      />

      {/* Visual Comparison Modal */}
      <JobComparisonModal
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        jobIds={selectedCompareJobs.map((j) => j.id)}
        resumeId={selectedResumeId}
        resumes={resumes}
      />

      {/* Confirmation Modal for Delete Chat Session / History */}
      <ConfirmModal
        open={Boolean(deleteTargetSessionId || isClearAllConfirm)}
        title={isClearAllConfirm ? t.clearAllChatConfirmTitle : t.deleteChatConfirmTitle}
        message={isClearAllConfirm ? t.clearAllChatConfirmDesc : t.deleteChatConfirmDesc}
        confirmLabel={isDeletingSession ? (lang === "en" ? "Deleting..." : "Đang xóa...") : t.delete}
        cancelLabel={t.cancel}
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
