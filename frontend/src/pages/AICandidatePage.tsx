import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Sparkles, Bot, User, FileText, ExternalLink,
  PanelLeft, PanelRight, X, MessageSquare, SlidersHorizontal, Loader2, Check, Plus,
  Trash2, Clock, RotateCcw, CheckCircle2, ShieldCheck,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { apiJson } from "../lib/api";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { getResumeSignedUrl } from "../lib/storage";
import { ENUM_LABELS } from "../lib/format";
import { APP_STATUS_COLORS } from "../lib/ui";
import type { JobPost } from "../types";
import AnimatedPage from "../components/AnimatedPage";
import ConfirmModal from "../components/ConfirmModal";
import { useToast } from "../context/ToastContext";
import { useLang } from "../context/LangContext";
import CandidateCompareDock, { SelectedCandidateItem } from "../components/candidate/CandidateCompareDock";
import CVComparisonModal from "../components/candidate/CVComparisonModal";


const QUICK_PROMPT = "Gợi ý ứng viên phù hợp";
const DEFAULT_FIT_GOOD = 45;
const DEFAULT_FIT_OK = 30;
const DEFAULT_MAX_CANDIDATES = 20;
const DEFAULT_SKILL_WEIGHT = 0.6;
const LEFT_W = 256;
const RIGHT_W = 288;
const SIDE_T = { duration: 0.32, ease: [0.4, 0, 0.2, 1] as const };
const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

type RerankStatus = "success" | "fallback" | "not_requested";
type ChatCandidate = {
  application_id: string;
  applicant_user_id: string;
  full_name: string | null;
  email: string | null;
  resume_title: string | null;
  resume_storage_path: string | null;
  current_status: string;
  is_public_candidate?: boolean;
  has_verified_skills?: boolean;
  rrf_score: number;
  rerank_score: number | null;
  rerank_status: RerankStatus;
  match_reason?: string | null;
};
type HistoryRun = { id: string; created_at: string; rerank_mode: string | null; rerank_status: string | null; recruiter_message: string | null };
type Message = { id: string; role: "user" | "system"; text: string; candidates?: ChatCandidate[] };
type SavedSession = { id: string; created_at: string; first_message: string };
type JobOption = JobPost & { company_name?: string };
type FitKey = "good" | "ok" | "poor";

const FIT_GROUPS: { key: FitKey; label: string; className: string }[] = [
  { key: "good", label: "Phù hợp", className: "text-emerald-600 dark:text-emerald-400" },
  { key: "ok", label: "Bình thường", className: "text-amber-600 dark:text-amber-400" },
  { key: "poor", label: "Chưa phù hợp", className: "text-rose-600 dark:text-rose-400" },
];

const displayScore = (c: ChatCandidate) =>
  c.rerank_status === "success" && c.rerank_score != null ? c.rerank_score : c.rrf_score;

function getFitBand(score: number, goodPct: number, okPct: number): FitKey {
  if (score >= goodPct / 100) return "good";
  if (score >= okPct / 100) return "ok";
  return "poor";
}

function groupCandidates(
  candidates: ChatCandidate[],
  goodPct: number,
  okPct: number,
  includePublic: boolean,
  verifiedOnly: boolean,
  maxLimit?: number
) {
  let list = candidates.filter((c) => {
    if (!includePublic && (c.current_status === "job_seeking" || c.is_public_candidate)) {
      return false;
    }
    if (verifiedOnly && !c.has_verified_skills) {
      return false;
    }
    return true;
  });
  if (maxLimit) {
    list = list.slice(0, maxLimit);
  }
  const buckets: Record<FitKey, ChatCandidate[]> = { good: [], ok: [], poor: [] };
  for (const c of list) buckets[getFitBand(displayScore(c), goodPct, okPct)].push(c);
  return buckets;
}

