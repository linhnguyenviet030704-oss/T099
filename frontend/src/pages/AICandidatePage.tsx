import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Sparkles, Bot, User, FileText, ExternalLink,
  PanelLeft, PanelRight, X, MessageSquare, SlidersHorizontal, Loader2,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { apiJson } from "../lib/api";
import { supabase, handleSupabaseError } from "../lib/supabase";
import { getResumeSignedUrl } from "../lib/storage";
import { ENUM_LABELS } from "../lib/format";
import { APP_STATUS_COLORS } from "../lib/ui";
import type { JobPost } from "../types";
import AnimatedPage from "../components/AnimatedPage";

const QUICK_PROMPT = "Gợi ý ứng viên phù hợp";
const FIT_GOOD = 0.75;
const FIT_OK = 0.5;
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
};
type HistoryRun = { id: string; created_at: string; rerank_mode: string | null; rerank_status: string | null; recruiter_message: string | null };
type Message = { id: string; role: "user" | "system"; text: string; candidates?: ChatCandidate[] };
type JobOption = JobPost & { company_name?: string };
type FitKey = "good" | "ok" | "poor";

const FIT_GROUPS: { key: FitKey; label: string; className: string }[] = [
  { key: "good", label: "Phù hợp", className: "text-emerald-600 dark:text-emerald-400" },
  { key: "ok", label: "Bình thường", className: "text-amber-600 dark:text-amber-400" },
  { key: "poor", label: "Không phù hợp", className: "text-rose-600 dark:text-rose-400" },
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
  candidate, opening, onOpen,
}: {
  candidate: ChatCandidate;
  opening: boolean;
  onOpen: () => void;
}) {
  const pct = Math.round(displayScore(candidate) * 100);
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl p-4 w-64 shrink-0">
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300 px-2 py-0.5 rounded-full">{pct}% phù hợp</span>
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
      <button
        onClick={onOpen}
        disabled={opening}
        className="mt-3 w-full py-1.5 text-xs font-medium text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-xl flex items-center justify-center gap-1 disabled:opacity-50"
      >
        <ExternalLink size={11} /> Xem CV
      </button>
    </div>
  );
}

export default function AICandidatePage() {
  const { user, session } = useAuth();
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
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "system", text: "Chọn một vị trí, rồi bấm “Gợi ý ứng viên phù hợp”." },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const handleSelectJob = async (nextId: string) => {
    setJobId(nextId);
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
    const msgText = (text || input).trim();
    if (!msgText || sending || !jobId || !session?.access_token) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: msgText }]);
    try {
      const body = await apiJson<{ response: string; candidates?: ChatCandidate[] }>("/chat", session.access_token, {
        method: "POST",
        body: JSON.stringify({ message: msgText, job_id: jobId, rerank }),
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
          className="shrink-0 overflow-hidden self-stretch"
        >
          <div className="h-full min-h-[calc(100vh-4rem)]" style={{ width: LEFT_W }}>{historyPane}</div>
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
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setLeftOpen((v) => !v)}
              className={`p-2 rounded-xl border ${leftOpen ? "bg-purple-50 border-purple-200 text-purple-600" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"}`}
              aria-pressed={leftOpen}
              aria-label="Hiện/ẩn lịch sử trò chuyện"
            >
              <PanelLeft size={16} />
            </button>
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
            <button
              type="button"
              onClick={() => setRightOpen((v) => !v)}
              className={`p-2 rounded-xl border ${rightOpen ? "bg-purple-50 border-purple-200 text-purple-600" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"}`}
              aria-pressed={rightOpen}
              aria-label="Hiện/ẩn tham số tùy chỉnh"
            >
              <PanelRight size={16} />
            </button>
          </div>
          {jobsError && <p className="text-xs text-red-500">{jobsError}</p>}

          <section className="flex-1 min-w-0 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden" style={{ minHeight: "60vh" }}>
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
                            <div key={g.key} className="min-w-0">
                              <p className={`text-xs font-semibold mb-2 ${g.className}`}>{g.label} ({list.length})</p>
                              <div className="flex flex-row flex-wrap gap-3">
                                {list.map((cand) => (
                                  <CandidateCard
                                    key={cand.application_id}
                                    candidate={cand}
                                    opening={openingId === cand.application_id}
                                    onOpen={() => void openCv(cand)}
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
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 flex gap-2 flex-wrap">
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
            <div className="p-4 border-t border-slate-100 dark:border-slate-700 flex gap-2">
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
          </section>
        </div>
      </div>

      {desktop ? (
        <motion.aside
          initial={false}
          animate={{ width: rightOpen ? RIGHT_W : 0 }}
          transition={SIDE_T}
          className="shrink-0 overflow-hidden self-stretch"
        >
          <div className="h-full min-h-[calc(100vh-4rem)]" style={{ width: RIGHT_W }}>{paramsPane}</div>
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
    </AnimatedPage>
  );
}
