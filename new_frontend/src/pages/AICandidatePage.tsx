import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, Bot, User, FileText, ExternalLink, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { AI_CANDIDATE_RESPONSES, APP_STATUS_LABELS, APP_STATUS_COLORS } from "../data/mockData";
import AnimatedPage from "../components/AnimatedPage";

interface Message {
  id: string;
  role: "user" | "system";
  text?: string;
  candidates?: typeof AI_CANDIDATE_RESPONSES[0]["candidates"];
}

interface HistoryEntry {
  jobId: string;
  messages: Message[];
}

export default function AICandidatePage() {
  const { currentUser, jobs, applications, cvFiles } = useApp();
  const navigate = useNavigate();

  const [selectedJobId, setSelectedJobId] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "system", text: "Xin chào! Chọn một tin tuyển dụng và tôi sẽ giúp bạn tìm ứng viên phù hợp nhất." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [responseIdx, setResponseIdx] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  if (!currentUser || (currentUser.role !== "recruiter" && currentUser.role !== "admin")) {
    navigate("/");
    return null;
  }

  const availableJobs = jobs.filter((j) =>
    j.status === "active" && (currentUser.role === "admin" || j.recruiterId === currentUser.id)
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSelectJob = (jobId: string) => {
    setSelectedJobId(jobId);
    const job = jobs.find((j) => j.id === jobId);
    const existingHistory = history.find((h) => h.jobId === jobId);
    if (existingHistory) {
      setMessages(existingHistory.messages);
    } else {
      setMessages([{
        id: `welcome-${jobId}`,
        role: "system",
        text: `Đã chọn tin: **${job?.title}**\nTôi có thể tìm kiếm và đánh giá ứng viên phù hợp cho vị trí này. Nhấn chip bên dưới hoặc nhắn tin để bắt đầu!`,
      }]);
    }
  };

  const handleSend = async (text?: string) => {
    const msgText = text || input.trim();
    if (!msgText || sending || !selectedJobId) return;
    setInput("");
    setSending(true);

    const userMsg: Message = { id: `msg-${Date.now()}`, role: "user", text: msgText };
    setMessages((prev) => [...prev, userMsg]);

    await new Promise((r) => setTimeout(r, 1400 + Math.random() * 600));

    const jobApps = applications.filter((a) => a.jobId === selectedJobId);
    let sysMsg: Message;

    if (jobApps.length === 0) {
      sysMsg = { id: `sys-${Date.now()}`, role: "system", text: "Chưa có CV nộp cho vị trí này." };
    } else {
      const response = AI_CANDIDATE_RESPONSES[responseIdx % AI_CANDIDATE_RESPONSES.length];
      sysMsg = {
        id: `sys-${Date.now()}`,
        role: "system",
        text: response.text,
        candidates: response.candidates,
      };
      setResponseIdx((i) => i + 1);
    }

    setMessages((prev) => {
      const next = [...prev, sysMsg];
      setHistory((h) => {
        const existing = h.find((e) => e.jobId === selectedJobId);
        if (existing) return h.map((e) => e.jobId === selectedJobId ? { ...e, messages: next } : e);
        return [...h, { jobId: selectedJobId, messages: next }];
      });
      return next;
    });
    setSending(false);
  };

  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  return (
    <AnimatedPage className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 w-full flex-1 flex flex-col py-8 gap-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Gợi ý ứng viên AI</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Tìm ứng viên phù hợp nhất cho vị trí của bạn</p>
            </div>
          </div>
          <select
            value={selectedJobId}
            onChange={(e) => handleSelectJob(e.target.value)}
            className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">-- Chọn tin tuyển dụng --</option>
            {availableJobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>

        {/* Chat */}
        <div className="flex-1 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden" style={{ minHeight: "60vh" }}>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${msg.role === "system" ? "bg-gradient-to-br from-purple-500 to-pink-600" : "bg-gradient-to-br from-orange-400 to-pink-500"}`}>
                    {msg.role === "system" ? <Bot size={14} className="text-white" /> : <User size={14} className="text-white" />}
                  </div>
                  <div className={`max-w-[80%] flex flex-col gap-2 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    {msg.text && (
                      <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${msg.role === "user" ? "bg-indigo-600 text-white rounded-tr-sm" : "bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-sm"}`}>
                        {msg.text}
                      </div>
                    )}
                    {msg.candidates?.map((cand, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl p-4 w-72 shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">{cand.match}% phù hợp</span>
                          {cand.appId && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${APP_STATUS_COLORS["reviewing"]}`}>{APP_STATUS_LABELS["reviewing"]}</span>
                          )}
                        </div>
                        <p className="font-semibold text-slate-800 dark:text-white text-sm">{cand.name}</p>
                        <p className="text-xs text-slate-500">{cand.email}</p>
                        <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                          <FileText size={11} />
                          <span className="truncate">{cand.cvName}</span>
                        </div>
                        <button className="mt-3 w-full py-1.5 text-xs font-medium text-purple-600 border border-purple-200 rounded-xl hover:bg-purple-50 transition-colors flex items-center justify-center gap-1">
                          <ExternalLink size={11} /> Xem CV
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {sending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                  <Bot size={14} className="text-white" />
                </div>
                <div className="bg-slate-100 dark:bg-slate-700 rounded-2xl px-4 py-3 flex gap-1 items-center">
                  {[0, 1, 2].map((i) => (
                    <motion.div key={i} className="w-2 h-2 bg-slate-400 rounded-full" animate={{ y: [0, -6, 0] }} transition={{ duration: 0.6, delay: i * 0.15, repeat: Infinity }} />
                  ))}
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Chips */}
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-700 flex gap-2 overflow-x-auto">
            <button
              disabled={sending || !selectedJobId}
              onClick={() => handleSend("Gợi ý ứng viên phù hợp")}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 text-xs font-medium rounded-full hover:bg-purple-100 disabled:opacity-50 transition-colors border border-purple-100 dark:border-purple-800"
            >
              <Sparkles size={12} /> Gợi ý ứng viên phù hợp
            </button>
            <button
              disabled={sending || !selectedJobId}
              onClick={() => handleSend("Hiển thị ứng viên theo thứ tự điểm phù hợp cao nhất")}
              className="flex-shrink-0 px-3 py-1.5 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium rounded-full hover:bg-slate-100 disabled:opacity-50 transition-colors border border-slate-200 dark:border-slate-600"
            >
              Xếp hạng theo điểm
            </button>
          </div>

          {/* Input */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !sending && handleSend()}
                disabled={sending || !selectedJobId}
                placeholder={selectedJobId ? "Nhắn tin với AI..." : "Chọn tin tuyển dụng trước"}
                className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              />
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => handleSend()}
                disabled={!input.trim() || sending || !selectedJobId}
                className="p-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl transition-colors"
              >
                <Send size={16} />
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </AnimatedPage>
  );
}