function CandidateCard({
  candidate,
  opening,
  onOpen,
  isCompareSelected,
  onToggleCompare,
  goodThreshold = DEFAULT_FIT_GOOD,
  okThreshold = DEFAULT_FIT_OK,
}: {
  candidate: ChatCandidate;
  opening: boolean;
  onOpen: () => void;
  isCompareSelected?: boolean;
  onToggleCompare?: () => void;
  goodThreshold?: number;
  okThreshold?: number;
}) {
  const score = displayScore(candidate);
  const band = getFitBand(score, goodThreshold, okThreshold);
  const pct = Math.round(score * 100);
  const badgeColor =
    band === "good"
      ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300"
      : band === "ok"
      ? "text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300"
      : "text-rose-600 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-300";

  const isJobSeeking = candidate.current_status === "job_seeking" || Boolean(candidate.is_public_candidate);

  return (
    <div
      className={`bg-white dark:bg-slate-800 border rounded-xl p-4 w-72 sm:w-80 shrink-0 flex flex-col justify-between shadow-sm hover:shadow-md transition-all ${
        isCompareSelected
          ? "border-indigo-500 ring-2 ring-indigo-300 dark:ring-indigo-700 bg-indigo-50/20 dark:bg-indigo-950/20"
          : "border-slate-200 dark:border-slate-600"
      }`}
    >
      <div>
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            {onToggleCompare && (
              <button
                type="button"
                onClick={onToggleCompare}
                className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                  isCompareSelected
                    ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                    : "border-slate-300 dark:border-slate-600 hover:border-indigo-400 bg-white dark:bg-slate-800"
                }`}
                title={isCompareSelected ? "Bỏ chọn so sánh" : "Chọn để so sánh trực quan (2-5 ứng viên)"}
              >
                {isCompareSelected && <Check size={10} strokeWidth={3} />}
              </button>
            )}
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>{pct}% phù hợp</span>
          </div>

          <div className="flex items-center gap-1">
            {candidate.has_verified_skills && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-medium flex items-center gap-0.5" title="Kỹ năng đã được xác minh">
                <CheckCircle2 size={10} className="text-blue-500" /> Xác minh
              </span>
            )}
            {isJobSeeking ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Đang tìm việc
              </span>
            ) : (
              <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${APP_STATUS_COLORS[candidate.current_status as keyof typeof APP_STATUS_COLORS] || ""}`}>
                {ENUM_LABELS.application_status[candidate.current_status as keyof typeof ENUM_LABELS.application_status] || candidate.current_status}
              </span>
            )}
          </div>
        </div>

        <p className="font-semibold text-sm truncate">{candidate.full_name || "Ứng viên"}</p>
        <p className="text-xs text-slate-500 truncate">{candidate.email}</p>
        <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
          <FileText size={11} />
          <span className="truncate">{candidate.resume_title || "CV"}</span>
        </div>

        {/* Dynamic AI Match Reason / Score Explanation */}
        <div className="mt-3 p-2.5 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950/40 dark:to-indigo-950/40 border border-purple-200 dark:border-purple-800/60 rounded-xl text-xs space-y-1">
          <div className="flex items-center gap-1 font-semibold text-purple-700 dark:text-purple-300 text-[11px]">
            <Sparkles size={12} className="text-purple-600 dark:text-purple-400 shrink-0" />
            <span>Giải thích điểm phù hợp ({pct}%):</span>
          </div>
          <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-normal">
            {candidate.match_reason || `Được AI đánh giá ${pct}% phù hợp JD dựa trên phân tích kỹ năng và kinh nghiệm trong CV.`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={onOpen}
          disabled={opening}
          className="flex-1 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-xl flex items-center justify-center gap-1 disabled:opacity-50 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors"
        >
          <ExternalLink size={11} /> Xem CV
        </button>
        {onToggleCompare && (
          <button
            type="button"
            onClick={onToggleCompare}
            className={`px-3 py-1.5 text-xs font-medium rounded-xl border flex items-center gap-1 transition-colors ${
              isCompareSelected
                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                : "text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-700"
            }`}
          >
            {isCompareSelected ? "Đã chọn" : "So sánh"}
          </button>
        )}
      </div>
    </div>
  );
}
export default function AICandidatePage() {
  const { user, session } = useAuth();
  const { error: toastError, success, info } = useToast();
  const { lang, t } = useLang();
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobId, setJobId] = useState("");
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [rerank, setRerank] = useState<"qwen" | "agent">("qwen");
  const [includePublicCandidates, setIncludePublicCandidates] = useState(true);

  // Custom Algorithm Configuration State (no longer mock)
  const [maxCandidates, setMaxCandidates] = useState<number>(DEFAULT_MAX_CANDIDATES);
  const [fitGoodThreshold, setFitGoodThreshold] = useState<number>(DEFAULT_FIT_GOOD);
  const [fitOkThreshold, setFitOkThreshold] = useState<number>(DEFAULT_FIT_OK);
  const [skillWeight, setSkillWeight] = useState<number>(DEFAULT_SKILL_WEIGHT);
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(false);

  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(isDesktop);
  const [rightOpen, setRightOpen] = useState(isDesktop);
  const [desktop, setDesktop] = useState(isDesktop);
  const [selectedCompareCandidates, setSelectedCompareCandidates] = useState<SelectedCandidateItem[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "system", text: "Chọn một vị trí tuyển dụng, rồi bấm “Gợi ý ứng viên phù hợp” hoặc nhập yêu cầu cụ thể." },
  ]);

  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem("chat_session_id_candidate"));
  const [chatHistory, setChatHistory] = useState<SavedSession[]>([]);
  const [deleteTargetSessionId, setDeleteTargetSessionId] = useState<string | null>(null);
  const [isClearAllConfirm, setIsClearAllConfirm] = useState(false);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleResetDefaults = () => {
    setMaxCandidates(DEFAULT_MAX_CANDIDATES);
    setFitGoodThreshold(DEFAULT_FIT_GOOD);
    setFitOkThreshold(DEFAULT_FIT_OK);
    setSkillWeight(DEFAULT_SKILL_WEIGHT);
    setVerifiedOnly(false);
    setIncludePublicCandidates(true);
    setRerank("qwen");
    info("Đã khôi phục các tham số tùy chỉnh về mặc định.");
  };

  const handleToggleCompare = (cand: ChatCandidate) => {
    setSelectedCompareCandidates((prev) => {
      const exists = prev.some((c) => c.id === cand.application_id);
      if (exists) {
        return prev.filter((c) => c.id !== cand.application_id);
      }
      if (prev.length >= 5) {
        toastError("Tối đa 5 ứng viên", "Bạn chỉ có thể chọn tối đa 5 ứng viên để so sánh cùng lúc.");
        return prev;
      }
      return [
        ...prev,
        {
          id: cand.application_id,
          name: cand.full_name || "Ứng viên",
          subtitle: cand.resume_title || undefined,
        },
      ];
    });
  };

  const loadJobs = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      setJobsError(null);
      const { data: memberData, error: memberErr } = await supabase
        .from("company_members")
        .select("company_id, companies(name)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .in("role", ["owner", "recruiter"]);
      if (memberErr) throw memberErr;
      const companyIds = Array.from(new Set((memberData || []).map((row: { company_id: string }) => row.company_id)));
      const companyNames: Record<string, string> = {};
      (memberData || []).forEach((row: any) => {
        const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
        if (company?.name) companyNames[row.company_id] = company.name;
      });
      if (companyIds.length === 0) {
        setJobs([]);
        return;
      }
      const { data: jobsData, error: jobsErr } = await supabase
        .from("job_posts")
        .select("*")
        .in("company_id", companyIds)
        .eq("created_by_user_id", user.id)
        .order("updated_at", { ascending: false });
      if (jobsErr) throw jobsErr;
      setJobs(((jobsData || []) as JobPost[]).map((job) => ({ ...job, company_name: companyNames[job.company_id] })));
    } catch (err: unknown) {
      setJobsError(handleSupabaseError(err));
    }
  }, [user]);

  useEffect(() => { void loadJobs(); }, [loadJobs]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Ensure session exists
  useEffect(() => {
    if (!sessionId) {
      const newId = crypto.randomUUID();
      setSessionId(newId);
      localStorage.setItem("chat_session_id_candidate", newId);
    }
  }, [sessionId]);

  // Load session list
  const loadChatHistory = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, session_id, created_at, content")
        .eq("user_id", user.id)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(50);
      if (data) {
        const sessions = Array.from(
          new Map(data.map((m) => [m.session_id, { id: m.session_id, created_at: m.created_at, first_message: m.content }])).values()
        );
        setChatHistory(sessions);
      }
    } catch (err) {
      console.error("Failed to load chat history", err);
    }
  }, [user]);

  useEffect(() => { void loadChatHistory(); }, [loadChatHistory]);

  // Load session messages
  const loadSession = useCallback(async (sid: string) => {
    if (!session?.access_token) return;
    try {
      const data = await apiJson<{ messages: { id: string; role: string; content: string; recommendations: any[] }[] }>(
        `/chat/history/${sid}`,
        session.access_token
      );
      setMessages(
        data.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "system",
          text: m.content,
          candidates: m.recommendations?.filter((r) => r.type === "candidate").map((r) => r.data) || [],
        }))
      );
      setSessionId(sid);
      localStorage.setItem("chat_session_id_candidate", sid);
    } catch (err) {
      console.error("Failed to load session", err);
    }
  }, [session]);

  // New chat
  const startNewChat = () => {
    const newId = crypto.randomUUID();
    setSessionId(newId);
    localStorage.setItem("chat_session_id_candidate", newId);
    setMessages([{ id: "welcome", role: "system", text: "Chọn một vị trí tuyển dụng, rồi bấm “Gợi ý ứng viên phù hợp”." }]);
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


  const handleSelectJob = async (nextId: string) => {
    setJobId(nextId);
    setSelectedCompareCandidates([]);
    const job = jobs.find((j) => j.id === nextId);
    setMessages([{ id: `welcome-${nextId}`, role: "system", text: nextId ? `Đã chọn tin: ${job?.title}` : "Chọn một vị trí tuyển dụng." }]);
    setHistory([]);
    if (!nextId || !supabase) return;
    const { data } = await supabase
      .from("match_resume")
      .select("id, created_at, rerank_mode, rerank_status, recruiter_message")
      .eq("job_post_id", nextId)
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory((data || []) as HistoryRun[]);
  };

  const openCv = async (candidate: ChatCandidate) => {
    if (!candidate.resume_storage_path) {
      alert("Không tìm thấy file CV.");
      return;
    }
    try {
      setOpeningId(candidate.application_id);
      window.open(await getResumeSignedUrl(candidate.resume_storage_path), "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Không mở được CV.");
    } finally {
      setOpeningId(null);
    }
  };

  const handleSend = async (text?: string) => {
    if (!jobId) {
      toastError("Chưa chọn tin", "Vui lòng chọn tin tuyển dụng ở danh sách thả xuống.");
      return;
    }
    const msgText = (text || input).trim();
    if (!msgText) {
      toastError("Nội dung trống", "Vui lòng nhập câu hỏi hoặc bấm gợi ý!");
      return;
    }
    if (sending || !session?.access_token) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: msgText }]);
    try {
      const body = await apiJson<{ response: string; candidates?: ChatCandidate[] }>("/chat", session.access_token, {
        method: "POST",
        body: JSON.stringify({
          message: msgText,
          job_id: jobId,
          rerank,
          session_id: sessionId || undefined,
          include_public: includePublicCandidates,
          verified_only: verifiedOnly,
          max_results: maxCandidates,
          skill_weight: skillWeight,
          experience_weight: Number((1 - skillWeight).toFixed(2)),
        }),
      });
      let candidateList = body.candidates || [];
      if (!includePublicCandidates) {
        candidateList = candidateList.filter((c) => c.current_status !== "job_seeking" && !c.is_public_candidate);
      }
      if (verifiedOnly) {
        candidateList = candidateList.filter((c) => c.has_verified_skills);
      }
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "system", text: body.response, candidates: candidateList }]);
    } catch (err: unknown) {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "system", text: err instanceof Error ? err.message : "Không gửi được tin nhắn." }]);
    } finally {
      setSending(false);
    }
  };

  const chatTurns = messages.filter((m) => m.id !== "welcome" && !m.id.startsWith("welcome-"));

  const historyPane = (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-700">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <MessageSquare size={13} /> Lịch sử trò chuyện
        </p>
        <button type="button" onClick={() => setLeftOpen(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Ẩn lịch sử">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
        {/* New Chat Button */}
        <button
          type="button"
          onClick={startNewChat}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Plus size={14} /> Cuộc trò chuyện mới
        </button>

        {/* Current Session */}
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">Phiên hiện tại</p>
          {chatTurns.length === 0 ? (
            <p className="text-slate-400">Chưa có tin nhắn.</p>
          ) : (
            <ul className="space-y-1.5">
              {chatTurns.map((m) => (
                <li key={m.id} className={`rounded-lg px-2 py-1.5 line-clamp-2 ${m.role === "user" ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-200" : "bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300"}`}>
                  {m.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Saved Sessions */}
        <div>
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">
            <span>Phiên đã lưu ({chatHistory.length})</span>
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
            <p className="text-slate-400">Chưa có phiên nào được lưu.</p>
          ) : (
            <ul className="space-y-1.5">
              {chatHistory.map((sess) => (
                <li
                  key={sess.id}
                  onClick={() => void loadSession(sess.id)}
                  className={`group relative rounded-lg px-2 py-1.5 cursor-pointer transition-colors pr-7 ${
                    sessionId === sess.id
                      ? "bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200"
                      : "bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600"
                  }`}
                >
                  <p className="truncate line-clamp-1">{sess.first_message}</p>
                  <p className="text-[10px] text-slate-400">{new Date(sess.created_at).toLocaleString("vi-VN")}</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsClearAllConfirm(false);
                      setDeleteTargetSessionId(sess.id);
                    }}
                    className="absolute right-1.5 top-2 p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={t.deleteChatSession}
                    aria-label={t.deleteChatSession}
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>


        {/* Lượt gợi ý */}
        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">Lượt gợi ý</p>
          {history.length === 0 ? (
            <p className="text-slate-400">Chọn tin tuyển dụng để xem lịch sử.</p>
          ) : (
            <ul className="space-y-1.5">
              {history.map((run) => (
                <li key={run.id} className="rounded-lg px-2 py-1.5 bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300">
                  <p>{new Date(run.created_at).toLocaleString("vi-VN")}</p>
                  <p className="text-[10px] text-slate-400">{run.rerank_mode || "—"}{run.recruiter_message ? ` · ${run.recruiter_message}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  const paramsPane = (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-100 dark:border-slate-700">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <SlidersHorizontal size={14} className="text-purple-600 dark:text-purple-400" /> Tham số tùy chỉnh AI
        </p>
        <button type="button" onClick={() => setRightOpen(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Ẩn tham số">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
        {/* Toggle Rà soát ứng viên đang tìm việc */}
        <label className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200 p-3 rounded-xl bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/40 transition-colors">
          <input
            type="checkbox"
            checked={includePublicCandidates}
            onChange={(e) => setIncludePublicCandidates(e.target.checked)}
            className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4 mt-0.5"
          />
          <div className="min-w-0">
            <span className="font-bold block text-slate-900 dark:text-white text-xs">Rà soát ứng viên đang tìm việc</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block leading-tight mt-0.5">
              Tự động quét cả CV công khai trên toàn hệ thống chưa nộp đơn trực tiếp
            </span>
          </div>
        </label>

        {/* Chế độ Rerank AI */}
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
                    ? "bg-purple-50/90 dark:bg-purple-950/60 border-purple-500 text-purple-700 dark:text-purple-300 font-semibold ring-1 ring-purple-500/20"
                    : "bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                <div>
                  <p className="capitalize text-xs">{mode === "qwen" ? "Qwen AI Reranker" : "RRF Fusion Match"}</p>
                  <p className="text-[10px] text-slate-400 font-normal">{mode === "qwen" ? "Mô hình Deep Reranking chấm điểm sâu" : "Kết hợp điểm vector và từ khóa BM25"}</p>
                </div>
                {rerank === mode ? (
                  <CheckCircle2 size={14} className="text-purple-600 dark:text-purple-400 shrink-0" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-500 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Algorithm Parameters */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tham số thuật toán</p>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="text-[10px] font-medium text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 flex items-center gap-1 transition-colors cursor-pointer"
              title="Đặt lại các tham số về mặc định"
            >
              <RotateCcw size={10} /> Đặt lại
            </button>
          </div>

          {/* Max Candidates */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-600 dark:text-slate-300 font-medium">Số ứng viên tối đa</span>
              <span className="font-bold text-purple-600 dark:text-purple-400">Top {maxCandidates}</span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[5, 10, 15, 20, 30].map((num) => (
                <button
                  type="button"
                  key={num}
                  onClick={() => setMaxCandidates(num)}
                  className={`py-1 text-xs font-semibold rounded-lg border transition-all ${
                    maxCandidates === num
                      ? "bg-purple-600 text-white border-purple-600 shadow-xs"
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
              <span className="text-slate-600 dark:text-slate-300 font-medium">Ngưỡng phù hợp cao</span>
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
              <span className="text-slate-600 dark:text-slate-300 font-medium">Ngưỡng bình thường</span>
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

          {/* Skill vs Experience Weights */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-600 dark:text-slate-300 font-medium">Trọng số Kỹ năng / Kinh nghiệm</span>
              <span className="font-bold text-purple-600 dark:text-purple-400">
                {Math.round(skillWeight * 100)}% / {Math.round((1 - skillWeight) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.1}
              value={skillWeight}
              onChange={(e) => setSkillWeight(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
            />
            <div className="flex justify-between text-[9px] text-slate-400">
              <span>Thiên kinh nghiệm</span>
              <span>Cân bằng</span>
              <span>Thiên kỹ năng</span>
            </div>
          </div>

          {/* Verified Only Checkbox */}
          <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
            />
            <div className="min-w-0">
              <span className="font-semibold block text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1">
                <ShieldCheck size={13} className="text-blue-500" /> Chỉ CV có kỹ năng đã xác minh
              </span>
              <span className="text-[10px] text-slate-400 block">Lọc bỏ các CV chỉ có kỹ năng suy đoán</span>
            </div>
          </label>

          {/* Model info banner */}
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
              <Sparkles size={11} className="text-purple-500" />
              <span>Mô hình AI Matching</span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Qwen3.7 Embed (1536d) + Skill Taxonomy Verification & Deep Reranker.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <AnimatedPage className="w-full min-h-[calc(100vh-4rem)] bg-slate-50 dark:bg-slate-900 flex">
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

      <div className="flex-1 min-w-0 flex flex-col py-4 gap-3">
        <div className="w-full lg:w-[90%] lg:mx-auto px-3 sm:px-4 flex flex-col flex-1 min-h-0 gap-3">
          <div className="flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shrink-0">
                <Sparkles size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">Gợi ý ứng viên AI</h1>
                <p className="text-xs text-slate-500 hidden sm:block">Rà soát CV đã nộp và các CV công khai "Đang tìm việc"</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <motion.button
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => setIncludePublicCandidates((v) => !v)}
                className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${
                  includePublicCandidates
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700"
                    : "bg-white text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50"
                }`}
                title="Bật/tắt rà soát các ứng viên đang mở CV tìm việc"
              >
                <Check size={14} className={includePublicCandidates ? "opacity-100 text-emerald-600" : "opacity-0"} />
                <span>Rà soát ứng viên đang tìm việc</span>
              </motion.button>
              <select
                value={jobId}
                onChange={(e) => void handleSelectJob(e.target.value)}
                className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm max-w-full sm:max-w-xs cursor-pointer shadow-sm"
              >
                <option value="">-- Chọn tin tuyển dụng --</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.company_name ? `${j.company_name} — ${j.title}` : j.title}</option>)}
              </select>
            </div>
          </div>

          {jobsError && <p className="text-xs text-red-500">{jobsError}</p>}

          <section className="flex-1 min-w-0 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col relative" style={{ minHeight: "60vh" }}>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((msg) => {
                  const groups = msg.candidates?.length
                    ? groupCandidates(msg.candidates, fitGoodThreshold, fitOkThreshold, includePublicCandidates, verifiedOnly, maxCandidates)
                    : null;
                  return (
                    <motion.div key={msg.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                      <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${msg.role === "system" ? "bg-gradient-to-br from-purple-500 to-pink-600" : "bg-gradient-to-br from-orange-400 to-pink-500"}`}>
                        {msg.role === "system" ? <Bot size={14} className="text-white" /> : <User size={14} className="text-white" />}
                      </div>
                      <div className={`min-w-0 ${groups ? "flex-1" : "max-w-[80%]"} flex flex-col gap-3`}>
                        <div className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-line w-fit max-w-full ${msg.role === "user" ? "bg-indigo-600 text-white ml-auto" : "bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200"}`}>{msg.text}</div>
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
                              <div className="flex flex-row flex-wrap gap-3">
                                {list.map((cand) => (
                                  <CandidateCard
                                    key={cand.application_id}
                                    candidate={cand}
                                    opening={openingId === cand.application_id}
                                    onOpen={() => void openCv(cand)}
                                    isCompareSelected={selectedCompareCandidates.some((c) => c.id === cand.application_id)}
                                    onToggleCompare={() => handleToggleCompare(cand)}
                                    goodThreshold={fitGoodThreshold}
                                    okThreshold={fitOkThreshold}
                                  />
                                ))}
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
                <div className="flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 py-1">
                  <Loader2 size={14} className="animate-spin" />
                  <span>AI đang phân tích và tìm kiếm Top {maxCandidates} ứng viên phù hợp...</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Bottom Sticky Input Container */}
            <div className="sticky bottom-0 z-10 bg-white dark:bg-slate-800 rounded-b-2xl border-t border-slate-100 dark:border-slate-700 shadow-md">
              <div className="px-4 py-2.5 flex gap-2 flex-wrap items-center">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  disabled={sending || !jobId}
                  onClick={() => void handleSend(QUICK_PROMPT)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 text-xs font-semibold rounded-full border border-purple-200 dark:border-purple-800 disabled:opacity-50 transition-colors"
                >
                  <Sparkles size={13} className={sending ? "animate-pulse" : ""} /> {QUICK_PROMPT}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={() => setIncludePublicCandidates((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                    includePublicCandidates
                      ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 shadow-sm"
                      : "bg-slate-50 dark:bg-slate-700/60 text-slate-500 border-slate-200 dark:border-slate-600"
                  }`}
                  title="Bật/tắt rà soát các ứng viên đang mở CV tìm việc"
                >
                  <Check size={12} className={includePublicCandidates ? "opacity-100" : "opacity-0"} />
                  <span>Rà soát các ứng viên đang tìm việc</span>
                </motion.button>
                {(["qwen", "agent"] as const).map((mode) => (
                  <motion.button
                    key={mode}
                    whileTap={{ scale: 0.95 }}
                    disabled={sending || !jobId}
                    onClick={() => setRerank(mode)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${rerank === mode ? "bg-purple-600 text-white border-purple-600 shadow-sm" : "bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600"}`}
                  >
                    {mode}
                  </motion.button>
                ))}
              </div>

              <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-700 flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleSend()}
                  disabled={sending || !jobId}
                  placeholder={jobId ? "Nhắn tin với AI..." : "Chọn tin tuyển dụng trước"}
                  className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm disabled:opacity-60"
                />
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => void handleSend()}
                  disabled={!input.trim() || sending || !jobId}
                  className="p-2.5 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-50 text-white rounded-xl transition-colors shadow-md shadow-purple-200 dark:shadow-none"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </motion.button>
              </div>
            </div>
          </section>
        </div>
      </div>

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
        className="fixed top-20 z-30 p-2.5 bg-white dark:bg-slate-800 border border-l-0 border-slate-200 dark:border-slate-700 shadow-md rounded-r-xl text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
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
        className="fixed top-20 z-30 p-2.5 bg-white dark:bg-slate-800 border border-r-0 border-slate-200 dark:border-slate-700 shadow-md rounded-l-xl text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
        aria-pressed={rightOpen}
        aria-label={rightOpen ? "Thu gọn tham số tùy chỉnh" : "Hiện tham số tùy chỉnh"}
        title={rightOpen ? "Thu gọn tham số tùy chỉnh" : "Hiện tham số tùy chỉnh"}
      >
        <PanelRight size={18} />
      </motion.button>

      {/* Floating Selection Compare Dock */}
      <CandidateCompareDock
        selectedCandidates={selectedCompareCandidates}
        onRemove={(id) => setSelectedCompareCandidates((prev) => prev.filter((c) => c.id !== id))}
        onClear={() => setSelectedCompareCandidates([])}
        onCompare={() => setShowCompareModal(true)}
      />

      {/* CV Comparison Modal */}
      <CVComparisonModal
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        jobId={jobId}
        jobTitle={jobs.find((j) => j.id === jobId)?.title || ""}
        applicationIds={selectedCompareCandidates.map((c) => c.id)}
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
