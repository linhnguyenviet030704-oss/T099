import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Sparkles, Bot, User, FileText, ExternalLink,
  PanelLeft, PanelRight, X, MessageSquare, SlidersHorizontal, Loader2, Check, Plus,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { apiJson } from "../lib/api";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { getResumeSignedUrl } from "../lib/storage";
import { ENUM_LABELS } from "../lib/format";
import { APP_STATUS_COLORS } from "../lib/ui";
import type { JobPost } from "../types";
import AnimatedPage from "../components/AnimatedPage";
import { useToast } from "../context/ToastContext";
import CandidateCompareDock, { SelectedCandidateItem } from "../components/candidate/CandidateCompareDock";
import CVComparisonModal from "../components/candidate/CVComparisonModal";

const QUICK_PROMPT = "Gợi ý ứng viên phù hợp";
const FIT_GOOD = 0.45;
const FIT_OK = 0.3;
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

function fitBand(score: number): FitKey {
  if (score >= FIT_GOOD) return "good";
  if (score >= FIT_OK) return "ok";
  return "poor";
}

function groupCandidates(candidates: ChatCandidate[]) {
  const buckets: Record<FitKey, ChatCandidate[]> = { good: [], ok: [], poor: [] };
  for (const c of candidates) buckets[fitBand(displayScore(c))].push(c);
  return buckets;
}

function CandidateCard({
  candidate,
  opening,
  onOpen,
  isCompareSelected,
  onToggleCompare,
}: {
  candidate: ChatCandidate;
  opening: boolean;
  onOpen: () => void;
  isCompareSelected?: boolean;
  onToggleCompare?: () => void;
}) {
  const score = displayScore(candidate);
  const band = fitBand(score);
  const pct = Math.round(score * 100);
  const badgeColor =
    band === "good"
      ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300"
      : band === "ok"
      ? "text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300"
      : "text-rose-600 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-300";

  return (
    <div
      className={`bg-white dark:bg-slate-800 border rounded-xl p-4 w-72 sm:w-80 shrink-0 flex flex-col justify-between shadow-sm hover:shadow-md transition-all ${
        isCompareSelected
          ? "border-indigo-500 ring-2 ring-indigo-300 dark:ring-indigo-700 bg-indigo-50/20 dark:bg-indigo-950/20"
          : "border-slate-200 dark:border-slate-600"
      }`}
    >
      <div>
        <div className="flex items-center justify-between mb-2 gap-2">
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
          <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${APP_STATUS_COLORS[candidate.current_status as keyof typeof APP_STATUS_COLORS] || ""}`}>
            {ENUM_LABELS.application_status[candidate.current_status as keyof typeof ENUM_LABELS.application_status] || candidate.current_status}
          </span>
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
  const { error: toastError } = useToast();
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobId, setJobId] = useState("");
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [rerank, setRerank] = useState<"qwen" | "agent">("qwen");
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(isDesktop);
  const [rightOpen, setRightOpen] = useState(isDesktop);
  const [desktop, setDesktop] = useState(isDesktop);
  const [selectedCompareCandidates, setSelectedCompareCandidates] = useState<SelectedCandidateItem[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "system", text: "Chọn một vị trí, rồi bấm "Gợi ý ứng viên phù hợp"." },
  ]);
  const [sessionId, setSessionId] = useState<string | null>(() => localStorage.getItem("chat_session_id_candidate"));
  const [chatHistory, setChatHistory] = useState<SavedSession[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    setMessages([{ id: "welcome", role: "system", text: "Chọn một vị trí, rồi bấm "Gợi ý ứng viên phù hợp"." }]);
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
        body: JSON.stringify({ message: msgText, job_id: jobId, rerank, session_id: sessionId || undefined }),
      });
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "system", text: body.response, candidates: body.candidates || [] }]);
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
          <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1.5">Phiên đã lưu</p>
          {chatHistory.length === 0 ? (
            <p className="text-slate-400">Chưa có phiên nào được lưu.</p>
          ) : (
            <ul className="space-y-1.5">
              {chatHistory.map((sess) => (
                <li
                  key={sess.id}
                  onClick={() => void loadSession(sess.id)}
                  className={`rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                    sessionId === sess.id
                      ? "bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-700 text-indigo-800 dark:text-indigo-200"
                      : "bg-slate-50 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600"
                  }`}
                >
                  <p className="truncate line-clamp-1">{sess.first_message}</p>
                  <p className="text-[10px] text-slate-400">{new Date(sess.created_at).toLocaleString("vi-VN")}</p>
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
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-700">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <SlidersHorizontal size={13} /> Tham số tùy chỉnh
        </p>
        <button type="button" onClick={() => setRightOpen(false)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Ẩn tham số">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300 px-2 py-1 rounded-lg">Mock — chưa áp dụng</p>
        {[
          { label: "Số ứng viên tối đa", value: "20" },
          { label: "Ngưỡng phù hợp", value: `${Math.round(FIT_GOOD * 100)}%` },
          { label: "Ngưỡng bình thường", value: `${Math.round(FIT_OK * 100)}%` },
          { label: "Trọng số kỹ năng", value: "0.6" },
          { label: "Trọng số kinh nghiệm", value: "0.4" },
        ].map((row) => (
          <label key={row.label} className="block">
            <span className="text-[11px] text-slate-500">{row.label}</span>
            <input disabled value={row.value} className="mt-1 w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-500 cursor-not-allowed" />
          </label>
        ))}
        <label className="flex items-center gap-2 text-[11px] text-slate-500">
          <input type="checkbox" disabled className="rounded" />
          Chỉ CV đã xác minh
        </label>
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
                <p className="text-xs text-slate-500 hidden sm:block">Chỉ xét CV đã nộp vào vị trí đang chọn</p>
              </div>
            </div>
            <select
              value={jobId}
              onChange={(e) => void handleSelectJob(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm max-w-full sm:max-w-xs"
            >
              <option value="">-- Chọn tin tuyển dụng --</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.company_name ? `${j.company_name} — ${j.title}` : j.title}</option>)}
            </select>
          </div>
          {jobsError && <p className="text-xs text-red-500">{jobsError}</p>}

          <section className="flex-1 min-w-0 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col relative" style={{ minHeight: "60vh" }}>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((msg) => {
                  const groups = msg.candidates?.length ? groupCandidates(msg.candidates) : null;
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
                  <span>AI đang phân tích và gợi ý ứng viên...</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Bottom Sticky Input Container */}
            <div className="sticky bottom-0 z-10 bg-white dark:bg-slate-800 rounded-b-2xl border-t border-slate-100 dark:border-slate-700 shadow-md">
              <div className="px-4 py-2.5 flex gap-2 flex-wrap">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  disabled={sending || !jobId}
                  onClick={() => void handleSend(QUICK_PROMPT)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 text-xs font-semibold rounded-full border border-purple-200 dark:border-purple-800 disabled:opacity-50 transition-colors"
                >
                  <Sparkles size={13} className={sending ? "animate-pulse" : ""} /> {QUICK_PROMPT}
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
    </AnimatedPage>
  );
}
